# Document Conversion Service - Technical System Design

> A microservices-based document conversion service that accepts PPTX/DOCX files and returns PDF or PNG outputs, using open-source Docker containers for rapid deployment.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [API Design](#api-design)
- [Docker Compose Configuration](#docker-compose-configuration)
- [PNG Conversion Strategy](#png-conversion-strategy)
- [Scaling & Load Balancing](#scaling--load-balancing)
- [Security Considerations](#security-considerations)
- [Monitoring & Observability](#monitoring--observability)
- [Alternative Solutions](#alternative-solutions)
- [Quick Start](#quick-start)
- [Resource Requirements](#resource-requirements)

---

## Architecture Overview

### High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client Layer
        C[Client Application]
    end

    subgraph Gateway Layer
        AG[API Gateway<br/>Traefik/Nginx]
    end

    subgraph Application Layer
        API[API Service<br/>Node.js/Python]
        Q[Queue Service<br/>Redis/RabbitMQ]
    end

    subgraph Conversion Layer
        G1[Gotenberg Instance 1]
        G2[Gotenberg Instance 2]
        G3[Gotenberg Instance N]
        PNG[PNG Converter<br/>Poppler/ImageMagick]
    end

    subgraph Storage Layer
        S3[Object Storage<br/>MinIO/S3]
    end

    C -->|HTTP/HTTPS| AG
    AG -->|Route| API
    API -->|Queue Jobs| Q
    API -->|Convert| G1
    API -->|Convert| G2
    API -->|Convert| G3
    G1 -->|PDF| PNG
    G2 -->|PDF| PNG
    G3 -->|PDF| PNG
    API -->|Store Results| S3
    
    style C fill:#e1f5fe
    style AG fill:#fff3e0
    style API fill:#f3e5f5
    style Q fill:#fce4ec
    style G1 fill:#e8f5e9
    style G2 fill:#e8f5e9
    style G3 fill:#e8f5e9
    style PNG fill:#fff8e1
    style S3 fill:#efebe9
```

### Component Interaction

```mermaid
graph LR
    subgraph External
        U[User]
    end
    
    subgraph "Docker Network"
        T[Traefik<br/>:80/:443]
        A[API Service<br/>:8080]
        G[Gotenberg<br/>:3000]
        R[Redis<br/>:6379]
        P[Poppler<br/>PNG Conv.]
        M[MinIO<br/>:9000]
    end
    
    U --> T
    T --> A
    A --> G
    A --> R
    G --> P
    A --> M
    
    style U fill:#bbdefb
    style T fill:#ffcc80
    style A fill:#ce93d8
    style G fill:#a5d6a7
    style R fill:#ef9a9a
    style P fill:#fff59d
    style M fill:#bcaaa4
```

---

## Core Components

### 1. Conversion Engine: Gotenberg

**Why Gotenberg?**
- Purpose-built for document conversion
- Docker-native with REST API
- Uses LibreOffice for Office formats
- Active maintenance and excellent documentation

| Property | Value |
|----------|-------|
| **Docker Image** | `gotenberg/gotenberg:8` |
| **Default Port** | 3000 |
| **License** | MIT |
| **Supported Formats** | DOCX, PPTX, XLSX, ODT, ODP, HTML, Markdown |

### 2. API Gateway Options

```mermaid
flowchart LR
    subgraph "Option A: Traefik"
        T[Traefik]
        T --> |Auto-discovery| D1[Docker Services]
    end
    
    subgraph "Option B: Nginx"
        N[Nginx]
        N --> |Manual Config| D2[Docker Services]
    end
    
    style T fill:#42a5f5
    style N fill:#66bb6a
```

### 3. Queue Service

For handling async/batch processing:

```mermaid
flowchart LR
    A[API] -->|Enqueue| R[(Redis)]
    W1[Worker 1] -->|Dequeue| R
    W2[Worker 2] -->|Dequeue| R
    W3[Worker N] -->|Dequeue| R
    
    W1 --> G[Gotenberg]
    W2 --> G
    W3 --> G
    
    style R fill:#ef5350
    style G fill:#66bb6a
```

### 4. Object Storage

For handling large files and results:

| Service | Use Case | Docker Image |
|---------|----------|--------------|
| MinIO | Self-hosted S3-compatible | `minio/minio` |
| AWS S3 | Cloud production | N/A |
| Local Volume | Development | N/A |

---

## Data Flow

### Synchronous PDF Conversion

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API Service
    participant G as Gotenberg
    
    C->>+A: POST /convert/pdf<br/>[DOCX/PPTX file]
    A->>A: Validate file type & size
    A->>+G: POST /forms/libreoffice/convert<br/>[multipart/form-data]
    G->>G: LibreOffice conversion
    G-->>-A: PDF binary
    A-->>-C: 200 OK<br/>[PDF file]
```

### Asynchronous PNG Conversion

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API Service
    participant Q as Redis Queue
    participant W as Worker
    participant G as Gotenberg
    participant P as Poppler
    participant S as Storage
    
    C->>+A: POST /convert/png<br/>[PPTX file]
    A->>A: Generate job ID
    A->>Q: Enqueue job
    A-->>-C: 202 Accepted<br/>{jobId: "abc123"}
    
    W->>Q: Dequeue job
    W->>+G: Convert to PDF
    G-->>-W: PDF binary
    W->>+P: pdftoppm -png
    P-->>-W: PNG files
    W->>S: Store results
    W->>Q: Update job status
    
    C->>+A: GET /jobs/abc123
    A->>Q: Get job status
    A-->>-C: 200 OK<br/>{status: "complete", urls: [...]}
```

### Batch Processing Flow

```mermaid
flowchart TD
    U[Upload Multiple Files] --> V{Validate All}
    V -->|Pass| Q[Add to Queue]
    V -->|Fail| E[Return Errors]
    
    Q --> W1[Worker 1]
    Q --> W2[Worker 2]
    Q --> W3[Worker N]
    
    W1 --> G[Gotenberg Pool]
    W2 --> G
    W3 --> G
    
    G --> S[(Storage)]
    S --> N[Notify Complete]
    N --> D[Download Results]
    
    style V fill:#fff59d
    style Q fill:#ef9a9a
    style G fill:#a5d6a7
    style S fill:#bcaaa4
```

---

## API Design

### Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `POST` | `/convert/pdf` | Sync PDF conversion | PDF binary |
| `POST` | `/convert/png` | Async PNG conversion | Job ID |
| `POST` | `/convert/batch` | Batch conversion | Job ID |
| `GET` | `/jobs/{id}` | Get job status | Job details |
| `GET` | `/jobs/{id}/download` | Download results | ZIP file |
| `GET` | `/health` | Health check | Status |

### Request/Response Flow

```mermaid
stateDiagram-v2
    [*] --> Received: POST /convert
    Received --> Validating: Check file
    Validating --> Rejected: Invalid
    Validating --> Queued: Valid (async)
    Validating --> Processing: Valid (sync)
    
    Queued --> Processing: Worker picks up
    Processing --> Converting: Gotenberg
    Converting --> PostProcessing: PDF ready
    PostProcessing --> Storing: Save results
    Storing --> Complete: Done
    
    Rejected --> [*]
    Complete --> [*]
```

### Example API Calls

**PDF Conversion (cURL):**
```bash
curl -X POST http://localhost:8080/convert/pdf \
  -F "file=@presentation.pptx" \
  -o presentation.pdf
```

**PNG Conversion (cURL):**
```bash
# Submit job
curl -X POST http://localhost:8080/convert/png \
  -F "file=@document.docx" \
  -H "Content-Type: multipart/form-data"

# Response: {"jobId": "abc123", "status": "queued"}

# Check status
curl http://localhost:8080/jobs/abc123

# Download when complete
curl http://localhost:8080/jobs/abc123/download -o images.zip
```

---

## Docker Compose Configuration

### Complete Production Setup

```yaml
version: '3.8'

services:
  # Reverse Proxy / Load Balancer
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.middlewares.ratelimit.ratelimit.average=100"
      - "traefik.http.middlewares.ratelimit.ratelimit.burst=50"

  # API Orchestration Service
  api:
    build: ./api
    container_name: converter-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - GOTENBERG_URL=http://gotenberg:3000
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - gotenberg
      - redis
      - minio
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`converter.localhost`)"
      - "traefik.http.services.api.loadbalancer.server.port=8080"

  # Document Conversion Engine
  gotenberg:
    image: gotenberg/gotenberg:8
    container_name: gotenberg
    restart: unless-stopped
    command:
      - "gotenberg"
      - "--api-timeout=300s"
      - "--api-root-path=/"
      - "--libreoffice-restart-after=10"
      - "--libreoffice-max-queue-size=20"
      - "--log-level=info"
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # Queue Service
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # PNG Conversion Sidecar
  poppler:
    image: minidocks/poppler
    container_name: poppler
    restart: unless-stopped
    volumes:
      - shared_tmp:/tmp/conversions

  # Object Storage
  minio:
    image: minio/minio
    container_name: minio
    restart: unless-stopped
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

volumes:
  redis_data:
  minio_data:
  shared_tmp:

networks:
  default:
    name: converter-network
```

### Minimal Development Setup

```yaml
version: '3.8'

services:
  gotenberg:
    image: gotenberg/gotenberg:8
    ports:
      - "3000:3000"
    command:
      - "gotenberg"
      - "--api-timeout=120s"
```

---

## PNG Conversion Strategy

### Pipeline Architecture

```mermaid
flowchart LR
    subgraph "Stage 1"
        D[DOCX/PPTX]
    end
    
    subgraph "Stage 2"
        G[Gotenberg<br/>LibreOffice]
    end
    
    subgraph "Stage 3"
        P[PDF]
    end
    
    subgraph "Stage 4"
        PP[Poppler<br/>pdftoppm]
    end
    
    subgraph "Stage 5"
        PNG1[Page 1.png]
        PNG2[Page 2.png]
        PNGN[Page N.png]
    end
    
    D --> G --> P --> PP --> PNG1
    PP --> PNG2
    PP --> PNGN
    
    style G fill:#a5d6a7
    style PP fill:#fff59d
```

### Implementation Options

| Option | Tool | Docker Image | Pros | Cons |
|--------|------|--------------|------|------|
| A | Poppler | `minidocks/poppler` | Fast, lightweight | Limited options |
| B | ImageMagick | `dpokidov/imagemagick` | Full-featured | Larger image |
| C | Custom | Build from Gotenberg | Single container | More complex |

### PNG Conversion Commands

```bash
# Using pdftoppm (Poppler)
pdftoppm -png -r 150 input.pdf output
# Output: output-1.png, output-2.png, ...

# Using ImageMagick
convert -density 150 input.pdf -quality 90 output-%d.png

# High-quality presentation slides
pdftoppm -png -r 300 -cropbox presentation.pdf slide
```

---

## Scaling & Load Balancing

### Horizontal Scaling Architecture

```mermaid
flowchart TB
    LB[Load Balancer<br/>Traefik]
    
    subgraph "API Tier"
        A1[API 1]
        A2[API 2]
        A3[API N]
    end
    
    subgraph "Conversion Tier"
        G1[Gotenberg 1]
        G2[Gotenberg 2]
        G3[Gotenberg N]
    end
    
    subgraph "Worker Tier"
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker N]
    end
    
    Q[(Redis<br/>Queue)]
    
    LB --> A1
    LB --> A2
    LB --> A3
    
    A1 --> Q
    A2 --> Q
    A3 --> Q
    
    W1 --> Q
    W2 --> Q
    W3 --> Q
    
    W1 --> G1
    W2 --> G2
    W3 --> G3
    
    style LB fill:#ffcc80
    style Q fill:#ef9a9a
```

### Docker Swarm Scaling

```yaml
services:
  gotenberg:
    image: gotenberg/gotenberg:8
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gotenberg
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gotenberg
  template:
    metadata:
      labels:
        app: gotenberg
    spec:
      containers:
      - name: gotenberg
        image: gotenberg/gotenberg:8
        resources:
          limits:
            memory: "2Gi"
            cpu: "2"
          requests:
            memory: "1Gi"
            cpu: "1"
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
```

---

## Security Considerations

### Security Architecture

```mermaid
flowchart TB
    subgraph "Security Layers"
        direction TB
        L1[Layer 1: Network<br/>Firewall, TLS]
        L2[Layer 2: Gateway<br/>Rate Limiting, Auth]
        L3[Layer 3: Application<br/>Validation, Sanitization]
        L4[Layer 4: Container<br/>Isolation, Resource Limits]
    end
    
    L1 --> L2 --> L3 --> L4
    
    style L1 fill:#ffcdd2
    style L2 fill:#f8bbd9
    style L3 fill:#e1bee7
    style L4 fill:#d1c4e9
```

### Security Checklist

| Category | Measure | Implementation |
|----------|---------|----------------|
| **Input Validation** | File type check | MIME type + extension |
| **Input Validation** | File size limit | Max 50MB default |
| **Input Validation** | Filename sanitization | Remove special chars |
| **Rate Limiting** | Request throttling | 100 req/min per IP |
| **Authentication** | API keys | Header-based auth |
| **Network** | TLS encryption | Let's Encrypt certs |
| **Container** | Non-root user | Gotenberg default |
| **Container** | Resource limits | Memory & CPU caps |
| **Timeout** | Conversion timeout | 300s max |

### Traefik Security Middleware

```yaml
labels:
  # Rate limiting
  - "traefik.http.middlewares.ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.ratelimit.ratelimit.burst=50"
  
  # Headers
  - "traefik.http.middlewares.secure-headers.headers.framedeny=true"
  - "traefik.http.middlewares.secure-headers.headers.sslredirect=true"
  
  # IP whitelist (optional)
  - "traefik.http.middlewares.ipwhitelist.ipwhitelist.sourcerange=10.0.0.0/8"
```

---

## Monitoring & Observability

### Monitoring Stack

```mermaid
flowchart LR
    subgraph "Services"
        G[Gotenberg]
        A[API]
        R[Redis]
    end
    
    subgraph "Collection"
        P[Prometheus]
    end
    
    subgraph "Visualization"
        GF[Grafana]
    end
    
    subgraph "Alerting"
        AM[AlertManager]
    end
    
    G -->|/metrics| P
    A -->|/metrics| P
    R -->|Exporter| P
    
    P --> GF
    P --> AM
    
    style P fill:#e65100,color:#fff
    style GF fill:#f57c00,color:#fff
    style AM fill:#ff9800
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gotenberg'
    static_configs:
      - targets: ['gotenberg:3000']
    metrics_path: /prometheus/metrics
    
  - job_name: 'traefik'
    static_configs:
      - targets: ['traefik:8080']
    metrics_path: /metrics
    
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `gotenberg_requests_total` | Total conversion requests | N/A |
| `gotenberg_requests_duration_seconds` | Conversion time | > 60s |
| `gotenberg_requests_queue_size` | Queue depth | > 50 |
| `process_resident_memory_bytes` | Memory usage | > 1.8GB |
| `redis_connected_clients` | Active connections | > 100 |

### Health Check Endpoints

| Service | Endpoint | Expected |
|---------|----------|----------|
| Gotenberg | `GET /health` | `{"status": "up"}` |
| API | `GET /health` | `{"status": "ok"}` |
| Redis | `redis-cli ping` | `PONG` |
| MinIO | `GET /minio/health/live` | `200 OK` |

---

## Alternative Solutions

### Comparison Matrix

```mermaid
quadrantChart
    title Conversion Solutions Comparison
    x-axis Low Complexity --> High Complexity
    y-axis Low Features --> High Features
    quadrant-1 Full-Featured
    quadrant-2 Best Balance
    quadrant-3 Simple
    quadrant-4 Complex
    Gotenberg: [0.35, 0.75]
    Stirling-PDF: [0.55, 0.85]
    LibreOffice-Direct: [0.70, 0.60]
    unoconv: [0.25, 0.40]
    Apache-Tika: [0.45, 0.50]
```

### Solution Details

| Tool | Best For | Docker Image | License |
|------|----------|--------------|---------|
| **Gotenberg** | Production API service | `gotenberg/gotenberg:8` | MIT |
| **Stirling-PDF** | Self-hosted with UI | `frooodle/s-pdf` | GPL-3.0 |
| **LibreOffice** | Direct control | `libreoffice/libreoffice` | MPL-2.0 |
| **unoconv** | Simple CLI | `zrrrzzt/unoconv` | GPL |
| **Apache Tika** | Text extraction | `apache/tika` | Apache-2.0 |

---

## Quick Start

### 1. Minimal Setup (Development)

```bash
# Start Gotenberg only
docker run -d -p 3000:3000 gotenberg/gotenberg:8

# Test conversion
curl -X POST http://localhost:3000/forms/libreoffice/convert \
  -F "files=@document.docx" \
  -o document.pdf
```

### 2. Full Stack Setup

```bash
# Clone repository
git clone https://github.com/your-repo/doc-converter
cd doc-converter

# Start all services
docker-compose up -d

# Check health
curl http://localhost:3000/health

# View logs
docker-compose logs -f
```

### 3. Test Endpoints

```bash
# PDF conversion
curl -X POST http://localhost:8080/convert/pdf \
  -F "file=@presentation.pptx" \
  -o output.pdf

# PNG conversion (async)
curl -X POST http://localhost:8080/convert/png \
  -F "file=@document.docx"

# Check job status
curl http://localhost:8080/jobs/{jobId}
```

---

## Resource Requirements

### Sizing Guide

```mermaid
xychart-beta
    title "Resource Scaling by Volume"
    x-axis ["Dev", "Small", "Medium", "Large", "Enterprise"]
    y-axis "Resources" 0 --> 20
    bar [1, 2, 4, 8, 16]
    line [1, 2, 5, 10, 18]
```

### Detailed Requirements

| Scale | Daily Volume | Gotenberg Instances | Memory | CPU | Storage |
|-------|--------------|---------------------|--------|-----|---------|
| **Dev/Test** | < 10 | 1 | 1 GB | 1 core | 5 GB |
| **Small** | < 100 | 1 | 2 GB | 2 cores | 20 GB |
| **Medium** | < 1,000 | 2-3 | 4 GB | 4 cores | 50 GB |
| **Large** | < 10,000 | 5-10 | 8 GB | 8 cores | 200 GB |
| **Enterprise** | 10,000+ | 10+ | 16+ GB | 16+ cores | 500+ GB |

### Cost Estimation (Cloud)

| Provider | Small | Medium | Large |
|----------|-------|--------|-------|
| AWS (ECS) | ~$50/mo | ~$150/mo | ~$400/mo |
| GCP (Cloud Run) | ~$40/mo | ~$120/mo | ~$350/mo |
| DigitalOcean | ~$30/mo | ~$80/mo | ~$200/mo |

---

## Conclusion

This design provides a scalable, production-ready document conversion service using proven open-source components. Key benefits:

- **Quick Deployment**: Single `docker-compose up` command
- **Scalable**: Horizontal scaling with load balancing
- **Reliable**: Health checks, retries, and queue-based processing
- **Secure**: Input validation, rate limiting, and container isolation
- **Observable**: Full metrics and logging stack

For questions or contributions, please open an issue on the project repository.

---

*Document Version: 1.0 | Last Updated: 2024*
