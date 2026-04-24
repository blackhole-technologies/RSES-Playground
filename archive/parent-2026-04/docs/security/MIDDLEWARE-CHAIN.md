# Security Middleware Chain Design

**Version:** 1.0.0
**Author:** Security Specialist Agent (SEC)
**Date:** 2026-02-01

---

## Overview

This document describes the security middleware chain for the RSES CMS. Middleware is applied in a specific order to ensure proper security layering, where each layer builds upon the previous ones.

## Chain Order

```
Request Entry
    |
    v
+-------------------+
| 1. Correlation    |  Assigns unique request ID for tracing
+-------------------+
    |
    v
+-------------------+
| 2. Request Log    |  Logs request start (debug level)
+-------------------+
    |
    v
+-------------------+
| 3. Helmet         |  Adds security headers (CSP, X-Frame, etc.)
+-------------------+
    |
    v
+-------------------+
| 4. Rate Limiter   |  IP/user-based request throttling
+-------------------+
    |
    v
+-------------------+
| 5. CORS           |  Cross-origin request handling
+-------------------+
    |
    v
+-------------------+
| 6. Body Parser    |  JSON parsing with size limits
+-------------------+
    |
    v
+-------------------+
| 7. Cookie Parser  |  Parse cookies for session/CSRF
+-------------------+
    |
    v
+-------------------+
| 8. Path Traversal |  Block path escape attempts
+-------------------+
    |
    v
+-------------------+
| 9. Input Size     |  Validate input size limits
+-------------------+
    |
    v
+-------------------+
| 10. Session       |  Session management
+-------------------+
    |
    v
+-------------------+
| 11. Passport Init |  Initialize authentication
+-------------------+
    |
    v
+-------------------+
| 12. Passport Sess |  Restore session from store
+-------------------+
    |
    v
+-------------------+
| 13. CSRF          |  Validate CSRF token
+-------------------+
    |
    v
+-------------------+
| 14. Auth Required |  Check if route requires auth
+-------------------+
    |
    v
+-------------------+
| 15. RBAC          |  Role-based access control
+-------------------+
    |
    v
+-------------------+
| 16. Permission    |  Granular permission check
+-------------------+
    |
    v
+-------------------+
| 17. Audit Start   |  Begin audit event capture
+-------------------+
    |
    v
+-------------------+
|   Route Handler   |  Business logic
+-------------------+
    |
    v
+-------------------+
| 18. Audit End     |  Complete audit event
+-------------------+
    |
    v
+-------------------+
| 19. Response Log  |  Log response (on finish event)
+-------------------+
    |
    v
Response Sent
```

## Middleware Implementation

### 1. Correlation Middleware

```typescript
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

const correlationStore = new AsyncLocalStorage<{ correlationId: string }>();

export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();

    res.setHeader('X-Correlation-ID', correlationId);
    req.correlationId = correlationId;

    correlationStore.run({ correlationId }, () => next());
  };
}
```

### 2. Request Logging Middleware

```typescript
export function requestLoggingMiddleware() {
  const log = createModuleLogger('http');

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    log.debug({
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      userAgent: req.get('user-agent'),
    }, 'Request started');

    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      };

      if (res.statusCode >= 500) {
        log.error(logData, 'Request failed');
      } else if (res.statusCode >= 400) {
        log.warn(logData, 'Request client error');
      } else {
        log.info(logData, 'Request completed');
      }
    });

    next();
  };
}
```

### 3. Helmet Middleware

```typescript
import helmet from 'helmet';

export function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: false, // Handle at reverse proxy level
  });
}
```

### 4. Rate Limiter Middleware

```typescript
import rateLimit from 'express-rate-limit';

const rateLimitTiers = {
  anonymous: { windowMs: 15 * 60 * 1000, max: 30 },
  authenticated: { windowMs: 15 * 60 * 1000, max: 100 },
  apiKey: { windowMs: 15 * 60 * 1000, max: 1000 },
  admin: { windowMs: 15 * 60 * 1000, max: 5000 },
};

export function createRateLimiter(tier: keyof typeof rateLimitTiers) {
  const config = rateLimitTiers[tier];

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(config.windowMs / 1000),
      code: 'E_RATE_LIMIT',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || req.ip;
    },
    skip: (req) => {
      // Skip for health checks
      return ['/health', '/ready', '/metrics'].includes(req.path);
    },
  });
}

// Adaptive rate limiter based on user context
export function adaptiveRateLimiter() {
  return (req: Request, res: Response, next: NextFunction) => {
    const tier = req.user?.isAdmin ? 'admin'
      : req.apiKey ? 'apiKey'
      : req.user ? 'authenticated'
      : 'anonymous';

    return createRateLimiter(tier)(req, res, next);
  };
}
```

### 5. CORS Middleware

```typescript
import cors from 'cors';

export function createCorsMiddleware(config: CorsConfig) {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (config.origins.includes('*') || config.origins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error('CORS not allowed'));
    },
    methods: config.methods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    credentials: config.credentials,
    maxAge: config.maxAge,
  });
}
```

### 6-7. Body and Cookie Parsers

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parser
app.use(cookieParser());
```

### 8. Path Traversal Blocker

```typescript
const DANGEROUS_PATH_PATTERNS = [
  /\.\.\//g,          // ../
  /\.\.\\/g,          // ..\
  /\.\.$/,            // ends with ..
  /^\/etc\//,         // Linux system files
  /^\/var\//,
  /^\/usr\//,
  /^\/root\//,
  /^\/home\//,
  /^C:\\/i,           // Windows drive
  /^\/proc\//,
  /^\/sys\//,
  /~\//,              // Home expansion
];

export function pathTraversalBlocker() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && !isPathSafe(value)) {
        return res.status(400).json({
          error: 'Invalid request',
          message: `Path traversal detected in query parameter '${key}'`,
          code: 'E_PATH_TRAVERSAL',
        });
      }
    }

    // Check request body
    if (req.body && typeof req.body === 'object') {
      const pathFields = ['path', 'filepath', 'filename', 'directory', 'result'];
      for (const field of pathFields) {
        const value = req.body[field];
        if (typeof value === 'string' && !isPathSafe(value)) {
          return res.status(400).json({
            error: 'Invalid request',
            message: `Path traversal detected in field '${field}'`,
            code: 'E_PATH_TRAVERSAL',
          });
        }
      }
    }

    next();
  };
}

function isPathSafe(path: string): boolean {
  if (!path || typeof path !== 'string') return false;

  let normalizedPath: string;
  try {
    normalizedPath = decodeURIComponent(path);
  } catch {
    return false;
  }

  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }

  return true;
}
```

### 9. Input Size Limiter

```typescript
export function inputSizeLimiter(maxConfigSize: number = 512 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('application/json')) {
      return next();
    }

    if (req.body?.content && typeof req.body.content === 'string') {
      const contentSize = Buffer.byteLength(req.body.content, 'utf8');
      if (contentSize > maxConfigSize) {
        return res.status(413).json({
          error: 'Payload too large',
          message: `Content exceeds maximum size of ${maxConfigSize / 1024}KB`,
          code: 'E_PAYLOAD_TOO_LARGE',
        });
      }
    }

    next();
  };
}
```

### 10-12. Session and Authentication

```typescript
import session from 'express-session';
import passport from 'passport';
import RedisStore from 'connect-redis';

// Session middleware
app.use(session({
  name: 'rses.sid',
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  store: new RedisStore({ client: redisClient }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());
```

### 13. CSRF Protection

```typescript
export function csrfProtection(exemptPaths: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip exempt paths
    if (exemptPaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    // Validate double-submit cookie
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.csrf;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return res.status(403).json({
        error: 'CSRF validation failed',
        message: 'Invalid or missing CSRF token',
        code: 'E_CSRF_INVALID',
      });
    }

    next();
  };
}
```

### 14. Authentication Required

```typescript
export function requireAuth(paths: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if path requires authentication
    const requiresAuth = paths.some(p =>
      req.path.startsWith(p) || new RegExp(p).test(req.path)
    );

    if (!requiresAuth) {
      return next();
    }

    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }

    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      code: 'E_AUTH_REQUIRED',
    });
  };
}
```

### 15. RBAC Middleware

```typescript
export function rbacMiddleware(roleRequired: Record<string, string[]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Find matching path pattern
    const matchedPath = Object.keys(roleRequired).find(pattern =>
      req.path.startsWith(pattern) || new RegExp(pattern).test(req.path)
    );

    if (!matchedPath) {
      return next();
    }

    const requiredRoles = roleRequired[matchedPath];

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'E_AUTH_REQUIRED',
      });
    }

    // Check if user has any required role
    const userRoles = req.user.roleIds || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole && !userRoles.includes('super_admin')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient role privileges',
        code: 'E_ROLE_REQUIRED',
        requiredRoles,
      });
    }

    next();
  };
}
```

### 16. Permission Middleware

```typescript
export function permissionMiddleware(permissionResolver: PermissionResolver) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get required permission from route metadata
    const requiredPermission = req.route?.options?.permission;

    if (!requiredPermission) {
      return next();
    }

    const context: PermissionContext = {
      user: req.user!,
      resource: req.body?.id ? {
        type: req.route.options.resourceType,
        id: req.body.id,
        ownerId: req.body.userId,
      } : undefined,
    };

    const result = permissionResolver.check(requiredPermission, context);

    if (!result.allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: result.reason || 'Permission denied',
        code: 'E_PERMISSION_DENIED',
        permission: requiredPermission,
      });
    }

    next();
  };
}
```

### 17-18. Audit Middleware

```typescript
export function auditMiddleware(auditLogger: AuditLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Capture original send to intercept response
    const originalSend = res.send;
    let responseBody: unknown;

    res.send = function(body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.on('finish', () => {
      // Don't audit health checks or static assets
      if (req.path.match(/^\/(health|ready|static|assets)/)) {
        return;
      }

      const duration = Date.now() - startTime;

      auditLogger.log({
        correlationId: req.correlationId,
        category: categorizeRequest(req),
        action: `${req.method.toLowerCase()}.${extractResourceType(req.path)}`,
        outcome: res.statusCode < 400 ? 'success' : 'failure',
        actor: {
          type: req.user ? 'user' : 'anonymous',
          id: req.user?.id || req.ip,
          name: req.user?.username,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          sessionId: req.session?.id,
        },
        resource: {
          type: extractResourceType(req.path),
          id: req.params.id || req.body?.id,
          path: req.path,
        },
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
        },
      });
    });

    next();
  };
}
```

## Middleware Registration

```typescript
import express from 'express';

const app = express();

// Register middleware in order
app.use(correlationMiddleware());
app.use(requestLoggingMiddleware());
app.use(createHelmetMiddleware());
app.use(adaptiveRateLimiter());
app.use(createCorsMiddleware(corsConfig));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(pathTraversalBlocker());
app.use(inputSizeLimiter());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(csrfProtection(['/api/engine/validate', '/api/engine/test']));
app.use(requireAuth(['/api/configs', '/api/projects', '/api/admin']));
app.use(rbacMiddleware(roleRequirements));
app.use(permissionMiddleware(permissionResolver));
app.use(auditMiddleware(auditLogger));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/projects', projectRoutes);
// ... etc
```

## Conditional Middleware

For routes with specific requirements:

```typescript
// Route-level middleware
router.post(
  '/configs',
  requirePermission('create.config.own'),
  validateInput(createConfigSchema),
  auditAction('config.create'),
  configController.create
);

router.delete(
  '/configs/:id',
  requirePermission('delete.config.any'),
  auditAction('config.delete'),
  configController.delete
);

router.get(
  '/admin/users',
  requireRole('user_admin'),
  auditAction('admin.users.list'),
  adminController.listUsers
);
```

## Error Handling

```typescript
// Global error handler (registered last)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const correlationId = req.correlationId || 'unknown';

  logger.error({
    err,
    correlationId,
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : err.message;

  res.status(500).json({
    error: 'Internal Server Error',
    message,
    correlationId,
    code: 'E_INTERNAL',
  });
});
```

## Performance Considerations

1. **Middleware Ordering:** Security-critical middleware (rate limiting, path traversal) runs before expensive operations (body parsing, session lookup).

2. **Short-Circuit Early:** Each middleware should return early when possible to avoid unnecessary processing.

3. **Async Operations:** Use async/await properly to avoid blocking the event loop.

4. **Caching:** Consider caching permission resolutions for the duration of a request.

5. **Logging Level:** Use appropriate log levels (debug for start, info for completion) to reduce log volume.
