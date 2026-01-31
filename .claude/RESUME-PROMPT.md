# RSES-Playground Implementation Resume Prompt

## Quick Context Restoration

Copy this entire prompt to resume implementation in a new context window:

---

## RESUME PROMPT (Copy from here)

I'm continuing implementation of the RSES-Playground project. This is a multi-session implementation with 11 specialized agents.

**First, read these files in order:**

1. `.claude/PROJECT-STATE.json` - Current phase, task status, quality gates
2. `IMPLEMENTATION-PLAN.md` - Full 7-phase plan with agent assignments
3. The latest `HANDOFF-PHASE-{N}.md` if it exists

**Project Summary:**
RSES-Playground is a web-based CMS for organizing AI-generated projects via symlinks. It needs to:
- Watch ~/Projects for changes in real-time
- Execute symlink creation (currently preview-only)
- Prompt users for unknown categories
- Learn user preferences

**11 Agent Specialists Available at `/Users/Alchemy/Projects/agents/`:**
- SEC (Security), SYS (Systems), UI, UX, CMS
- FW (File Watcher), PRV (Preview), ARC (Architecture)
- SGT (Set-Graph Theory), ALK (Auto-Link), PRM (Prompting)

**After reading state, tell me:**
1. Current phase and status
2. Next task(s) to execute
3. Which agent(s) to invoke
4. Any blockers from previous session

---

## State File Locations

```
/Users/Alchemy/Projects/experiments/RSES-Playground/
├── .claude/
│   ├── PROJECT-STATE.json    # Machine-readable state
│   └── RESUME-PROMPT.md      # This file
├── IMPLEMENTATION-PLAN.md    # Full plan
├── HANDOFF-PHASE-1.md        # Created after Phase 1
├── HANDOFF-PHASE-2.md        # Created after Phase 2
└── ... (handoffs created as phases complete)
```

## How to Update State

After completing tasks, update `PROJECT-STATE.json`:

```json
{
  "tasks": {
    "1.1.1": { "status": "complete", ... }
  },
  "qualityGates": {
    "G1.1": { "passed": true, ... }
  }
}
```

After completing a phase:
1. Create `HANDOFF-PHASE-{N}.md` with summary
2. Update `currentPhase` in PROJECT-STATE.json
3. Set phase status to "COMPLETE"

## Emergency Context Recovery

If all context is lost, these files contain everything needed:

| Priority | File | Contains |
|----------|------|----------|
| 1 | PROJECT-STATE.json | Exact task/phase status |
| 2 | IMPLEMENTATION-PLAN.md | Full instructions |
| 3 | HANDOFF-PHASE-*.md | Session summaries |
| 4 | Agent files in ~/Projects/agents/ | Agent expertise |

## Token Budget Tracking

Update `tokensUsed` in PROJECT-STATE.json periodically:

```json
"phases": {
  "1": {
    "tokenBudget": 140000,
    "tokensUsed": 45000,  // Update this
    ...
  }
}
```

If approaching 80% of budget, create handoff and pause.

---

## Verification Checklist for New Context

- [ ] Read PROJECT-STATE.json
- [ ] Identify current phase
- [ ] Check incomplete tasks
- [ ] Review any HANDOFF docs
- [ ] Confirm agent definitions are accessible
- [ ] Resume from documented state
