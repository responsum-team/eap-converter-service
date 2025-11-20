# Development Guide

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- TypeScript knowledge

### Initial Setup

```bash
# Clone and enter directory
cd eap_conversion_service

# Install dependencies
npm install

# Note: package-lock.json is committed for reproducible builds
# Docker uses 'npm ci' for faster, deterministic installs

# Start infrastructure services
docker-compose -f docker-compose.dev.yml up -d

# Run API (hot reload)
npm run dev

# In another terminal, run worker (hot reload)
npm run worker:dev
```

## TypeScript Development

### Build Commands

```bash
# Type check only (no output)
npm run typecheck

# Compile TypeScript to JavaScript (outputs to dist/)
npm run build

# Run compiled code
npm start
npm run worker
```

### Development Workflow

1. **Edit TypeScript files** in `src/`
2. **Hot reload** automatically restarts (dev mode)
3. **Type check** with `npm run typecheck`
4. **Build** before committing with `npm run build`

### Type Definitions

All shared types are in `src/types/index.ts`:

```typescript
import { JobData, JobStatus, BatchStatus } from './types';
```

## Code Standards

### Following .cursorrules

This project has comprehensive coding standards in `.cursorrules`. Key points:

#### 1. Type Safety
```typescript
// ✅ Good
async function convert(file: string): Promise<Buffer> {
  return await service.convert(file);
}

// ❌ Bad - never use 'any'
async function convert(file: any): Promise<any> {
  return await service.convert(file);
}
```

#### 2. Error Handling
```typescript
// ✅ Always use try-catch with proper typing
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('Context:', error);
  throw new Error(`Failed: ${(error as Error).message}`);
}
```

#### 3. Route Handlers
```typescript
// ✅ Type Request and Response
app.post('/endpoint', async (req: Request, res: Response) => {
  try {
    if (!req.body.field) {
      return res.status(400).json({ error: 'Missing field' });
    }
    
    const result = await process(req.body.field);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal error',
      message: (error as Error).message 
    });
  }
});
```

#### 4. Resource Cleanup
```typescript
// ✅ Always cleanup with try-finally
let tempFile: string | null = null;
try {
  tempFile = await createTemp();
  await process(tempFile);
} finally {
  if (tempFile) {
    try {
      await fs.unlink(tempFile);
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  }
}
```

## Project Structure

```
src/
├── server.ts                 # Express app + routes
├── worker.ts                 # Background job processor
├── types/
│   └── index.ts             # Shared TypeScript types
└── services/
    ├── conversionService.ts  # Gotenberg integration
    ├── queueService.ts       # Redis/Bull queue
    └── storageService.ts     # MinIO storage
```

### Adding New Features

1. **Define types first** in `src/types/index.ts`
2. **Create service methods** in appropriate service file
3. **Add route handler** in `src/server.ts`
4. **Add worker logic** in `src/worker.ts` (if async)
5. **Update documentation** in README.md

### Example: Adding a New Endpoint

```typescript
// 1. Add types (src/types/index.ts)
export interface ConversionOptions {
  quality: 'low' | 'medium' | 'high';
  dpi?: number;
}

// 2. Add service method (src/services/conversionService.ts)
async convertWithOptions(
  file: string, 
  options: ConversionOptions
): Promise<Buffer> {
  // implementation
}

// 3. Add route (src/server.ts)
app.post('/convert/advanced', upload.single('file'), 
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file' });
      }
      
      const options: ConversionOptions = {
        quality: req.body.quality || 'medium',
        dpi: parseInt(req.body.dpi, 10) || 150
      };
      
      const result = await conversionService.convertWithOptions(
        req.file.path, 
        options
      );
      
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(result);
      
    } catch (error) {
      console.error('Conversion error:', error);
      return res.status(500).json({ 
        error: 'Failed',
        message: (error as Error).message 
      });
    } finally {
      if (req.file) {
        await fs.unlink(req.file.path).catch(console.error);
      }
    }
});
```

## Testing

### Manual Testing

```bash
# Health check
curl http://localhost:8080/health

# PDF conversion
curl -X POST http://localhost:8080/convert/pdf \
  -F "file=@test.docx" \
  -o output.pdf

# PNG conversion (async)
curl -X POST http://localhost:8080/convert/png \
  -F "file=@test.pptx" \
  -F "dpi=300"
```

### Docker Testing

```bash
# Build and test in Docker
docker-compose up --build

# Check logs
docker-compose logs -f api
docker-compose logs -f worker

# Stop and clean
docker-compose down -v
```

## Debugging

### TypeScript Debugging

Source maps are enabled - use VS Code debugger:

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API",
  "runtimeArgs": ["-r", "ts-node/register"],
  "args": ["${workspaceFolder}/src/server.ts"],
  "env": {
    "NODE_ENV": "development"
  }
}
```

### Common Issues

#### "Cannot find module"
```bash
# Rebuild
npm run build
# or
npm install
```

#### Type errors
```bash
# Check all type errors
npm run typecheck

# Common fixes:
# - Add missing types to src/types/index.ts
# - Install @types/* packages
# - Use 'as Type' for type assertions
```

#### Docker build fails
```bash
# Clean rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Performance

### Monitoring

```bash
# Check container resources
docker stats

# Check Redis queue
docker exec redis redis-cli
> KEYS *
> LLEN bull:png-conversion:wait

# Check MinIO storage
open http://localhost:9001
```

### Optimization Tips

1. **File Size**: Limit uploads (current: 50MB)
2. **DPI Settings**: Lower DPI = faster PNG conversion
3. **Concurrency**: Scale workers with `docker-compose up --scale worker=3`
4. **Memory**: Increase Gotenberg memory in docker-compose.yml

## Production Deployment

### Build for Production

```bash
# Build TypeScript
npm run build

# Build Docker images
docker-compose build

# Start production stack
docker-compose up -d
```

### Environment Variables

Copy and configure:
```bash
cp .env.example .env
# Edit .env with production values
```

Key variables:
- `NODE_ENV=production`
- `GOTENBERG_URL=http://gotenberg:3000`
- `REDIS_URL=redis://redis:6379`
- `MINIO_*` for storage configuration

### Security Checklist

- [ ] Change MinIO credentials
- [ ] Enable HTTPS (configure Traefik)
- [ ] Set up proper firewall rules
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerting
- [ ] Regular security updates

## Resources

- **README.md** - Complete documentation
- **QUICKSTART.md** - Quick start guide
- **.cursorrules** - Coding standards
- **TYPESCRIPT_MIGRATION.md** - TypeScript info
- **docs/document-conversion-service-design.md** - Architecture

## Getting Help

### Check Logs
```bash
docker-compose logs [service-name]
```

### Verify Health
```bash
curl http://localhost/health | jq
```

### Check Types
```bash
npm run typecheck
```

### Debug Mode
Set `LOG_LEVEL=debug` in environment for verbose logging.

---

**Happy coding! 🚀**

