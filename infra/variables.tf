variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

variable "name" {
  description = "Name prefix for every resource."
  type        = string
  default     = "chat-service"
}

variable "vpc_id" {
  description = "VPC to deploy into."
  type        = string
}

variable "public_subnet_ids" {
  description = "At least two public subnets in different availability zones, for the load balancer and tasks."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "An application load balancer needs at least two subnets."
  }
}

variable "image" {
  description = "Container image to run, for example 123456789012.dkr.ecr.eu-west-2.amazonaws.com/chat-service:1.0.0. Use a version tag, not latest."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate for HTTPS. Leave empty only for a throwaway demo: the listener is then plain HTTP."
  type        = string
  default     = ""
}

variable "desired_count" {
  description = "How many copies of the service to run."
  type        = number
  default     = 2
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "anthropic_model" {
  description = "Model the chat service calls."
  type        = string
  default     = "claude-sonnet-5-5"
}

variable "webhook_url" {
  description = "Where signed escalation webhooks are sent. Empty turns webhooks off."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  type    = number
  default = 30
}
