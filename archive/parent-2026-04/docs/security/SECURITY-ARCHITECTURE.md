# RSES CMS Security Architecture

**Version:** 1.0.0
**Author:** Security Specialist Agent (SEC)
**Date:** 2026-02-01
**Status:** Architecture Design

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Architecture Diagram](#security-architecture-diagram)
3. [Authentication System](#authentication-system)
4. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
5. [Permission System](#permission-system)
6. [Module Security](#module-security)
7. [Content Access Control](#content-access-control)
8. [API Security](#api-security)
9. [Session Management](#session-management)
10. [Audit Logging](#audit-logging)
11. [Input Validation](#input-validation)
12. [Path Traversal Prevention](#path-traversal-prevention)
13. [Module Installation Security](#module-installation-security)
14. [Theme Security](#theme-security)
15. [RSES Rule Validation](#rses-rule-validation)
16. [Security Checklist](#security-checklist)

---

## Executive Summary

This document defines the comprehensive security architecture for the RSES CMS transformation, modeled after Drupal's proven security framework. The architecture implements defense-in-depth principles with multiple security layers protecting against common web vulnerabilities while supporting the unique requirements of the RSES classification and symlink system.

### Current Security Baseline

The following security measures are already implemented:

- **Authentication:** Local username/password with scrypt hashing (`server/auth/passport.ts`)
- **Session Management:** Secure cookies with httpOnly, secure, sameSite flags (`server/auth/session.ts`)
- **Security Headers:** Helmet middleware with CSP, X-Frame-Options, etc. (`server/middleware/security.ts`)
- **Rate Limiting:** IP-based request throttling (`server/middleware/security.ts`)
- **Path Traversal Protection:** Blocking dangerous path patterns (`server/middleware/security.ts`)
- **Input Size Limits:** Payload size enforcement (`server/middleware/security.ts`)
- **ReDoS Prevention:** Pattern safety checking (`server/lib/redos-checker.ts`)
- **Safe Expression Evaluation:** Boolean parser without eval (`server/lib/boolean-parser.ts`)
- **Sensitive Data Redaction:** Automatic log sanitization (`server/logger.ts`)
- **Symlink Boundary Enforcement:** Path validation in executor (`server/services/symlink-executor.ts`)

---

## Security Architecture Diagram

```
                                    SECURITY ARCHITECTURE
    ================================================================================

                                   +-----------------+
                                   |   Load Balancer |
                                   |  (TLS Termination)
                                   +-----------------+
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
            +-------v-------+      +-------v-------+      +-------v-------+
            |   WAF Rules   |      |  DDoS Shield  |      |   IP Blocklist |
            +---------------+      +---------------+      +---------------+
                    |                      |                      |
                    +----------------------+----------------------+
                                           |
    ================================================================================
    LAYER 1: NETWORK SECURITY
    ================================================================================
                                           |
                                   +-------v-------+
                                   |   NGINX/HAProxy |
                                   |  (Reverse Proxy) |
                                   +---------------+
                                           |
    ================================================================================
    LAYER 2: APPLICATION GATEWAY
    ================================================================================
                                           |
              +----------------------------+----------------------------+
              |                            |                            |
      +-------v-------+            +-------v-------+            +-------v-------+
      | Correlation   |            |  Rate Limiter |            |   CORS       |
      | Middleware    |            |  (IP-based)   |            |  Middleware   |
      +---------------+            +---------------+            +---------------+
              |                            |                            |
              +----------------------------+----------------------------+
                                           |
                                   +-------v-------+
                                   |   Helmet      |
                                   | (Security Hdrs)|
                                   +---------------+
                                           |
    ================================================================================
    LAYER 3: REQUEST VALIDATION
    ================================================================================
                                           |
      +-------v-------+            +-------v-------+            +-------v-------+
      | Body Parser   |            | Path Traversal|            |  Input Size  |
      | (JSON limit)  |            |   Blocker     |            |   Limiter    |
      +---------------+            +---------------+            +---------------+
              |                            |                            |
              +----------------------------+----------------------------+
                                           |
                                   +-------v-------+
                                   |  CSRF Token   |
                                   |  Validation   |
                                   +---------------+
                                           |
    ================================================================================
    LAYER 4: AUTHENTICATION & AUTHORIZATION
    ================================================================================
                                           |
      +------------------------------------+------------------------------------+
      |                                    |                                    |
+-----v-----+                      +-------v-------+                    +-------v-------+
|  Session  |                      |   Passport    |                    |   JWT/OAuth   |
|  Store    |                      | (LocalStrategy)|                   |   Provider    |
+-----------+                      +---------------+                    +---------------+
      |                                    |                                    |
      |                            +-------v-------+                            |
      |                            | User Resolver |<---------------------------+
      |                            +---------------+
      |                                    |
      +------------------------------------+
                                           |
                                   +-------v-------+
                                   | RBAC Middleware |
                                   | (Role Check)   |
                                   +---------------+
                                           |
                                   +-------v-------+
                                   | Permission    |
                                   | Middleware    |
                                   +---------------+
                                           |
    ================================================================================
    LAYER 5: BUSINESS LOGIC SECURITY
    ================================================================================
                                           |
      +------------------------------------+------------------------------------+
      |                                    |                                    |
+-----v-----+                      +-------v-------+                    +-------v-------+
|  Config   |                      |   Project     |                    |   Module      |
| Validator |                      | Access Control|                    |  Sandbox      |
+-----------+                      +---------------+                    +---------------+
      |                                    |                                    |
      |                            +-------v-------+
      |                            | Content Access |
      |                            |   Controller   |
      |                            +---------------+
      |                                    |
      +------------------------------------+
                                           |
    ================================================================================
    LAYER 6: DATA LAYER SECURITY
    ================================================================================
                                           |
      +------------------------------------+------------------------------------+
      |                                    |                                    |
+-----v-----+                      +-------v-------+                    +-------v-------+
| Symlink   |                      |   Database    |                    |   File System |
| Boundary  |                      | (Parameterized)|                   |  (Sandboxed)  |
| Enforcer  |                      +---------------+                    +---------------+
+-----------+
                                           |
    ================================================================================
    LAYER 7: AUDIT & MONITORING
    ================================================================================
                                           |
      +------------------------------------+------------------------------------+
      |                                    |                                    |
+-----v-----+                      +-------v-------+                    +-------v-------+
| Security  |                      |   Audit Log   |                    |   Metrics     |
|  Logger   |                      |  (Immutable)  |                    |  (Prometheus) |
+-----------+                      +---------------+                    +---------------+
```

---

## Authentication System

### Multi-Strategy Authentication

```
+------------------+     +------------------+     +------------------+
|  Local Strategy  |     |  OAuth Strategy  |     |  SAML/SSO       |
|  (username/pass) |     |  (GitHub, etc.)  |     |  Strategy       |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                          +-------v-------+
                          |   Passport    |
                          |   Manager     |
                          +-------+-------+
                                  |
                          +-------v-------+
                          |   User Store  |
                          +---------------+
```

### Authentication Flow

1. **Local Authentication**
   - Scrypt password hashing (current implementation)
   - Timing-safe comparison to prevent timing attacks
   - Account lockout after N failed attempts
   - Password complexity enforcement

2. **OAuth 2.0 / OpenID Connect**
   - Support for GitHub, GitLab, Google, Microsoft
   - State parameter for CSRF protection
   - Token validation and refresh handling
   - Account linking for existing users

3. **SSO / SAML 2.0**
   - Enterprise SSO integration
   - Assertion signature verification
   - Attribute mapping to user roles
   - Just-in-time user provisioning

---

## Role-Based Access Control (RBAC)

### Role Hierarchy

```
                    +------------------+
                    |   Super Admin    |
                    | (system-level)   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+         +---------v---------+
    |   Site Admin      |         |   Security Admin  |
    | (site management) |         | (security config) |
    +--------+----------+         +-------------------+
             |
    +--------+--------+--------+--------+
    |        |        |        |        |
+---v---+ +--v---+ +--v---+ +--v---+ +--v---+
|Content| |Config| |Module| |Theme | |User  |
|Manager| |Editor| |Admin | |Admin | |Admin |
+-------+ +------+ +------+ +------+ +------+
    |        |        |        |        |
    +--------+--------+--------+--------+
                    |
            +-------v-------+
            | Authenticated |
            |     User      |
            +-------+-------+
                    |
            +-------v-------+
            |   Anonymous   |
            +---------------+
```

### Role Definitions

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `super_admin` | Full system access | All permissions, bypass access checks |
| `site_admin` | Site-level administration | Manage users, configs, modules |
| `security_admin` | Security configuration | Manage roles, permissions, audit |
| `content_manager` | Content administration | CRUD all content, manage projects |
| `config_editor` | Configuration editing | Create/edit RSES configs |
| `module_admin` | Module management | Install/uninstall modules |
| `theme_admin` | Theme management | Install/configure themes |
| `user_admin` | User management | Create/edit users, assign roles |
| `authenticated` | Logged-in user | View content, own content CRUD |
| `anonymous` | Not logged in | Public content only |

---

## Permission System

### Granular Permission Model

```
Permission Format: {operation}.{resource}.{scope}

Examples:
- create.config.own           - Create own configurations
- edit.config.any            - Edit any configuration
- delete.project.own         - Delete own projects
- view.content.published     - View published content
- administer.modules.all     - Full module administration
- execute.symlinks.restricted - Execute symlinks in allowed paths only

Operations: create, read, update, delete, execute, administer
Resources: config, project, content, module, theme, user, role, permission
Scopes: own, any, published, restricted, all
```

### Field-Level Permissions

```
Field Permission Format: {operation}.{content_type}.{field_name}

Examples:
- edit.config.content        - Edit the content field of configs
- view.project.classification - View project classification data
- edit.user.roles            - Modify user role assignments
```

---

## Module Security

### Module Trust Levels

```
+------------------+     +------------------+     +------------------+
|    Core Module   |     | Contrib Module   |     | Custom Module    |
|   (Trusted)      |     | (Verified)       |     | (Untrusted)      |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         | Full Access            | Sandboxed              | Heavily Restricted
         |                        |                        |
+--------v---------+     +--------v---------+     +--------v---------+
| - File System    |     | - API Access     |     | - Isolated       |
| - Database       |     | - Limited FS     |     | - No FS Access   |
| - All APIs       |     | - Declared Deps  |     | - Whitelist APIs |
+------------------+     +------------------+     +------------------+
```

### Module Manifest Schema

See `security-types.ts` for complete TypeScript definitions.

---

## Content Access Control

### Access Control List (ACL) Model

```
+------------------+
|    Content       |
|    Entity        |
+--------+---------+
         |
         | has
         v
+------------------+
|    Access        |
|    Control       |
|    List          |
+--------+---------+
         |
         | contains
         v
+------------------+     +------------------+
|    ACL Entry     |---->|    Principal     |
| (grant/deny)     |     | (user/role/group)|
+--------+---------+     +------------------+
         |
         | specifies
         v
+------------------+
|   Permission     |
|   (view/edit/    |
|    delete/etc)   |
+------------------+
```

### Content Visibility States

| State | Description | Access |
|-------|-------------|--------|
| `draft` | Work in progress | Owner only |
| `review` | Pending approval | Owner + Reviewers |
| `published` | Live content | Based on ACL |
| `archived` | Soft deleted | Admins only |
| `deleted` | Hard delete pending | System only |

---

## API Security

### Security Layers

```
Request Flow:
    |
    v
+-------------------+
| Rate Limiting     |  <-- IP-based, user-based, endpoint-based
+-------------------+
    |
    v
+-------------------+
| CORS Validation   |  <-- Origin whitelist, credentials handling
+-------------------+
    |
    v
+-------------------+
| Authentication    |  <-- Session, JWT, API Key
+-------------------+
    |
    v
+-------------------+
| CSRF Protection   |  <-- Double-submit cookie, SameSite
+-------------------+
    |
    v
+-------------------+
| Authorization     |  <-- RBAC + Permission check
+-------------------+
    |
    v
+-------------------+
| Input Validation  |  <-- Schema validation, sanitization
+-------------------+
    |
    v
+-------------------+
| Business Logic    |
+-------------------+
```

### Rate Limiting Tiers

| Tier | Requests | Window | Applies To |
|------|----------|--------|------------|
| Anonymous | 30 | 15 min | Unauthenticated requests |
| Authenticated | 100 | 15 min | Logged-in users |
| API Key | 1000 | 15 min | Programmatic access |
| Admin | 5000 | 15 min | Admin operations |
| Exempt | Unlimited | - | Health checks, metrics |

---

## Session Management

### Secure Session Configuration

```typescript
// Current implementation enhanced
const sessionConfig = {
  name: "rses.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,      // Prevent XSS access
    secure: true,        // HTTPS only
    sameSite: "strict",  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    domain: process.env.COOKIE_DOMAIN,
  },
  // Production: Use Redis or PostgreSQL session store
  store: new RedisStore({ client: redisClient }),
};
```

### Session Security Features

1. **Session Fixation Prevention:** Regenerate session ID on login
2. **Idle Timeout:** Expire sessions after inactivity period
3. **Absolute Timeout:** Force re-authentication after maximum session age
4. **Concurrent Session Control:** Limit active sessions per user
5. **Session Revocation:** Ability to invalidate all user sessions

---

## Audit Logging

### Audit Event Schema

```typescript
interface AuditEvent {
  id: string;                    // UUID
  timestamp: Date;               // ISO 8601
  correlationId: string;         // Request correlation

  // Actor information
  actor: {
    type: 'user' | 'system' | 'api_key' | 'module';
    id: string;
    username?: string;
    ip?: string;
    userAgent?: string;
  };

  // Action details
  action: string;                // e.g., "config.update"
  resource: {
    type: string;                // e.g., "config"
    id: string;
    name?: string;
  };

  // Change tracking
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };

  // Outcome
  outcome: 'success' | 'failure' | 'error';
  errorCode?: string;
  errorMessage?: string;

  // Context
  metadata?: Record<string, unknown>;
}
```

### Audit Categories

| Category | Events | Retention |
|----------|--------|-----------|
| Authentication | login, logout, password_change | 90 days |
| Authorization | permission_denied, role_change | 90 days |
| Content | create, update, delete, publish | 365 days |
| Configuration | config_change, module_install | 365 days |
| Security | suspicious_activity, rate_limit | 365 days |
| System | startup, shutdown, error | 30 days |

---

## Input Validation

### Validation Strategy

```
                    +------------------+
                    |   Raw Input      |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Schema Validation |  <-- Zod schemas
                    | (structure)      |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Type Coercion    |  <-- Safe type conversion
                    +--------+---------+
                             |
                    +--------v---------+
                    | Sanitization     |  <-- XSS prevention
                    +--------+---------+
                             |
                    +--------v---------+
                    | Business Rules   |  <-- Domain validation
                    +--------+---------+
                             |
                    +--------v---------+
                    | Security Checks  |  <-- Path traversal, injection
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Clean Data     |
                    +------------------+
```

### Validation Rules by Input Type

| Input Type | Validation | Sanitization |
|------------|------------|--------------|
| Username | `^[a-zA-Z0-9_-]{3,50}$` | Lowercase, trim |
| Email | RFC 5322 compliant | Lowercase, trim |
| Password | Min 8 chars, complexity | None (hash as-is) |
| Config Content | Size limit, syntax check | Normalize line endings |
| File Path | Path traversal check | Normalize, resolve |
| Project Name | `^[a-zA-Z0-9_-]+$` | Trim |
| Set Pattern | ReDoS check, glob safety | None |
| Boolean Expr | Safe parser validation | None |

---

## Path Traversal Prevention

### Critical for Symlink System

```
+-------------------+
|  Path Input       |
+--------+----------+
         |
+--------v----------+
| URL Decode        |  <-- Handle %2e%2e etc.
+--------+----------+
         |
+--------v----------+
| Normalize         |  <-- path.normalize()
+--------+----------+
         |
+--------v----------+
| Pattern Check     |  <-- Block ../, ..\, etc.
+--------+----------+
         |
+--------v----------+
| Absolute Path     |  <-- Block /etc, C:\, etc.
| Check             |
+--------+----------+
         |
+--------v----------+
| Boundary Check    |  <-- Must be within allowed dirs
+--------+----------+
         |
+--------v----------+
| Symlink Target    |  <-- Verify final target is safe
| Resolution        |
+--------+----------+
         |
+--------v----------+
|  Safe Path        |
+-------------------+
```

### Protected Boundaries

```typescript
// From symlink-executor.ts - enhanced
const ALLOWED_BOUNDARIES = {
  // Symlink targets must be under this directory
  symlinkBase: process.env.SYMLINK_BASE || '/data/symlinks',

  // Source projects must be under these directories
  allowedSourceDirs: [
    process.env.PROJECTS_DIR || '/data/projects',
    process.env.WORKSPACE_DIR || '/workspace',
  ],

  // Never allow these paths regardless of configuration
  blockedPaths: [
    '/etc', '/var', '/usr', '/root', '/home',
    '/proc', '/sys', '/dev', '/bin', '/sbin',
  ],
};
```

---

## Module Installation Security

### Installation Pipeline

```
+-------------------+
| Module Package    |  <-- .tar.gz or git repo
+--------+----------+
         |
+--------v----------+
| Signature Check   |  <-- GPG signature verification
+--------+----------+
         |
+--------v----------+
| Checksum Verify   |  <-- SHA-256 hash match
+--------+----------+
         |
+--------v----------+
| Manifest Parse    |  <-- Validate module.json
+--------+----------+
         |
+--------v----------+
| Dependency Check  |  <-- Version compatibility
+--------+----------+
         |
+--------v----------+
| Security Scan     |  <-- Static analysis
+--------+----------+
         |
+--------v----------+
| Sandbox Test      |  <-- Isolated execution test
+--------+----------+
         |
+--------v----------+
| Admin Approval    |  <-- Manual review (optional)
+--------+----------+
         |
+--------v----------+
|  Installation     |
+-------------------+
```

### Static Analysis Checks

| Check | Description | Blocking |
|-------|-------------|----------|
| Eval Usage | No `eval()`, `Function()` | Yes |
| Process Access | No `process.exit`, `process.env` modification | Yes |
| File System | Only allowed paths | Yes |
| Network | Only declared endpoints | Yes |
| Child Process | No `exec`, `spawn` without approval | Yes |
| Global Pollution | No prototype modification | Yes |

---

## Theme Security

### Theme Sandboxing

```
+-------------------+
|   Theme Package   |
+--------+----------+
         |
+--------v----------+
| Structure Check   |  <-- Required files present
+--------+----------+
         |
+--------v----------+
| Template Scan     |  <-- No raw JS in templates
+--------+----------+
         |
+--------v----------+
| CSS Sanitize      |  <-- No @import external
+--------+----------+
         |
+--------v----------+
| Asset Check       |  <-- No executable files
+--------+----------+
         |
+--------v----------+
| CSP Compliance    |  <-- Scripts from trusted sources
+--------+----------+
         |
+--------v----------+
|  Theme Installed  |
+-------------------+
```

### Blocked Theme Patterns

| Pattern | Reason | Example |
|---------|--------|---------|
| Inline Event Handlers | XSS vector | `onclick="..."` |
| JavaScript URLs | XSS vector | `href="javascript:..."` |
| External Script Tags | CSP violation | `<script src="http://..."` |
| Eval in Templates | Code injection | `{{ eval(...) }}` |
| Data URLs with JS | XSS bypass | `data:text/javascript,...` |
| CSS Expressions | IE XSS vector | `expression(...)` |

---

## RSES Rule Validation

### Validation Pipeline

```
+-------------------+
|  RSES Config      |
+--------+----------+
         |
+--------v----------+
| Syntax Parse      |  <-- Section structure, arrow syntax
+--------+----------+
         |
+--------v----------+
| Pattern Safety    |  <-- ReDoS check for all patterns
+--------+----------+
         |
+--------v----------+
| Path Validation   |  <-- No traversal in results
+--------+----------+
         |
+--------v----------+
| Expression Check  |  <-- Boolean parser validation
+--------+----------+
         |
+--------v----------+
| Cycle Detection   |  <-- No circular dependencies
+--------+----------+
         |
+--------v----------+
| Resource Limits   |  <-- Max rules, sets, depth
+--------+----------+
         |
+--------v----------+
|  Valid Config     |
+-------------------+
```

### Configuration Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max Config Size | 512 KB | Memory protection |
| Max Sets | 500 | Performance |
| Max Rules per Section | 200 | Performance |
| Max Pattern Length | 256 chars | ReDoS mitigation |
| Max Expression Depth | 10 | Stack protection |
| Max Set References | 20 per expression | Complexity limit |

---

## Security Checklist

### Module Security Checklist

```markdown
## Module Security Review Checklist

### Manifest Validation
- [ ] Valid module.json with required fields
- [ ] Version follows semver
- [ ] Dependencies declared and compatible
- [ ] Permissions explicitly listed
- [ ] Trust level appropriate

### Code Review
- [ ] No use of eval() or Function()
- [ ] No direct file system access outside sandbox
- [ ] No child_process usage without approval
- [ ] No network requests to undeclared endpoints
- [ ] No modification of global objects or prototypes
- [ ] No access to process.env secrets

### Security Patterns
- [ ] All user input validated with schemas
- [ ] Output properly escaped for context
- [ ] SQL queries parameterized (if applicable)
- [ ] Sensitive data not logged
- [ ] Error messages don't leak internals

### Testing
- [ ] Unit tests for security-critical functions
- [ ] Fuzzing for input handlers
- [ ] Penetration testing for exposed endpoints
- [ ] Dependency vulnerability scan passed

### Documentation
- [ ] Security considerations documented
- [ ] Required permissions explained
- [ ] Data handling practices disclosed
```

### Theme Security Checklist

```markdown
## Theme Security Review Checklist

### Structure
- [ ] No JavaScript files in theme root
- [ ] All assets in designated directories
- [ ] No executable files (.php, .py, .sh, etc.)
- [ ] No hidden files or directories

### Templates
- [ ] No inline JavaScript
- [ ] No event handler attributes
- [ ] No JavaScript URLs
- [ ] All variable output escaped
- [ ] No raw HTML from user input

### Styles
- [ ] No @import from external domains
- [ ] No CSS expressions
- [ ] No url() to external resources
- [ ] No data URIs with JavaScript

### Assets
- [ ] Images validated (format, size)
- [ ] Fonts from trusted sources
- [ ] No obfuscated code
- [ ] MIME types correctly set

### CSP Compliance
- [ ] All scripts from 'self' or trusted CDN
- [ ] No inline scripts (or valid nonce/hash)
- [ ] No unsafe-eval
- [ ] Styles from 'self' or trusted sources
```

### Deployment Security Checklist

```markdown
## Production Deployment Checklist

### Environment
- [ ] SESSION_SECRET set to strong random value
- [ ] NODE_ENV set to "production"
- [ ] Database credentials secured
- [ ] TLS certificates valid and current

### Headers
- [ ] HSTS enabled at reverse proxy
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Content-Security-Policy configured

### Access Control
- [ ] Admin accounts use strong passwords
- [ ] Default accounts disabled/removed
- [ ] Rate limiting configured
- [ ] CORS whitelist defined

### Monitoring
- [ ] Audit logging enabled
- [ ] Error logging configured
- [ ] Metrics collection active
- [ ] Alerting configured for security events

### Backup & Recovery
- [ ] Database backups automated
- [ ] Backup encryption enabled
- [ ] Recovery procedures tested
- [ ] Incident response plan documented
```

---

## Appendix A: Error Codes

| Code | Category | Description |
|------|----------|-------------|
| E_AUTH_REQUIRED | Authentication | Login required |
| E_AUTH_FAILED | Authentication | Invalid credentials |
| E_TOKEN_EXPIRED | Authentication | Session/token expired |
| E_FORBIDDEN | Authorization | Insufficient permissions |
| E_ROLE_REQUIRED | Authorization | Specific role needed |
| E_VALIDATION | Input | Schema validation failed |
| E_PATH_TRAVERSAL | Security | Path escape attempt |
| E_CSRF_INVALID | Security | CSRF token mismatch |
| E_RATE_LIMIT | Security | Too many requests |
| E_PAYLOAD_TOO_LARGE | Input | Request body too large |

---

## Appendix B: Security Headers Reference

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  connect-src 'self' ws: wss: https://cdn.jsdelivr.net;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';

Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-01 | SEC | Initial architecture design |
