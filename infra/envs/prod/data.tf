# All tables are on-demand: you pay per request (fractions of a cent at blog scale), nothing when idle.

resource "aws_dynamodb_table" "posts" {
  name                        = "${local.name}-posts"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "postId"
  deletion_protection_enabled = true
  stream_enabled              = true
  stream_view_type            = "NEW_AND_OLD_IMAGES" # drives the publisher (static pages, RSS, sitemap)

  attribute {
    name = "postId"
    type = "S"
  }
  attribute {
    name = "slug"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "publishedAt"
    type = "S"
  }
  attribute {
    name = "authorId"
    type = "S"
  }
  attribute {
    name = "updatedAt"
    type = "S"
  }

  # Lookup by URL slug.
  global_secondary_index {
    name = "slug-index"
    key_schema {
      attribute_name = "slug"
      key_type       = "HASH"
    }
    projection_type = "ALL"
  }

  # Listing: status = published, newest first. Drafts have no publishedAt so they stay out (sparse index).
  # Projects everything except the post body, so the home page never reads full articles.
  global_secondary_index {
    name = "status-index"
    key_schema {
      attribute_name = "status"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "publishedAt"
      key_type       = "RANGE"
    }
    projection_type = "INCLUDE"
    non_key_attributes = [
      "slug", "title", "excerpt", "coverImage", "coverAlt", "category", "tags",
      "authorId", "author", "authorHandle", "authorAvatar", "createdAt", "updatedAt", "readingMinutes", "featured",
    ]
  }

  # A writer's own posts (any status), most recently edited first. Also powers author pages.
  global_secondary_index {
    name = "author-index"
    key_schema {
      attribute_name = "authorId"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "updatedAt"
      key_type       = "RANGE"
    }
    projection_type = "INCLUDE"
    non_key_attributes = [
      "slug", "title", "excerpt", "coverImage", "coverAlt", "category", "tags", "status", "publishedAt",
      "author", "authorHandle", "authorAvatar", "createdAt", "readingMinutes", "featured",
    ]
  }

  point_in_time_recovery {
    enabled = true
  }

  # Hard ceiling on request rate: a runaway script or attack can't produce a surprise bill.
  on_demand_throughput {
    max_read_request_units  = 200
    max_write_request_units = 50
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "comments" {
  name                        = "${local.name}-comments"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "postId"
  range_key                   = "commentKey" # "<createdAt>#<commentId>": a Query returns a post's comments in order
  deletion_protection_enabled = true

  attribute {
    name = "postId"
    type = "S"
  }
  attribute {
    name = "commentKey"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  # Admin view: newest comments across all posts.
  global_secondary_index {
    name = "status-index"
    key_schema {
      attribute_name = "status"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  # Hard ceiling on request rate: a runaway script or attack can't produce a surprise bill.
  on_demand_throughput {
    max_read_request_units  = 200
    max_write_request_units = 50
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "views" {
  name         = "${local.name}-views"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "postId"

  attribute {
    name = "postId"
    type = "S"
  }

  # Hard ceiling on request rate: a runaway script or attack can't produce a surprise bill.
  on_demand_throughput {
    max_read_request_units  = 200
    max_write_request_units = 50
  }

  server_side_encryption {
    enabled = true
  }
}

# One item per user: handle, display name, bio, avatar, status (active/suspended).
resource "aws_dynamodb_table" "profiles" {
  name                        = "${local.name}-profiles"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "userId" # Cognito sub
  deletion_protection_enabled = true

  attribute {
    name = "userId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  on_demand_throughput {
    max_read_request_units  = 200
    max_write_request_units = 50
  }

  server_side_encryption {
    enabled = true
  }
}

# handle -> userId. Conditional writes here guarantee handles are unique.
resource "aws_dynamodb_table" "handles" {
  name                        = "${local.name}-handles"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "handle"
  deletion_protection_enabled = true

  attribute {
    name = "handle"
    type = "S"
  }

  on_demand_throughput {
    max_read_request_units  = 200
    max_write_request_units = 50
  }

  server_side_encryption {
    enabled = true
  }
}
