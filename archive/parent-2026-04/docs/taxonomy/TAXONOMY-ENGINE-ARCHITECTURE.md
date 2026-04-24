# RSES Taxonomy Engine Architecture

## Overview

The RSES Taxonomy Engine transforms the Rules-based Symlink Evaluation System (RSES) into a comprehensive vocabulary/taxonomy system for Content Management. This document describes the architecture, interfaces, and integration patterns.

## Core Concepts

### 1. Vocabulary

A **Vocabulary** is a collection of related terms derived from RSES rule categories:

| Vocabulary ID | Source Category | Example Terms |
|---------------|-----------------|---------------|
| `by-topic` | topic rules | ai, claude, web, tools |
| `by-type` | type rules | project, config, docs |
| `by-filetype` | filetype rules | typescript, rust, python |
| `custom` | manually created | priority, status |

### 2. Term

A **Term** is an individual classification value within a vocabulary:

```typescript
interface Term {
  id: string;           // "by-topic:ai/claude"
  value: string;        // "ai/claude"
  label: string;        // "Claude"
  vocabularyId: string; // "by-topic"
  parentId?: string;    // "by-topic:ai" (for hierarchy)
  childIds: string[];   // ["by-topic:ai/claude/projects"]
  contentCount: number; // Number of classified items
  weight: number;       // Importance score
  symlinkPath: string;  // "/organized/by-topic/ai/claude"
}
```

### 3. Content Item

A **Content Item** is any classifiable entity (project, file, etc.):

```typescript
interface ContentItem {
  id: string;      // Unique identifier (path)
  name: string;    // Display name
  path: string;    // File system path
  attributes: Record<string, string>; // Classification attributes
}
```

### 4. Classification Result

When content is classified, a **Classification Result** is produced:

```typescript
interface ClassificationResult {
  contentId: string;
  timestamp: Date;
  sets: string[];           // Matched RSES sets
  termAssignments: TermAssignment[];
  conflicts: ClassificationConflict[];
  needsReview: boolean;
}
```

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  (Express Routes: /api/taxonomy/*)                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Integration Layer                             │
│  (TaxonomyIntegration: coordinates engine + file system)        │
│  - Classification queue                                          │
│  - File watcher integration                                      │
│  - WebSocket broadcasting                                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Taxonomy Engine                               │
│  (TaxonomyEngine: core classification logic)                    │
│  - Vocabulary management                                         │
│  - Term CRUD                                                     │
│  - Classification                                                │
│  - Re-classification planning                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    RSES Parser                                   │
│  (RsesParser: rule evaluation)                                  │
│  - Pattern matching                                              │
│  - Attribute evaluation                                          │
│  - Compound set resolution                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Storage Layer                                 │
│  (TaxonomyStorage: persistence)                                 │
│  - Vocabulary storage                                            │
│  - Term storage                                                  │
│  - Classification results                                        │
│  - Content references                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Classification Flow

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Content │────▶│ Integration │────▶│    Engine    │────▶│   RSES      │
│  Item   │     │   Layer     │     │  (classify)  │     │  Parser     │
└─────────┘     └─────────────┘     └──────────────┘     └─────────────┘
                                           │                    │
                                           │  TestMatchResult   │
                                           ◀────────────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │ Build Term  │
                                    │ Assignments │
                                    └──────┬──────┘
                                           │
                      ┌────────────────────┼────────────────────┐
                      ▼                    ▼                    ▼
               ┌──────────┐         ┌──────────┐         ┌──────────┐
               │  Update  │         │  Create  │         │  Detect  │
               │  Terms   │         │ Symlinks │         │Conflicts │
               └──────────┘         └──────────┘         └──────────┘
```

### Re-classification Flow

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
│  New RSES   │────▶│ Create Plan   │────▶│   Execute Plan  │
│   Config    │     │ (diff rules)  │     │ (batch classify)│
└─────────────┘     └───────────────┘     └─────────────────┘
                           │                      │
                    ┌──────▼──────┐        ┌──────▼──────┐
                    │  Identify   │        │  Update All │
                    │  Affected   │        │  References │
                    │  Content    │        │  + Symlinks │
                    └─────────────┘        └─────────────┘
```

## RSES to Taxonomy Mapping

### Rules to Vocabularies

```
RSES Config                         Taxonomy
───────────────────────────────────────────────────────────────
[rules.topic]                  ──▶  Vocabulary: "by-topic"
  $ai -> ai                         Term: "ai"
  $claude -> ai/claude              Term: "ai/claude" (child of "ai")

[rules.type]                   ──▶  Vocabulary: "by-type"
  $tools -> tools                   Term: "tools"

[rules.filetype]               ──▶  Vocabulary: "by-filetype"
  *.ts -> typescript                Term: "typescript"
```

### Sets to Classification

```
RSES Sets                           Classification
───────────────────────────────────────────────────────────────
[sets]
  ai = claude-* | chatgpt-*    ──▶  Pattern-based matching
  tools = *-tool | *-util

[sets.attributes]
  claudeSource = {source = claude} ──▶  Attribute-based matching

[sets.compound]
  aiTools = $ai & $tools       ──▶  Compound matching
```

### Symlinks to Term References

```
Symlink                             Term Reference
───────────────────────────────────────────────────────────────
/organized/by-topic/ai/            Term: by-topic:ai
  └── my-project -> /src/...       ContentRef: my-project

/organized/by-type/tools/          Term: by-type:tools
  └── my-project -> /src/...       ContentRef: my-project
```

## Hierarchy Support

The taxonomy engine supports hierarchical terms derived from rule results with delimiters:

```
Rule Result: "ai/claude/projects"
                │
                ▼
        ┌───────────────┐
        │   by-topic    │  Vocabulary
        └───────┬───────┘
                │
        ┌───────▼───────┐
        │      ai       │  Root Term
        └───────┬───────┘
                │
        ┌───────▼───────┐
        │    claude     │  Child Term
        └───────┬───────┘
                │
        ┌───────▼───────┐
        │   projects    │  Leaf Term
        └───────────────┘
```

## Conflict Resolution

When multiple rules match the same content, conflicts may arise:

| Strategy | Description |
|----------|-------------|
| `first_match` | Use the first matching rule (by line number) |
| `all_matches` | Keep all matches (multi-valued) |
| `highest_priority` | Use rule with lowest line number |
| `most_specific` | Use the most specific pattern match |
| `manual` | Flag for human review |

## Event System

The taxonomy engine emits events for real-time updates:

| Event | Payload | Description |
|-------|---------|-------------|
| `content:classified` | ClassificationResult | Content was classified |
| `term:created` | Term | New term auto-created |
| `term:updated` | Term | Term counts changed |
| `conflict:detected` | ClassificationConflict | Multiple rules matched |
| `reclassification:started` | ReclassificationPlan | Batch re-classification began |
| `reclassification:progress` | {processed, total} | Progress update |
| `reclassification:completed` | BatchClassificationResult | Batch finished |

## API Endpoints

### Vocabulary API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/taxonomy/vocabularies` | List vocabularies |
| GET | `/api/taxonomy/vocabularies/:id` | Get vocabulary |
| POST | `/api/taxonomy/vocabularies` | Create custom vocabulary |
| PATCH | `/api/taxonomy/vocabularies/:id` | Update vocabulary |
| DELETE | `/api/taxonomy/vocabularies/:id` | Delete vocabulary |
| POST | `/api/taxonomy/vocabularies/sync` | Sync from RSES |

### Term API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/taxonomy/vocabularies/:id/terms` | List terms |
| GET | `/api/taxonomy/vocabularies/:id/terms/tree` | Get term tree |
| GET | `/api/taxonomy/vocabularies/:id/terms/:termId` | Get term |
| POST | `/api/taxonomy/vocabularies/:id/terms` | Create term |
| PATCH | `/api/taxonomy/vocabularies/:id/terms/:termId` | Update term |
| DELETE | `/api/taxonomy/vocabularies/:id/terms/:termId` | Delete term |
| POST | `/api/taxonomy/vocabularies/:id/terms/:termId/move` | Move in hierarchy |
| POST | `/api/taxonomy/vocabularies/:id/terms/:termId/merge` | Merge terms |
| GET | `/api/taxonomy/terms/search` | Search terms |

### Classification API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/taxonomy/classify` | Classify content |
| POST | `/api/taxonomy/classify/batch` | Batch classify |
| POST | `/api/taxonomy/classify/scan` | Scan and classify directory |
| GET | `/api/taxonomy/classifications/:id` | Get classification |
| DELETE | `/api/taxonomy/classifications/:id` | Remove classification |
| POST | `/api/taxonomy/reclassify/plan` | Create re-classification plan |
| POST | `/api/taxonomy/reclassify/:planId/execute` | Execute plan |

### Stats API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/taxonomy/stats` | Overall statistics |
| GET | `/api/taxonomy/stats/vocabularies` | Per-vocabulary stats |
| GET | `/api/taxonomy/stats/conflicts` | Conflict statistics |

## Performance Considerations

### Incremental Classification

- Cache RSES test results for unchanged content
- Only re-classify content affected by rule changes
- Use batch operations for bulk updates

### Memory Management

- Use LRU caches for term lookups
- Stream large result sets
- Limit concurrent classifications

### Optimization Strategies

1. **Lazy Term Loading**: Load term content references on-demand
2. **Batch Symlink Creation**: Group symlink operations in transactions
3. **Parallel Classification**: Process independent content items concurrently
4. **Incremental Re-classification**: Only re-process affected content

## Integration Points

### File Watcher Integration

```typescript
// On project detected
fileWatcher.on("project:added", (path) => {
  taxonomyIntegration.queueClassification(path, 1);
});

// On project changed
fileWatcher.on("project:changed", (path) => {
  taxonomyIntegration.queueClassification(path, 2); // Higher priority
});
```

### Symlink Executor Integration

```typescript
// Classification creates symlinks
const classification = await engine.classify(content);
for (const assignment of classification.termAssignments) {
  await executor.createSymlink({
    source: content.path,
    targetDir: assignment.symlinkPath,
    linkName: content.name,
  });
}
```

### WebSocket Integration

```typescript
// Real-time updates to clients
engine.on("term:created", (term) => {
  wsServer.broadcast({ type: "term:created", data: term });
});

engine.on("content:classified", (result) => {
  wsServer.broadcast({ type: "content:classified", data: result });
});
```

## Usage Example

```typescript
import { initTaxonomyIntegration } from "./services/taxonomy-integration";
import { RsesParser } from "./lib/rses";

// 1. Initialize with RSES config
const rsesConfig = `
[sets]
ai = claude-* | chatgpt-* | gemini-*
tools = *-tool | *-util

[sets.attributes]
claudeSource = {source = claude}

[rules.topic]
$ai -> ai
$claudeSource -> ai/claude

[rules.type]
$tools -> tools
`;

const integration = await initTaxonomyIntegration({
  rsesConfigContent: rsesConfig,
  symlinkBaseDir: "/organized",
  enableFileWatcher: true,
  enableAutoSymlinks: true,
});

// 2. Classify content
const result = await integration.classifyProject("/projects/claude-assistant");
console.log(result.termAssignments);
// [{ vocabularyId: "by-topic", termValue: "ai/claude", ... }]

// 3. Scan and classify directory
const batchResult = await integration.scanAndClassify("/projects", {
  maxDepth: 3,
});
console.log(`Classified ${batchResult.successCount} projects`);

// 4. Update config and re-classify
await integration.updateConfig(newConfigContent, true);
```

## File Structure

```
server/
├── lib/
│   └── rses.ts                    # Core RSES parser
├── services/
│   ├── taxonomy-engine.ts         # Main taxonomy engine
│   ├── taxonomy-integration.ts    # Integration layer
│   ├── file-watcher.ts            # File system watching
│   ├── project-scanner.ts         # Directory scanning
│   └── symlink-executor.ts        # Symlink operations
└── routes/
    └── taxonomy.ts                # API routes

shared/
└── taxonomy-routes.ts             # Route type definitions
```

## Future Enhancements

1. **Database Storage**: Replace in-memory storage with PostgreSQL
2. **Caching Layer**: Add Redis for classification result caching
3. **Machine Learning**: Auto-suggest terms based on content analysis
4. **Import/Export**: Support vocabulary import/export formats
5. **Versioning**: Track vocabulary and term history
6. **Permissions**: Term-level access control
