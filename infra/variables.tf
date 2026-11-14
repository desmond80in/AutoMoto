variable "region" {
  description = "Everything runs in Canada (Central) so customer data stays in Canada."
  type        = string
  default     = "ca-central-1"
  validation {
    condition     = var.region == "ca-central-1"
    error_message = "This app must be deployed to ca-central-1."
  }
}

variable "app_name" {
  type    = string
  default = "workshop"
}

variable "stage" {
  description = "pov | dev"
  type        = string
  default     = "pov"
  validation {
    condition     = contains(["pov", "dev"], var.stage)
    error_message = "stage must be pov or dev."
  }
}

variable "supabase_url" {
  description = "https://<ref>.supabase.co (used by the Lambdas and the CSP)."
  type        = string
  validation {
    condition     = can(regex("^https?://", var.supabase_url))
    error_message = "supabase_url must be a URL."
  }
}

variable "google_client_id" {
  description = "Google OAuth client ID. Leave empty on the first apply; set it after storing the client secret (HUMAN H3)."
  type        = string
  default     = ""
}

variable "anthropic_model" {
  type    = string
  default = "claude-haiku-5-5"
}

variable "web_extra_origins" {
  description = "Extra origins allowed for sign-in redirects and CORS (local development)."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "custom_domain" {
  description = "Optional custom domain for CloudFront (HUMAN H6)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate in us-east-1 for custom_domain."
  type        = string
  default     = ""
}

variable "lambda_dist_dir" {
  description = "Bundled Lambdas (backend: npm run build:lambdas)."
  type        = string
  default     = "../backend/dist"
}

variable "log_retention_days" {
  type    = number
  default = 30
}
