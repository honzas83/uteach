output "alb_dns_name" {
  description = "DNS adresa Application Load Balanceru"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID ALB (pro Route 53 alias záznam)"
  value       = aws_lb.main.zone_id
}

output "ecr_repository_url" {
  description = "URL ECR repository pro docker push"
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  description = "Název ECS clusteru"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Název ECS service"
  value       = aws_ecs_service.app.name
}

output "app_assets_bucket" {
  description = "Název S3 bucketu pro assety"
  value       = aws_s3_bucket.app_assets.bucket
}

output "vpc_id" {
  description = "ID VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "ID privátních subnetů"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "ID veřejných subnetů"
  value       = aws_subnet.public[*].id
}

output "app_url" {
  description = "URL aplikace"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_domain" {
  description = "CloudFront HTTPS domain"
  value       = aws_cloudfront_distribution.main.domain_name
}
