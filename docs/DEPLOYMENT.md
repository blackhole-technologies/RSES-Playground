# RSES-Playground Production Deployment Guide

## Overview

This document provides instructions for deploying RSES-Playground to a production environment.

## Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL 14+
- Reverse proxy (nginx recommended)
- Process manager (PM2 or systemd)
- SSL/TLS certificate

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | - | Secure random string for session signing |
| `PORT` | No | 5000 | HTTP server port |
| `NODE_ENV` | No | development | Set to `production` for production |
| `LOG_LEVEL` | No | info | Logging level: error, warn, info, debug |
| `DB_POOL_MIN` | No | 2 | Minimum database connections |
| `DB_POOL_MAX` | No | 10 | Maximum database connections |
| `DB_IDLE_TIMEOUT` | No | 30000 | Idle connection timeout (ms) |
| `DB_CONNECTION_TIMEOUT` | No | 5000 | Connection timeout (ms) |
| `DB_STATEMENT_TIMEOUT` | No | 30000 | Statement timeout (ms) |

## Database Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE rses_playground;
CREATE USER rses_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE rses_playground TO rses_user;
```

### 2. Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://rses_user:your_secure_password@localhost:5432/rses_playground"

# Run migrations
npm run db:push
```

## Application Setup

### 1. Install Dependencies

```bash
npm ci --production
```

### 2. Build Application

```bash
npm run build
```

### 3. Configure Environment

Create `/etc/rses-playground/.env`:

```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://rses_user:password@localhost:5432/rses_playground
SESSION_SECRET=your_64_char_random_secret_here
LOG_LEVEL=info
```

## Running with PM2

### 1. Install PM2

```bash
npm install -g pm2
```

### 2. Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'rses-playground',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/rses-playground/error.log',
    out_file: '/var/log/rses-playground/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M'
  }]
};
```

### 3. Start Application

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## Running with Systemd

### 1. Create Service File

Create `/etc/systemd/system/rses-playground.service`:

```ini
[Unit]
Description=RSES Playground
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/rses-playground
EnvironmentFile=/etc/rses-playground/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/rses-playground/out.log
StandardError=append:/var/log/rses-playground/error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/rses-playground /var/log/rses-playground
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable rses-playground
sudo systemctl start rses-playground
```

## Nginx Reverse Proxy

### 1. Install Nginx

```bash
sudo apt install nginx
```

### 2. Configure Site

Create `/etc/nginx/sites-available/rses-playground`:

```nginx
upstream rses_backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name rses.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rses.example.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/rses.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rses.example.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Proxy settings
    location / {
        proxy_pass http://rses_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://rses_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    # Static files caching
    location /assets {
        proxy_pass http://rses_backend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/rses-playground /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL/TLS Setup with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d rses.example.com
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nodejs
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
USER nodejs
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/rses
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: rses
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

## Health Checks

The application exposes health check endpoints for container orchestration:

- `GET /health` - Liveness probe (always returns 200 if process is alive)
- `GET /ready` - Readiness probe (checks database connectivity)

Configure Kubernetes/Docker health checks to use these endpoints.

## Security Checklist

- [ ] Set strong `SESSION_SECRET` (64+ random characters)
- [ ] Use HTTPS in production
- [ ] Configure database with least privilege
- [ ] Enable firewall (only allow 443, 80 -> 443 redirect)
- [ ] Set up log rotation
- [ ] Configure rate limiting in nginx
- [ ] Enable security headers (done by helmet middleware)
- [ ] Regular security updates
- [ ] Backup database regularly

## Performance Tuning

### Node.js

```bash
# Increase memory limit if needed
NODE_OPTIONS="--max-old-space-size=512"
```

### PostgreSQL

Recommended settings for `postgresql.conf`:

```ini
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 6553kB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 4
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
```
