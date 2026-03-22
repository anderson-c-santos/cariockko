.PHONY: help start stop destroy restart logs status

.DEFAULT_GOAL := help

GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-12s$(NC) %s\n", $$1, $$2}'

start: ## Start all services (detached, with builds)
	@echo "$(GREEN)Starting services...$(NC)"
	docker compose up -d --build

stop: ## Stop all services (keep volumes)
	@echo "$(YELLOW)Stopping services...$(NC)"
	docker compose down

destroy: ## Stop all services and remove volumes (deletes all data)
	@echo "$(RED)WARNING: This will delete all data (database, files).$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	@echo "$(RED)Volumes removed.$(NC)"

restart: ## Restart all services
	@echo "$(YELLOW)Restarting services...$(NC)"
	docker compose down
	docker compose up -d --build
	@echo "$(GREEN)Services restarted.$(NC)"

logs: ## Follow logs from all services
	docker compose logs -f

status: ## Show status of all services
	docker compose ps
