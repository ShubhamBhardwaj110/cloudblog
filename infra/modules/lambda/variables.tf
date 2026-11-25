variable "name" {
  type        = string
  description = "Function name (also used for its IAM role and log group)."
}

variable "description" {
  type    = string
  default = ""
}

variable "source_dir" {
  type        = string
  description = "Directory containing the bundled index.mjs."
}

variable "policy_json" {
  type        = string
  description = "Least-privilege IAM policy for what this function needs."
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "memory_size" {
  type    = number
  default = 256
}

variable "timeout" {
  type    = number
  default = 10
}

variable "log_retention_days" {
  type    = number
  default = 14
}
