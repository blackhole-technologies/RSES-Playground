# RSES-Playground: Drupal-Inspired Modular Architecture

## Project Architect Analysis Report

**Prepared by**: Project Architect Agent (ARC)
**Date**: 2026-02-01
**Project**: RSES-Playground at `/Users/Alchemy/Projects/experiments/RSES-Playground`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Structure Analysis](#2-current-structure-analysis)
3. [Drupal-Inspired Directory Structure](#3-drupal-inspired-directory-structure)
4. [Module System Design](#4-module-system-design)
5. [RSES-to-Drupal Taxonomy Mapping](#5-rses-to-drupal-taxonomy-mapping)
6. [Multi-Site Architecture](#6-multi-site-architecture)
7. [Migration Strategy](#7-migration-strategy)
8. [File Naming Conventions](#8-file-naming-conventions)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Executive Summary

The RSES-Playground is a mature project with **399 passing tests** covering 7 implementation phases. The current structure follows a typical React/Express monorepo pattern. This document proposes a Drupal-inspired reorganization that:

- Separates **core framework** from **contributed/custom modules**
- Enables **multi-site configuration** for different RSES deployments
- Provides a **standardized module structure** for extensibility
- Maps **RSES concepts** to Drupal-like taxonomy

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Preserve existing code paths | Zero-regression migration |
| Use symlinks for backward compatibility | Import paths unchanged |
| Module manifest via `module.info.yaml` | Declarative dependency management |
| TypeScript-first module system | Type safety preserved |
| Gradual migration phases | Test suite remains valid |

---

## 2. Current Structure Analysis

### 2.1 Existing Directory Tree

```
RSES-Playground/
├── client/                    # React frontend
│   └── src/
│       ├── components/        # UI components (mixed concerns)
│       │   ├── ui/           # shadcn/ui primitives
│       │   ├── preview/      # Preview-specific components
│       │   ├── Onboarding/   # Onboarding flow
│       │   └── workbench/    # Workbench components
│       ├── hooks/            # React hooks (11 files)
│       ├── lib/              # Utilities (4 files)
│       └── pages/            # Page components (2 files)
├── server/                    # Express backend
│   ├── auth/                 # Authentication (3 files)
│   ├── lib/                  # Core libraries (8 files)
│   ├── middleware/           # Express middleware (1 file)
│   ├── routes/               # API routes (3 files)
│   ├── services/             # Background services (3 files)
│   └── ws/                   # WebSocket server (2 files)
├── shared/                    # Shared types/schemas (3 files)
├── tests/                     # Test suites (7 directories)
└── docs/                      # Documentation (4 files)
```

### 2.2 Issues with Current Structure

| Issue | Impact | Severity |
|-------|--------|----------|
| Mixed concerns in `components/` | Hard to locate features | Medium |
| No module separation | Tight coupling | High |
| Single-site only | Cannot deploy multiple RSES configs | Medium |
| No plugin architecture | Extension requires core changes | High |
| Flat `lib/` directory | Growing complexity | Medium |

### 2.3 Current Code Distribution

```
Component       Files    Lines (est.)   Tests
─────────────────────────────────────────────────
Server Core       6        ~800          45
Server Lib        8       ~2,500        180
Server Auth       3        ~450          25
Server Routes     3       ~1,200         50
Server Services   3       ~1,000         40
Server WS         2        ~450          20
Client Hooks     11       ~1,200         15
Client Lib        4        ~400           0
Client Components 14      ~2,800         24
Shared            3        ~750           0
─────────────────────────────────────────────────
TOTAL            57      ~11,550        399
```

---

## 3. Drupal-Inspired Directory Structure

### 3.1 Proposed Structure

```
RSES-Playground/
├── core/                           # Core CMS framework
│   ├── lib/                        # Core libraries
│   │   ├── engine/                 # RSES parsing engine
│   │   │   ├── rses.ts
│   │   │   ├── boolean-parser.ts
│   │   │   ├── cycle-detector.ts
│   │   │   ├── redos-checker.ts
│   │   │   └── regex-cache.ts
│   │   ├── services/               # Core services
│   │   │   ├── queue.ts
│   │   │   ├── circuit-breaker.ts
│   │   │   └── suggestion-engine.ts
│   │   └── utils/                  # Shared utilities
│   │       ├── logger.ts
│   │       └── metrics.ts
│   ├── modules/                    # Core modules (always enabled)
│   │   ├── node/                   # Content management (projects)
│   │   │   ├── node.module.ts
│   │   │   ├── node.info.yaml
│   │   │   ├── node.routes.ts
│   │   │   └── node.service.ts
│   │   ├── taxonomy/               # Classification (sets, categories)
│   │   │   ├── taxonomy.module.ts
│   │   │   ├── taxonomy.info.yaml
│   │   │   ├── taxonomy.routes.ts
│   │   │   └── taxonomy.service.ts
│   │   ├── user/                   # User management
│   │   │   ├── user.module.ts
│   │   │   ├── user.info.yaml
│   │   │   ├── user.routes.ts
│   │   │   └── user.service.ts
│   │   ├── field/                  # Field system (attributes)
│   │   │   ├── field.module.ts
│   │   │   ├── field.info.yaml
│   │   │   └── field.types.ts
│   │   ├── file/                   # File operations
│   │   │   ├── file.module.ts
│   │   │   ├── file.info.yaml
│   │   │   ├── file.watcher.ts
│   │   │   └── file.scanner.ts
│   │   └── system/                 # System configuration
│   │       ├── system.module.ts
│   │       ├── system.info.yaml
│   │       ├── system.health.ts
│   │       └── system.middleware.ts
│   ├── themes/                     # Core themes
│   │   └── default/
│   │       ├── theme.info.yaml
│   │       ├── components/         # UI components
│   │       │   └── ui/            # shadcn/ui
│   │       └── templates/          # Layout templates
│   └── profiles/                   # Installation profiles
│       ├── standard/              # Standard install
│       │   └── profile.info.yaml
│       └── minimal/               # Minimal install
│           └── profile.info.yaml
├── modules/                        # Contributed/custom modules
│   ├── contrib/                    # Third-party modules
│   │   └── .gitkeep
│   └── custom/                     # Site-specific modules
│       ├── workbench/             # Workbench module
│       │   ├── workbench.module.ts
│       │   ├── workbench.info.yaml
│       │   ├── workbench.routes.ts
│       │   └── components/
│       │       ├── WorkbenchPanel.tsx
│       │       └── AutolinkDialog.tsx
│       ├── preview/               # Preview module
│       │   ├── preview.module.ts
│       │   ├── preview.info.yaml
│       │   └── components/
│       │       ├── PreviewPanel.tsx
│       │       ├── SymlinkPreview.tsx
│       │       └── AttributeBadges.tsx
│       ├── editor/                # Config editor module
│       │   ├── editor.module.ts
│       │   ├── editor.info.yaml
│       │   └── components/
│       │       ├── MonacoEditor.tsx
│       │       └── ConfigSidebar.tsx
│       ├── onboarding/            # Onboarding module
│       │   ├── onboarding.module.ts
│       │   ├── onboarding.info.yaml
│       │   └── components/
│       │       └── OnboardingTour.tsx
│       └── testing/               # Test panel module
│           ├── testing.module.ts
│           ├── testing.info.yaml
│           └── components/
│               └── TestPanel.tsx
├── themes/                         # Site themes
│   ├── contrib/                    # Third-party themes
│   │   └── .gitkeep
│   └── custom/                     # Custom themes
│       └── quantum/               # Quantum OS theme (future)
│           ├── theme.info.yaml
│           ├── components/
│           └── styles/
├── sites/                          # Multi-site configuration
│   ├── default/                    # Default site
│   │   ├── settings.ts            # Site settings
│   │   ├── files/                 # User uploads
│   │   │   ├── configs/           # RSES config files
│   │   │   └── exports/           # Exported data
│   │   └── config/                # Configuration storage
│   │       ├── sync/              # Exportable config
│   │       └── active/            # Active configuration
│   └── [site-name]/               # Additional sites
│       ├── settings.ts
│       ├── files/
│       └── config/
├── config/                         # Global exportable configuration
│   ├── schema/                    # Database schemas
│   │   └── schema.ts
│   ├── routes/                    # API route definitions
│   │   └── routes.ts
│   └── install/                   # Installation configs
│       └── default.rses.conf
├── vendor/                         # Dependencies (node_modules equivalent)
│   └── -> ../node_modules          # Symlink to node_modules
├── tests/                          # Test suites
│   ├── unit/                      # Unit tests
│   │   ├── engine/
│   │   ├── cms/
│   │   └── ui/
│   ├── integration/               # Integration tests
│   ├── functional/                # End-to-end tests
│   └── fixtures/                  # Test fixtures
├── scripts/                        # Build and utility scripts
│   ├── build.ts
│   ├── migrate.ts
│   └── install.ts
├── private/                        # Private files (not web-accessible)
│   └── temp/
└── web/                           # Public web root
    ├── index.html
    └── assets/
```

### 3.2 Directory Purposes

| Directory | Purpose | Drupal Equivalent |
|-----------|---------|-------------------|
| `core/` | Immutable framework code | `core/` |
| `core/lib/` | Core libraries and engine | `core/lib/` |
| `core/modules/` | Built-in modules | `core/modules/` |
| `core/themes/` | Default themes | `core/themes/` |
| `core/profiles/` | Installation profiles | `core/profiles/` |
| `modules/contrib/` | Third-party modules | `modules/contrib/` |
| `modules/custom/` | Site-specific modules | `modules/custom/` |
| `themes/contrib/` | Third-party themes | `themes/contrib/` |
| `themes/custom/` | Custom site themes | `themes/custom/` |
| `sites/` | Multi-site configuration | `sites/` |
| `config/` | Exportable configuration | `config/sync/` |
| `vendor/` | Dependencies | `vendor/` |
| `tests/` | Test suites | N/A |

---

## 4. Module System Design

### 4.1 Module Manifest (module.info.yaml)

Every module must have a `[name].info.yaml` file:

```yaml
# workbench.info.yaml
name: 'Workbench'
type: module
description: 'Provides workbench functionality for RSES project management'
version: '1.0.0'
core_version_requirement: '^1.0'
package: 'Custom'

dependencies:
  - core:node
  - core:taxonomy
  - core:file

configure: workbench.settings

# Routing
routes:
  - workbench.routes

# Services
services:
  - workbench.autolink
  - workbench.scanner

# React components to register
components:
  - WorkbenchPanel
  - AutolinkDialog

# Hooks implemented
hooks:
  - hook_entity_presave
  - hook_cron

# Permissions
permissions:
  - 'access workbench'
  - 'create symlinks'
  - 'scan projects'
```

### 4.2 Standard Module Structure

```
modules/custom/workbench/
├── workbench.info.yaml         # Module manifest
├── workbench.module.ts         # Module bootstrap and hooks
├── workbench.routes.ts         # API route definitions
├── workbench.service.ts        # Business logic service
├── workbench.install.ts        # Install/uninstall hooks
├── workbench.permissions.ts    # Permission definitions
├── config/                     # Default configuration
│   ├── install/               # Installed on enable
│   │   └── workbench.settings.yaml
│   └── schema/                # Configuration schema
│       └── workbench.schema.yaml
├── src/                        # TypeScript source
│   ├── Controller/            # Route controllers
│   │   └── WorkbenchController.ts
│   ├── Service/               # Services
│   │   └── AutolinkService.ts
│   ├── Plugin/                # Plugin types
│   │   └── SymlinkStrategy/
│   └── Entity/                # Entity definitions
│       └── Project.ts
├── components/                 # React components
│   ├── WorkbenchPanel.tsx
│   └── AutolinkDialog.tsx
├── hooks/                      # React hooks
│   └── useAutolink.ts
├── templates/                  # Twig-like templates (optional)
│   └── workbench-panel.html.twig
└── tests/                      # Module-specific tests
    ├── WorkbenchService.test.ts
    └── WorkbenchController.test.ts
```

### 4.3 Module Bootstrap (workbench.module.ts)

```typescript
// workbench.module.ts
import { Module, Hook, Service, Route } from '@core/module';
import { WorkbenchService } from './src/Service/WorkbenchService';
import { workbenchRoutes } from './workbench.routes';

@Module({
  name: 'workbench',
  version: '1.0.0',
  dependencies: ['core:node', 'core:taxonomy', 'core:file'],
})
export class WorkbenchModule {
  constructor(
    @Service('workbench.service') private workbench: WorkbenchService,
  ) {}

  /**
   * Hook called when a project entity is about to be saved.
   * Auto-classifies the project based on RSES rules.
   */
  @Hook('entity_presave')
  async onEntityPresave(entity: Project): Promise<Project> {
    if (entity.type === 'project') {
      return this.workbench.classify(entity);
    }
    return entity;
  }

  /**
   * Hook called during cron execution.
   * Scans for new projects and updates classifications.
   */
  @Hook('cron')
  async onCron(): Promise<void> {
    await this.workbench.scanProjects();
  }

  /**
   * Register module routes.
   */
  @Route()
  getRoutes() {
    return workbenchRoutes;
  }
}
```

### 4.4 Service Definition (workbench.service.ts)

```typescript
// workbench.service.ts
import { Injectable, Inject } from '@core/di';
import { RsesEngine } from '@core/lib/engine/rses';
import { FileService } from '@core/modules/file';
import { TaxonomyService } from '@core/modules/taxonomy';

@Injectable('workbench.service')
export class WorkbenchService {
  constructor(
    @Inject('rses.engine') private engine: RsesEngine,
    @Inject('file.service') private files: FileService,
    @Inject('taxonomy.service') private taxonomy: TaxonomyService,
  ) {}

  async autolink(projectPath: string, config: string): Promise<AutolinkResult> {
    // Implementation
  }

  async classify(entity: Project): Promise<Project> {
    const result = this.engine.test(entity.config, entity.name);
    entity.classification = result;
    return entity;
  }

  async scanProjects(rootPath: string): Promise<Project[]> {
    // Implementation
  }
}
```

### 4.5 Route Definition (workbench.routes.ts)

```typescript
// workbench.routes.ts
import { Route, Controller, Method } from '@core/routing';
import { z } from 'zod';

export const workbenchRoutes: Route[] = [
  {
    path: '/api/workbench/autolink',
    method: Method.POST,
    controller: 'WorkbenchController',
    action: 'autolink',
    permissions: ['create symlinks'],
    input: z.object({
      projectPath: z.string(),
      configContent: z.string(),
      dryRun: z.boolean().optional(),
    }),
  },
  {
    path: '/api/workbench/scan',
    method: Method.POST,
    controller: 'WorkbenchController',
    action: 'scan',
    permissions: ['scan projects'],
    input: z.object({
      rootPath: z.string(),
      configContent: z.string(),
    }),
  },
];
```

---

## 5. RSES-to-Drupal Taxonomy Mapping

### 5.1 Concept Mapping

| RSES Concept | Drupal Equivalent | Implementation |
|--------------|-------------------|----------------|
| RSES Config | Vocabulary Config | `taxonomy.vocabulary.yaml` |
| Pattern Sets (`[sets]`) | Taxonomy Terms | `TaxonomyTerm` entity |
| Attribute Sets (`[sets.attributes]`) | Entity Fields | `FieldConfig` |
| Compound Sets (`[sets.compound]`) | Computed Fields | `ComputedField` |
| Rules (`[rules.*]`) | Term Assignment Plugins | `TermAssignmentPlugin` |
| Symlinks | Entity References in FS | `FileReference` entity |
| Projects | Content Nodes | `Node` entity |

### 5.2 RSES Config as Vocabulary Configuration

```yaml
# config/taxonomy/rses_classification.vocabulary.yaml
langcode: en
status: true
dependencies: {}
id: rses_classification
name: 'RSES Classification'
description: 'Classification vocabulary powered by RSES rules'
weight: 0

# RSES-specific extensions
rses:
  defaults:
    auto_topic: 'false'
    auto_type: 'false'
    delimiter: '-'

  sets:
    tools: '*-tool | tool-*'
    tutorials: '*-tutorial | *-guide'
    web: '*-web | web-* | *-html'

  attributes:
    ai_generated: '{source = *}'
    claude_projects: '{source = claude}'

  compound:
    ai_tools: '$ai_generated & $tools'

  rules:
    topic:
      - condition: '$ai_generated'
        result: 'ai/$source'
```

### 5.3 Pattern Sets as Taxonomy Terms

```typescript
// core/modules/taxonomy/src/Entity/TaxonomyTerm.ts
export interface TaxonomyTerm {
  id: number;
  vid: string;              // Vocabulary ID
  name: string;             // Human-readable name
  machineName: string;      // Machine name (e.g., 'tools')
  description?: string;
  weight: number;
  parent?: number;          // Parent term (hierarchy)

  // RSES-specific
  rses: {
    type: 'pattern' | 'attribute' | 'compound';
    pattern: string;        // The RSES pattern/expression
    namespace: string;      // For collision detection
    lineNumber?: number;    // Source line in config
  };
}
```

### 5.4 Rules as Assignment Plugins

```typescript
// core/modules/taxonomy/src/Plugin/TermAssignment/RsesRulePlugin.ts
import { Plugin, PluginBase } from '@core/plugin';

@Plugin({
  id: 'rses_rule',
  label: 'RSES Rule Assignment',
})
export class RsesRulePlugin extends PluginBase implements TermAssignmentPlugin {
  async assignTerms(entity: Node, vocabulary: Vocabulary): Promise<TaxonomyTerm[]> {
    const config = vocabulary.getThirdPartySetting('rses', 'config');
    const engine = this.getService('rses.engine');

    const result = engine.test(config, entity.label);

    // Map matched sets to taxonomy terms
    return result.sets.map(setName =>
      this.taxonomyStorage.loadByMachineName(vocabulary.id, setName)
    );
  }
}
```

### 5.5 Symlinks as File References

```typescript
// core/modules/file/src/Entity/FileReference.ts
export interface FileReference {
  id: number;
  type: 'symlink' | 'hardlink' | 'copy';
  sourceUri: string;        // Original file path
  targetUri: string;        // Link location
  entityType: string;       // e.g., 'project'
  entityId: number;

  // Metadata
  category: 'topic' | 'type' | 'filetype';
  categoryValue: string;    // e.g., 'ai/claude'

  status: 'pending' | 'created' | 'broken' | 'removed';
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}
```

---

## 6. Multi-Site Architecture

### 6.1 Multi-Site Configuration

Each site in `sites/` can have its own:
- Database connection
- RSES configuration
- Theme
- Custom modules

```
sites/
├── default/                    # Default site (localhost)
│   ├── settings.ts
│   ├── files/
│   │   └── configs/
│   └── config/
│       ├── sync/              # Exportable
│       └── active/            # Runtime
├── projects.example.com/       # Production site
│   ├── settings.ts
│   ├── files/
│   └── config/
└── staging.example.com/        # Staging site
    ├── settings.ts
    ├── files/
    └── config/
```

### 6.2 Site Settings (settings.ts)

```typescript
// sites/default/settings.ts
import { SiteConfig } from '@core/config';

export const settings: SiteConfig = {
  siteName: 'RSES Playground - Development',

  database: {
    type: 'sqlite',
    database: 'sites/default/files/database.sqlite',
  },

  // RSES-specific settings
  rses: {
    projectsRoot: '~/Projects',
    symlinkBase: '~/Projects/by-rses',
    defaultConfig: 'config/install/default.rses.conf',
    scanDepth: 5,
  },

  // Enabled modules (beyond core)
  modules: [
    'workbench',
    'preview',
    'editor',
    'onboarding',
    'testing',
  ],

  // Active theme
  theme: 'default',

  // File storage
  files: {
    public: 'sites/default/files/public',
    private: 'sites/default/files/private',
    temp: 'sites/default/files/temp',
  },

  // Security
  trustedHosts: ['localhost', '127.0.0.1'],
  sessionSecret: process.env.SESSION_SECRET,
};
```

### 6.3 Site Detection

```typescript
// core/lib/site-detection.ts
export function detectSite(request: Request): string {
  const host = request.headers.host || 'localhost';
  const sitesDir = path.join(__dirname, '../../sites');

  // Check for exact match
  const exactMatch = path.join(sitesDir, host);
  if (fs.existsSync(exactMatch)) {
    return host;
  }

  // Check for wildcard sites (e.g., *.example.com)
  const sites = fs.readdirSync(sitesDir);
  for (const site of sites) {
    if (site.startsWith('*.')) {
      const pattern = site.replace('*.', '');
      if (host.endsWith(pattern)) {
        return site;
      }
    }
  }

  return 'default';
}
```

### 6.4 Shared Core, Separate Content

```
Multi-Site Architecture
═══════════════════════════════════════════════════════════════

                    ┌─────────────────────────────────────────┐
                    │              SHARED CORE                 │
                    │  ─────────────────────────────────────  │
                    │  core/lib/  core/modules/  core/themes/ │
                    └─────────────────┬───────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  sites/default  │      │ sites/prod.com  │      │sites/staging.com│
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ • Own database  │      │ • Own database  │      │ • Own database  │
│ • Own configs   │      │ • Own configs   │      │ • Own configs   │
│ • Own files     │      │ • Own files     │      │ • Own files     │
│ • Own theme     │      │ • Own theme     │      │ • Own theme     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 7. Migration Strategy

### 7.1 Migration Phases

The migration must preserve all 399 passing tests. We use a phased approach:

```
Phase M1: Symlink Bridge (0 test changes)
Phase M2: Core Extraction (test path updates only)
Phase M3: Module Separation (import path updates)
Phase M4: Site Configuration (new tests only)
Phase M5: Cleanup (remove symlinks)
```

### 7.2 Phase M1: Symlink Bridge

Create symlinks so existing imports continue to work:

```bash
# Create backward-compatible symlinks
mkdir -p core/lib
ln -s ../../server/lib/* core/lib/

# Old import still works:
# import { RsesParser } from '../lib/rses'
# New import also works:
# import { RsesParser } from '@core/lib/engine/rses'
```

**Migration Script:**

```typescript
// scripts/migrate-phase1.ts
import fs from 'fs';
import path from 'path';

const SYMLINK_MAP = {
  // Old path -> New path
  'server/lib': 'core/lib/engine',
  'server/auth': 'core/modules/user/src',
  'server/routes.ts': 'core/modules/system/system.routes.ts',
  'shared/schema.ts': 'config/schema/schema.ts',
  'shared/routes.ts': 'config/routes/routes.ts',
};

async function createSymlinks() {
  for (const [oldPath, newPath] of Object.entries(SYMLINK_MAP)) {
    // Create new directory structure
    await fs.promises.mkdir(path.dirname(newPath), { recursive: true });

    // Copy files to new location
    await fs.promises.cp(oldPath, newPath, { recursive: true });

    // Create symlink from old to new
    await fs.promises.rm(oldPath, { recursive: true });
    await fs.promises.symlink(newPath, oldPath);
  }
}
```

### 7.3 Phase M2: Core Extraction

Move core libraries to `core/lib/`:

```
BEFORE                          AFTER
──────                          ─────
server/lib/rses.ts         →    core/lib/engine/rses.ts
server/lib/boolean-parser.ts →  core/lib/engine/boolean-parser.ts
server/lib/cycle-detector.ts →  core/lib/engine/cycle-detector.ts
server/lib/redos-checker.ts  →  core/lib/engine/redos-checker.ts
server/lib/regex-cache.ts   →   core/lib/engine/regex-cache.ts
server/lib/queue.ts         →   core/lib/services/queue.ts
server/lib/circuit-breaker.ts → core/lib/services/circuit-breaker.ts
server/lib/suggestion-engine.ts → core/lib/services/suggestion-engine.ts
server/logger.ts            →   core/lib/utils/logger.ts
server/metrics.ts           →   core/lib/utils/metrics.ts
server/health.ts            →   core/lib/utils/health.ts
```

**tsconfig.json updates:**

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["./core/*"],
      "@modules/*": ["./modules/*"],
      "@themes/*": ["./themes/*"],
      "@config/*": ["./config/*"],
      "@shared/*": ["./shared/*"],
      "@server/*": ["./server/*"]
    }
  }
}
```

### 7.4 Phase M3: Module Separation

Extract features into modules:

```
COMPONENT                   MODULE
─────────                   ──────
server/auth/*          →    core/modules/user/
server/routes/projects.ts → core/modules/node/
server/storage.ts      →    core/modules/node/node.storage.ts
server/services/file-watcher.ts → core/modules/file/file.watcher.ts
server/services/project-scanner.ts → core/modules/file/file.scanner.ts
server/services/symlink-executor.ts → modules/custom/workbench/
server/routes/workbench.ts → modules/custom/workbench/
server/routes/bridge.ts  → modules/custom/workbench/
```

### 7.5 Phase M4: Site Configuration

Create multi-site structure:

```bash
# Create default site
mkdir -p sites/default/{files,config}

# Move database
mv server/db.ts sites/default/database.ts

# Create settings
cat > sites/default/settings.ts << 'EOF'
import { SiteConfig } from '@core/config';
export const settings: SiteConfig = { /* ... */ };
EOF

# Create config export
mkdir -p sites/default/config/sync
```

### 7.6 Phase M5: Cleanup

Remove symlinks and update remaining imports:

```bash
# Remove all symlinks
find . -type l -delete

# Update imports using codemod
npx jscodeshift -t scripts/codemods/update-imports.ts .
```

### 7.7 Test Migration Commands

```bash
# Run tests after each phase to ensure no regressions
npm run test                    # All 399 tests

# Phase-specific test runs
npm run test -- --testPathPattern="engine"      # Engine tests
npm run test -- --testPathPattern="security"    # Security tests
npm run test -- --testPathPattern="cms"         # CMS tests
npm run test -- --testPathPattern="production"  # Production tests
```

---

## 8. File Naming Conventions

### 8.1 Module Files

| File | Convention | Example |
|------|------------|---------|
| Module definition | `{name}.module.ts` | `workbench.module.ts` |
| Module info | `{name}.info.yaml` | `workbench.info.yaml` |
| Routes | `{name}.routes.ts` | `workbench.routes.ts` |
| Service | `{name}.service.ts` | `workbench.service.ts` |
| Install hooks | `{name}.install.ts` | `workbench.install.ts` |
| Permissions | `{name}.permissions.ts` | `workbench.permissions.ts` |
| Test file | `{name}.test.ts` | `workbench.test.ts` |

### 8.2 Controllers and Services

| Type | Convention | Example |
|------|------------|---------|
| Controller | `{Name}Controller.ts` | `WorkbenchController.ts` |
| Service | `{Name}Service.ts` | `AutolinkService.ts` |
| Plugin | `{Name}Plugin.ts` | `RsesRulePlugin.ts` |
| Entity | `{Name}.ts` | `Project.ts` |

### 8.3 React Components

| Type | Convention | Example |
|------|------------|---------|
| Component | `{Name}.tsx` | `WorkbenchPanel.tsx` |
| Hook | `use{Name}.ts` | `useAutolink.ts` |
| Context | `{Name}Context.tsx` | `WorkbenchContext.tsx` |
| Provider | `{Name}Provider.tsx` | `WorkbenchProvider.tsx` |

### 8.4 Configuration Files

| Type | Convention | Example |
|------|------------|---------|
| Install config | `{module}.settings.yaml` | `workbench.settings.yaml` |
| Schema | `{module}.schema.yaml` | `workbench.schema.yaml` |
| Site settings | `settings.ts` | `settings.ts` |
| RSES config | `{name}.rses.conf` | `default.rses.conf` |

---

## 9. Implementation Checklist

### 9.1 Pre-Migration Checklist

- [ ] Backup current codebase
- [ ] Document all current import paths
- [ ] Create snapshot of test results (399 passing)
- [ ] Identify circular dependencies
- [ ] Review all file watchers and hot reload configs

### 9.2 Phase M1 Checklist: Symlink Bridge

- [ ] Create `core/` directory structure
- [ ] Create `modules/custom/` directory structure
- [ ] Create `sites/default/` directory structure
- [ ] Create symlinks from old paths to new
- [ ] Run all tests (expect 399 passing)
- [ ] Verify hot reload still works
- [ ] Update `.gitignore` for symlinks

### 9.3 Phase M2 Checklist: Core Extraction

- [ ] Move engine files to `core/lib/engine/`
- [ ] Move service files to `core/lib/services/`
- [ ] Move utility files to `core/lib/utils/`
- [ ] Update `tsconfig.json` with path aliases
- [ ] Update all imports in moved files
- [ ] Run all tests (expect 399 passing)
- [ ] Update test file paths if needed

### 9.4 Phase M3 Checklist: Module Separation

- [ ] Create `core/modules/node/` module
- [ ] Create `core/modules/taxonomy/` module
- [ ] Create `core/modules/user/` module
- [ ] Create `core/modules/field/` module
- [ ] Create `core/modules/file/` module
- [ ] Create `core/modules/system/` module
- [ ] Create `modules/custom/workbench/` module
- [ ] Create `modules/custom/preview/` module
- [ ] Create `modules/custom/editor/` module
- [ ] Create `modules/custom/onboarding/` module
- [ ] Create `modules/custom/testing/` module
- [ ] Write `*.info.yaml` for all modules
- [ ] Run all tests (expect 399 passing)

### 9.5 Phase M4 Checklist: Site Configuration

- [ ] Move database configuration to `sites/default/`
- [ ] Create `sites/default/settings.ts`
- [ ] Set up config sync directory
- [ ] Implement site detection middleware
- [ ] Test multi-site detection
- [ ] Run all tests (expect 399+ passing)

### 9.6 Phase M5 Checklist: Cleanup

- [ ] Remove all symlinks
- [ ] Update all remaining imports
- [ ] Run codemod for import updates
- [ ] Final test run (expect 399+ passing)
- [ ] Update documentation
- [ ] Update CI/CD scripts
- [ ] Update development setup guide

### 9.7 Post-Migration Verification

- [ ] All 399 tests passing
- [ ] Hot reload functional
- [ ] Build process succeeds
- [ ] Production deployment works
- [ ] No broken imports
- [ ] IDE autocompletion works
- [ ] All API endpoints functional

---

## Appendix A: Complete Directory Tree

```
RSES-Playground/
├── core/
│   ├── lib/
│   │   ├── engine/
│   │   │   ├── rses.ts
│   │   │   ├── boolean-parser.ts
│   │   │   ├── cycle-detector.ts
│   │   │   ├── redos-checker.ts
│   │   │   ├── regex-cache.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   ├── queue.ts
│   │   │   ├── circuit-breaker.ts
│   │   │   ├── suggestion-engine.ts
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── metrics.ts
│   │   │   ├── health.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── modules/
│   │   ├── node/
│   │   │   ├── node.module.ts
│   │   │   ├── node.info.yaml
│   │   │   ├── node.routes.ts
│   │   │   ├── node.service.ts
│   │   │   ├── node.storage.ts
│   │   │   ├── src/
│   │   │   │   ├── Controller/
│   │   │   │   │   └── NodeController.ts
│   │   │   │   └── Entity/
│   │   │   │       ├── Project.ts
│   │   │   │       └── Config.ts
│   │   │   └── tests/
│   │   │       └── node.test.ts
│   │   ├── taxonomy/
│   │   │   ├── taxonomy.module.ts
│   │   │   ├── taxonomy.info.yaml
│   │   │   ├── taxonomy.routes.ts
│   │   │   ├── taxonomy.service.ts
│   │   │   ├── src/
│   │   │   │   ├── Entity/
│   │   │   │   │   ├── Vocabulary.ts
│   │   │   │   │   └── TaxonomyTerm.ts
│   │   │   │   └── Plugin/
│   │   │   │       └── TermAssignment/
│   │   │   │           └── RsesRulePlugin.ts
│   │   │   └── tests/
│   │   │       └── taxonomy.test.ts
│   │   ├── user/
│   │   │   ├── user.module.ts
│   │   │   ├── user.info.yaml
│   │   │   ├── user.routes.ts
│   │   │   ├── user.service.ts
│   │   │   ├── src/
│   │   │   │   ├── Controller/
│   │   │   │   │   └── UserController.ts
│   │   │   │   ├── Auth/
│   │   │   │   │   ├── passport.ts
│   │   │   │   │   └── session.ts
│   │   │   │   └── Entity/
│   │   │   │       └── User.ts
│   │   │   └── tests/
│   │   │       └── user.test.ts
│   │   ├── field/
│   │   │   ├── field.module.ts
│   │   │   ├── field.info.yaml
│   │   │   ├── field.types.ts
│   │   │   └── src/
│   │   │       └── Plugin/
│   │   │           ├── FieldType/
│   │   │           │   ├── StringField.ts
│   │   │           │   └── AttributeField.ts
│   │   │           └── FieldFormatter/
│   │   │               └── DefaultFormatter.ts
│   │   ├── file/
│   │   │   ├── file.module.ts
│   │   │   ├── file.info.yaml
│   │   │   ├── file.watcher.ts
│   │   │   ├── file.scanner.ts
│   │   │   ├── src/
│   │   │   │   ├── Controller/
│   │   │   │   │   └── FileController.ts
│   │   │   │   ├── Service/
│   │   │   │   │   ├── WatcherService.ts
│   │   │   │   │   └── ScannerService.ts
│   │   │   │   └── Entity/
│   │   │   │       └── FileReference.ts
│   │   │   └── tests/
│   │   │       ├── watcher.test.ts
│   │   │       └── scanner.test.ts
│   │   └── system/
│   │       ├── system.module.ts
│   │       ├── system.info.yaml
│   │       ├── system.routes.ts
│   │       ├── system.health.ts
│   │       ├── system.middleware.ts
│   │       └── src/
│   │           └── Middleware/
│   │               └── SecurityMiddleware.ts
│   ├── themes/
│   │   └── default/
│   │       ├── theme.info.yaml
│   │       ├── components/
│   │       │   └── ui/
│   │       │       ├── accordion.tsx
│   │       │       ├── alert-dialog.tsx
│   │       │       ├── button.tsx
│   │       │       └── ... (other shadcn components)
│   │       └── templates/
│   │           └── page.html
│   └── profiles/
│       ├── standard/
│       │   ├── profile.info.yaml
│       │   └── config/
│       │       └── install/
│       └── minimal/
│           ├── profile.info.yaml
│           └── config/
│               └── install/
├── modules/
│   ├── contrib/
│   │   └── .gitkeep
│   └── custom/
│       ├── workbench/
│       │   ├── workbench.module.ts
│       │   ├── workbench.info.yaml
│       │   ├── workbench.routes.ts
│       │   ├── workbench.service.ts
│       │   ├── src/
│       │   │   ├── Controller/
│       │   │   │   └── WorkbenchController.ts
│       │   │   └── Service/
│       │   │       └── AutolinkService.ts
│       │   ├── components/
│       │   │   ├── WorkbenchPanel.tsx
│       │   │   └── AutolinkDialog.tsx
│       │   ├── hooks/
│       │   │   └── useAutolink.ts
│       │   └── tests/
│       │       └── workbench.test.ts
│       ├── preview/
│       │   ├── preview.module.ts
│       │   ├── preview.info.yaml
│       │   ├── components/
│       │   │   ├── PreviewPanel.tsx
│       │   │   ├── SymlinkPreview.tsx
│       │   │   └── AttributeBadges.tsx
│       │   └── tests/
│       │       └── preview.test.ts
│       ├── editor/
│       │   ├── editor.module.ts
│       │   ├── editor.info.yaml
│       │   ├── components/
│       │   │   ├── MonacoEditor.tsx
│       │   │   └── ConfigSidebar.tsx
│       │   ├── lib/
│       │   │   └── monaco-rses.ts
│       │   └── tests/
│       │       └── editor.test.ts
│       ├── onboarding/
│       │   ├── onboarding.module.ts
│       │   ├── onboarding.info.yaml
│       │   ├── components/
│       │   │   ├── OnboardingTour.tsx
│       │   │   └── index.ts
│       │   └── tests/
│       │       └── onboarding.test.ts
│       └── testing/
│           ├── testing.module.ts
│           ├── testing.info.yaml
│           ├── components/
│           │   ├── TestPanel.tsx
│           │   └── TestResults.tsx
│           └── tests/
│               └── testing.test.ts
├── themes/
│   ├── contrib/
│   │   └── .gitkeep
│   └── custom/
│       └── quantum/
│           ├── theme.info.yaml
│           ├── components/
│           │   ├── Desktop.tsx
│           │   ├── Taskbar.tsx
│           │   ├── Window.tsx
│           │   └── Finder.tsx
│           ├── styles/
│           │   └── quantum.css
│           └── templates/
│               └── desktop.html
├── sites/
│   ├── default/
│   │   ├── settings.ts
│   │   ├── files/
│   │   │   ├── configs/
│   │   │   ├── exports/
│   │   │   ├── public/
│   │   │   └── private/
│   │   └── config/
│   │       ├── sync/
│   │       │   ├── core.extension.yaml
│   │       │   ├── taxonomy.vocabulary.rses_classification.yaml
│   │       │   └── user.role.administrator.yaml
│   │       └── active/
│   └── example.com/
│       ├── settings.ts
│       ├── files/
│       └── config/
├── config/
│   ├── schema/
│   │   └── schema.ts
│   ├── routes/
│   │   └── routes.ts
│   └── install/
│       └── default.rses.conf
├── vendor/
│   └── -> ../node_modules
├── tests/
│   ├── unit/
│   │   ├── engine/
│   │   │   ├── cycle-detector.test.ts
│   │   │   ├── performance.test.ts
│   │   │   ├── redos-checker.test.ts
│   │   │   └── symbol-namespace.test.ts
│   │   ├── cms/
│   │   │   ├── activity-log.test.ts
│   │   │   ├── api-schemas.test.ts
│   │   │   ├── quality-gates.test.ts
│   │   │   └── storage.test.ts
│   │   └── ui/
│   │       ├── error-boundary.test.tsx
│   │       ├── hooks.test.tsx
│   │       └── setup.ts
│   ├── integration/
│   │   └── file-services.test.ts
│   ├── functional/
│   │   └── e2e.test.ts
│   ├── security/
│   │   ├── auth.test.ts
│   │   ├── boolean-parser.test.ts
│   │   ├── rses-parser-security.test.ts
│   │   └── security-middleware.test.ts
│   ├── production/
│   │   ├── circuit-breaker.test.ts
│   │   ├── health.test.ts
│   │   ├── metrics.test.ts
│   │   └── queue.test.ts
│   ├── prompting/
│   │   └── suggestion-engine.test.ts
│   └── fixtures/
│       ├── configs/
│       └── projects/
├── scripts/
│   ├── build.ts
│   ├── migrate.ts
│   ├── install.ts
│   └── codemods/
│       └── update-imports.ts
├── private/
│   └── temp/
├── web/
│   ├── index.html
│   └── assets/
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── OPERATIONS.md
│   ├── ARCHITECTURE-DRUPAL-STYLE.md
│   └── UNUSED-COMPONENTS.md
├── .claude/
│   └── PROJECT-STATE.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
├── .env
├── README.md
├── IMPLEMENTATION-PLAN.md
├── HANDOFF-CURRENT.md
├── HANDOFF-PHASE-1.md
├── HANDOFF-PHASE-2.md
├── HANDOFF-PHASE-3.md
├── HANDOFF-PHASE-5.md
├── HANDOFF-PHASE-6.md
├── HANDOFF-PHASE-7.md
└── HANDOFF-PHASE-8.md
```

---

## Appendix B: Module Dependency Graph

```
                              ┌──────────────┐
                              │    system    │
                              │   (health,   │
                              │  middleware) │
                              └──────┬───────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│     user     │            │     file     │            │    field     │
│ (auth, sess) │            │  (watcher,   │            │  (types,     │
│              │            │   scanner)   │            │  formatters) │
└──────┬───────┘            └──────┬───────┘            └──────┬───────┘
       │                           │                           │
       └───────────────────────────┼───────────────────────────┘
                                   │
                                   ▼
                          ┌──────────────┐
                          │     node     │
                          │  (projects,  │
                          │   configs)   │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │   taxonomy   │
                          │   (sets,     │
                          │   rules)     │
                          └──────┬───────┘
                                 │
         ┌───────────────────────┼───────────────────────────┐
         │                       │                           │
         ▼                       ▼                           ▼
┌──────────────┐        ┌──────────────┐            ┌──────────────┐
│  workbench   │        │   preview    │            │    editor    │
│  (autolink,  │        │  (symlinks,  │            │  (monaco,    │
│   scanning)  │        │   badges)    │            │   sidebar)   │
└──────────────┘        └──────────────┘            └──────────────┘
         │                       │                           │
         │                       ▼                           │
         │               ┌──────────────┐                    │
         │               │   testing    │◄───────────────────┘
         │               │  (test UI)   │
         │               └──────────────┘
         │
         ▼
┌──────────────┐
│  onboarding  │
│  (tour, help)│
└──────────────┘
```

---

*This architecture document provides the complete blueprint for transforming RSES-Playground into a Drupal-inspired modular system while preserving all existing functionality and tests.*
