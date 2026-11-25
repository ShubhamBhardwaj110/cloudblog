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
      "author", "createdAt", "updatedAt", "readingMinutes", "featured",
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

  # Moderation queue: all pending comments across posts, newest first.
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
