# Deploying the chat service to AWS (Terraform)

**Status: written and syntax-checked, never applied.** It has not been run against a real AWS
account. CI runs `terraform fmt -check` and `terraform validate` on every change, which catches
mistakes in the code but proves nothing about how it behaves in AWS. Read the plan before applying.

## What it creates

| Piece                                    | Why                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| ECS Fargate cluster, service, task       | Runs the container. No servers to patch.                                                 |
| Application Load Balancer + target group | Public entry point and health checks (`/health`).                                        |
| Two security groups                      | Internet can reach only the load balancer; only the load balancer can reach the service. |
| Secrets Manager (2 secrets)              | `ANTHROPIC_API_KEY` and `WEBHOOK_SECRET`, injected at start-up. Never in code or state.  |
| IAM roles                                | Execution role can read just those two secrets. The task role has no permissions at all. |
| CloudWatch log group + 2 alarms          | Logs with retention; alarms for unhealthy targets and 5xx errors.                        |
| Deployment circuit breaker               | A bad release rolls itself back.                                                         |

## Steps

```bash
# 1. Build and push the image (replace the account id and region)
aws ecr create-repository --repository-name chat-service
docker build -t chat-service .
docker tag chat-service 123456789012.dkr.ecr.eu-west-2.amazonaws.com/chat-service:1.0.0
aws ecr get-login-password | docker login --username AWS --password-stdin 123456789012.dkr.ecr.eu-west-2.amazonaws.com
docker push 123456789012.dkr.ecr.eu-west-2.amazonaws.com/chat-service:1.0.0

# 2. Plan, read it, then apply
cd infra
cp terraform.tfvars.example terraform.tfvars   # edit the values
terraform init
terraform plan
terraform apply

# 3. Put the real secrets in (they are not in Terraform)
aws secretsmanager put-secret-value --secret-id chat-service/anthropic-api-key --secret-string "sk-ant-..."
aws secretsmanager put-secret-value --secret-id chat-service/webhook-secret --secret-string "$(openssl rand -hex 32)"

# 4. Restart the tasks so they pick the secrets up
#    (until step 3 is done the tasks cannot start, and the circuit breaker may roll the first deploy back)
aws ecs update-service --cluster chat-service --service chat-service --force-new-deployment
```

Then point the evals at it: `CHAT_API_URL=https://<url output> npm run eval`.

## Known shortcuts (fine for a portfolio, fix before real customers)

- Tasks run in **public subnets with public IPs** so they can reach the model API without a NAT
  gateway. In production use private subnets plus a NAT gateway or VPC endpoints.
- Without `certificate_arn` the listener is **plain HTTP**. Always set it outside a throwaway demo.
- The service has **no authentication** of its own. Put an API gateway, WAF or auth layer in front.
- State is **local** until you enable the S3 backend block in `versions.tf`.
- Costs money while running (load balancer, Fargate tasks, logs). `terraform destroy` removes it all.
