.PHONY: help start stop destroy restart logs status wait-ready seed-status

.DEFAULT_GOAL := help

GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
CYAN   := \033[0;36m
NC     := \033[0m

API_URL := http://localhost:3001

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-14s$(NC) %s\n", $$1, $$2}'

start: ## Start all services (detached, with builds) then wait for readiness
	@echo "$(GREEN)Starting services...$(NC)"
	docker compose up -d --build
	@echo "$(CYAN)Services are up. Waiting for lesson seeding to complete...$(NC)"
	@$(MAKE) wait-ready

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
	@$(MAKE) wait-ready

logs: ## Follow logs from all services
	docker compose logs -f

status: ## Show status of all services
	docker compose ps

seed-status: ## Show current lesson seeding progress
	@echo "$(CYAN)Checking seed status...$(NC)"
	@response=$$(curl -s $(API_URL)/health/ready 2>/dev/null); \
	if [ -z "$$response" ]; then \
		echo "$(RED)API is not reachable at $(API_URL)$(NC)"; \
	else \
		status=$$(echo "$$response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4); \
		lessons=$$(echo "$$response" | grep -o '"lessons":[0-9]*' | head -1 | cut -d':' -f2); \
		expected=$$(echo "$$response" | grep -o '"expected":[0-9]*' | head -1 | cut -d':' -f2); \
		if [ "$$status" = "ready" ]; then \
			echo "$(GREEN)Ready: $$lessons lessons available$(NC)"; \
		else \
			echo "$(YELLOW)Seeding: $$lessons / $$expected lessons generated$(NC)"; \
		fi; \
	fi

wait-ready: ## Poll /health/ready until all lessons are seeded (use after start)
	@echo "$(CYAN)Polling API readiness (this may take several minutes on first run)...$(NC)"
	@elapsed=0; \
	while true; do \
		response=$$(curl -s -o /dev/null -w "%{http_code}" $(API_URL)/health/ready 2>/dev/null); \
		if [ "$$response" = "200" ]; then \
			echo "$(GREEN)System ready! All lessons have been seeded.$(NC)"; \
			break; \
		fi; \
		count=$$(curl -s $(API_URL)/health/ready 2>/dev/null | grep -o '"lessons":[0-9]*' | head -1 | cut -d':' -f2); \
		expected=$$(curl -s $(API_URL)/health/ready 2>/dev/null | grep -o '"expected":[0-9]*' | head -1 | cut -d':' -f2); \
		if [ -n "$$count" ] && [ -n "$$expected" ]; then \
			echo "$(YELLOW)Seeding in progress: $$count / $$expected lessons (elapsed: $${elapsed}s)$(NC)"; \
		else \
			echo "$(YELLOW)Waiting for API to start... (elapsed: $${elapsed}s)$(NC)"; \
		fi; \
		sleep 10; \
		elapsed=$$((elapsed + 10)); \
	done
