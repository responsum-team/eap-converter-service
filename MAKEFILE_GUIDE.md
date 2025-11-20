# Makefile Guide

The Document Conversion Service includes a comprehensive Makefile to simplify common development and deployment tasks.

## Quick Start

```bash
# See all available commands
make help

# Start development environment
make dev

# Start production stack
make start

# Check service health
make health

# Stop services
make stop
```

## All Commands

### General

| Command | Description |
|---------|-------------|
| `make help` | Display all available commands with descriptions |

### Development

| Command | Description |
|---------|-------------|
| `make install` | Install npm dependencies |
| `make dev` | Start development environment (infrastructure only) |
| `make dev-api` | Start API in development mode with hot reload |
| `make dev-worker` | Start Worker in development mode with hot reload |

**Development Workflow:**
```bash
# 1. Start infrastructure services
make dev

# 2. In another terminal, start API
make dev-api

# 3. In another terminal, start Worker
make dev-worker
```

### Production

| Command | Description |
|---------|-------------|
| `make start` | Start production stack (all services with Docker) |
| `make stop` | Stop all services |
| `make stop-dev` | Stop development services |
| `make restart` | Restart all services |
| `make status` | Show status of all services |

**Production Workflow:**
```bash
# Start everything
make start

# Check status
make status

# View logs
make logs-api

# Stop when done
make stop
```

### Build

| Command | Description |
|---------|-------------|
| `make build` | Build Docker images |
| `make rebuild` | Rebuild Docker images from scratch (no cache) |
| `make typecheck` | Run TypeScript type checking |
| `make compile` | Compile TypeScript to JavaScript |

**Build Workflow:**
```bash
# After code changes, rebuild images
make rebuild

# Or just build normally
make build

# Type check before building
make typecheck
```

### Logs & Monitoring

| Command | Description |
|---------|-------------|
| `make logs` | View logs from all services |
| `make logs-api` | View API logs |
| `make logs-worker` | View Worker logs |
| `make logs-gotenberg` | View Gotenberg logs |
| `make logs-redis` | View Redis logs |
| `make health` | Check health of all services |

**Monitoring Examples:**
```bash
# Watch API logs in real-time
make logs-api

# Check health status
make health

# See all service logs
make logs
```

### Testing

| Command | Description |
|---------|-------------|
| `make test` | Display test instructions |
| `make test-health` | Test health endpoint |

**Testing Example:**
```bash
# Quick health check
make test-health

# See test instructions
make test
```

### Cleanup

| Command | Description |
|---------|-------------|
| `make clean` | Stop services and remove volumes ⚠️ **Deletes all data** |
| `make clean-dev` | Stop development services and remove volumes |
| `make clean-images` | Remove Docker images |
| `make clean-all` | Complete cleanup (services, volumes, images) |

**Cleanup Examples:**
```bash
# Stop and clean development environment
make clean-dev

# Complete cleanup (WARNING: deletes all data)
make clean

# Remove everything including images
make clean-all
```

### Utilities

| Command | Description |
|---------|-------------|
| `make shell-api` | Open shell in API container |
| `make shell-worker` | Open shell in Worker container |
| `make shell-redis` | Open Redis CLI |
| `make ps` | Alias for `status` |
| `make up` | Alias for `start` |
| `make down` | Alias for `stop` |

**Utility Examples:**
```bash
# Access API container shell
make shell-api

# Use Redis CLI
make shell-redis

# Quick status check
make ps
```

### Documentation

| Command | Description |
|---------|-------------|
| `make docs` | Open documentation in browser |
| `make info` | Display service information |

## Common Workflows

### Starting for the First Time

```bash
# 1. Install dependencies
make install

# 2. Start production stack
make start

# 3. Wait 30-60 seconds, then check health
make health

# 4. Test the API
curl http://localhost:3001/health
```

### Development Workflow

```bash
# 1. Start infrastructure
make dev

# 2. Open new terminals and run:
make dev-api      # Terminal 2
make dev-worker   # Terminal 3

# 3. Code changes auto-reload
# 4. When done:
make stop-dev
```

### Rebuilding After Changes

```bash
# Stop services
make stop

# Rebuild images
make rebuild

# Start again
make start

# Check logs
make logs-api
```

### Troubleshooting

```bash
# Check service status
make status

# View logs for debugging
make logs-api
make logs-worker

# Check health
make health

# Restart everything
make restart
```

### Cleaning Up

```bash
# Stop services (keeps data)
make stop

# Clean everything including data
make clean

# Nuclear option - removes images too
make clean-all
```

## Color Codes

The Makefile uses colors to improve readability:
- **Blue** - Section headers and informational messages
- **Green** - Success messages
- **Yellow** - Important notes and next steps
- **Red** - Warnings and errors

## Tips

1. **Always use `make help`** to see available commands
2. **Use `make status`** frequently to check service health
3. **Use `make logs-api`** for debugging issues
4. **Use `make dev`** for local development to avoid rebuilding Docker images
5. **Use `make clean`** carefully - it deletes all data!
6. **Aliases available**: `up`, `down`, `ps` for shorter commands

## Environment Variables

The Makefile respects all environment variables defined in `.env`:
- `MAX_FILE_SIZE` - Maximum upload file size
- `PNG_DPI` - Default PNG resolution
- `REDIS_URL` - Redis connection string
- And more...

## Requirements

- **Make** - Usually pre-installed on macOS/Linux
- **Docker** - For container orchestration
- **Docker Compose** - For multi-container management
- **Node.js 18+** - For local development (dev mode)
- **npm** - For dependency management
- **curl** - For testing (usually pre-installed)
- **jq** - For JSON parsing (optional, for prettier output)

## Getting Help

```bash
# Show all commands
make help

# Show service information
make info

# Open full documentation
make docs
```

## Examples

### Complete Development Session

```bash
# Start fresh
make install
make dev

# In separate terminals
make dev-api
make dev-worker

# Test
curl http://localhost:3001/health

# When done
make stop-dev
```

### Complete Production Session

```bash
# Start
make start

# Monitor
make logs-api

# Test
make test-health

# Stop
make stop
```

### After Making Code Changes

```bash
# Stop
make stop

# Rebuild with no cache
make rebuild

# Start
make start

# Verify
make health
```

---

**Pro Tip**: Add `make start` to your morning routine and `make stop` to your evening routine!

