# RSES CMS Security Documentation

**Version:** 1.0.0
**Author:** Security Specialist Agent (SEC)
**Date:** 2026-02-01

---

## Overview

This directory contains the comprehensive security architecture and guidelines for the RSES CMS transformation. The security model is inspired by Drupal's proven security framework while addressing the unique requirements of the RSES classification and symlink system.

## Documents

### Core Architecture

| Document | Description |
|----------|-------------|
| [SECURITY-ARCHITECTURE.md](./SECURITY-ARCHITECTURE.md) | Complete security architecture including diagrams, authentication, RBAC, permissions, and all security layers |
| [security-types.ts](./security-types.ts) | TypeScript interfaces for User, Role, Permission, Module Manifest, Audit Events, and all security entities |

### Implementation Guides

| Document | Description |
|----------|-------------|
| [MIDDLEWARE-CHAIN.md](./MIDDLEWARE-CHAIN.md) | Security middleware chain design with implementation examples for each layer |
| [MODULE-MANIFEST-FORMAT.md](./MODULE-MANIFEST-FORMAT.md) | Module security manifest format with complete schema and examples |

### Checklists

| Document | Description |
|----------|-------------|
| [SECURITY-CHECKLISTS.md](./SECURITY-CHECKLISTS.md) | Security checklists for modules, themes, configs, deployment, code review, and incident response |

## Quick Reference

### Security Layers (Top to Bottom)

1. **Network Security** - TLS, WAF, DDoS protection
2. **Application Gateway** - Reverse proxy, rate limiting, CORS
3. **Request Validation** - Path traversal blocking, input limits
4. **Authentication** - Session, Passport, OAuth/SSO
5. **Authorization** - RBAC, granular permissions
6. **Business Logic** - Content access control, module sandbox
7. **Data Layer** - Symlink boundary enforcement, parameterized queries
8. **Audit & Monitoring** - Security logging, metrics

### Key Security Features

| Feature | Location | Status |
|---------|----------|--------|
| Password Hashing | `server/auth/passport.ts` | Implemented (scrypt) |
| Session Security | `server/auth/session.ts` | Implemented |
| Security Headers | `server/middleware/security.ts` | Implemented (Helmet) |
| Rate Limiting | `server/middleware/security.ts` | Implemented |
| Path Traversal | `server/middleware/security.ts` | Implemented |
| ReDoS Prevention | `server/lib/redos-checker.ts` | Implemented |
| Safe Expression Eval | `server/lib/boolean-parser.ts` | Implemented |
| Log Redaction | `server/logger.ts` | Implemented |
| Symlink Boundary | `server/services/symlink-executor.ts` | Implemented |
| RBAC | Planned | Design Complete |
| Granular Permissions | Planned | Design Complete |
| Module Sandbox | Planned | Design Complete |
| Audit Logging | Partial | Activity log exists |

### Trust Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `core` | Built-in modules | System modules |
| `verified` | RSES team reviewed | Official contrib |
| `community` | Published registry | Third-party |
| `custom` | User installed | Internal modules |
| `untrusted` | Unknown source | Testing only |

### Permission Format

```
{operation}.{resource}.{scope}

Examples:
- create.config.own
- edit.project.any
- administer.modules.all
```

### Role Hierarchy

```
super_admin
    |
+---+---+
|       |
site_admin  security_admin
    |
+---+---+---+---+
|   |   |   |   |
content_manager  config_editor  module_admin  theme_admin  user_admin
    |
authenticated
    |
anonymous
```

## Implementation Priorities

### Phase 1: Immediate (Already Done)

- [x] Password hashing with scrypt
- [x] Session management with secure cookies
- [x] Security headers (Helmet)
- [x] Rate limiting
- [x] Path traversal prevention
- [x] Input validation with Zod
- [x] ReDoS pattern detection
- [x] Safe boolean expression parser
- [x] Sensitive data log redaction

### Phase 2: Short-term

- [ ] User roles database table
- [ ] Permission system implementation
- [ ] RBAC middleware
- [ ] Enhanced audit logging
- [ ] API key authentication

### Phase 3: Medium-term

- [ ] OAuth/SSO integration
- [ ] Module manifest validation
- [ ] Module sandbox enforcement
- [ ] Theme security scanning
- [ ] Automated security testing

### Phase 4: Long-term

- [ ] Module signing infrastructure
- [ ] Security vulnerability database
- [ ] Automated CVE scanning
- [ ] Security dashboard
- [ ] Compliance reporting

## Related Files

### Existing Security Implementation

```
server/
  auth/
    passport.ts     # Authentication with scrypt
    session.ts      # Session management
    routes.ts       # Auth API routes
  middleware/
    security.ts     # Security middleware stack
  lib/
    boolean-parser.ts  # Safe expression evaluation
    redos-checker.ts   # Pattern safety checking
  logger.ts           # Log redaction
  services/
    symlink-executor.ts  # Path boundary enforcement

tests/
  security/
    auth.test.ts
    boolean-parser.test.ts
    rses-parser-security.test.ts
    security-middleware.test.ts

shared/
  schema.ts    # User schema with validation
```

## Security Contacts

- **Security Team:** security@rses-cms.example
- **Vulnerability Reports:** security-reports@rses-cms.example
- **Security Advisories:** https://rses-cms.example/security/advisories

## Contributing

When contributing security-related code:

1. Follow the security checklists in this directory
2. Include security tests for new functionality
3. Document security considerations in code comments
4. Request security review for sensitive changes

## License

This documentation is part of the RSES CMS project and is subject to the same license terms.
