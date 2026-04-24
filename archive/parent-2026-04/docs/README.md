# RSES CMS Documentation

**Version**: 0.6.0 (Pre-Foundation)
**Last Updated**: 2026-02-01

---

## Directory Structure

```
docs/
├── README.md                    # This file
│
├── plans/                       # Master plans and implementation strategy
│   ├── CMS-MASTER-PLAN-FINAL.md    # AUTHORITATIVE - Current plan
│   ├── CMS-MASTER-PLAN-v2.md       # Previous iteration
│   ├── CMS-MASTER-PLAN.md          # Original plan
│   └── IMPLEMENTATION-PLAN.md      # Detailed implementation
│
├── handoffs/                    # Context transition documents
│   ├── HANDOFF-EXPERT-REVIEW-v0.6.0.md  # Latest handoff
│   ├── HANDOFF-PHASE-*.md              # Phase handoffs
│   └── archive/                         # Old handoffs (deprecated)
│
├── reviews/                     # Expert agent reviews (versioned)
│   ├── CONSOLIDATED-REVIEW-v0.6.0.md   # Summary of all reviews
│   ├── systems-analyst/v0.6.0/
│   ├── security-specialist/v0.6.0/
│   ├── drift-specialist/v0.6.0/
│   └── [other-agents]/v0.6.0/
│
├── architecture/                # System architecture docs
│   ├── RSES-CMS-ENTERPRISE-ARCHITECTURE.md
│   ├── ARCHITECTURE-DRUPAL-STYLE.md
│   ├── MULTI-SITE-ARCHITECTURE.md
│   ├── ISOLATION-FAULT-TOLERANCE.md
│   ├── UPGRADE-PATH-SPECIFICATION.md
│   ├── FILE-WATCHER-ARCHITECTURE.md
│   ├── FINAL-IMPLEMENTATION-STRATEGY.md
│   └── diagrams/
│
├── security/                    # Security documentation
│   ├── README.md
│   ├── SECURITY-ARCHITECTURE.md
│   ├── MIDDLEWARE-CHAIN.md
│   ├── MODULE-MANIFEST-FORMAT.md
│   └── SECURITY-CHECKLISTS.md
│
├── ux/                          # UX/UI documentation
│   ├── UX-DESIGN.md
│   ├── UX-COMPONENTS.md
│   ├── UX-USER-FLOWS.md
│   ├── UX-AI-ENHANCED-DESIGN.md
│   ├── UX-SOCIAL-MEDIA.md
│   └── UX-SOCIAL-MEDIA-COMPONENTS.md
│
├── taxonomy/                    # Taxonomy system docs
│   ├── TAXONOMY-ENGINE-ARCHITECTURE.md
│   └── TAXONOMY-IMPLEMENTATION-GUIDE.md
│
├── theory/                      # Theoretical foundations
│   ├── SET-GRAPH-THEORY-FORMALIZATION.md
│   ├── QUANTUM-TAXONOMY-THEORY.md
│   └── SOCIAL-ANALYTICS-THEORY.md
│
├── api/                         # API documentation
│   └── API.md
│
└── operations/                  # Operations and deployment
    ├── DEPLOYMENT.md
    ├── OPERATIONS.md
    └── UNUSED-COMPONENTS.md
```

---

## Quick Links

### For New Context Windows
1. Read `plans/CMS-MASTER-PLAN-FINAL.md` - The authoritative plan
2. Read `reviews/CONSOLIDATED-REVIEW-v0.6.0.md` - Current state assessment
3. Read `handoffs/HANDOFF-EXPERT-REVIEW-v0.6.0.md` - Latest handoff

### For Development
- Architecture: `architecture/RSES-CMS-ENTERPRISE-ARCHITECTURE.md`
- Security: `security/SECURITY-ARCHITECTURE.md`
- UX: `ux/UX-DESIGN.md`

### Expert Agents
Located at `~/Projects/agents/`:
- `systems-analyst.md` - Final authority on architecture
- `security-specialist.md` - Security review
- `drift-specialist.md` - Scope drift prevention
- `cms-developer.md` - CMS features
- `project-architect.md` - Technical architecture
- `ux-design-expert.md` - UX patterns
- `ui-development-expert.md` - UI implementation
- `set-graph-theorist.md` - RSES theory
- `plug-and-play-module-specialist.md` - Module system
- `media-integration-specialist.md` - Media/social
- `communications-technology-specialist.md` - Real-time

---

## Versioning Convention

- Documents versioned by implementation state
- Format: `v{MAJOR}.{MINOR}.{PATCH}`
- Current: `v0.6.0` (Pre-Foundation/Phase 0)
- Next milestone: `v1.0.0` (Phase 1 complete)

---

## Status

| Metric | Value |
|--------|-------|
| Master Plan Alignment | 35% |
| Phase 1 Completion | 25% |
| Critical Issues | 2 (Security) |

See `reviews/CONSOLIDATED-REVIEW-v0.6.0.md` for details.

---

## No TypeScript in Docs

All `.ts` files have been moved to `server/`:
- Contract specs → `server/kernel/contracts/`
- Security types → `server/security/`

Documentation is markdown only.
