.PHONY: help start stop destroy restart logs status wait-ready seed-status tunnel

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
	@echo "$(CYAN)Services are up. Lessons seed in the background — the app$(NC)"
	@echo "$(CYAN)is already usable at $(WEB_URL) (API and audio are$(NC)"
	@echo "$(CYAN)proxied same-origin via Next.js). Waiting for full readiness...$(NC)"
	@$(MAKE) wait-ready
	@echo "$(GREEN)Open $(WEB_URL) to start a lesson.$(NC)"
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

tunnel: ## Expose the running stack over public HTTPS via localhost.run (Ctrl+C to stop)
	@echo "$(CYAN)Opening SSH tunnel to localhost.run...$(NC)"
	@echo "$(CYAN)Watch for the 'tunneled with tls termination' line — that's your phone URL.$(NC)"
	ssh -R 80:localhost:3000 -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new localhost.run
