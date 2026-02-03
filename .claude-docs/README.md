# Documentation System

This directory contains structured documentation managed by the doc-manager system.

## Directory Structure

```
.claude-docs/
├── README.md              # This file
├── registry/
│   └── index.json         # Master document registry
├── current/               # Active documents
│   ├── review/            # Code/architecture reviews
│   ├── handoff/           # Session handoff notes
│   ├── architecture/      # Architecture decisions
│   ├── audit/             # Security/compliance audits
│   └── analysis/          # Investigation reports
└── archive/               # Superseded documents
    └── YYYY/MM/           # Organized by date
```

## Document Naming Convention

```
{type}_{scope}_{YYYY-MM-DD}_v{version}.md
```

Examples:
- `review_full-project_2026-02-01_v1.md`
- `handoff_session_2026-02-02_v1.md`
- `arch_security_2026-01-15_v2.md`

## Document Types

| Type | Purpose |
|------|---------|
| `review` | Code/architecture reviews |
| `handoff` | Agent session handoffs |
| `arch` | Architecture decisions |
| `audit` | Security/compliance audits |
| `analysis` | Investigation reports |

## Status Values

| Status | Meaning | Location |
|--------|---------|----------|
| `current` | Active, authoritative | `current/` |
| `superseded` | Replaced by newer version | `archive/` |
| `archived` | Kept for history | `archive/` |
| `legacy` | Migrated from unstructured location | varies |

## Registry

The `registry/index.json` file tracks all documents with:
- Unique IDs
- File locations
- Status and relationships
- Metadata and checksums

## Legacy Documents

Documents in `docs/` that predate this system are tracked with `status: legacy`.
Use the migration guide to move them into the structured system.

## Commands

```bash
# List current documents
jq '.documents[] | select(.status == "current")' .claude-docs/registry/index.json

# Find reviews
jq '.documents[] | select(.type == "review")' .claude-docs/registry/index.json
```
