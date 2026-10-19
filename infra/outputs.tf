output "url" {
  description = "Public address of the service."
  value       = "${local.https ? "https" : "http"}://${aws_lb.this.dns_name}"
}

output "anthropic_secret_arn" {
  description = "Put the API key here with: aws secretsmanager put-secret-value"
  value       = aws_secretsmanager_secret.anthropic_api_key.arn
}

output "webhook_secret_arn" {
  value = aws_secretsmanager_secret.webhook_secret.arn
}

output "log_group" {
  value = aws_cloudwatch_log_group.service.name
}
