locals {
  common_env = {
    POSTS_TABLE      = aws_dynamodb_table.posts.name
    COMMENTS_TABLE   = aws_dynamodb_table.comments.name
    VIEWS_TABLE      = aws_dynamodb_table.views.name
    PROFILES_TABLE   = aws_dynamodb_table.profiles.name
    HANDLES_TABLE    = aws_dynamodb_table.handles.name
    SITE_URL         = local.site_url
    SITE_TITLE       = var.site_title
    SITE_DESCRIPTION = var.site_description
  }
  posts_arns    = [aws_dynamodb_table.posts.arn, "${aws_dynamodb_table.posts.arn}/index/*"]
  comments_arns = [aws_dynamodb_table.comments.arn, "${aws_dynamodb_table.comments.arn}/index/*"]
}

# ---------- Public API: anonymous reads + view counter ----------

data "aws_iam_policy_document" "public" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = local.posts_arns
  }
  statement {
    actions   = ["dynamodb:Query"]
    resources = [aws_dynamodb_table.comments.arn]
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.views.arn]
  }
  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.profiles.arn, aws_dynamodb_table.handles.arn]
  }
}

module "public_api" {
  source      = "../../modules/lambda"
  name        = "${local.name}-public-api"
  description = "Anonymous read API"
  source_dir  = "${var.lambda_dist_dir}/public"
  policy_json = data.aws_iam_policy_document.public.json
  environment = local.common_env
}

# ---------- App API: any signed-in user (own profile, own posts, comments, reports) ----------

data "aws_iam_policy_document" "app" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = local.posts_arns
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.comments.arn]
  }
  statement {
    actions   = ["dynamodb:BatchGetItem"]
    resources = [aws_dynamodb_table.views.arn]
  }
  # Profile + handle changes are transactional (TransactWriteItems needs per-table Put/Delete/Condition rights).
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"]
    resources = [aws_dynamodb_table.profiles.arn, aws_dynamodb_table.handles.arn]
  }
  # Presigned POSTs are signed with this role; uploads are confined to media/u/<userId>/...
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.this["media"].arn}/media/u/*"]
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

module "app_api" {
  source      = "../../modules/lambda"
  name        = "${local.name}-app-api"
  description = "Signed-in user API: profile, writing, comments, reports"
  source_dir  = "${var.lambda_dist_dir}/app"
  policy_json = data.aws_iam_policy_document.app.json
  environment = merge(local.common_env, {
    MEDIA_BUCKET     = aws_s3_bucket.this["media"].bucket
    MEDIA_BASE_URL   = local.site_url
    ALERTS_TOPIC_ARN = aws_sns_topic.alerts.arn
    ADMIN_GROUP      = aws_cognito_user_group.admins.name
  })
}

# ---------- Admin API: moderation (admins group only) ----------

data "aws_iam_policy_document" "admin" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:UpdateItem"]
    resources = local.posts_arns
  }
  statement {
    actions   = ["dynamodb:Query"]
    resources = local.comments_arns
  }
  statement {
    actions   = ["dynamodb:Scan"]
    resources = [aws_dynamodb_table.views.arn]
  }
  statement {
    actions   = ["dynamodb:Scan", "dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.profiles.arn]
  }
  statement {
    actions   = ["cognito-idp:AdminDisableUser", "cognito-idp:AdminEnableUser", "cognito-idp:AdminUserGlobalSignOut"]
    resources = [aws_cognito_user_pool.users.arn]
  }
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [module.publisher.arn]
  }
}

module "admin_api" {
  source      = "../../modules/lambda"
  name        = "${local.name}-admin-api"
  description = "Admin moderation API"
  source_dir  = "${var.lambda_dist_dir}/admin"
  policy_json = data.aws_iam_policy_document.admin.json
  environment = merge(local.common_env, {
    PUBLISHER_FUNCTION = module.publisher.function_name
    ADMIN_GROUP        = aws_cognito_user_group.admins.name
    USER_POOL_ID       = aws_cognito_user_pool.users.id
  })
}

# ---------- Publisher: static post pages, RSS, sitemap, scheduled posts ----------

data "aws_iam_policy_document" "publisher" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = local.posts_arns
  }
  statement {
    actions   = ["dynamodb:DescribeStream", "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:ListStreams"]
    resources = [aws_dynamodb_table.posts.stream_arn]
  }
  statement {
    actions   = ["dynamodb:Query", "dynamodb:BatchWriteItem"]
    resources = [aws_dynamodb_table.comments.arn]
  }
  statement {
    actions   = ["dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.views.arn]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this["site"].arn}/index.html"]
  }
  statement {
    actions = ["s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.this["site"].arn}/posts/*",
      "${aws_s3_bucket.this["site"].arn}/sitemap.xml",
      "${aws_s3_bucket.this["site"].arn}/rss.xml",
      "${aws_s3_bucket.this["site"].arn}/robots.txt",
    ]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this["site"].arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["posts/*"]
    }
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

module "publisher" {
  source      = "../../modules/lambda"
  name        = "${local.name}-publisher"
  description = "Renders static post pages and feeds; publishes scheduled posts"
  source_dir  = "${var.lambda_dist_dir}/publisher"
  policy_json = data.aws_iam_policy_document.publisher.json
  timeout     = 120
  memory_size = 512
  environment = merge(local.common_env, {
    SITE_BUCKET     = aws_s3_bucket.this["site"].bucket
    DISTRIBUTION_ID = aws_cloudfront_distribution.site.id
  })
}

resource "aws_lambda_event_source_mapping" "posts_stream" {
  event_source_arn                   = aws_dynamodb_table.posts.stream_arn
  function_name                      = module.publisher.arn
  starting_position                  = "LATEST"
  batch_size                         = 25
  maximum_batching_window_in_seconds = 2
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true
}

# Check for due scheduled posts every 5 minutes (~8.6k invocations/month: well inside the free tier).
resource "aws_cloudwatch_event_rule" "publish_tick" {
  name                = "${local.name}-publish-scheduled"
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "publish_tick" {
  rule  = aws_cloudwatch_event_rule.publish_tick.name
  arn   = module.publisher.arn
  input = jsonencode({ source = "aws.events" })
}

resource "aws_lambda_permission" "publish_tick" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = module.publisher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.publish_tick.arn
}
