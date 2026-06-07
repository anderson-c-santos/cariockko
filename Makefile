.PHONY: help start stop destroy restart logs status tunnel

.DEFAULT_GOAL := help

GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
CYAN   := \033[0;36m
NC     := \033[0m

API_URL := http://localhost:3001
WEB_URL := http://localhost:3000

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-14s$(NC) %s\n", $$1, $$2}'

start: ## Start all services in Docker over HTTP (run 'make tunnel' alongside for phone access)
	@echo "$(GREEN)Starting services...$(NC)"
	docker compose up -d --build
	@echo "$(CYAN)Services are up. The app is ready at $(WEB_URL) — open the$(NC)"
	@echo "$(CYAN)Criar Lições tab (sparkles icon) to build your first lessons.$(NC)"
	@echo "$(CYAN)For phone/microphone testing, run 'make tunnel' in another$(NC)"
	@echo "$(CYAN)terminal — it exposes $(WEB_URL) over public HTTPS via$(NC)"
	@echo "$(CYAN)localhost.run (no certs, no LAN setup).$(NC)"

stop: ## Stop all services (keep volumes)
	@echo "$(YELLOW)Stopping services...$(NC)"
	docker compose down

destroy: ## Stop all services, remove volumes and images (deletes all data)
	@echo "$(RED)WARNING: This will delete all data (database, files) and images.$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v --rmi all
	@echo "$(RED)Volumes and images removed.$(NC)"

restart: ## Restart all services
	@echo "$(YELLOW)Restarting services...$(NC)"
	docker compose down
	docker compose up -d --build
	@echo "$(GREEN)Services restarted.$(NC)"

logs: ## Follow logs from all services
	docker compose logs -f

status: ## Show status of all services
	docker compose ps

tunnel: ## Expose the running stack over public HTTPS via localhost.run (Ctrl+C to stop)
	@echo "$(CYAN)Opening SSH tunnel to localhost.run...$(NC)"
	@echo "$(CYAN)Watch for the 'tunneled with tls termination' line — that's your phone URL.$(NC)"
	ssh -R 80:localhost:3000 -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new localhost.run
