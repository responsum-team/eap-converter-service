# Document Conversion Service

A production-ready microservices-based document conversion service that converts PPTX/DOCX files to PDF or PNG formats using open-source Docker containers.

## Features

- **Synchronous PDF Conversion** - Convert documents to PDF with immediate response
- **Asynchronous PNG Conversion** - Convert documents to PNG images via job queue
- **Batch Processing** - Convert multiple documents in parallel
- **Object Storage** - MinIO-based S3-compatible storage for results
- **Queue System** - Redis-backed job queue with retry logic
- **API Gateway** - Traefik reverse proxy with rate limiting
- **Health Monitoring** - Health check endpoints for all services
- **Production Ready** - Docker Compose orchestration with graceful shutdown

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
┌──────▼──────┐
│   Traefik   │  (Reverse Proxy / Rate Limiting)
└──────┬──────┘
       │
┌──────▼──────┐
│  API Server │  (Node.js / Express)
└──┬───────┬──┘
   │       │
   │   ┌───▼────┐
   │   │ Redis  │  (Job Queue)
   │   └───┬────┘
   │       │
   │   ┌───▼────┐
   │   │ Worker │  (Async Processing)
   │   └───┬────┘
   │       │
┌──▼───────▼──┐
│  Gotenberg  │  (Document Conversion)
└──────┬──────┘
       │
┌──────▼──────┐
│   MinIO     │  (Object Storage)
└─────────────┘
```

## Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Make (pre-installed on macOS/Linux)
- 4GB RAM minimum
- 10GB disk space

### 1. Start All Services

**Using Make (Recommended):**
```bash
# Clone the repository
cd eap_conversion_service

# Start all services in production mode
make start

# Check service health
make health
```

**Using Docker Compose directly:**
```bash
# Start all services
docker-compose up -d

# Check service health
curl http://localhost:3001/health
```

### 2. Test the Service

```bash
# Test health endpoint
make test-health
# or: curl http://localhost:3001/health

# Test PDF conversion (synchronous)
curl -X POST http://localhost:3001/convert/pdf \
  -F "file=@document.docx" \
  -o output.pdf

# Test PNG conversion (asynchronous)
curl -X POST http://localhost:3001/convert/png \
  -F "file=@presentation.pptx" \
  -F "dpi=300"

# Response: {"jobId":"abc-123","status":"queued","statusUrl":"/jobs/abc-123"}

# Check job status
curl http://localhost:3001/jobs/abc-123

# Download result when complete
curl http://localhost:3001/jobs/abc-123/download -o images.zip
```

### 3. View Logs

**Using Make:**
```bash
# View all logs
make logs

# View specific service logs
make logs-api
make logs-worker
make logs-gotenberg
```

**Using Docker Compose:**
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
```

### 4. Stop Services

**Using Make:**
```bash
# Stop all services
make stop

# Stop and remove volumes (deletes data)
make clean
```

**Using Docker Compose:**
```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## API Documentation

### Endpoints

| Method | Endpoint | Description | Response Type |
|--------|----------|-------------|---------------|
| `GET` | `/health` | Health check for all services | JSON |
| `POST` | `/convert/pdf` | Convert document to PDF (sync) | Binary PDF |
| `POST` | `/convert/png` | Convert document to PNG (async) | JSON (Job ID) |
| `POST` | `/convert/batch` | Batch convert multiple files | JSON (Batch ID) |
| `GET` | `/jobs/:jobId` | Get job status | JSON |
| `GET` | `/jobs/batch/:batchId` | Get batch status | JSON |
| `GET` | `/jobs/:jobId/download` | Download conversion result | Binary/ZIP |

### 1. Synchronous PDF Conversion

Convert a document to PDF and receive the result immediately.

**Request:**
```bash
curl -X POST http://localhost/convert/pdf \
  -F "file=@document.docx" \
  -o output.pdf
```

**Response:**
- Content-Type: `application/pdf`
- Binary PDF data

**Supported formats:** `.docx`, `.pptx`, `.doc`, `.ppt`, `.xlsx`, `.xls`

### 2. Asynchronous PNG Conversion

Convert a document to PNG images via background job.

**Request:**
```bash
curl -X POST http://localhost/convert/png \
  -F "file=@presentation.pptx" \
  -F "dpi=300"
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Conversion job queued successfully",
  "statusUrl": "/jobs/550e8400-e29b-41d4-a716-446655440000"
}
```

**Parameters:**
- `file` (required) - Document file
- `dpi` (optional) - PNG resolution (default: 150, recommended for presentations: 300)

### 3. Batch Conversion

Convert multiple documents in parallel.

**Request:**
```bash
curl -X POST http://localhost/convert/batch \
  -F "files=@document1.docx" \
  -F "files=@document2.pptx" \
  -F "files=@document3.xlsx" \
  -F "format=pdf"
```

**Response:**
```json
{
  "batchId": "batch-123",
  "status": "queued",
  "jobs": [
    {"jobId": "job-1", "filename": "document1.docx", "status": "queued"},
    {"jobId": "job-2", "filename": "document2.pptx", "status": "queued"},
    {"jobId": "job-3", "filename": "document3.xlsx", "status": "queued"}
  ],
  "message": "3 conversion jobs queued successfully",
  "statusUrl": "/jobs/batch/batch-123"
}
```

**Parameters:**
- `files` (required) - Multiple document files (max 10)
- `format` (optional) - Output format: `pdf` or `png` (default: `pdf`)
- `dpi` (optional) - PNG resolution for PNG format

### 4. Job Status

Check the status of an asynchronous conversion job.

**Request:**
```bash
curl http://localhost/jobs/550e8400-e29b-41d4-a716-446655440000
```

**Response (Processing):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "originalName": "presentation.pptx",
  "format": "png",
  "progress": 60,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:15.000Z"
}
```

**Response (Completed):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "originalName": "presentation.pptx",
  "format": "png",
  "progress": 100,
  "resultPath": "550e8400-e29b-41d4-a716-446655440000/presentation.zip",
  "downloadUrl": "http://minio:9000/conversions/...",
  "filename": "presentation.zip",
  "fileCount": 15,
  "contentType": "application/zip",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "completedAt": "2024-01-15T10:30:45.000Z"
}
```

**Job Statuses:**
- `queued` - Job is waiting to be processed
- `processing` - Job is currently being converted
- `completed` - Job completed successfully
- `failed` - Job failed with error

### 5. Download Result

Download the conversion result.

**Request:**
```bash
curl http://localhost/jobs/550e8400-e29b-41d4-a716-446655440000/download \
  -o result.zip
```

**Response:**
- Binary data (PDF or ZIP containing PNG files)
- Content-Type: `application/pdf` or `application/zip`

### 6. Health Check

Check the health of all services.

**Request:**
```bash
curl http://localhost/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "gotenberg": "up",
    "redis": "up",
    "minio": "up"
  }
}
```

## Development

### Development Mode

Run services without Traefik for local development:

**Using Make (Recommended):**
```bash
# Start infrastructure services only
make dev

# In separate terminals:
make dev-api      # API with hot reload
make dev-worker   # Worker with hot reload

# Or manually:
npm run dev
npm run worker:dev
```

**Using Docker Compose:**
```bash
# Start minimal services
docker-compose -f docker-compose.dev.yml up -d

# Install dependencies
npm install

# Run API locally (with hot reload)
npm run dev

# Run worker locally (with hot reload)
npm run worker:dev
```

### Makefile Commands

See all available commands:
```bash
make help
```

Common commands:
- `make start` - Start production stack
- `make dev` - Start development environment
- `make stop` - Stop services
- `make logs-api` - View API logs
- `make health` - Check service health
- `make status` - Show service status
- `make clean` - Clean up (deletes data)

See [MAKEFILE_GUIDE.md](MAKEFILE_GUIDE.md) for complete documentation.

### Code Standards

This project follows TypeScript and Express.js best practices. See [`.cursorrules`](.cursorrules) for:
- TypeScript coding standards
- Express API patterns
- Error handling guidelines
- Security best practices
- Performance optimization tips

### Environment Variables

Create a `.env` file in the project root:

```env
# Server Configuration
NODE_ENV=production
PORT=8080

# Gotenberg Configuration
GOTENBERG_URL=http://gotenberg:3000

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# MinIO Configuration
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=conversions

# File Upload Configuration
MAX_FILE_SIZE=52428800
ALLOWED_EXTENSIONS=.docx,.pptx,.doc,.ppt

# PNG Conversion Configuration
PNG_DPI=150
PNG_HIGH_QUALITY_DPI=300

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Project Structure

```
eap_conversion_service/
├── docs/
│   └── document-conversion-service-design.md
├── src/
│   ├── server.ts                    # Main API server (TypeScript)
│   ├── worker.ts                    # Background job worker (TypeScript)
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   └── services/
│       ├── conversionService.ts     # Gotenberg integration
│       ├── queueService.ts          # Redis queue management
│       └── storageService.ts        # MinIO storage
├── dist/                            # Compiled JavaScript (generated)
├── docker-compose.yml               # Production setup
├── docker-compose.dev.yml           # Development setup
├── Dockerfile                       # API/Worker container image
├── package.json                     # Node.js dependencies
├── tsconfig.json                    # TypeScript configuration
├── .dockerignore
├── .gitignore
└── README.md
```

## Monitoring

### Service Dashboards

- **Traefik Dashboard**: http://localhost:8080
- **MinIO Console**: http://localhost:9001 (admin/minioadmin)

### Container Status

```bash
# Check all containers
docker-compose ps

# Check resource usage
docker stats

# View container logs
docker-compose logs -f [service-name]
```

### Health Checks

All services include health checks:

```bash
# API health
curl http://localhost/health

# Gotenberg health
curl http://localhost:3000/health

# Redis health
docker exec redis redis-cli ping

# MinIO health
curl http://localhost:9000/minio/health/live
```

## Scaling

### Horizontal Scaling

Scale conversion workers and Gotenberg instances:

```bash
# Scale workers
docker-compose up -d --scale worker=3

# Scale Gotenberg
docker-compose up -d --scale gotenberg=2
```

### Resource Limits

Default resource limits are configured in `docker-compose.yml`:

- **Gotenberg**: 2 CPU cores, 2GB RAM
- **API/Worker**: Default Docker limits
- **Redis**: Default Docker limits
- **MinIO**: Default Docker limits

## Troubleshooting

### Common Issues

**1. Port conflicts**
```bash
# Check if ports are in use
lsof -i :80,443,3000,6379,9000,9001

# Change ports in docker-compose.yml if needed
```

**2. Out of memory**
```bash
# Check memory usage
docker stats

# Increase Docker memory limit (Docker Desktop)
# Settings -> Resources -> Memory
```

**3. Conversion failures**
```bash
# Check Gotenberg logs
docker-compose logs gotenberg

# Check worker logs
docker-compose logs worker

# Test Gotenberg directly
curl -F "files=@test.docx" \
  http://localhost:3000/forms/libreoffice/convert \
  -o test.pdf
```

**4. Job stuck in queue**
```bash
# Check Redis
docker exec redis redis-cli
> KEYS *
> GET job:status:YOUR_JOB_ID

# Restart worker
docker-compose restart worker
```

## Performance

### Throughput

- **PDF Conversion**: ~5-10 seconds per document (depends on size/complexity)
- **PNG Conversion**: ~10-20 seconds per document (depends on page count and DPI)
- **Concurrent Jobs**: Scales with number of workers

### Optimization Tips

1. **Increase Workers**: Scale worker service for better throughput
2. **Adjust DPI**: Lower DPI (96-150) for faster PNG conversion
3. **Resource Limits**: Increase Gotenberg memory for large documents
4. **Caching**: Implement result caching for repeated conversions

## Security

### Security Features

- File type validation
- File size limits (50MB default)
- Rate limiting (100 req/min)
- Helmet.js security headers
- Container isolation
- Non-root containers
- Resource limits

### Production Recommendations

1. Enable HTTPS: Configure TLS certificates in Traefik
2. Add Authentication: Implement API key or OAuth
3. Network Isolation: Use Docker networks
4. Secure MinIO: Change default credentials
5. Firewall Rules: Restrict external access
6. Regular Updates: Keep Docker images updated

## License

MIT

## Support

For issues and feature requests, please refer to the project documentation in `docs/document-conversion-service-design.md`.

---

**Built with:**
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Node.js](https://nodejs.org/) - Runtime environment
- [Express](https://expressjs.com/) - Web framework
- [Gotenberg](https://gotenberg.dev/) - Document conversion engine
- [Redis](https://redis.io/) - Job queue
- [MinIO](https://min.io/) - Object storage
- [Traefik](https://traefik.io/) - Reverse proxy
- [Docker](https://www.docker.com/) - Containerization

