# RSES CMS Master Implementation Plan

## Executive Summary

This document presents a comprehensive plan to transform the RSES-Playground from a configuration tool into a full-featured Content Management System (CMS) inspired by Drupal 11's architecture, implemented entirely in TypeScript/TSX.

### Vision
A modular, extensible CMS where RSES (Rule-based Symlink Execution System) serves as the core taxonomy/vocabulary engine, creating classifications through symlink-based organization.

### Expert Consultations Completed
- **Project Architect**: Drupal-style directory structure
- **CMS Developer**: Content type system with field API
- **Security Specialist**: RBAC, module security, audit logging
- **Systems Analyst**: Hook system, service registry, event-driven architecture
- **UX Design Expert**: Quantum-OS inspired UX patterns
- **UI Development Expert**: Themeable component architecture
- **Auto-link Developer**: RSES taxonomy engine integration
- **File Watcher Specialist**: Real-time monitoring system
- **Set-Graph Theorist**: Formal taxonomy algebra and query engine

---

## Phase Overview

| Phase | Name | Duration | Focus |
|-------|------|----------|-------|
| 1 | Foundation | 2-3 weeks | Directory restructure, core framework |
| 2 | Entity System | 2-3 weeks | Content types, field API |
| 3 | Taxonomy Engine | 2 weeks | RSES-powered vocabularies |
| 4 | Security & Auth | 2 weeks | RBAC, permissions, audit |
| 5 | Theme System | 2 weeks | Drupal-like theming |
| 6 | Module System | 2 weeks | Plugin architecture |
| 7 | UX Implementation | 2-3 weeks | Quantum-OS inspired UI |
| 8 | Production Hardening | 2 weeks | Performance, monitoring |
| 9 | Documentation & Polish | 1-2 weeks | Docs, testing, launch prep |

**Total Estimated: 17-22 weeks**

---

## Phase 1: Foundation (2-3 weeks)

### 1.1 Directory Restructure

Transform from current flat structure to Drupal-like hierarchy:

```
rses-cms/
├── core/                           # Core CMS framework (non-replaceable)
│   ├── lib/                        # Core libraries
│   │   ├── engine/                 # RSES engine
│   │   │   ├── rses.ts            # Parser (from server/lib/rses.ts)
│   │   │   ├── regex-cache.ts     # Caching (from server/lib/regex-cache.ts)
│   │   │   ├── boolean-parser.ts  # Expression parser
│   │   │   ├── cycle-detector.ts  # DAG validation
│   │   │   └── redos-checker.ts   # Security
│   │   ├── services/              # Core services
│   │   │   ├── service-container.ts    # DI container
│   │   │   ├── event-manager.ts        # Hook system
│   │   │   ├── cache-manager.ts        # Multi-layer cache
│   │   │   └── queue-manager.ts        # Job queue
│   │   ├── entity/                # Entity framework
│   │   │   ├── entity-base.ts
│   │   │   ├── entity-storage.ts
│   │   │   └── entity-query.ts
│   │   ├── field/                 # Field API
│   │   │   ├── field-types.ts
│   │   │   ├── field-storage.ts
│   │   │   └── field-instance.ts
│   │   ├── access/                # Access control
│   │   │   ├── permission.ts
│   │   │   ├── role.ts
│   │   │   └── access-checker.ts
│   │   └── database/              # Database layer
│   │       ├── connection.ts
│   │       ├── schema.ts
│   │       └── migrations/
│   ├── modules/                   # Core modules (shipped with CMS)
│   │   ├── system/               # System module
│   │   ├── user/                 # User management
│   │   ├── node/                 # Content (node) module
│   │   ├── taxonomy/             # Taxonomy module
│   │   ├── field/                # Field UI module
│   │   ├── file/                 # File management
│   │   └── activity/             # Activity logging
│   ├── themes/                    # Core themes
│   │   ├── stark/                # Base theme (like Drupal's Stark)
│   │   │   ├── manifest.ts
│   │   │   ├── tokens.ts
│   │   │   ├── components/
│   │   │   └── styles/
│   │   └── quantum/              # Quantum-OS theme
│   │       ├── manifest.ts
│   │       ├── tokens.ts
│   │       ├── components/
│   │       └── styles/
│   └── includes/                  # Shared utilities
│       ├── bootstrap.ts
│       ├── common.ts
│       └── install.ts
├── modules/                        # Contributed/custom modules
│   └── custom/                    # Site-specific modules
│       ├── rses_workbench/       # Workbench module
│       ├── rses_editor/          # Editor module
│       └── rses_preview/         # Preview module
├── themes/                         # Contributed/custom themes
│   └── custom/
├── sites/                          # Multi-site support
│   ├── default/
│   │   ├── settings.ts
│   │   └── files/
│   └── sites.ts
├── config/                         # Configuration
│   ├── sync/                      # Exportable config
│   └── development/
├── web/                            # Web root
│   ├── index.ts                   # Entry point
│   └── assets/
├── private/                        # Private files
│   ├── backups/
│   └── temp/
├── vendor/                         # Dependencies (node_modules symlink)
├── scripts/                        # CLI scripts
│   ├── install.ts
│   ├── update.ts
│   └── drush.ts                   # CLI tool (like Drush)
├── tests/                          # Test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/                           # Documentation
```

### 1.2 Service Container Implementation

```typescript
// core/lib/services/service-container.ts
export interface ServiceDefinition<T = unknown> {
  id: string;
  factory: (container: ServiceContainer) => T | Promise<T>;
  dependencies?: string[];
  singleton?: boolean;
  tags?: string[];
}

export class ServiceContainer {
  register<T>(definition: ServiceDefinition<T>): void;
  async get<T>(id: string): Promise<T>;
  async getTagged<T>(tag: string): Promise<T[]>;
}
```

### 1.3 Event Manager (Hook System)

```typescript
// core/lib/services/event-manager.ts
export const CMS_HOOKS = {
  // Entity lifecycle
  'entity.presave': 'Before entity save',
  'entity.postsave': 'After entity save',
  'entity.predelete': 'Before entity delete',
  'entity.postdelete': 'After entity delete',
  'entity.load': 'Entity loaded',

  // Content type hooks
  'content_type.create': 'Content type created',
  'content_type.update': 'Content type updated',

  // Field hooks
  'field.presave': 'Before field save',
  'field.validate': 'Field validation',
  'field.format': 'Field formatting',

  // Access hooks
  'access.check': 'Access check',
  'access.alter': 'Alter access result',

  // RSES hooks
  'rses.parse': 'Config parsed',
  'rses.classify': 'Content classified',
  'symlink.create': 'Symlink created',
} as const;
```

### 1.4 Database Schema Migration

Add new tables for CMS entities while preserving existing data:

```typescript
// New tables to add
- content_types
- field_storages
- field_instances
- view_displays
- form_displays
- vocabularies
- terms
- content
- content_revisions
- field_data
- roles
- permissions
- role_permissions
- user_roles
```

### 1.5 Deliverables
- [ ] New directory structure created
- [ ] File migration completed
- [ ] ServiceContainer implemented
- [ ] EventManager implemented
- [ ] Database migrations written
- [ ] Bootstrap process updated
- [ ] All 399 existing tests passing

---

## Phase 2: Entity System (2-3 weeks)

### 2.1 Content Type Definition

```typescript
// core/lib/entity/content-type.ts
export interface ContentType {
  id: string;
  machineName: string;
  label: string;
  description?: string;
  settings: {
    revisions: boolean;
    publishedDefault: boolean;
    previewMode: 'optional' | 'required' | 'disabled';
  };
  fieldInstances: FieldInstance[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.2 Field System

**Field Types (25+)**:
- Text: string, string_long, text, text_long, text_with_summary
- Number: integer, decimal, float
- Boolean: boolean
- Date/Time: datetime, daterange, timestamp
- Lists: list_string, list_integer, list_float
- References: entity_reference, taxonomy_term_reference
- Files: file, image
- Special: link, email, telephone, uri
- RSES: rses_classification, rses_symlink

```typescript
// core/lib/field/field-storage.ts
export interface FieldStorage {
  id: string;
  name: string;
  type: FieldType;
  settings: Record<string, unknown>;
  cardinality: number; // -1 for unlimited
}

// core/lib/field/field-instance.ts
export interface FieldInstance {
  id: string;
  fieldStorageId: string;
  entityType: string;
  bundle: string;
  label: string;
  required: boolean;
  weight: number;
  settings: Record<string, unknown>;
}
```

### 2.3 Widget & Formatter Registry

```typescript
// core/lib/field/registry.ts
export interface WidgetDefinition {
  id: string;
  label: string;
  fieldTypes: FieldType[];
  component: React.ComponentType<WidgetProps>;
  defaultSettings: Record<string, unknown>;
}

export interface FormatterDefinition {
  id: string;
  label: string;
  fieldTypes: FieldType[];
  component: React.ComponentType<FormatterProps>;
  defaultSettings: Record<string, unknown>;
}
```

### 2.4 Display Modes

```typescript
// View modes: full, teaser, search_result, rss, etc.
// Form modes: default, register, compact, etc.
export interface ViewDisplay {
  entityType: string;
  bundle: string;
  mode: string;
  fields: FieldDisplayConfig[];
}
```

### 2.5 API Endpoints

```
POST   /api/cms/content-types           Create content type
GET    /api/cms/content-types           List content types
GET    /api/cms/content-types/:id       Get content type
PUT    /api/cms/content-types/:id       Update content type
DELETE /api/cms/content-types/:id       Delete content type

POST   /api/cms/content                 Create content
GET    /api/cms/content                 List content
GET    /api/cms/content/:id             Get content
PUT    /api/cms/content/:id             Update content
DELETE /api/cms/content/:id             Delete content

GET    /api/cms/content/:id/revisions   Get revisions
POST   /api/cms/content/:id/revert/:rev Revert to revision
```

### 2.6 Deliverables
- [ ] ContentType CRUD implemented
- [ ] FieldStorage system implemented
- [ ] FieldInstance management implemented
- [ ] 25+ field types registered
- [ ] Widget registry with 30+ widgets
- [ ] Formatter registry with 30+ formatters
- [ ] View/Form display management
- [ ] Content CRUD with revisions
- [ ] API routes implemented
- [ ] Unit tests for all components

---

## Phase 3: Taxonomy Engine (2 weeks)

### 3.1 RSES-Powered Vocabularies

The key insight: RSES rules define vocabularies through symlink-based classification.

```typescript
// core/modules/taxonomy/taxonomy-engine.ts
export interface Vocabulary {
  id: string;
  machineName: string;
  name: string;
  description?: string;
  rsesIntegration: {
    enabled: boolean;
    category: 'topic' | 'type' | 'filetype' | 'custom';
    configId?: number;
    autoCreateTerms: boolean;
    symlinkBasePath: string;
  };
  hierarchy: 'flat' | 'single' | 'multiple';
}

export interface Term {
  id: string;
  vocabularyId: string;
  parentId?: string;
  name: string;
  weight: number;
  rsesMetadata?: {
    sourceRule: string;
    matchedPattern: string;
    symlinks: string[];
  };
}
```

### 3.2 Classification Flow

```
1. Content created/updated
2. RSES rules evaluated against content
3. Matching rules create/assign terms
4. Symlinks created as physical manifestation
5. Content-term relationships stored
6. Events broadcast for real-time updates
```

### 3.3 Taxonomy Query Algebra

Formal query language for taxonomy:

```
// Query examples
topic:quantum                      # Content in quantum topic
type:framework AND topic:ai        # Frameworks about AI
topic:ai/* NOT type:deprecated     # All AI subtopics, not deprecated
```

### 3.4 API Endpoints

```
GET    /api/taxonomy/vocabularies
POST   /api/taxonomy/vocabularies
GET    /api/taxonomy/vocabularies/:id/terms
POST   /api/taxonomy/terms
POST   /api/taxonomy/classify/:contentId
POST   /api/taxonomy/batch-classify
GET    /api/taxonomy/query?q=...
```

### 3.5 Deliverables
- [ ] TaxonomyEngine implemented
- [ ] Vocabulary CRUD
- [ ] Term CRUD with hierarchy
- [ ] RSES integration for auto-classification
- [ ] Content-term relationship management
- [ ] Query language parser
- [ ] FacetedSearchIndex
- [ ] Real-time classification via WebSocket
- [ ] 76 taxonomy algebra tests passing

---

## Phase 4: Security & Auth (2 weeks)

### 4.1 User System

```typescript
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  passwordHash: string;
  status: 'active' | 'blocked' | 'pending';
  roles: string[];
  lastLogin?: Date;
  createdAt: Date;
}
```

### 4.2 Role-Based Access Control

**Default Roles**:
- anonymous
- authenticated
- content_editor
- content_admin
- taxonomy_admin
- user_admin
- module_admin
- site_admin
- super_admin

### 4.3 Permission System

```typescript
export interface Permission {
  id: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'administer';
  resource: string;
  scope: 'own' | 'any' | 'bundle';
  conditions?: Record<string, unknown>;
}

// Examples:
// create.content.any
// update.content.own
// delete.taxonomy_term.any
// administer.users.any
```

### 4.4 Middleware Chain

1. Correlation ID
2. Request Logging
3. Helmet (Security Headers)
4. Rate Limiter
5. CORS
6. Body Parser
7. Cookie Parser
8. Path Traversal Blocker
9. Input Size Limiter
10. Session Management
11. Passport Initialize
12. CSRF Protection
13. Auth Required Check
14. RBAC Middleware
15. Permission Middleware
16. Audit Start
17. Route Handler
18. Audit End

### 4.5 Module Security

```typescript
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  trustLevel: 'core' | 'verified' | 'community' | 'custom' | 'untrusted';
  capabilities: {
    fileSystem: 'none' | 'read' | 'write' | 'full';
    network: 'none' | 'localhost' | 'allowlist' | 'full';
    database: 'none' | 'read' | 'write' | 'schema';
  };
  permissions: string[];
  signature?: string;
  checksums: Record<string, string>;
}
```

### 4.6 Deliverables
- [ ] User entity with authentication
- [ ] Role system with hierarchy
- [ ] Permission system with granular control
- [ ] Middleware chain implemented
- [ ] Module security manifest format
- [ ] Audit logging for all sensitive operations
- [ ] Security checklists documented
- [ ] OAuth integration (GitHub, Google)
- [ ] Session management with secure cookies

---

## Phase 5: Theme System (2 weeks)

### 5.1 Theme Manifest

```typescript
// themes/custom/mytheme/manifest.ts
export const themeManifest: ThemeManifest = {
  id: 'mytheme',
  name: 'My Theme',
  version: '1.0.0',
  extends: 'stark', // Base theme
  features: ['dark_mode', 'color_schemes'],
  regions: {
    header: { label: 'Header' },
    sidebar_left: { label: 'Left Sidebar' },
    content: { label: 'Content' },
    footer: { label: 'Footer' },
  },
  tokens: { /* design tokens */ },
  components: { /* component overrides */ },
  libraries: { /* asset definitions */ },
  settings: { /* configurable settings */ },
};
```

### 5.2 Design Token System

```typescript
export interface DesignTokens {
  colors: {
    primitives: ColorScale;
    semantic: SemanticColors;
  };
  spacing: SpacingScale;
  typography: TypographyTokens;
  shadows: ShadowScale;
  borders: BorderTokens;
  motion: MotionTokens;
  zIndex: ZIndexScale;
}
```

### 5.3 Region System

```typescript
export type RegionId =
  | 'header' | 'header_top' | 'header_bottom'
  | 'navigation' | 'navigation_secondary'
  | 'sidebar_left' | 'sidebar_right'
  | 'content' | 'content_top' | 'content_bottom'
  | 'footer' | 'footer_top' | 'footer_bottom'
  | 'breadcrumb' | 'messages' | 'help'
  | 'admin_toolbar' | 'admin_sidebar';
```

### 5.4 Component Override System

```typescript
export interface ComponentOverride {
  type: 'replace' | 'wrapper' | 'props' | 'variants' | 'styles';
  component?: React.ComponentType;
  props?: Record<string, unknown>;
  styles?: string;
}
```

### 5.5 Theme Provider

```tsx
<ThemeProvider theme="quantum" defaultColorScheme="dark">
  <Layout layout="sidebar-left">
    <Region name="header"><Header /></Region>
    <Region name="sidebar_left"><Navigation /></Region>
    <Region name="content"><MainContent /></Region>
    <Region name="footer"><Footer /></Region>
  </Layout>
</ThemeProvider>
```

### 5.6 Deliverables
- [ ] ThemeManifest interface implemented
- [ ] Design token system with CSS variables
- [ ] Region system with visibility controls
- [ ] Component override system
- [ ] Base theme (Stark) created
- [ ] Quantum-OS theme created
- [ ] Theme settings UI
- [ ] Hot reload for theme development
- [ ] Tailwind CSS integration
- [ ] shadcn/ui as base component library

---

## Phase 6: Module System (2 weeks)

### 6.1 Module Manifest

```typescript
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  provides: {
    services?: ServiceDefinition[];
    hooks?: HookDefinition[];
    entities?: EntityDefinition[];
    fields?: FieldDefinition[];
    routes?: RouteDefinition[];
    permissions?: PermissionDefinition[];
    menuItems?: MenuItemDefinition[];
  };
  config?: {
    schema: ZodSchema;
    defaults: Record<string, unknown>;
  };
}
```

### 6.2 Module Lifecycle

```
1. Discovery: Scan modules/ directories
2. Validation: Verify manifest and checksums
3. Dependency Resolution: Topological sort
4. Installation: Run install hooks
5. Activation: Register services, routes, hooks
6. Configuration: Load/merge config
```

### 6.3 Hook Registration

```typescript
// Module registering a hook
export function install(container: ServiceContainer) {
  const eventManager = await container.get<EventManager>('event_manager');

  eventManager.register('entity.postsave', {
    name: 'mymodule_entity_postsave',
    module: 'mymodule',
    priority: HookPriority.NORMAL,
    handler: async (context) => {
      // Handle entity save
      return context;
    },
  });
}
```

### 6.4 Core Modules

| Module | Purpose |
|--------|---------|
| system | Core system functionality |
| user | User management, authentication |
| node | Content (node) management |
| taxonomy | Vocabulary and term management |
| field | Field UI and management |
| file | File uploads and management |
| activity | Activity logging and audit trail |

### 6.5 Custom Modules (Migrated)

| Module | Purpose | Source |
|--------|---------|--------|
| rses_workbench | Project scanning, autolinking | workbench/ |
| rses_editor | Monaco editor, validation | editor-page.tsx |
| rses_preview | Symlink preview | preview-panel.tsx |
| rses_testing | Rule testing | test-panel.tsx |

### 6.6 Deliverables
- [ ] ModuleManifest interface
- [ ] Module loader and discovery
- [ ] Dependency resolution
- [ ] Module installation/uninstallation
- [ ] Hook registration system
- [ ] Route registration system
- [ ] Permission registration system
- [ ] 7 core modules implemented
- [ ] 4 custom modules migrated
- [ ] Module admin UI

---

## Phase 7: UX Implementation (2-3 weeks)

### 7.1 Information Architecture

```
Dashboard
├── Activity Feed
├── Quick Stats
└── Quick Actions

Content
├── All Content
├── Add Content
│   └── [Content Type]
└── [Content Type] List

Structure
├── Content Types
│   ├── List
│   ├── Add
│   └── Manage Fields
├── Taxonomy
│   ├── Vocabularies
│   └── Terms
└── RSES Rules
    ├── Configurations
    └── Editor

Workbench
├── Project Scanner
├── Classification
└── Symlink Manager

People
├── Users
├── Roles
└── Permissions

Extend
├── Modules
│   ├── List
│   ├── Install
│   └── Configure
└── Themes
    ├── List
    └── Configure

Configuration
├── Site Settings
├── Performance
├── Logging
└── Development
```

### 7.2 Navigation Patterns

**Sidebar Navigation** (Hilbert-style collapsing drawer):
- Expanded: 280px with icons + labels
- Collapsed: 64px with icons only
- Hover-to-expand behavior
- Keyboard accessible (Tab navigation)

**Command Palette** (Cmd+K):
- Fuzzy search across all actions
- Recent items
- Keyboard navigation

### 7.3 Key Screens

1. **Dashboard**: Activity feed, stats, quick actions
2. **Content List**: DataTable with bulk operations
3. **Content Edit**: Dynamic form from content type
4. **Content Type Builder**: Field management UI
5. **RSES Editor**: Monaco + test panel + preview
6. **Taxonomy Manager**: Tree view with drag-drop
7. **User Management**: List, roles, permissions
8. **Module Manager**: Enable/disable, configure
9. **Theme Settings**: Token customization

### 7.4 Interaction Patterns

- **Drag and Drop**: Reorder fields, terms, menu items
- **Inline Editing**: Quick edits without modal
- **Bulk Operations**: Select multiple, action dropdown
- **Progressive Disclosure**: Collapsible sections
- **Optimistic UI**: Immediate feedback, rollback on error

### 7.5 Deliverables
- [ ] AppShell with sidebar navigation
- [ ] Command palette (Cmd+K)
- [ ] Dashboard with widgets
- [ ] Content management screens
- [ ] Content type builder UI
- [ ] RSES editor integration
- [ ] Taxonomy management UI
- [ ] User/role management
- [ ] Module management UI
- [ ] Theme settings UI
- [ ] Keyboard shortcuts throughout
- [ ] WCAG 2.2 AA compliance

---

## Phase 8: Production Hardening (2 weeks)

### 8.1 Caching Strategy

**Layer 1: In-Memory**
- Regex pattern cache (existing)
- Parsed config cache
- Permission cache per request

**Layer 2: Application Cache**
- LRU cache for database queries
- Classification results cache
- Theme token resolution cache

**Layer 3: Distributed (Redis)**
- Cross-instance shared cache
- Session storage
- Rate limiting counters

### 8.2 Performance Optimization

- [ ] Query optimization with indexes
- [ ] Lazy loading for heavy components
- [ ] Code splitting by route
- [ ] Image optimization pipeline
- [ ] Bundle size monitoring (< 200KB)
- [ ] Core Web Vitals targets (LCP < 2.5s, FID < 100ms)

### 8.3 Monitoring & Observability

- [ ] Prometheus metrics endpoint
- [ ] Custom business metrics
- [ ] Error tracking (Sentry integration)
- [ ] Request tracing with correlation IDs
- [ ] Health check endpoints (/health, /ready)

### 8.4 File Watcher Hardening

- [ ] Resource limits (max watchers, events/sec)
- [ ] Crash recovery with exponential backoff
- [ ] launchd/systemd integration
- [ ] Health monitoring dashboard

### 8.5 API Versioning

```
/api/v1/content-types
/api/v1/content
/api/v1/taxonomy
```

### 8.6 Deliverables
- [ ] Multi-layer caching implemented
- [ ] Redis integration for distributed cache
- [ ] Performance benchmarks documented
- [ ] Monitoring dashboards created
- [ ] API versioned with v1 prefix
- [ ] Load testing completed
- [ ] Security audit completed

---

## Phase 9: Documentation & Polish (1-2 weeks)

### 9.1 Documentation

- [ ] User Guide: Getting started, content management
- [ ] Developer Guide: Module development, theming
- [ ] API Reference: OpenAPI/Swagger spec
- [ ] Architecture Guide: System design decisions
- [ ] Security Guide: Best practices, checklist
- [ ] Operations Guide: Deployment, monitoring

### 9.2 Testing

- [ ] Unit tests: 90%+ coverage on core
- [ ] Integration tests: All API endpoints
- [ ] E2E tests: Critical user flows (Playwright)
- [ ] Visual regression tests (Chromatic)
- [ ] Accessibility tests (axe-core)

### 9.3 Final Polish

- [ ] Error messages reviewed for clarity
- [ ] Loading states on all async operations
- [ ] Empty states designed and implemented
- [ ] 404 and error pages styled
- [ ] Favicon and PWA manifest
- [ ] SEO meta tags

### 9.4 Launch Preparation

- [ ] Migration guide from current to CMS
- [ ] Backup and restore procedures
- [ ] Rollback plan documented
- [ ] Release notes prepared

---

## File Migration Map

### Server Files

| Current | New Location |
|---------|--------------|
| server/lib/rses.ts | core/lib/engine/rses.ts |
| server/lib/regex-cache.ts | core/lib/engine/regex-cache.ts |
| server/lib/boolean-parser.ts | core/lib/engine/boolean-parser.ts |
| server/lib/cycle-detector.ts | core/lib/engine/cycle-detector.ts |
| server/lib/redos-checker.ts | core/lib/engine/redos-checker.ts |
| server/lib/circuit-breaker.ts | core/lib/services/circuit-breaker.ts |
| server/lib/queue.ts | core/lib/services/queue-manager.ts |
| server/lib/suggestion-engine.ts | modules/custom/rses_editor/suggestion-engine.ts |
| server/auth/* | core/modules/user/auth/ |
| server/middleware/security.ts | core/lib/access/security-middleware.ts |
| server/services/file-watcher.ts | core/lib/services/file-watcher.ts |
| server/services/symlink-executor.ts | core/modules/taxonomy/symlink-executor.ts |
| server/services/project-scanner.ts | modules/custom/rses_workbench/project-scanner.ts |
| server/routes/workbench.ts | modules/custom/rses_workbench/routes.ts |
| server/storage.ts | core/lib/database/storage.ts |
| server/db.ts | core/lib/database/connection.ts |
| server/logger.ts | core/lib/services/logger.ts |
| server/metrics.ts | core/lib/services/metrics.ts |
| server/health.ts | core/lib/services/health.ts |

### Client Files

| Current | New Location |
|---------|--------------|
| client/src/components/ui/* | core/themes/stark/components/ui/ |
| client/src/components/MonacoEditor.tsx | modules/custom/rses_editor/components/MonacoEditor.tsx |
| client/src/components/preview-panel.tsx | modules/custom/rses_preview/components/PreviewPanel.tsx |
| client/src/components/test-panel.tsx | modules/custom/rses_testing/components/TestPanel.tsx |
| client/src/components/workbench/* | modules/custom/rses_workbench/components/ |
| client/src/components/config-sidebar.tsx | modules/custom/rses_editor/components/ConfigSidebar.tsx |
| client/src/pages/editor-page.tsx | modules/custom/rses_editor/pages/EditorPage.tsx |
| client/src/hooks/* | core/lib/hooks/ |
| client/src/lib/* | core/lib/utils/ |

### Shared Files

| Current | New Location |
|---------|--------------|
| shared/schema.ts | core/lib/database/schema.ts |
| shared/routes.ts | core/lib/routes/index.ts |
| shared/prompts.ts | modules/custom/rses_editor/prompts.ts |

---

## Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Cache**: Redis (distributed), LRU (in-memory)
- **Queue**: BullMQ
- **Search**: MeiliSearch
- **WebSocket**: ws
- **Validation**: Zod

### Frontend
- **Framework**: React 18+ with TypeScript
- **Routing**: Wouter
- **State**: TanStack Query
- **UI Components**: shadcn/ui + Radix
- **Styling**: Tailwind CSS + CSS Variables
- **Editor**: Monaco Editor
- **Build**: Vite

### Testing
- **Unit/Integration**: Vitest
- **E2E**: Playwright
- **Visual**: Chromatic
- **Accessibility**: axe-core

### DevOps
- **Container**: Docker
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Pino + ELK

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive test suite, phased migration |
| Performance regression | Benchmarks at each phase, profiling |
| Security vulnerabilities | Security audit, module sandboxing |
| Scope creep | Clear phase boundaries, feature freeze |
| Developer learning curve | Documentation, training materials |

---

## Success Criteria

### Phase Completion
- All deliverables checked off
- Tests passing (unit, integration, e2e)
- No critical bugs
- Performance within targets
- Documentation updated

### Project Completion
- Full CMS functionality comparable to Drupal
- RSES as core taxonomy engine
- Module system with 10+ modules
- Theme system with 2+ themes
- Production-ready deployment
- < 3 second page load times
- WCAG 2.2 AA compliant

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Approve Phase 1** to begin
3. **Set up project tracking** (GitHub Projects/Issues)
4. **Create development branch** for CMS transformation
5. **Begin Phase 1** with directory restructure

---

*Generated by consulting 9 expert agents: Project Architect, CMS Developer, Security Specialist, Systems Analyst, UX Design Expert, UI Development Expert, Auto-link Developer, File Watcher Specialist, Set-Graph Theorist*

*Date: 2026-02-01*
