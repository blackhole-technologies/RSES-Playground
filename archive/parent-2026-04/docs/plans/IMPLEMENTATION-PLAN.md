# RSES-Playground: Comprehensive Implementation Plan

## Master Orchestration Strategy

### Agent Team Composition

| Agent ID | Specialty | Primary Responsibilities |
|----------|-----------|-------------------------|
| **SEC** | Security Specialist | Authentication, injection prevention, hardening |
| **SYS** | Systems Analyst | Architecture, data flows, integration |
| **UI** | UI Development Expert | React components, performance, accessibility |
| **UX** | UX Design Expert | Interaction design, user flows, feedback |
| **CMS** | CMS Developer | Content management, APIs, dashboards |
| **FW** | File Watcher Specialist | Real-time updates, chokidar, WebSocket |
| **PRV** | Preview Generator | Syntax highlighting, caching, visualization |
| **ARC** | Project Architect | Directory structure, taxonomy, scalability |
| **SGT** | Set-Graph Theorist | Formal correctness, decidability, proofs |
| **ALK** | Auto-Link Developer | Symlink execution, shell integration |
| **PRM** | Prompting Expert | User guidance, error messages, onboarding |

### Orchestration Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT ORCHESTRATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase N                                                                     │
│    │                                                                         │
│    ├──► Primary Agent(s) ──► Implementation                                 │
│    │         │                    │                                          │
│    │         │                    ▼                                          │
│    │         │              Code + Docs                                      │
│    │         │                    │                                          │
│    │         ▼                    ▼                                          │
│    │    Validator Agent(s) ──► Review + Fixes                               │
│    │         │                    │                                          │
│    │         ▼                    ▼                                          │
│    │    Integration Test ──► Quality Gate                                   │
│    │         │                    │                                          │
│    │         ▼                    ▼                                          │
│    └──► Handoff Documentation ──► Next Phase                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Token Budget Estimation

### Token Costs Per Agent Invocation

| Activity Type | Est. Tokens | Notes |
|---------------|-------------|-------|
| Code Implementation | 15,000-25,000 | Writing new code + context |
| Code Review | 8,000-12,000 | Reading + feedback |
| Documentation | 5,000-10,000 | Comments, READMEs |
| Integration Testing | 10,000-15,000 | Running tests, fixing issues |
| Handoff Summary | 3,000-5,000 | Context preservation |

### Phase Token Budgets

| Phase | Primary Work | Validation | Documentation | Total Budget |
|-------|--------------|------------|---------------|--------------|
| 1 | 80,000 | 40,000 | 20,000 | **140,000** |
| 2 | 60,000 | 30,000 | 15,000 | **105,000** |
| 3 | 100,000 | 50,000 | 25,000 | **175,000** |
| 4 | 70,000 | 35,000 | 18,000 | **123,000** |
| 5 | 50,000 | 25,000 | 12,000 | **87,000** |
| 6 | 60,000 | 30,000 | 15,000 | **105,000** |
| 7 | 40,000 | 20,000 | 10,000 | **70,000** |
| **TOTAL** | **460,000** | **230,000** | **115,000** | **805,000** |

### Handoff Checkpoints

Handoffs occur after each phase with full documentation:
- `HANDOFF-PHASE-{N}.md` - Completed work summary
- `CONTEXT-PHASE-{N+1}.md` - Required context for next phase
- Updated inline code comments
- Test coverage reports

---

## Phase 1: Security Hardening

### Duration: Session 1-2
### Token Budget: 140,000

### 1.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 1.1.1 | Replace `new Function()` with safe Boolean parser | SGT | SEC | 25,000 |
| 1.1.2 | Implement passport-local authentication | SEC | SYS | 20,000 |
| 1.1.3 | Add CSRF protection middleware | SEC | UI | 8,000 |
| 1.1.4 | Block path traversal (not just warn) | SEC | SGT | 10,000 |
| 1.1.5 | Add input size limits (Zod + body-parser) | SEC | CMS | 8,000 |
| 1.1.6 | Implement rate limiting | SEC | SYS | 10,000 |
| 1.1.7 | Add security headers (helmet) | SEC | SYS | 5,000 |
| 1.1.8 | Security integration test suite | SEC | ALL | 15,000 |

### 1.2 Execution Sequence

```
Step 1: SGT implements safe Boolean evaluator
         ├── Creates /server/lib/boolean-parser.ts
         ├── Recursive descent parser for: true, false, &, |, !, ()
         ├── Full test coverage
         └── Validator: SEC reviews for injection vectors

Step 2: SEC implements authentication system
         ├── Creates /server/auth/passport.ts
         ├── Creates /server/auth/session.ts
         ├── Adds user table schema
         ├── Protects all /api/* routes
         └── Validator: SYS reviews architecture

Step 3: SEC adds remaining security measures
         ├── CSRF, rate limiting, helmet
         ├── Input validation upgrades
         └── Validator: UI confirms frontend compatibility

Step 4: Integration testing
         ├── SEC runs security test suite
         ├── SYS validates system integration
         └── Generate HANDOFF-PHASE-1.md
```

### 1.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G1.1 | Zero `new Function()` calls in codebase | SGT |
| G1.2 | All endpoints require authentication | SEC |
| G1.3 | OWASP Top 10 vulnerabilities addressed | SEC |
| G1.4 | Rate limiting tested under load | SYS |
| G1.5 | Security test suite passes 100% | SEC |

### 1.4 Deliverables

```
/server/lib/boolean-parser.ts       # Safe expression evaluator
/server/lib/boolean-parser.test.ts  # Full test coverage
/server/auth/passport.ts            # Authentication config
/server/auth/session.ts             # Session management
/server/middleware/security.ts      # CSRF, rate-limit, helmet
/shared/schema.ts                   # Updated with users table
/tests/security/                    # Security test suite
HANDOFF-PHASE-1.md                  # Completion summary
```

---

## Phase 2: Core Engine Improvements

### Duration: Session 2-3
### Token Budget: 105,000

### 2.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 2.1.1 | Implement cycle detection in compound sets | SGT | ARC | 20,000 |
| 2.1.2 | Add symbol namespace separation | SGT | SEC | 15,000 |
| 2.1.3 | Cache regex compilation in matchGlob() | SGT | SYS | 12,000 |
| 2.1.4 | Comprehensive ReDoS detection | SEC | SGT | 15,000 |
| 2.1.5 | Expression compilation cache | SGT | SYS | 12,000 |
| 2.1.6 | Add pagination to config API | CMS | SYS | 10,000 |
| 2.1.7 | Engine performance test suite | SYS | SGT | 12,000 |

### 2.2 Execution Sequence

```
Step 1: SGT implements formal correctness improvements
         ├── Cycle detection via topological sort
         │    └── Reject configs with cyclic set definitions
         ├── Symbol namespace enforcement
         │    └── Prefix: _pattern_, _attr_, _compound_
         └── Validator: ARC reviews for architectural fit

Step 2: SGT + SEC improve pattern matching
         ├── Regex compilation cache (LRU, 1000 entries)
         ├── ReDoS detection via safe-regex library
         ├── Expression pre-compilation during parse
         └── Validator: SYS reviews performance impact

Step 3: CMS adds pagination
         ├── GET /api/configs?page=1&limit=50
         ├── Add database index on name
         └── Validator: SYS confirms query efficiency

Step 4: Performance testing
         ├── SYS runs benchmark suite
         ├── SGT validates formal properties
         └── Generate HANDOFF-PHASE-2.md
```

### 2.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G2.1 | Cyclic config definitions rejected at parse time | SGT |
| G2.2 | No symbol collisions possible | SGT |
| G2.3 | Regex cache hit rate > 90% in benchmarks | SYS |
| G2.4 | No ReDoS patterns pass validation | SEC |
| G2.5 | 1000+ configs paginated in < 50ms | CMS |

### 2.4 Deliverables

```
/server/lib/rses.ts                 # Refactored with improvements
/server/lib/cycle-detector.ts       # Topological sort for sets
/server/lib/regex-cache.ts          # LRU cache for compiled patterns
/server/lib/redos-checker.ts        # Safe-regex integration
/tests/engine/                       # Engine test suite
/benchmarks/                         # Performance benchmarks
HANDOFF-PHASE-2.md                  # Completion summary
```

---

## Phase 3: File System Integration

### Duration: Session 3-5
### Token Budget: 175,000 (Largest phase)

### 3.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 3.1.1 | WebSocket server infrastructure | FW | SYS | 25,000 |
| 3.1.2 | Chokidar watcher service | FW | SYS | 30,000 |
| 3.1.3 | Project scanner service | ALK | ARC | 25,000 |
| 3.1.4 | Symlink executor service | ALK | SEC | 30,000 |
| 3.1.5 | Port skip patterns from shell scripts | ALK | SEC | 15,000 |
| 3.1.6 | Client WebSocket integration | UI | FW | 20,000 |
| 3.1.7 | Shell script bridge API | ALK | SYS | 15,000 |
| 3.1.8 | Integration test suite | SYS | ALL | 20,000 |

### 3.2 Execution Sequence

```
Step 1: FW implements WebSocket infrastructure
         ├── Creates /server/websocket.ts
         │    ├── WebSocketServer attached to HTTP server
         │    ├── Connection tracking with heartbeat
         │    ├── Event broadcasting system
         │    └── Reconnection handling
         └── Validator: SYS reviews for scalability

Step 2: FW implements file watcher
         ├── Creates /server/watcher.ts
         │    ├── Chokidar configuration for ~/Projects
         │    ├── 2-second debounce with batching
         │    ├── Aggressive exclusion patterns
         │    ├── Event emission to WebSocket
         │    └── Graceful shutdown
         └── Validator: SYS reviews performance

Step 3: ALK implements scanner and linker
         ├── Creates /server/lib/scanner.ts
         │    ├── Recursive project discovery
         │    ├── Project detection (markers)
         │    ├── Skip pattern integration
         │    └── Statistics tracking
         ├── Creates /server/lib/linker.ts
         │    ├── Atomic symlink creation
         │    ├── Broken link cleanup
         │    ├── Rollback capability
         │    └── Audit logging
         └── Validator: SEC reviews for security, ARC for architecture

Step 4: ALK creates shell script bridge
         ├── Creates /api/rses/execute endpoint
         ├── Spawns bin/rses with proper args
         ├── Streams output to WebSocket
         └── Validator: SYS reviews process management

Step 5: UI implements client WebSocket
         ├── Creates /client/src/hooks/use-websocket.ts
         ├── Creates /client/src/hooks/use-filesystem-events.ts
         ├── Updates Workbench with live file tree
         ├── Adds connection status indicator
         └── Validator: FW confirms event handling

Step 6: Integration testing
         ├── SYS runs full integration tests
         ├── FW validates watcher behavior
         ├── ALK validates linking operations
         └── Generate HANDOFF-PHASE-3.md
```

### 3.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G3.1 | WebSocket reconnects within 5 seconds | FW |
| G3.2 | File events debounced correctly (2s window) | FW |
| G3.3 | Scanner excludes all skip patterns | ALK |
| G3.4 | Symlinks created atomically with rollback | ALK |
| G3.5 | No symlinks escape ~/Projects boundary | SEC |
| G3.6 | UI updates within 500ms of file change | UI |

### 3.4 Deliverables

```
/server/websocket.ts                # WebSocket server
/server/watcher.ts                  # Chokidar file watcher
/server/lib/scanner.ts              # Project discovery
/server/lib/linker.ts               # Symlink executor
/server/lib/skip-patterns.ts        # Ported from shell
/server/routes/rses.ts              # Shell bridge API
/client/src/hooks/use-websocket.ts  # WS client hook
/client/src/hooks/use-filesystem-events.ts
/client/src/components/ConnectionStatus.tsx
/tests/integration/                  # Integration tests
HANDOFF-PHASE-3.md                  # Completion summary
```

---

## Phase 4: UI/UX Improvements

### Duration: Session 5-6
### Token Budget: 123,000

### 4.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 4.1.1 | Extract shared hooks, add Error Boundaries | UI | UX | 15,000 |
| 4.1.2 | Remove unused assets (fonts, components) | UI | SYS | 10,000 |
| 4.1.3 | Add keyboard shortcuts system | UI | UX | 15,000 |
| 4.1.4 | Integrate Monaco Editor with RSES syntax | UI | PRV | 25,000 |
| 4.1.5 | Rename tabs, sync test path | UX | UI | 10,000 |
| 4.1.6 | Add unsaved changes warning | UX | UI | 8,000 |
| 4.1.7 | Accessibility improvements | UI | UX | 15,000 |
| 4.1.8 | UI/UX test suite | UX | UI | 12,000 |

### 4.2 Execution Sequence

```
Step 1: UI performs code cleanup
         ├── Extract useDebounceValue to /hooks/use-debounce.ts
         ├── Add ErrorBoundary wrapper component
         ├── Remove unused shadcn/ui components
         ├── Remove unused Google Fonts
         └── Validator: UX confirms no regressions

Step 2: UI implements keyboard shortcuts
         ├── Creates /client/src/lib/shortcuts.ts
         │    ├── Cmd+S: Save config
         │    ├── Cmd+Enter: Run test
         │    ├── Cmd+K: Command palette
         │    └── Escape: Close modals
         ├── Adds ShortcutsProvider context
         └── Validator: UX tests discoverability

Step 3: UI + PRV implement Monaco Editor
         ├── Replace EditorTextarea with Monaco
         ├── Create RSES language definition
         │    ├── Tokenizer for sections, comments, rules
         │    ├── Autocomplete for $set references
         │    └── Inline error markers
         └── Validator: PRV confirms syntax coverage

Step 4: UX implements interaction improvements
         ├── Rename tabs: "Match Tester", "Symlink Preview", "Parsed Config"
         ├── Create shared test path context
         ├── Add beforeunload for unsaved changes
         └── Validator: UI confirms implementation

Step 5: UI adds accessibility
         ├── ARIA labels on all interactive elements
         ├── Keyboard navigation for all components
         ├── Focus management improvements
         └── Validator: UX audits with screen reader

Step 6: Testing
         ├── UX runs usability tests
         ├── UI runs accessibility audit
         └── Generate HANDOFF-PHASE-4.md
```

### 4.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G4.1 | Zero duplicate hook definitions | UI |
| G4.2 | Error Boundary catches all render errors | UI |
| G4.3 | Lighthouse accessibility score > 90 | UI |
| G4.4 | All keyboard shortcuts documented | UX |
| G4.5 | Monaco syntax highlighting 100% accurate | PRV |
| G4.6 | Unsaved changes prevented from loss | UX |

### 4.4 Deliverables

```
/client/src/hooks/use-debounce.ts   # Extracted shared hook
/client/src/components/ErrorBoundary.tsx
/client/src/lib/shortcuts.ts        # Keyboard shortcuts
/client/src/components/ShortcutsProvider.tsx
/client/src/lib/monaco-rses.ts      # RSES language definition
/client/src/components/MonacoEditor.tsx
/client/src/contexts/TestPathContext.tsx
/tests/accessibility/               # A11y test suite
/tests/ui/                          # UI component tests
HANDOFF-PHASE-4.md                  # Completion summary
```

---

## Phase 5: Prompting & Learning System

### Duration: Session 6-7
### Token Budget: 87,000

### 5.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 5.1.1 | Unknown category detection | SGT | PRM | 15,000 |
| 5.1.2 | Interactive prompting dialog | UX | UI | 15,000 |
| 5.1.3 | Learning persistence layer | CMS | SYS | 15,000 |
| 5.1.4 | Redesign error messages | PRM | UX | 12,000 |
| 5.1.5 | Contextual help system | PRM | UI | 12,000 |
| 5.1.6 | Onboarding flow | UX | PRM | 12,000 |

### 5.2 Execution Sequence

```
Step 1: SGT implements detection system
         ├── Adds _unmatched flag to test results
         ├── Generates suggestions based on:
         │    ├── Prefix similarity (Levenshtein)
         │    ├── Suffix matching
         │    └── Existing set membership
         └── Validator: PRM reviews suggestion quality

Step 2: UX designs and UI implements prompt dialog
         ├── Creates /client/src/components/UnknownCategoryPrompt.tsx
         │    ├── Suggested categories with confidence
         │    ├── Create new category option
         │    ├── "Remember this" checkbox
         │    └── "Add as rule" checkbox
         └── Validator: UI confirms component quality

Step 3: CMS implements learning persistence
         ├── Creates user_preferences table
         │    ├── pattern -> category mappings
         │    ├── timestamps, usage counts
         │    └── Per-user storage
         ├── Creates /server/lib/learning.ts
         └── Validator: SYS reviews data model

Step 4: PRM redesigns all error messages
         ├── Creates /shared/prompts.ts
         │    ├── All error codes with actionable fixes
         │    ├── Contextual help text
         │    └── Tooltip content
         └── Validator: UX reviews clarity

Step 5: UX creates onboarding
         ├── 4-step interactive tutorial
         ├── Skip option with resume
         ├── Progress persistence
         └── Validator: PRM reviews content

Step 6: Testing
         ├── PRM reviews all user-facing text
         ├── UX runs user testing
         └── Generate HANDOFF-PHASE-5.md
```

### 5.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G5.1 | Unknown categories trigger prompt 100% of time | SGT |
| G5.2 | Suggestions relevant in >80% of cases | PRM |
| G5.3 | Learning persists across sessions | CMS |
| G5.4 | All error messages have actionable fixes | PRM |
| G5.5 | Onboarding completion rate >70% in testing | UX |

### 5.4 Deliverables

```
/server/lib/learning.ts             # Learning service
/server/lib/suggestion-engine.ts    # Category suggestions
/shared/prompts.ts                  # All user-facing text
/shared/schema.ts                   # + user_preferences table
/client/src/components/UnknownCategoryPrompt.tsx
/client/src/components/Onboarding/
/client/src/components/ContextualHelp.tsx
/tests/prompting/                   # Prompt quality tests
HANDOFF-PHASE-5.md                  # Completion summary
```

---

## Phase 6: CMS Features

### Duration: Session 7-8
### Token Budget: 105,000

### 6.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 6.1.1 | Projects entity and scanning API | CMS | ARC | 20,000 |
| 6.1.2 | Dashboard with statistics | CMS | UI | 20,000 |
| 6.1.3 | Config versioning/history | CMS | SYS | 20,000 |
| 6.1.4 | Batch operations API | CMS | SEC | 15,000 |
| 6.1.5 | Activity timeline | CMS | UX | 15,000 |
| 6.1.6 | CMS integration tests | CMS | SYS | 15,000 |

### 6.2 Execution Sequence

```
Step 1: CMS implements project management
         ├── Creates projects table schema
         ├── Creates /api/projects/* endpoints
         │    ├── scan, list, get, link, unlink, categorize
         │    └── Validator: ARC reviews data model

Step 2: CMS + UI create dashboard
         ├── Creates /client/src/pages/dashboard-page.tsx
         │    ├── Projects by source (pie chart)
         │    ├── Categories distribution (bar chart)
         │    ├── Recent activity feed
         │    └── Storage usage
         └── Validator: UI reviews component quality

Step 3: CMS implements versioning
         ├── Creates config_versions table
         ├── Auto-version on save
         ├── Diff view between versions
         ├── Restore from version
         └── Validator: SYS reviews storage efficiency

Step 4: CMS adds batch operations
         ├── POST /api/configs/bulk-delete
         ├── POST /api/configs/bulk-update
         ├── POST /api/projects/bulk-link
         └── Validator: SEC reviews for abuse prevention

Step 5: CMS + UX create activity timeline
         ├── Creates activity_log table
         ├── Timeline component with filtering
         └── Validator: UX reviews interaction design

Step 6: Testing
         ├── CMS runs full CMS test suite
         ├── SYS validates data integrity
         └── Generate HANDOFF-PHASE-6.md
```

### 6.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G6.1 | Project scan completes in <5s for 500 projects | CMS |
| G6.2 | Dashboard renders in <1s | UI |
| G6.3 | Version history preserved indefinitely | CMS |
| G6.4 | Batch operations support 100+ items | CMS |
| G6.5 | Activity timeline queryable by date range | CMS |

### 6.4 Deliverables

```
/shared/schema.ts                   # + projects, versions, activity tables
/server/routes/projects.ts          # Projects API
/server/routes/versions.ts          # Versioning API
/server/routes/activity.ts          # Activity API
/client/src/pages/dashboard-page.tsx
/client/src/components/Dashboard/
/client/src/components/VersionHistory.tsx
/client/src/components/ActivityTimeline.tsx
/tests/cms/                         # CMS test suite
HANDOFF-PHASE-6.md                  # Completion summary
```

---

## Phase 7: Production Readiness

### Duration: Session 8-9
### Token Budget: 70,000

### 7.1 Task Breakdown

| Task ID | Description | Primary Agent | Validator | Est. Tokens |
|---------|-------------|---------------|-----------|-------------|
| 7.1.1 | Health check endpoints | SYS | SEC | 10,000 |
| 7.1.2 | Structured logging (pino) | SYS | SEC | 12,000 |
| 7.1.3 | Prometheus metrics | SYS | CMS | 12,000 |
| 7.1.4 | Background job queue | SYS | ALK | 15,000 |
| 7.1.5 | Database connection resilience | SYS | SEC | 10,000 |
| 7.1.6 | Production deployment guide | SYS | ALL | 8,000 |

### 7.2 Execution Sequence

```
Step 1: SYS implements health checks
         ├── GET /health - Liveness probe
         ├── GET /ready - Readiness probe (DB check)
         └── Validator: SEC reviews for information disclosure

Step 2: SYS implements logging
         ├── Replace console.log with pino
         ├── Add correlation IDs to requests
         ├── Log all RSES operations
         ├── Structured JSON format
         └── Validator: SEC reviews for sensitive data

Step 3: SYS implements metrics
         ├── Creates /server/metrics.ts
         │    ├── Request latency histogram
         │    ├── Error rate counter
         │    ├── Pattern match duration
         │    └── Active WebSocket connections
         ├── GET /metrics endpoint
         └── Validator: CMS reviews metric coverage

Step 4: SYS implements job queue
         ├── Creates /server/lib/queue.ts
         │    ├── Background symlink operations
         │    ├── Batch processing
         │    ├── Retry with backoff
         │    └── Dead letter queue
         └── Validator: ALK reviews job handling

Step 5: SYS improves database resilience
         ├── Connection pool configuration
         ├── Automatic reconnection
         ├── Circuit breaker pattern
         └── Validator: SEC reviews failure modes

Step 6: Final documentation
         ├── DEPLOYMENT.md - Production setup
         ├── OPERATIONS.md - Runbook
         ├── API.md - Full API documentation
         └── Generate HANDOFF-PHASE-7.md (FINAL)
```

### 7.3 Quality Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| G7.1 | Health endpoints respond in <100ms | SYS |
| G7.2 | All logs in structured JSON format | SYS |
| G7.3 | Metrics endpoint Prometheus-compatible | SYS |
| G7.4 | Job queue handles 1000 items without memory issues | SYS |
| G7.5 | Database recovers from disconnection in <30s | SYS |
| G7.6 | Production deployment documented | SYS |

### 7.4 Deliverables

```
/server/health.ts                   # Health endpoints
/server/logger.ts                   # Pino configuration
/server/metrics.ts                  # Prometheus metrics
/server/lib/queue.ts                # Background job queue
/server/lib/circuit-breaker.ts      # DB resilience
/docs/DEPLOYMENT.md                 # Production setup
/docs/OPERATIONS.md                 # Runbook
/docs/API.md                        # API documentation
HANDOFF-PHASE-7.md                  # Final summary
```

---

## Cross-Phase Validation Protocol

### Agent Review Matrix

After each phase, specific agents review the work of others:

| Phase | Primary | Reviewed By |
|-------|---------|-------------|
| 1 | SEC, SGT | SYS, UI |
| 2 | SGT, SEC, CMS | SYS, ARC |
| 3 | FW, ALK, UI | SYS, SEC, ARC |
| 4 | UI, UX, PRV | PRM, SEC |
| 5 | SGT, UX, CMS, PRM | UI, SYS |
| 6 | CMS, UI, UX | SYS, ARC, SEC |
| 7 | SYS | ALL agents final review |

### Final Integration Review

Before declaring completion, ALL agents perform a final review:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FINAL INTEGRATION REVIEW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SEC ──► Security audit of complete system                                  │
│  SYS ──► Architecture review, performance testing                           │
│  UI  ──► Component quality, accessibility                                   │
│  UX  ──► User flow validation, usability testing                           │
│  CMS ──► Data integrity, API completeness                                   │
│  FW  ──► Real-time functionality, WebSocket stability                       │
│  PRV ──► Syntax highlighting, preview accuracy                              │
│  ARC ──► Directory structure, taxonomy validation                           │
│  SGT ──► Formal correctness verification                                    │
│  ALK ──► Symlink operations, shell integration                              │
│  PRM ──► User guidance, error message quality                               │
│                                                                              │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  FINAL GATE: All agents approve → RELEASE                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Documentation Standards

### Code Comment Requirements

```typescript
/**
 * @file boolean-parser.ts
 * @description Safe Boolean expression evaluator for RSES set expressions.
 *              Replaces unsafe `new Function()` with recursive descent parser.
 * @phase Phase 1 - Security Hardening
 * @author SGT (Set-Graph Theorist Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * @security This parser was specifically designed to prevent code injection.
 *           It only recognizes: true, false, &, |, !, (, )
 *           Any other tokens cause immediate rejection.
 *
 * @complexity O(n) where n is expression length
 * @termination Guaranteed - no recursion beyond expression depth
 */

/**
 * Evaluates a Boolean expression string against a set of active set names.
 *
 * @param expr - The expression string, e.g., "$tools & $claude"
 * @param activeSets - Set of set names that are currently true
 * @returns boolean - The result of evaluating the expression
 *
 * @example
 * evaluate("$tools & $claude", new Set(["tools", "claude"])) // true
 * evaluate("$tools & $web", new Set(["tools"]))              // false
 *
 * @throws {ExpressionError} If expression contains invalid tokens
 */
export function evaluate(expr: string, activeSets: Set<string>): boolean {
  // Implementation...
}
```

### Handoff Document Template

```markdown
# HANDOFF-PHASE-{N}.md

## Phase Summary
- **Phase**: {N} - {Name}
- **Duration**: {start} to {end}
- **Token Usage**: {actual} / {budget}
- **Status**: COMPLETE | BLOCKED | PARTIAL

## Completed Tasks
| Task ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| ... | ... | ✅ | ... |

## Quality Gates
| Gate | Status | Evidence |
|------|--------|----------|
| G{N}.1 | PASSED | Link to test results |

## Known Issues
- [ ] Issue 1: Description, owner, mitigation

## Files Modified/Created
- `/path/to/file.ts` - Description of changes

## Context for Next Phase
### Required Reading
1. File 1 - Reason
2. File 2 - Reason

### Key Decisions Made
1. Decision 1 - Rationale
2. Decision 2 - Rationale

### Open Questions for Next Phase
1. Question 1 - Context needed

## Agent Sign-offs
- [ ] Primary Agent: {name}
- [ ] Validator Agent(s): {names}
```

---

## Execution Command Reference

### Starting Each Phase

```bash
# Phase 1 - Launch security agents in parallel where possible
claude-code --agent=SEC --task="Phase 1.1.2-1.1.7: Security hardening"
claude-code --agent=SGT --task="Phase 1.1.1: Safe Boolean parser"

# After primary work, launch validators
claude-code --agent=SYS --task="Validate Phase 1 architecture"
claude-code --agent=UI --task="Validate Phase 1 frontend compatibility"
```

### Token Monitoring

```bash
# Check token usage mid-phase
claude-code --status --show-tokens

# If approaching budget, trigger early handoff
claude-code --handoff --phase=1 --reason="token-budget"
```

### Quality Gate Verification

```bash
# Run quality gate checks
npm run test:security    # G1.x gates
npm run test:engine      # G2.x gates
npm run test:integration # G3.x gates
npm run test:a11y        # G4.x gates
npm run test:prompting   # G5.x gates
npm run test:cms         # G6.x gates
npm run test:production  # G7.x gates
```

---

## Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Security vulnerabilities | 0 critical, 0 high | OWASP scan |
| Test coverage | >80% | Jest coverage report |
| Performance (LCP) | <2.5s | Lighthouse |
| Accessibility score | >90 | Lighthouse |
| API response time (p95) | <200ms | Prometheus |
| WebSocket latency | <100ms | Custom metric |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Onboarding completion | >70% | Analytics |
| Error recovery rate | >80% | User testing |
| Task completion time | <5min for basic flow | User testing |
| User satisfaction | >4.0/5.0 | Survey |

### Operational Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | 99.9% | Health checks |
| Mean time to recovery | <5min | Incident logs |
| Deploy frequency | Daily capable | CI/CD |
| Change failure rate | <5% | Deploy logs |

---

## Appendix: Full File Structure After Completion

```
/Users/Alchemy/Projects/experiments/RSES-Playground/
├── client/
│   └── src/
│       ├── components/
│       │   ├── Dashboard/
│       │   │   ├── StatsCards.tsx
│       │   │   ├── DistributionCharts.tsx
│       │   │   └── ActivityFeed.tsx
│       │   ├── Editor/
│       │   │   ├── MonacoEditor.tsx
│       │   │   └── monaco-rses.ts
│       │   ├── Onboarding/
│       │   │   ├── Step1Welcome.tsx
│       │   │   ├── Step2Patterns.tsx
│       │   │   ├── Step3Sets.tsx
│       │   │   └── Step4Rules.tsx
│       │   ├── ErrorBoundary.tsx
│       │   ├── ConnectionStatus.tsx
│       │   ├── UnknownCategoryPrompt.tsx
│       │   ├── ContextualHelp.tsx
│       │   ├── ActivityTimeline.tsx
│       │   └── VersionHistory.tsx
│       ├── contexts/
│       │   ├── TestPathContext.tsx
│       │   └── ShortcutsContext.tsx
│       ├── hooks/
│       │   ├── use-debounce.ts
│       │   ├── use-websocket.ts
│       │   └── use-filesystem-events.ts
│       ├── lib/
│       │   ├── shortcuts.ts
│       │   └── queryClient.ts
│       └── pages/
│           ├── editor-page.tsx
│           └── dashboard-page.tsx
├── server/
│   ├── auth/
│   │   ├── passport.ts
│   │   └── session.ts
│   ├── lib/
│   │   ├── rses.ts
│   │   ├── boolean-parser.ts
│   │   ├── cycle-detector.ts
│   │   ├── regex-cache.ts
│   │   ├── redos-checker.ts
│   │   ├── scanner.ts
│   │   ├── linker.ts
│   │   ├── skip-patterns.ts
│   │   ├── learning.ts
│   │   ├── suggestion-engine.ts
│   │   ├── queue.ts
│   │   └── circuit-breaker.ts
│   ├── middleware/
│   │   └── security.ts
│   ├── routes/
│   │   ├── configs.ts
│   │   ├── projects.ts
│   │   ├── versions.ts
│   │   ├── activity.ts
│   │   └── rses.ts
│   ├── index.ts
│   ├── websocket.ts
│   ├── watcher.ts
│   ├── health.ts
│   ├── logger.ts
│   └── metrics.ts
├── shared/
│   ├── schema.ts
│   ├── routes.ts
│   └── prompts.ts
├── tests/
│   ├── security/
│   ├── engine/
│   ├── integration/
│   ├── accessibility/
│   ├── ui/
│   ├── prompting/
│   ├── cms/
│   └── production/
├── benchmarks/
├── docs/
│   ├── DEPLOYMENT.md
│   ├── OPERATIONS.md
│   └── API.md
├── HANDOFF-PHASE-1.md
├── HANDOFF-PHASE-2.md
├── HANDOFF-PHASE-3.md
├── HANDOFF-PHASE-4.md
├── HANDOFF-PHASE-5.md
├── HANDOFF-PHASE-6.md
├── HANDOFF-PHASE-7.md
└── IMPLEMENTATION-PLAN.md
```

---

*This plan ensures the RSES-Playground becomes a best-in-class, production-ready automated CMS with full security hardening, real-time capabilities, and exceptional user experience.*
