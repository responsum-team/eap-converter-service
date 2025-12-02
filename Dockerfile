ARG BASE_IMAGE=node:18-alpine

FROM ${BASE_IMAGE} AS builder

# Install poppler-utils for PNG conversion
RUN apk add --no-cache poppler-utils

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM ${BASE_IMAGE}

# Install poppler-utils for PNG conversion
RUN apk add --no-cache poppler-utils

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create temp directory for file processing
RUN mkdir -p /tmp/conversions && chmod 777 /tmp/conversions

# Run as non-root user
# USER node

# Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:80/healthz', (r) => {if(r.statusCode !== 200) process.exit(1)})"

EXPOSE 80

CMD ["node", "dist/server.js"]

