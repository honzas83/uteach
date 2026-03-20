# Terraform — AWS ECS Fargate Web App

## Architektura

```
Internet
   │
   ▼
[ALB] (public subnety, 2x AZ)
   │  HTTP → redirect HTTPS
   │  HTTPS → forward
   ▼
[ECS Fargate Service] (private subnety, auto-scaling)
   │
   ├── [ECR] Docker image registry
   ├── [S3]  Statické assety
   └── [CloudWatch] Logy + alarmy
```

## Struktura souborů

| Soubor | Obsah |
|--------|-------|
| `main.tf` | Provider, Terraform verze |
| `variables.tf` | Všechny vstupní proměnné |
| `vpc.tf` | VPC, subnety, IGW, NAT Gateway |
| `security_groups.tf` | SG pro ALB a ECS |
| `alb.tf` | Load Balancer, Target Group, Listenery |
| `ecs.tf` | ECR, ECS Cluster, Task Definition, Service, IAM |
| `autoscaling.tf` | Auto-scaling dle CPU/paměti/požadavků |
| `s3.tf` | Bucket pro assety a ALB logy |
| `cloudwatch.tf` | Alarmy a Dashboard |
| `outputs.tf` | Výstupní hodnoty |

## Prerekvizity

- Terraform >= 1.5.0
- AWS CLI nakonfigurované (`aws configure`)
- Docker (pro build a push image)

## Deployment

### 1. Inicializace

```bash
terraform init
```

### 2. Konfigurace

```bash
cp terraform.tfvars.example terraform.tfvars
# Upravte hodnoty v terraform.tfvars
```

### 3. Plan

```bash
terraform plan -out=tfplan
```

### 4. Apply

```bash
terraform apply tfplan
```






### 5. Push Docker image

```bash
# Přihlášení do ECR
aws ecr get-login-password --region eu-central-1 | \
  docker login --username AWS --password-stdin \
  $(terraform output -raw ecr_repository_url | cut -d/ -f1)

# Build a push
docker build -t myapp .
docker tag myapp:latest $(terraform output -raw ecr_repository_url):latest
docker push $(terraform output -raw ecr_repository_url):latest
```

### 6. Aktualizace aplikace

```bash
# Po novém push image restartujte service
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment
```

## Odhad nákladů (eu-central-1, prod)

| Služba                         | Odhad/měsíc |
|--------------------------------|-------------|
| ECS Fargate (2× 0.5 vCPU, 1GB) | ~$25        |
| ALB                            | ~$20        |
| NAT Gateway (2×)               | ~$65        |
| ECR                            | ~$1         |
| S3 + CloudWatch                | ~$5         |
| **Celkem**                     | **~$116**   |

> NAT Gateway je největší nákladová položka. Pro dev prostředí zvažte pouze 1 AZ nebo VPC Endpoints.

## Zničení infrastruktury

```bash
terraform destroy
```
