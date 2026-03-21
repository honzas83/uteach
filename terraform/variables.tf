variable "aws_region" {
  description = "AWS region pro deployment"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Název projektu (používá se jako prefix zdrojů)"
  type        = string
  default     = "webapp"
}

variable "environment" {
  description = "Prostředí (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# --- VPC ---
variable "vpc_cidr" {
  description = "CIDR blok pro VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Seznam AZ pro multi-AZ deployment"
  type        = list(string)
  default     = ["eu-central-1a", "eu-central-1b"]
}

# --- ECS / App ---
variable "app_image" {
  description = "Docker image pro aplikaci (ECR URI nebo public image)"
  type        = string
  default     = "nginx:latest" # Nahraďte vlastním image
}

variable "app_port" {
  description = "Port, na kterém aplikace naslouchá"
  type        = number
  default     = 5001
}

variable "app_cpu" {
  description = "CPU jednotky pro Fargate task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "app_memory" {
  description = "Paměť v MB pro Fargate task"
  type        = number
  default     = 512
}

variable "app_desired_count" {
  description = "Požadovaný počet běžících tasků"
  type        = number
  default     = 2
}

variable "app_min_count" {
  description = "Minimální počet tasků při auto-scalingu"
  type        = number
  default     = 1
}

variable "app_max_count" {
  description = "Maximální počet tasků při auto-scalingu"
  type        = number
  default     = 10
}

variable "app_environment_vars" {
  description = "Environment proměnné pro aplikaci"
  type        = map(string)
  default     = {}
  sensitive   = true
}

# --- ALB / HTTPS ---
variable "certificate_arn" {
  description = "ARN ACM certifikátu pro HTTPS (nechat prázdné pro HTTP only)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Doménové jméno aplikace (volitelné)"
  type        = string
  default     = ""
}
