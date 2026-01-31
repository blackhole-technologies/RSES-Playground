# RSES-Playground Implementation Resume Prompt

## Quick Resume (Copy the relevant phase section)

---

## PHASE 1: Security Hardening

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 1 section)

Phase 1 Tasks:
- 1.1.1: SGT → Safe Boolean parser (replace new Function())
- 1.1.2: SEC → Passport authentication
- 1.1.3: SEC → CSRF protection
- 1.1.4: SEC → Block path traversal
- 1.1.5: SEC → Input size limits
- 1.1.6: SEC → Rate limiting
- 1.1.7: SEC → Security headers (helmet)
- 1.1.8: SEC → Security test suite

Agents: ~/Projects/agents/security-specialist.md, set-graph-theorist.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 2: Core Engine Improvements

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 2 section)
3. HANDOFF-PHASE-1.md (if exists)

Phase 2 Tasks:
- 2.1.1: SGT → Cycle detection in compound sets
- 2.1.2: SGT → Symbol namespace separation
- 2.1.3: SGT → Regex compilation cache
- 2.1.4: SEC → Comprehensive ReDoS detection
- 2.1.5: SGT → Expression compilation cache
- 2.1.6: CMS → API pagination
- 2.1.7: SYS → Performance test suite

Agents: ~/Projects/agents/set-graph-theorist.md, security-specialist.md, cms-developer.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 3: File System Integration

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 3 section)
3. HANDOFF-PHASE-2.md (if exists)

Phase 3 Tasks:
- 3.1.1: FW → WebSocket server infrastructure
- 3.1.2: FW → Chokidar watcher service
- 3.1.3: ALK → Project scanner service
- 3.1.4: ALK → Symlink executor service
- 3.1.5: ALK → Port skip patterns from shell
- 3.1.6: UI → Client WebSocket integration
- 3.1.7: ALK → Shell script bridge API
- 3.1.8: SYS → Integration test suite

Agents: ~/Projects/agents/file-watcher-specialist.md, auto-link-developer.md, ui-development-expert.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 4: UI/UX Improvements

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 4 section)
3. HANDOFF-PHASE-3.md (if exists)

Phase 4 Tasks:
- 4.1.1: UI → Extract shared hooks, Error Boundaries
- 4.1.2: UI → Remove unused assets (fonts, components)
- 4.1.3: UI → Keyboard shortcuts system
- 4.1.4: UI → Monaco Editor with RSES syntax
- 4.1.5: UX → Rename tabs, sync test path
- 4.1.6: UX → Unsaved changes warning
- 4.1.7: UI → Accessibility improvements
- 4.1.8: UX → UI/UX test suite

Agents: ~/Projects/agents/ui-development-expert.md, ux-design-expert.md, preview-generator.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 5: Prompting & Learning

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 5 section)
3. HANDOFF-PHASE-4.md (if exists)

Phase 5 Tasks:
- 5.1.1: SGT → Unknown category detection
- 5.1.2: UX → Interactive prompting dialog
- 5.1.3: CMS → Learning persistence layer
- 5.1.4: PRM → Redesign error messages
- 5.1.5: PRM → Contextual help system
- 5.1.6: UX → Onboarding flow

Agents: ~/Projects/agents/prompting-expert.md, ux-design-expert.md, set-graph-theorist.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 6: CMS Features

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 6 section)
3. HANDOFF-PHASE-5.md (if exists)

Phase 6 Tasks:
- 6.1.1: CMS → Projects entity and scanning API
- 6.1.2: CMS → Dashboard with statistics
- 6.1.3: CMS → Config versioning/history
- 6.1.4: CMS → Batch operations API
- 6.1.5: CMS → Activity timeline
- 6.1.6: CMS → CMS integration tests

Agents: ~/Projects/agents/cms-developer.md, ui-development-expert.md, ux-design-expert.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## PHASE 7: Production Readiness

```
I'm resuming RSES-Playground implementation.

Read these files:
1. .claude/PROJECT-STATE.json
2. IMPLEMENTATION-PLAN.md (Phase 7 section)
3. HANDOFF-PHASE-6.md (if exists)

Phase 7 Tasks:
- 7.1.1: SYS → Health check endpoints
- 7.1.2: SYS → Structured logging (pino)
- 7.1.3: SYS → Prometheus metrics
- 7.1.4: SYS → Background job queue
- 7.1.5: SYS → Database connection resilience
- 7.1.6: SYS → Production deployment guide

Agents: ~/Projects/agents/systems-analyst.md

Check PROJECT-STATE.json for task status, then continue from first incomplete task.
```

---

## Key File Locations

```
/Users/Alchemy/Projects/experiments/RSES-Playground/
├── .claude/
│   ├── PROJECT-STATE.json    # Task/gate status (UPDATE THIS)
│   └── RESUME-PROMPT.md      # This file
├── IMPLEMENTATION-PLAN.md    # Full plan details
├── HANDOFF-PHASE-*.md        # Created after each phase
└── ~/Projects/agents/        # All 11 agent definitions
```

## After Completing Tasks

Update `.claude/PROJECT-STATE.json`:
```json
"tasks": { "X.X.X": { "status": "complete" } }
"qualityGates": { "GX.X": { "passed": true } }
"tokensUsed": 50000
```

After completing a phase:
1. Create `HANDOFF-PHASE-{N}.md`
2. Update `currentPhase` in PROJECT-STATE.json
3. Commit and push to GitHub
