# Phase 5 Module Configuration UI - Handoff Document

**Date:** 2026-02-01
**Status:** COMPLETE
**Context Window:** Started fresh

---

## What Was Completed

### 1. Server-Side Config API Endpoints
**File:** `server/kernel-integration.ts`

Added module configuration storage and API endpoints:
- `moduleConfigs` Map to store runtime module configurations
- `GET /api/kernel/modules/:id/config` - Returns current config, schema info, and hot-reload capability
- `PUT /api/kernel/modules/:id/config` - Updates config with validation and optional hot-reload

**Key Features:**
- Schema extraction from Zod schemas (type, required, default)
- Config validation against module's configSchema
- Hot-reload support via `onConfigChange()` callback
- Event emission on config changes

### 2. Client-Side Config Hooks
**File:** `client/src/hooks/use-kernel.ts`

Added new types and hooks:
- `ModuleConfigField` - Schema field info type
- `ModuleConfigResponse` - API response type
- `useModuleConfig(id)` - Query hook for fetching module config
- `useUpdateModuleConfig()` - Mutation hook for saving config changes

### 3. ModuleConfigEditor Component
**File:** `client/src/pages/kernel-admin-page.tsx`

Dynamic form component that:
- Renders config fields based on schema (string, number, boolean)
- Falls back to raw JSON editor for modules without schema
- Shows hot-reload capability indicator
- Tracks dirty state and handles save

### 4. Integration into ModuleDetailSheet
Added Configuration section to the module detail panel showing:
- Schema-based form fields or raw JSON editor
- Save button with loading state
- Hot-reload status indicator

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  MODULE CONFIG FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ModuleDetailSheet                                               │
│  └── ModuleConfigEditor                                          │
│      ├── useModuleConfig(moduleId)  ───▶  GET /config            │
│      │                                       │                   │
│      │                               ┌───────┴──────┐            │
│      │                               │ configSchema  │            │
│      │                               │ current config│            │
│      │                               │ hotReload flag│            │
│      │                               └───────┬──────┘            │
│      │                                       │                   │
│      ├── renderConfigField()  ◀──────────────┘                   │
│      │   (string/number/boolean inputs)                          │
│      │                                                           │
│      └── useUpdateModuleConfig()  ───▶  PUT /config              │
│                                              │                   │
│                                     ┌────────┴────────┐          │
│                                     │ Validate schema  │          │
│                                     │ Store config     │          │
│                                     │ Call onConfigChange()      │
│                                     │ Emit event       │          │
│                                     └─────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Change |
|------|--------|
| `server/kernel-integration.ts` | +100 lines (config storage, API endpoints, schema extraction) |
| `client/src/hooks/use-kernel.ts` | +65 lines (types, hooks for config) |
| `client/src/pages/kernel-admin-page.tsx` | +120 lines (ModuleConfigEditor, integration) |

---

## API Reference

### GET /api/kernel/modules/:id/config

Returns module configuration with schema info.

**Response:**
```json
{
  "moduleId": "content",
  "config": {
    "maxConfigSize": 1000000,
    "enableVersioning": true
  },
  "schema": [
    {
      "name": "maxConfigSize",
      "type": "number",
      "required": false,
      "default": null
    },
    {
      "name": "enableVersioning",
      "type": "boolean",
      "required": false,
      "default": null
    }
  ],
  "hasSchema": true,
  "supportsHotReload": false
}
```

### PUT /api/kernel/modules/:id/config

Updates module configuration.

**Request:**
```json
{
  "config": {
    "maxConfigSize": 2000000,
    "enableVersioning": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "maxConfigSize": 2000000,
    "enableVersioning": false
  },
  "hotReloaded": false,
  "message": "Configuration updated (restart required to apply)"
}
```

---

## Testing

```bash
# Start server with kernel enabled
ENABLE_KERNEL=true npm run dev

# Open admin UI
open https://localhost:5000/admin/kernel

# Click on any module to open detail sheet
# Scroll to "Configuration" section
# Edit config values and click Save
```

---

## Schema Support

The config editor extracts schema info from Zod schemas:

| Zod Type | Rendered As |
|----------|-------------|
| `z.string()` | Text input |
| `z.number()` | Number input |
| `z.boolean()` | Toggle switch |
| `z.optional(...)` | Optional field (no asterisk) |
| `z.default(...)` | Shows default value |

Modules without `configSchema` show a raw JSON editor.

---

## Hot-Reload Support

Modules can implement `onConfigChange(newConfig)` to support hot-reloading:

```typescript
class MyModule implements IModule {
  async onConfigChange(newConfig: Record<string, unknown>): Promise<boolean> {
    // Apply new config at runtime
    this.config = newConfig;
    // Return true if hot-reload succeeded
    return true;
  }
}
```

The UI indicates whether hot-reload is available and shows appropriate feedback after save.

---

## Remaining Work (Phase 6+)

### Medium Priority
1. Module installation - Install third-party modules via UI
2. Config persistence - Save configs to disk/database for restart

### Lower Priority
3. Module marketplace - Browse available modules
4. Audit logging - Track all config changes
5. Config validation UI - Show inline validation errors
6. Config presets - Save and load config presets

---

## Known Issues

1. **Pre-existing TS errors** - Some design system files have syntax errors unrelated to this work.

2. **No config persistence** - Configs are stored in memory and lost on restart. A future phase should persist to disk or database.

---

## Resume Prompt

```
Continue Phase 6 of the RSES CMS project. Read docs/HANDOFF-PHASE-5-CONFIG-UI.md for context.

Phase 5 Completed:
- Module configuration API endpoints (GET/PUT /api/kernel/modules/:id/config)
- Schema extraction from Zod for dynamic form rendering
- ModuleConfigEditor component with string/number/boolean support
- Hot-reload indicator and raw JSON fallback for schema-less modules

Phase 6 Priority:
1. Config persistence - Save module configs to disk/database
2. Module installation UI - Upload/install third-party modules

Key files:
- server/kernel-integration.ts - Config API endpoints
- client/src/hooks/use-kernel.ts - useModuleConfig, useUpdateModuleConfig
- client/src/pages/kernel-admin-page.tsx - ModuleConfigEditor component
- server/kernel/types.ts - IModule.onConfigChange interface

To test:
ENABLE_KERNEL=true npm run dev
Open https://localhost:5000/admin/kernel
Click any module, scroll to Configuration section
Edit values and Save
```

---

*Handoff created: 2026-02-01*
*Lines changed: ~285*
*Status: PHASE 5 COMPLETE*
