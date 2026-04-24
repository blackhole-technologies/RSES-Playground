# Kernel Contracts

**Purpose**: Architectural specifications for future implementation phases.

These TypeScript files define contracts and interfaces that will be implemented as the project progresses through phases.

---

## Files

| File | Lines | Phase | Description |
|------|-------|-------|-------------|
| `kernel-contracts.ts` | 755 | Phase 2 | CQRS, Command/Query Bus, Saga Orchestrator, DDD patterns |
| `subsystem-ports.ts` | 919 | Phase 1-4 | Hexagonal architecture ports for Content, Taxonomy, AI, Quantum |

---

## Status

These are **specifications only** - not yet implemented.

| Pattern | Status | Target Phase |
|---------|--------|--------------|
| Command Bus | Spec only | Phase 2 |
| Query Bus | Spec only | Phase 2 |
| Saga Orchestrator | Spec only | Phase 2 |
| Content Ports | Spec only | Phase 1 |
| Taxonomy Ports | Spec only | Phase 1 |
| AI Ports | Spec only | Phase 2 |
| Quantum Ports | Spec only | Phase 4+ |

---

## Usage

When implementing these patterns:
1. Import types from these contract files
2. Implement adapters in appropriate directories
3. Wire through kernel module system

```typescript
import type { Command, CommandHandler } from "./contracts/kernel-contracts";
import type { ContentApiPort } from "./contracts/subsystem-ports";
```

---

*Contracts moved from docs/architecture/design-specs/ on 2026-02-01*
