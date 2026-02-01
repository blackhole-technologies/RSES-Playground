# RSES CMS

**Version**: 0.6.0 (Pre-Foundation)
**Status**: Active Development

A next-generation Content Management System combining quantum-ready taxonomy, AI-native design, and enterprise collaboration features.

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Kernel Module System | 90% | DI container, event bus, registry, gateway |
| Admin UI | 40% | Module management, config editor, dependency graph |
| Security | 25% | Architecture defined, P0 fixes applied |
| CMS Features | 20% | Content types schema only |
| Multi-Site | 0% | Not started |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client (React)                    │
├─────────────────────────────────────────────────────┤
│  Kernel Admin UI │ Config Editor │ Event Monitor    │
└─────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────┐
│                  Express Server                      │
├─────────────────────────────────────────────────────┤
│  API Gateway  │  Module Registry  │  Event Bus      │
├─────────────────────────────────────────────────────┤
│  DI Container │  Auth Middleware  │  Security       │
└─────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────┐
│                   PostgreSQL                         │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npm run db:push

# Start development server
npm run dev
```

## Project Structure

```
├── client/                 # React frontend
│   └── src/
│       ├── pages/          # Admin pages
│       └── hooks/          # Kernel hooks
├── server/                 # Express backend
│   ├── kernel/             # Module system core
│   │   ├── container.ts    # DI container
│   │   ├── events.ts       # Event bus
│   │   ├── registry.ts     # Module registry
│   │   ├── gateway.ts      # API gateway
│   │   └── contracts/      # Future specs (CQRS, ports)
│   ├── modules/            # Loadable modules
│   ├── security/           # Security architecture
│   └── middleware/         # Express middleware
├── shared/                 # Shared types/schema
└── docs/                   # Documentation
    ├── plans/              # Master plans
    ├── reviews/            # Expert agent reviews
    ├── handoffs/           # Context handoffs
    └── architecture/       # Architecture docs
```

## Documentation

- [Master Plan](docs/plans/CMS-MASTER-PLAN-FINAL.md) - Authoritative implementation plan
- [Consolidated Review](docs/reviews/CONSOLIDATED-REVIEW-v0.6.0.md) - Current state assessment
- [Architecture](docs/architecture/RSES-CMS-ENTERPRISE-ARCHITECTURE.md) - System architecture

## Development

### Kernel Admin

Access at `/kernel-admin` - provides:
- Module enable/disable
- Configuration editing with persistence
- Dependency graph visualization
- Real-time event monitoring

### Module System

Modules are self-contained units with:
- Manifest (id, version, dependencies)
- Lifecycle hooks (initialize, start, stop)
- Optional config schema (Zod)
- Optional routes

```typescript
// Example module structure
export class MyModule implements IModule {
  manifest = {
    id: 'my-module',
    name: 'My Module',
    version: '1.0.0',
    tier: 'optional',
  };

  async initialize(ctx: ModuleContext) { }
  async start() { }
  async stop() { }
}
```

## Roadmap

### Phase 1 (Current Priority)
- [ ] Site context (AsyncLocalStorage)
- [ ] Feature flag system
- [ ] Security middleware integration
- [ ] Domain routing

### Phase 2
- [ ] CQRS/Event Sourcing integration
- [ ] Content type builder
- [ ] Field API

### Phase 3+
- [ ] AI-native features
- [ ] Multi-site deployment
- [ ] Enterprise collaboration

## License

MIT
