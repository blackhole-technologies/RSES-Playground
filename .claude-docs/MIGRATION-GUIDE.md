# Documentation Migration Guide

This guide explains how to migrate legacy documents into the `.claude-docs/` structured system.

## Overview

Legacy documents exist in various locations:
- `docs/handoffs/` - Session handoff files
- `docs/reviews/` - Review documents
- `docs/architecture/` - Architecture documentation
- `docs/security/` - Security-related docs
- Root level - `REVIEW.md`, etc.

## Migration Status

| Location | Status |
|----------|--------|
| `REVIEW.md` | Tracked as legacy |
| `docs/reviews/` | Tracked as legacy |
| `docs/handoffs/` | Partially tracked |
| `docs/architecture/` | Tracked as legacy |
| `docs/security/` | Tracked as legacy |

## Migration Process

### Step 1: Identify Document

Determine:
- Type: review, handoff, architecture, audit, analysis
- Scope: what it covers (e.g., "full-project", "auth-module")
- Date: when it was created

### Step 2: Generate ID and Filename

```
ID: doc_{random-8-chars}
Filename: {type}_{scope}_{YYYY-MM-DD}_v1.md
```

### Step 3: Add Frontmatter

Add YAML frontmatter to the document:

```yaml
---
doc-id: doc_abc12345
type: review
scope: full-project
status: current
created: 2026-02-01T00:00:00Z
created-by: architect
supersedes: null
tags:
  - security
  - architecture
scope-path: /
migrated-from: REVIEW.md
---
```

### Step 4: Move Document

```bash
# Copy to structured location
cp docs/handoffs/HANDOFF-SESSION.md .claude-docs/current/handoff/handoff_session_2026-02-02_v1.md

# Or create symlink to preserve original location
ln -s ../../.claude-docs/current/handoff/handoff_session_2026-02-02_v1.md docs/handoffs/HANDOFF-SESSION.md
```

### Step 5: Update Registry

Add entry to `.claude-docs/registry/index.json`:

```json
{
  "id": "doc_abc12345",
  "filename": "handoff_session_2026-02-02_v1.md",
  "type": "handoff",
  "scope": "session",
  "path": ".claude-docs/current/handoff/handoff_session_2026-02-02_v1.md",
  "status": "current",
  "created": "2026-02-02T00:00:00Z",
  "createdBy": "agent",
  "supersedes": null,
  "supersededBy": null,
  "relatedTo": [],
  "tags": [],
  "scopePath": "/",
  "metadata": {
    "migrated": true,
    "originalPath": "docs/handoffs/HANDOFF-SESSION.md"
  }
}
```

## Recommended Migration Order

1. **Current handoffs** - Most time-sensitive
2. **Active reviews** - Reference frequently
3. **Architecture docs** - Stable, migrate at leisure
4. **Old handoffs** - Archive directly

## Keeping Legacy Documents

Documents can remain in original locations with `status: legacy` in registry.
This is acceptable for:
- Stable architecture documents
- Historical records
- Documents referenced by external systems

## Full Migration Command

```bash
# Example: migrate latest handoff
DOC_ID="doc_$(openssl rand -hex 4)"
TYPE="handoff"
SCOPE="session"
DATE="2026-02-02"
VERSION="v1"

FILENAME="${TYPE}_${SCOPE}_${DATE}_${VERSION}.md"
TARGET=".claude-docs/current/${TYPE}/${FILENAME}"

# Add frontmatter and copy
cat > "$TARGET" << 'FRONT'
---
doc-id: $DOC_ID
type: $TYPE
scope: $SCOPE
status: current
created: ${DATE}T00:00:00Z
migrated-from: docs/handoffs/HANDOFF-SESSION-2026-02-02.md
---

FRONT
cat docs/handoffs/HANDOFF-SESSION-2026-02-02.md >> "$TARGET"
```

## Validation

After migration, validate with:

```bash
# Check all registry entries have files
jq -r '.documents[].path' .claude-docs/registry/index.json | while read path; do
  [ -f "$path" ] || echo "MISSING: $path"
done

# Check frontmatter matches registry
# (requires more complex script)
```
