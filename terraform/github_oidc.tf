# ==============================================================
# GitHub Actions OIDC — bezheslo autentizace do AWS
# ==============================================================
# Po aplikaci terraform apply:
#   1. Zkopírovat output `github_actions_role_arn`
#   2. Uložit jako GitHub Secret: AWS_ROLE_ARN
#   3. Smazat staré secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
# ==============================================================

variable "github_org" {
  description = "GitHub organization nebo username (např. 'myorg' nebo 'andrii')"
  type        = string
}

variable "github_repo" {
  description = "Název GitHub repozitáře (např. 'aimtek')"
  type        = string
}

# OIDC Provider pro GitHub Actions (jeden na celý AWS účet)
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # Thumbprint GitHub OIDC endpoint (stabilní hodnota)
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = { Name = "github-actions-oidc" }
}

# IAM Role — přebíratelná pouze z konkrétního repozitáře, větve main
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # Povolí main větev i pull requesty
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
          }
        }
      }
    ]
  })

  tags = { Name = "${var.project_name}-github-actions-role" }
}

# Oprávnění: push do ECR
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "${var.project_name}-github-ecr"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:DescribeImages",
        ]
        Resource = aws_ecr_repository.app.arn
      }
    ]
  })
}

# Oprávnění: deploy do ECS
resource "aws_iam_role_policy" "github_actions_ecs" {
  name = "${var.project_name}-github-ecs"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices",
        ]
        Resource = "*"
      },
      {
        # Nutné pro registraci nové task definition s IAM rolemi
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task.arn,
        ]
      },
      {
        # Smoke test — zjištění DNS jména ALB
        Effect   = "Allow"
        Action   = "elasticloadbalancing:DescribeLoadBalancers"
        Resource = "*"
      }
    ]
  })
}

output "github_actions_role_arn" {
  description = "ARN role pro GitHub Actions — ulož jako secret AWS_ROLE_ARN"
  value       = aws_iam_role.github_actions.arn
}
