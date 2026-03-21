aws_region   = "eu-central-1"
project_name = "webapp"
environment  = "prod"

# VPC
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["eu-central-1a", "eu-central-1b"]

# ECS / App
app_image         = "687772879769.dkr.ecr.eu-central-1.amazonaws.com/webapp-app:latest"
app_port          = 5001
app_cpu           = 512
app_memory        = 1024
app_desired_count = 1
app_min_count     = 1
app_max_count     = 4

# GitHub OIDC
github_org  = "honzas83"
github_repo = "uteach"
