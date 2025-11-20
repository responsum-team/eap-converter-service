# Quick Start Guide

## Starting the Service

### Option 1: Full Production Stack (Recommended)

```bash
# Start all services with Traefik, Redis, MinIO, and workers
docker-compose up -d

# Wait for all services to initialize (30-60 seconds)
docker-compose ps

# Check health (API is on port 3001)
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-20T11:09:59.356Z",
  "services": {
    "gotenberg": "up",
    "redis": "up",
    "minio": "up"
  }
}
```

**Note**: The API is accessible on **port 3001** (`http://localhost:3001`). Traefik runs on port 80/443 but routing configuration can be customized if needed.

### Option 2: Development Mode

```bash
# Start only infrastructure services
docker-compose -f docker-compose.dev.yml up -d

# Install dependencies
npm install

# Run API locally
npm run dev

# In another terminal, run worker
npm run worker:dev
```

## Testing the Service

### Test 1: PDF Conversion (Synchronous)

```bash
# You need a real Office document (.docx, .pptx, .xlsx, etc.)
# The service only accepts Office formats, not plain text

# Convert to PDF (use your own document)
curl -X POST http://localhost:3001/convert/pdf \
  -F "file=@document.docx" \
  -o output.pdf

# Check the output
file output.pdf
# Should output: output.pdf: PDF document

# The service validates file types and will reject invalid formats:
# Supported: .docx, .pptx, .doc, .ppt, .xlsx, .xls
```

### Test 2: PNG Conversion (Asynchronous)

```bash
# Submit conversion job (use a real Office document)
JOB_ID=$(curl -s -X POST http://localhost:3001/convert/png \
  -F "file=@presentation.pptx" \
  -F "dpi=300" | jq -r '.jobId')

echo "Job ID: $JOB_ID"

# Check status
curl http://localhost:3001/jobs/$JOB_ID | jq

# Wait for completion (check status until "completed"), then download
curl http://localhost:3001/jobs/$JOB_ID/download -o result.zip

# The result will be a ZIP file with PNG images (one per slide/page)
```

### Test 3: Batch Conversion

```bash
# Convert multiple documents at once (max 10 files)
curl -X POST http://localhost:3001/convert/batch \
  -F "files=@doc1.docx" \
  -F "files=@doc2.pptx" \
  -F "files=@report.xlsx" \
  -F "format=pdf" | jq

# Response includes a batchId and individual jobIds
# Check batch status
curl http://localhost:3001/jobs/batch/BATCH_ID | jq
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f gotenberg
```

### Service Dashboards

- **API Service**: http://localhost:3001
- **API Health**: http://localhost:3001/health
- **Traefik Dashboard**: http://localhost:8080 (reverse proxy dashboard)
- **MinIO Console**: http://localhost:9001 (object storage UI)
  - Username: `minioadmin`
  - Password: `minioadmin`

### Check Service Status

```bash
# Container status
docker-compose ps

# Resource usage
docker stats

# Redis queue status
docker exec redis redis-cli info stats
```

## Development

### Build TypeScript

```bash
# Install dependencies first (generates node_modules)
npm install

# Type check only (requires TypeScript to be installed)
npm run typecheck

# Build to dist/
npm run build

# Run built code
npm start
```

### Hot Reload Development

```bash
# API with hot reload
npm run dev

# Worker with hot reload
npm run worker:dev
```

### Rebuild Docker Images

```bash
# Rebuild after code changes
docker-compose build

# Rebuild and restart
docker-compose up -d --build
```

## Stopping the Service

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs for all services
docker-compose logs

# Check logs for specific service
docker-compose logs api
docker-compose logs worker

# Check if ports are available
lsof -i :3001,3000,6379,9000,9001

# Restart specific service
docker-compose restart api
docker-compose restart worker
```

### Conversion Fails

```bash
# Check API logs
docker-compose logs api

# Check Gotenberg logs
docker-compose logs gotenberg

# Test Gotenberg directly (it's not exposed, only internal)
# Gotenberg is accessed internally by the API on port 3000

# Verify file format is supported
# Supported: .docx, .pptx, .doc, .ppt, .xlsx, .xls
```

### Jobs Stuck in Queue

```bash
# Check Redis
docker exec redis redis-cli
> KEYS *
> GET job:status:YOUR_JOB_ID

# Restart worker
docker-compose restart worker
```

### Out of Memory

```bash
# Check memory usage
docker stats

# Increase Docker memory (Docker Desktop: Settings → Resources)
# Minimum recommended: 4GB RAM
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/convert/pdf` | POST | Sync PDF conversion |
| `/convert/png` | POST | Async PNG conversion |
| `/convert/batch` | POST | Batch conversion |
| `/jobs/:id` | GET | Job status |
| `/jobs/:id/download` | GET | Download result |

## Next Steps

1. Service is running
2. Health check passes
3. Test conversions work
4. Read full [README.md](README.md)
5. Configure production security
6. Set up monitoring
7. Deploy to production

## Tips

- **API URL**: http://localhost:3001 (not port 80)
- **File Size Limit**: Default 50MB, configurable via `MAX_FILE_SIZE` env var
- **Rate Limiting**: 100 requests/minute per IP
- **PNG DPI**: Default 150, use 300 for high-quality presentations
- **Job Expiry**: Results expire after 24 hours in MinIO
- **Supported Formats**: .docx, .pptx, .doc, .ppt, .xlsx, .xls (Office documents only)
- **File Validation**: The service validates file types and rejects unsupported formats
- **Worker**: Async jobs (PNG conversion) are processed by the worker service

## Support

- **Full Documentation**: [README.md](README.md)
- **Architecture Design**: [docs/document-conversion-service-design.md](docs/document-conversion-service-design.md)
- **TypeScript Info**: [TYPESCRIPT_MIGRATION.md](TYPESCRIPT_MIGRATION.md)
- **Development Guide**: [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)
- **Build Info**: [BUILD_SUCCESS.md](BUILD_SUCCESS.md)
- **Coding Standards**: [.cursorrules](.cursorrules)

## Quick Reference

### Using Make (Recommended)

```bash
# Start development environment
make dev

# Start production stack
make start

# Check service status
make status

# View API logs
make logs-api

# Check health
make health

# Stop services
make stop

# See all commands
make help
```

### Using Docker Compose Directly

```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps

# Test API
curl http://localhost:3001/health

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

**Important**: API is on port **3001**, not 80!

---

**Ready to convert some documents? Let's go!**

