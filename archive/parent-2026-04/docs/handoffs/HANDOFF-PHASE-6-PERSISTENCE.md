# Phase 6 Config Persistence & Module Installation - Handoff Document

**Date:** 2026-02-01
**Status:** COMPLETE
**Context Window:** Started fresh

---

## What Was Completed

### 1. Database Schema for Module Configs
**File:** `shared/schema.ts`

Added `module_configs` table:
- `id` - Serial primary key
- `moduleId` - Unique text identifier
- `config` - JSONB for config storage
- `createdAt` / `updatedAt` - Timestamps

### 2. Module Config Storage Layer
**File:** `server/storage.ts`

Added `DatabaseModuleConfigStorage` class with methods:
- `getModuleConfig(moduleId)` - Get single config
- `getAllModuleConfigs()` - Get all persisted configs
- `saveModuleConfig(moduleId, config)` - Upsert config
- `deleteModuleConfig(moduleId)` - Remove config

### 3. Kernel Integration Updates
**File:** `server/kernel-integration.ts`

**Config Persistence:**
- Step 5: Load persisted configs from DB at kernel startup
- Merge persisted configs with provided configs (provided takes precedence)
- PUT endpoint now persists configs to database
- Response includes `persisted: true` flag

**Module Installation API:**
- `POST /api/kernel/modules/install` - Install module from code
- `DELETE /api/kernel/modules/:id/uninstall` - Uninstall module
- Validates module ID format (lowercase, alphanumeric + hyphens)
- Creates module directory and writes code
- Dynamic import and registration
- Cleanup on failure

### 4. Client-Side Hooks
**File:** `client/src/hooks/use-kernel.ts`

Added:
- `useInstallModule()` - Install module mutation
- `useUninstallModule()` - Uninstall module mutation
- Updated `useUpdateModuleConfig()` to include `persisted` flag

### 5. Module Installation UI
**File:** `client/src/pages/kernel-admin-page.tsx`

Added "Install" tab with:
- Module ID input with validation
- Code editor (Textarea) with template
- Installation notes sidebar
- Error handling and toast notifications

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONFIG PERSISTENCE FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Kernel Startup                                                  │
│  └── Step 5: Load Persisted Configs                             │
│      └── moduleConfigStorage.getAllModuleConfigs()              │
│          └── Populates moduleConfigs Map                        │
│                                                                  │
│  Step 6: Load Modules                                           │
│  └── Merge persisted + provided configs                         │
│      └── registry.load(moduleId, { config })                    │
│                                                                  │
│  PUT /api/kernel/modules/:id/config                             │
│  └── Validate against schema                                    │
│  └── Update moduleConfigs Map                                   │
│  └── moduleConfigStorage.saveModuleConfig() ──▶ PostgreSQL     │
│  └── Hot-reload if supported                                    │
│  └── Emit event with persisted: true                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  MODULE INSTALLATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST /api/kernel/modules/install                               │
│  ├── Validate moduleId format                                   │
│  ├── Check module doesn't exist                                 │
│  ├── Create ./server/modules/{moduleId}/                        │
│  ├── Write index.ts with module code                            │
│  ├── Dynamic import(modulePath)                                 │
│  ├── Find and instantiate module class                          │
│  ├── Validate manifest                                          │
│  ├── registry.register(instance)                                │
│  ├── registry.load(moduleId, { autoStart: true })              │
│  └── Emit kernel:module-installed event                         │
│                                                                  │
│  DELETE /api/kernel/modules/:id/uninstall                       │
│  ├── Check module exists                                        │
│  ├── Prevent core/kernel without force                          │
│  ├── registry.disable(moduleId)                                 │
│  ├── Delete from moduleConfigs                                  │
│  ├── moduleConfigStorage.deleteModuleConfig()                   │
│  ├── Remove module directory (third-party only)                 │
│  └── Emit kernel:module-uninstalled event                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Change |
|------|--------|
| `shared/schema.ts` | +20 lines (module_configs table) |
| `server/storage.ts` | +45 lines (DatabaseModuleConfigStorage) |
| `server/kernel-integration.ts` | +150 lines (persistence, install/uninstall) |
| `client/src/hooks/use-kernel.ts` | +50 lines (install/uninstall hooks) |
| `client/src/pages/kernel-admin-page.tsx` | +130 lines (ModuleInstaller UI) |

---

## API Reference

### POST /api/kernel/modules/install

Install a new module from code.

**Request:**
```json
{
  "moduleId": "my-module",
  "moduleCode": "export class MyModule implements IModule { ... }"
}
```

**Response:**
```json
{
  "success": true,
  "moduleId": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "message": "Module 'My Module' installed and loaded successfully"
}
```

### DELETE /api/kernel/modules/:id/uninstall

Uninstall a module.

**Request:**
```json
{
  "force": true  // Required for core/kernel modules
}
```

**Response:**
```json
{
  "success": true,
  "message": "Module 'my-module' uninstalled successfully"
}
```

### PUT /api/kernel/modules/:id/config (Updated)

**Response now includes:**
```json
{
  "success": true,
  "config": { ... },
  "hotReloaded": false,
  "persisted": true,
  "message": "Configuration updated and persisted (restart required to apply)"
}
```

---

## Database Migration

Run to create the new table:
```bash
npm run db:push
```

This will create the `module_configs` table in PostgreSQL.

---

## Testing

```bash
# Start server with kernel enabled
ENABLE_KERNEL=true npm run dev

# Open admin UI
open https://localhost:5000/admin/kernel

# Test Config Persistence:
1. Click on any module
2. Scroll to Configuration section
3. Modify a value and click Save
4. Note "persisted" in response
5. Restart server
6. Config should be restored

# Test Module Installation:
1. Click "Install" tab
2. Modify module ID (e.g., "test-module")
3. Modify template code as needed
4. Click "Install Module"
5. Module appears in All Modules list
```

---

## Module Template

```typescript
import type { IModule, ModuleManifest, ModuleContext } from "../kernel/types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("my-module");

export class MyModule implements IModule {
  manifest: ModuleManifest = {
    id: "my-module",
    name: "My Module",
    version: "1.0.0",
    description: "A custom module",
    tier: "third-party",
  };

  async initialize(ctx: ModuleContext): Promise<void> {
    log.info("Module initialized");
  }

  async start(): Promise<void> {
    log.info("Module started");
  }

  async stop(): Promise<void> {
    log.info("Module stopped");
  }

  async healthCheck() {
    return { status: "healthy" as const, message: "OK" };
  }
}

export default MyModule;
```

---

## Remaining Work (Phase 7+)

### Medium Priority
1. Module marketplace - Browse/download community modules
2. Module versioning - Support multiple versions
3. Config export/import - Backup/restore configs

### Lower Priority
4. Module dependencies UI - Visual dependency management
5. Audit logging - Track config changes with user info
6. Config rollback - Restore previous config versions
7. Module sandboxing - Isolate third-party modules

---

## Known Issues

1. **Pre-existing TS errors** - Design system files have syntax errors unrelated to this work.

2. **No module validation** - Installed module code is not validated for security. Third-party modules have full access to the server environment.

3. **No hot-reload for installed modules** - Newly installed modules require server restart for code changes. Config hot-reload works if module implements `onConfigChange()`.

---

## Resume Prompt

```
Continue Phase 7 of the RSES CMS project. Read docs/HANDOFF-PHASE-6-PERSISTENCE.md for context.

Phase 6 Completed:
- Config persistence to PostgreSQL (module_configs table)
- Module installation API (POST /api/kernel/modules/install)
- Module uninstall API (DELETE /api/kernel/modules/:id/uninstall)
- Installation UI with code editor and template

Phase 7 Priority:
1. Module marketplace - Browse/download community modules
2. Config export/import - Backup/restore configs

Key files:
- shared/schema.ts - module_configs table
- server/storage.ts - DatabaseModuleConfigStorage
- server/kernel-integration.ts - Install/uninstall endpoints
- client/src/hooks/use-kernel.ts - Install/uninstall hooks
- client/src/pages/kernel-admin-page.tsx - ModuleInstaller UI

To test:
ENABLE_KERNEL=true npm run dev
Open https://localhost:5000/admin/kernel
- Config persistence: Edit module config, save, restart, verify restored
- Module install: Click Install tab, modify template, install
```

---

*Handoff created: 2026-02-01*
*Lines changed: ~395*
*Status: PHASE 6 COMPLETE*
