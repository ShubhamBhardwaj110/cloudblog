variable "project" {
  type    = string
  default = "cloudblog"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "admin_email" {
  type        = string
  description = "Email for the first admin user (Cognito sends a temporary password here)."
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Where comment notifications, alarms and budget alerts go. Defaults to admin_email."
}

variable "site_title" {
  type    = string
  default = "CloudBlog"
}

variable "site_description" {
  type    = string
  default = "Stories, notes and ideas, served from the edge."
}

variable "monthly_budget_usd" {
  type        = number
  default     = 10
  description = "AWS Budgets emails you at 50%, 80% and 100% (forecasted) of this amount."
}

variable "lambda_dist_dir" {
  type        = string
  default     = "../../../backend/dist"
  description = "Where `npm run build -w backend` writes the bundled functions."
}

variable "dev_origins" {
  type        = list(string)
  default     = ["http://localhost:5173"]
  description = "Extra origins allowed for local frontend development (CORS + Cognito callbacks)."
}
