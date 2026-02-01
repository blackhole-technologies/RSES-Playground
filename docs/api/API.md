# RSES-Playground API Documentation

## Overview

This document describes the HTTP and WebSocket APIs for RSES-Playground.

**Base URL**: `https://your-domain.com/api`

## Authentication

All state-changing endpoints require authentication via session cookie.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response**:
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "displayName": "Admin User"
  }
}
```

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string (3-50 chars)",
  "password": "string (8+ chars)",
  "email": "string (optional)",
  "displayName": "string (optional)"
}
```

### Logout

```http
POST /api/auth/logout
```

### Get Current User

```http
GET /api/auth/me
```

---

## Configs API

### List Configs

```http
GET /api/configs
GET /api/configs?page=1&limit=50&paginated=true
```

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 100) |
| `paginated` | boolean | false | Return paginated format |

**Response (paginated)**:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2
}
```

### Get Config

```http
GET /api/configs/:id
```

**Response**:
```json
{
  "id": 1,
  "name": "My Config",
  "content": "...",
  "description": "...",
  "createdAt": "2026-01-31T12:00:00Z",
  "updatedAt": "2026-01-31T12:00:00Z"
}
```

### Create Config

```http
POST /api/configs
Content-Type: application/json

{
  "name": "string (required)",
  "content": "string (required)",
  "description": "string (optional)"
}
```

**Response**: `201 Created` with created config

### Update Config

```http
PUT /api/configs/:id
Content-Type: application/json

{
  "name": "string (optional)",
  "content": "string (optional)",
  "description": "string (optional)"
}
```

### Delete Config

```http
DELETE /api/configs/:id
```

**Response**: `204 No Content`

---

## Engine API

### Validate Config

```http
POST /api/engine/validate
Content-Type: application/json

{
  "content": "string (RSES config content)"
}
```

**Response**:
```json
{
  "valid": true,
  "parsed": {...},
  "errors": []
}
```

### Test Path

```http
POST /api/engine/test
Content-Type: application/json

{
  "configContent": "string (RSES config)",
  "filename": "string (path to test)",
  "attributes": {}
}
```

**Response**:
```json
{
  "topics": ["ai", "quantum"],
  "types": ["application"],
  "sets": ["claude", "quantum"],
  "matched": true,
  "suggestions": []
}
```

### Preview Symlinks

```http
POST /api/engine/preview
Content-Type: application/json

{
  "configContent": "string",
  "testPath": "string",
  "manualAttributes": {}
}
```

**Response**:
```json
{
  "derivedAttributes": {...},
  "combinedAttributes": {...},
  "matchedSets": ["..."],
  "symlinks": [
    {
      "type": "topic",
      "name": "my-project",
      "target": "/path/to/project",
      "category": "by-topic/ai"
    }
  ],
  "parsed": {...}
}
```

---

## Projects API

### List Projects

```http
GET /api/projects
GET /api/projects?page=1&limit=50
```

### Get Project

```http
GET /api/projects/:id
```

### Scan Directory

```http
POST /api/projects/scan
Content-Type: application/json

{
  "rootPath": "/path/to/scan",
  "maxDepth": 3,
  "configId": 1
}
```

**Response**:
```json
{
  "projects": [...],
  "directoriesScanned": 150,
  "duration": 1234,
  "errors": []
}
```

### Update Project

```http
PATCH /api/projects/:id
Content-Type: application/json

{
  "classification": {...},
  "attributes": {...}
}
```

### Link Project

```http
POST /api/projects/:id/link
Content-Type: application/json

{
  "linkPath": "/path/to/symlink"
}
```

### Unlink Project

```http
DELETE /api/projects/:id/link
```

### Bulk Link

```http
POST /api/projects/bulk-link
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

### Bulk Unlink

```http
POST /api/projects/bulk-unlink
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

---

## Config Versions API

### List Versions

```http
GET /api/configs/:id/versions
```

**Response**:
```json
[
  {
    "id": 1,
    "configId": 1,
    "version": 3,
    "content": "...",
    "description": "Updated rules",
    "createdAt": "2026-01-31T12:00:00Z"
  }
]
```

### Get Version

```http
GET /api/configs/:id/versions/:version
```

### Restore Version

```http
POST /api/configs/:id/versions/:version/restore
```

---

## Activity API

### List Activity

```http
GET /api/activity
GET /api/activity?page=1&limit=50&entityType=config&startDate=2026-01-01&endDate=2026-01-31
```

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `limit` | integer | Items per page |
| `entityType` | string | Filter by entity type (config, project) |
| `startDate` | ISO date | Filter by date range |
| `endDate` | ISO date | Filter by date range |

### Get Recent Activity

```http
GET /api/activity/recent?limit=20
```

---

## Batch Operations API

### Bulk Delete Configs

```http
POST /api/batch/configs/delete
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

**Response**:
```json
{
  "deleted": 3
}
```

### Bulk Update Configs

```http
POST /api/batch/configs/update
Content-Type: application/json

{
  "ids": [1, 2, 3],
  "updates": {
    "description": "New description"
  }
}
```

**Response**:
```json
{
  "updated": 3
}
```

---

## Bridge API (Shell Integration)

### Classify Project

```http
POST /api/bridge/classify
Content-Type: application/json

{
  "projectPath": "/path/to/project",
  "configId": 1
}
```

### Classify Batch

```http
POST /api/bridge/classify/batch
Content-Type: application/json

{
  "paths": ["/path/1", "/path/2"],
  "configId": 1
}
```

### Scan Projects

```http
POST /api/bridge/scan
Content-Type: application/json

{
  "rootPath": "/path/to/scan",
  "configId": 1
}
```

### Create Symlink

```http
POST /api/bridge/symlink
Content-Type: application/json

{
  "source": "/path/to/project",
  "targetDir": "/path/to/by-topic/ai",
  "linkName": "my-project",
  "dryRun": false
}
```

### Remove Symlink

```http
DELETE /api/bridge/symlink
Content-Type: application/json

{
  "targetPath": "/path/to/symlink"
}
```

### Cleanup Broken Links

```http
POST /api/bridge/cleanup
Content-Type: application/json

{
  "targetDir": "/path/to/by-topic"
}
```

---

## Health Endpoints

### Liveness Probe

```http
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "process": { "status": "ok" }
  }
}
```

### Readiness Probe

```http
GET /ready
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 5
    },
    "circuitBreaker": {
      "status": "ok"
    }
  },
  "pool": {
    "totalConnections": 5,
    "idleConnections": 3,
    "waitingClients": 0,
    "circuitState": "CLOSED"
  }
}
```

### Metrics

```http
GET /metrics
```

Returns Prometheus-format metrics.

---

## WebSocket API

Connect to: `wss://your-domain.com/ws`

### Connection

On connect, server sends:
```json
{
  "type": "connection",
  "timestamp": 1706709600000,
  "clientId": "uuid",
  "serverVersion": "1.0.0"
}
```

### Heartbeat

Client sends:
```json
{
  "type": "heartbeat"
}
```

Server responds:
```json
{
  "type": "heartbeat",
  "timestamp": 1706709600000,
  "clientId": "uuid"
}
```

### Subscribe to Channels

```json
{
  "type": "subscribe",
  "channels": ["projects", "scanner"]
}
```

### Unsubscribe

```json
{
  "type": "unsubscribe",
  "channels": ["projects"]
}
```

### Server Events

#### Project Added
```json
{
  "type": "project:added",
  "timestamp": 1706709600000,
  "data": {
    "path": "/path/to/project",
    "name": "my-project"
  }
}
```

#### Project Changed
```json
{
  "type": "project:changed",
  "timestamp": 1706709600000,
  "data": {
    "path": "/path/to/project",
    "name": "my-project"
  }
}
```

#### Project Removed
```json
{
  "type": "project:removed",
  "timestamp": 1706709600000,
  "data": {
    "path": "/path/to/project",
    "name": "my-project"
  }
}
```

#### Symlink Created
```json
{
  "type": "symlink:created",
  "timestamp": 1706709600000,
  "source": "/path/to/project",
  "target": "/path/to/symlink",
  "category": "by-topic/ai"
}
```

#### Scan Progress
```json
{
  "type": "scan:progress",
  "timestamp": 1706709600000,
  "data": {
    "current": 50,
    "total": 100,
    "currentPath": "/path/being/scanned"
  }
}
```

---

## Error Responses

All errors return JSON in this format:

```json
{
  "message": "Error description",
  "field": "fieldName"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (database down) |

---

## Rate Limiting

Default limits:
- 100 requests per 15 minutes per IP
- Applies to all `/api/*` endpoints
- Headers included in response:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

## CORS

CORS is configured for production domains. Include credentials:

```javascript
fetch('/api/configs', {
  credentials: 'include'
});
```

---

## CSRF Protection

State-changing requests require CSRF token:
1. Token is set in `csrf-token` cookie on first request
2. Include in header: `X-CSRF-Token: <token>`

```javascript
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('csrf-token='))
  ?.split('=')[1];

fetch('/api/configs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify(data)
});
```
