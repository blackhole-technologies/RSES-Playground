# RSES-Playground Operations Runbook

## Overview

This runbook provides operational guidance for running RSES-Playground in production.

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /health` | Liveness check | 200 OK |
| `GET /ready` | Readiness check | 200 OK (or 503 if unhealthy) |
| `GET /metrics` | Prometheus metrics | text/plain metrics |

### Key Metrics

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `http_requests_total` | Counter | Monitor for anomalies |
| `http_request_duration_seconds` | Histogram | p95 > 2s |
| `rses_parse_duration_seconds` | Histogram | p95 > 1s |
| `websocket_connections_active` | Gauge | > 1000 |
| `db_pool_size{state="waiting"}` | Gauge | > 5 |

### Prometheus Alerting Rules

```yaml
groups:
  - name: rses-playground
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High HTTP error rate detected

      - alert: SlowResponses
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Slow HTTP responses detected

      - alert: CircuitBreakerOpen
        expr: db_circuit_state == 2
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Database circuit breaker is open

      - alert: DatabaseConnectionPoolExhausted
        expr: db_pool_size{state="waiting"} > 5
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: Database connection pool has waiting clients
```

## Log Aggregation

### Log Format

Logs are output in JSON format with the following fields:

```json
{
  "level": "info",
  "time": "2026-01-31T12:00:00.000Z",
  "service": "rses-playground",
  "module": "http",
  "correlationId": "abc-123",
  "method": "GET",
  "path": "/api/configs",
  "statusCode": 200,
  "duration": 45,
  "msg": "Request completed"
}
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `error` | System errors, exceptions |
| `warn` | Recoverable issues, deprecations |
| `info` | Request completions, state changes |
| `debug` | Detailed debugging (development only) |

### Loki/Grafana Query Examples

```logql
# All errors in last hour
{app="rses-playground"} |= `"level":"error"` | json

# Slow requests
{app="rses-playground"} | json | duration > 1000

# Requests by correlation ID
{app="rses-playground"} |= `"correlationId":"abc-123"`

# Circuit breaker events
{app="rses-playground"} |= `circuit`
```

## Backup Procedures

### Database Backup

```bash
#!/bin/bash
# /opt/scripts/backup-db.sh

BACKUP_DIR=/var/backups/rses
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE=$BACKUP_DIR/rses_$DATE.sql.gz

mkdir -p $BACKUP_DIR

pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

# Keep last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 cp $BACKUP_FILE s3://backups/rses/
```

### Scheduled Backup

```bash
# /etc/cron.d/rses-backup
0 2 * * * root /opt/scripts/backup-db.sh
```

### Restore from Backup

```bash
gunzip -c /var/backups/rses/rses_20260131_020000.sql.gz | psql $DATABASE_URL
```

## Troubleshooting Guide

### Issue: Application Not Starting

**Symptoms**: Service fails to start, port not listening

**Check**:
1. View logs: `journalctl -u rses-playground -f`
2. Verify environment: `cat /etc/rses-playground/.env`
3. Test database: `psql $DATABASE_URL -c "SELECT 1"`

**Common Causes**:
- Missing `DATABASE_URL`
- Database not accessible
- Port already in use
- Missing dependencies

### Issue: High Memory Usage

**Symptoms**: Memory growing over time, OOM kills

**Check**:
1. Current memory: `ps aux | grep node`
2. Heap stats: `curl localhost:5000/metrics | grep nodejs_heap`

**Solutions**:
- Increase `max-old-space-size`
- Check for memory leaks in custom handlers
- Reduce connection pool size
- Add memory limit to container/service

### Issue: Slow Responses

**Symptoms**: High latency, timeout errors

**Check**:
1. Database queries: Check `db_query_duration_seconds` metrics
2. Connection pool: Check `db_pool_size{state="waiting"}`
3. Circuit breaker: Check `/ready` endpoint

**Solutions**:
- Increase database pool size
- Optimize slow queries
- Add database indexes
- Scale horizontally

### Issue: Database Connection Failures

**Symptoms**: 503 on `/ready`, circuit breaker open

**Check**:
1. Database status: `pg_isready -h localhost -p 5432`
2. Connection count: `SELECT count(*) FROM pg_stat_activity`
3. Circuit state: `curl localhost:5000/ready | jq .pool`

**Solutions**:
- Restart database
- Increase `max_connections` in PostgreSQL
- Reset circuit breaker (restart app)
- Check network connectivity

### Issue: WebSocket Disconnections

**Symptoms**: Clients losing connection, reconnect loops

**Check**:
1. Active connections: Check `websocket_connections_active` metric
2. Nginx proxy timeout settings
3. Load balancer timeout settings

**Solutions**:
- Increase proxy timeouts
- Check nginx `proxy_read_timeout`
- Verify WebSocket upgrade headers
- Check for client-side keepalive

## Scaling

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# PM2
pm2 scale rses-playground 4

# Docker Compose
docker-compose up --scale app=4

# Kubernetes
kubectl scale deployment rses-playground --replicas=4
```

### Considerations

- Session store: Use Redis for shared sessions across instances
- WebSocket: Use sticky sessions or Redis adapter
- Database: Single PostgreSQL can handle ~100 concurrent connections

## Maintenance Windows

### Rolling Restart

```bash
# PM2 (zero-downtime)
pm2 reload rses-playground

# Kubernetes
kubectl rollout restart deployment rses-playground
```

### Database Maintenance

1. Announce maintenance window
2. Stop accepting new requests (drain)
3. Wait for current requests to complete
4. Stop application
5. Perform database maintenance
6. Start application
7. Verify health endpoints
8. Re-enable traffic

### Emergency Procedures

#### Circuit Breaker Stuck Open

```bash
# Option 1: Restart application
sudo systemctl restart rses-playground

# Option 2: Wait for auto-reset (30 seconds)
```

#### Database Recovery

```bash
# 1. Stop application
sudo systemctl stop rses-playground

# 2. Restore from backup
gunzip -c /var/backups/rses/latest.sql.gz | psql $DATABASE_URL

# 3. Start application
sudo systemctl start rses-playground

# 4. Verify
curl localhost:5000/ready
```

## Contact

For escalation, contact the on-call engineer via PagerDuty.

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical | 15 minutes | Page on-call |
| High | 1 hour | Slack #rses-alerts |
| Medium | 4 hours | Email ops team |
| Low | Next business day | Jira ticket |
