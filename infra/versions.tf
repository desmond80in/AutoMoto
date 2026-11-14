terraform {
  required_version = ">= 1.7"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.90, < 7.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # Remote state is recommended for anything shared; see backend.tf.example.
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { App = var.app_name, Stage = var.stage, ManagedBy = "terraform" }
  }
}
