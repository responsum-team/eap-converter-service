.PHONY: help install dev start stop restart build rebuild logs health clean test typecheck

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@echo "$(BLUE)Document Conversion Service - Makefile Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(GREEN)<target>$(NC)\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

install: ## Install npm dependencies
	@echo "$(BLUE)Installing npm dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

dev: ## Start development environment (infrastructure only, run API/Worker locally)
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "$(GREEN)✓ Development services started!$(NC)"
	@echo ""
	@echo "$(YELLOW)Infrastructure services running:$(NC)"
	@echo "  - Gotenberg: http://localhost:3000"
	@echo "  - Redis: localhost:6379"
	@echo "  - MinIO: http://localhost:9000 (console: http://localhost:9001)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Run API:    npm run dev"
	@echo "  2. Run Worker: npm run worker:dev"
	@echo ""

dev-api: install ## Start API in development mode with hot reload
	@echo "$(BLUE)Starting API in development mode...$(NC)"
	npm run dev

dev-worker: install ## Start Worker in development mode with hot reload
	@echo "$(BLUE)Starting Worker in development mode...$(NC)"
	npm run worker:dev

##@ Production

start: ## Start production stack (all services with Docker)
	@echo "$(BLUE)Starting production stack...$(NC)"
	docker compose up -d
	@echo ""
	@echo "$(GREEN)✓ Production services started!$(NC)"
	@echo ""
	@echo "$(YELLOW)Services:$(NC)"
	@echo "  - API:      http://localhost:3001"
	@echo "  - Health:   http://localhost:3001/health"
	@echo "  - Traefik:  http://localhost:8080"
	@echo "  - MinIO:    http://localhost:9001 (admin/minioadmin)"
	@echo ""
	@echo "$(YELLOW)Check status:$(NC) make status"
	@echo "$(YELLOW)View logs:$(NC)    make logs"
	@echo ""

stop: ## Stop all services
	@echo "$(BLUE)Stopping all services...$(NC)"
	docker compose down
	@echo "$(GREEN)✓ Services stopped$(NC)"

stop-dev: ## Stop development services
	@echo "$(BLUE)Stopping development services...$(NC)"
	docker compose -f docker-compose.dev.yml down
	@echo "$(GREEN)✓ Development services stopped$(NC)"

restart: stop start ## Restart all services

status: ## Show status of all services
	@echo "$(BLUE)Service Status:$(NC)"
	@docker compose ps

##@ Build

build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker compose build
	@echo "$(GREEN)✓ Build complete$(NC)"

rebuild: ## Rebuild Docker images from scratch (no cache)
	@echo "$(BLUE)Rebuilding Docker images (no cache)...$(NC)"
	docker compose build --no-cache
	@echo "$(GREEN)✓ Rebuild complete$(NC)"

typecheck: ## Run TypeScript type checking
	@echo "$(BLUE)Running TypeScript type checking...$(NC)"
	npm run typecheck
	@echo "$(GREEN)✓ Type check passed$(NC)"

compile: ## Compile TypeScript to JavaScript
	@echo "$(BLUE)Compiling TypeScript...$(NC)"
	npm run build
	@echo "$(GREEN)✓ Compilation complete (output in dist/)$(NC)"

##@ Logs & Monitoring

logs: ## View logs from all services
	docker compose logs -f

logs-api: ## View API logs
	docker compose logs -f api

logs-worker: ## View Worker logs
	docker compose logs -f worker

logs-gotenberg: ## View Gotenberg logs
	docker compose logs -f gotenberg

logs-redis: ## View Redis logs
	docker compose logs -f redis

health: ## Check health of all services
	@echo "$(BLUE)Checking service health...$(NC)"
	@echo ""
	@echo "$(YELLOW)API Health:$(NC)"
	@curl -s http://localhost:3001/health | jq '.' || echo "$(RED)✗ API not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)Docker Services:$(NC)"
	@docker compose ps
	@echo ""

##@ Testing

test: ## Test the service with a sample request
	@echo "$(BLUE)Testing service...$(NC)"
	@echo ""
	@echo "$(YELLOW)Health Check:$(NC)"
	@curl -s http://localhost:3001/health | jq '.'
	@echo ""
	@echo "$(YELLOW)To test PDF conversion, use:$(NC)"
	@echo "  curl -X POST http://localhost:3001/convert/pdf \\"
	@echo "    -F \"file=@document.docx\" \\"
	@echo "    -o output.pdf"
	@echo ""

test-health: ## Test health endpoint
	@curl -s http://localhost:3001/health | jq '.'

##@ Cleanup

clean: ## Stop services and remove volumes (WARNING: deletes all data)
	@echo "$(RED)WARNING: This will delete all data including MinIO storage and Redis data$(NC)"
	@echo -n "Are you sure? [y/N] " && read ans && [ $${ans:-N} = y ]
	@echo "$(BLUE)Cleaning up...$(NC)"
	docker compose down -v
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-dev: ## Stop development services and remove volumes
	@echo "$(BLUE)Cleaning up development environment...$(NC)"
	docker compose -f docker-compose.dev.yml down -v
	@echo "$(GREEN)✓ Development cleanup complete$(NC)"

clean-images: ## Remove Docker images
	@echo "$(BLUE)Removing Docker images...$(NC)"
	docker compose down --rmi all
	@echo "$(GREEN)✓ Images removed$(NC)"

clean-all: clean clean-images ## Complete cleanup (services, volumes, images)
	@echo "$(GREEN)✓ Complete cleanup done$(NC)"

##@ Utilities

shell-api: ## Open shell in API container
	docker exec -it converter-api sh

shell-worker: ## Open shell in Worker container
	docker exec -it converter-worker sh

shell-redis: ## Open Redis CLI
	docker exec -it redis redis-cli

ps: status ## Alias for status

up: start ## Alias for start

down: stop ## Alias for stop

##@ Documentation

docs: ## Open documentation in browser
	@echo "$(BLUE)Opening documentation...$(NC)"
	@command -v open >/dev/null 2>&1 && open README.md || echo "Open README.md manually"

info: ## Display service information
	@echo "$(BLUE)Document Conversion Service$(NC)"
	@echo ""
	@echo "$(YELLOW)Service URLs:$(NC)"
	@echo "  API:           http://localhost:3001"
	@echo "  Health:        http://localhost:3001/health"
	@echo "  MinIO Console: http://localhost:9001"
	@echo "  Traefik:       http://localhost:8080"
	@echo ""
	@echo "$(YELLOW)Supported Formats:$(NC)"
	@echo "  .docx, .pptx, .doc, .ppt, .xlsx, .xls"
	@echo ""
	@echo "$(YELLOW)API Endpoints:$(NC)"
	@echo "  POST /convert/pdf   - Sync PDF conversion"
	@echo "  POST /convert/png   - Async PNG conversion"
	@echo "  POST /convert/batch - Batch conversion"
	@echo "  GET  /jobs/:id      - Job status"
	@echo "  GET  /health        - Health check"
	@echo ""
	@echo "$(YELLOW)Documentation:$(NC)"
	@echo "  make help    - Show all commands"
	@echo "  README.md    - Full documentation"
	@echo "  QUICKSTART.md - Quick start guide"
	@echo ""

