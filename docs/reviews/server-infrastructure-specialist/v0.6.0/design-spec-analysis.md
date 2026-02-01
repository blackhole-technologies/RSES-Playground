# Design Spec Analysis: Documentation vs Implementation

**Author**: Server Infrastructure Specialist
**Date**: 2026-02-01
**Version**: v0.6.0

---

## Executive Summary

After comprehensive analysis of the 4 design spec files against actual server source code, the findings reveal:

| File | Status | Recommendation |
|------|--------|----------------|
| `kernel-contracts.ts` | **Design Spec Only** | KEEP as docs |
| `subsystem-ports.ts` | **Design Spec Only** | KEEP as docs |
| `module-security-architecture.ts` | **Partially Implemented** | KEEP as docs (actively referenced) |
| `security-types.ts` | **Overlap with server types** | KEEP as docs (different scope) |

**Key Finding**: The design specs are architectural documentation that the actual implementation REFERENCES but does not duplicate. The server has its own simpler, working implementation that draws from these specs conceptually.

---

## Detailed Analysis

---

### 1. kernel-contracts.ts (755 lines)

**Location**: `/docs/architecture/design-specs/kernel-contracts.ts`

#### What It Defines

| Category | Interfaces/Types |
|----------|------------------|
| **Branded Types** | `Brand<T,B>`, `CommandId`, `QueryId`, `EventId`, `AggregateId`, `CorrelationId`, `CausationId`, `UserId`, `TenantId`, `PluginId` |
| **Result Type** | `Result<T,E>` with utility functions |
| **DDD Core** | `ValueObject<T>`, `Entity<TId>`, `AggregateRoot<TId>` |
| **CQRS - Commands** | `CommandMetadata`, `Command<T>`, `CommandHandler<T>`, `CommandBus`, `CommandError`, `ValidationViolation` |
| **CQRS - Queries** | `QueryMetadata`, `Query<T>`, `QueryHandler<T>`, `QueryBus`, `QueryError`, `CacheControl` |
| **Events** | `EventMetadata`, `DomainEvent<T>`, `EventHandler<T>`, `EventBus`, `Subscription` |
| **Saga** | `SagaStep<T>`, `SagaDefinition<T>`, `SagaOrchestrator`, `SagaError`, `SagaStatus`, `RetryPolicy` |
| **Plugin System** | `PluginManifest`, `PluginContributions`, `PluginCapability`, `PluginContext`, `PluginManager`, `PluginState`, `PluginError` |
| **Security** | `Identity`, `PolicyDecision`, `PolicyEngine`, `Policy`, `PolicyRequest`, `ResourceDescriptor` |
| **Logging/Telemetry** | `Logger`, `Metrics`, `Counter`, `Gauge`, `Histogram`, `Summary` |
| **Contributions** | 10+ contribution types for plugins |

#### Comparison with Server Implementation

**Server Kernel Types** (`/server/kernel/types.ts`):

| Concept | Design Spec | Server Implementation | Match? |
|---------|-------------|----------------------|--------|
| Module Tiers | Not defined | `ModuleTier = "kernel" \| "core" \| "optional" \| "third-party"` | Different |
| Module State | Not defined | `ModuleState` (9 states: registered, initializing, ready, etc.) | Different |
| Event Bus | `EventBus` (publish/subscribe methods) | `IEventBus` (on, once, off, emit, etc.) | Conceptually similar, different API |
| DI Container | Not defined | `IContainer` (registerSingleton, registerFactory, resolve, etc.) | Server has its own |
| Module Manifest | Part of Plugin system | `ModuleManifest` (id, name, version, tier, dependencies, permissions) | Server has simpler version |
| Health Check | Not defined | `ModuleHealth` | Server-specific |
| API Gateway | Not defined | `IApiGateway`, `GatewayRoute` | Server-specific |

**Key Differences**:
- Design spec is enterprise-grade CQRS/ES architecture with Sagas and full DDD support
- Server implementation is simpler module kernel focused on lifecycle management
- Server uses Pino logger, not the abstract `Logger` interface
- Server has no CommandBus/QueryBus - uses direct method calls
- Server has no Saga orchestration

#### Assessment

**Status**: DESIGN SPEC ONLY - Aspirational architecture not implemented

**Value**: HIGH - Defines target state for enterprise evolution

**Recommendation**: **KEEP as documentation**

The kernel-contracts.ts represents enterprise CQRS/ES architecture that could be a future evolution. The current server implementation is deliberately simpler and sufficient for current needs. Moving this to server would create unused code.

---

### 2. subsystem-ports.ts (919 lines)

**Location**: `/docs/architecture/design-specs/subsystem-ports.ts`

#### What It Defines

| Subsystem | Interfaces/Types |
|-----------|------------------|
| **Content** | `ContentApiPort`, `CreateContentCommand`, `UpdateContentCommand`, `PublishContentCommand`, `ContentDTO`, `ContentStoragePort`, `ContentSearchPort`, `ContentError` |
| **Taxonomy** | `TaxonomyApiPort`, `CreateVocabularyCommand`, `CreateTermCommand`, `TaxonomyQuery`, `VocabularyDTO`, `TermDTO`, `RsesEnginePort`, `TaxonomyError` |
| **AI** | `AIInferencePort`, `TextGenerationRequest/Response`, `ClassifyTextRequest`, `EmbeddingRequest/Response`, `AIModelAdapterPort`, `AIError` |
| **Quantum** | `QuantumExecutionPort`, `CircuitExecutionRequest`, `GroverOracle`, `QAOAProblem`, `QuantumState`, `QuantumHardwareAdapterPort`, `QuantumError` |
| **Common** | `Pagination`, `UserReference`, `ContentMetadata`, `FieldValue`, `SearchQuery`, `SearchResults` |

#### Comparison with Server Implementation

The server does NOT have any files implementing these hexagonal ports. There are no:
- `/server/content/` directory with port implementations
- `/server/taxonomy/` directory
- `/server/ai/` directory (beyond AI types)
- `/server/quantum/` directory

**Server has**:
- `/server/kernel/` - Module lifecycle (not content/taxonomy operations)
- `/server/security/` - Security enforcement (different from content ports)

#### Assessment

**Status**: DESIGN SPEC ONLY - Hexagonal architecture not implemented

**Value**: HIGH - Defines clean subsystem boundaries

**Recommendation**: **KEEP as documentation**

This defines the target hexagonal architecture with inbound/outbound ports. When subsystems are actually built, they SHOULD reference these port definitions. Currently serves as architectural blueprint.

---

### 3. module-security-architecture.ts (1,466 lines)

**Location**: `/docs/architecture/design-specs/module-security-architecture.ts`

#### What It Defines

| Section | Interfaces/Types |
|---------|------------------|
| **Sandboxing** | `ModuleExecutionContext`, `ModuleSandbox`, `SandboxResourceLimits`, `DEFAULT_RESOURCE_LIMITS` |
| **Capabilities** | `ModuleCapability` (40+ capabilities), `CapabilityRiskLevel`, `CapabilityDefinition`, `CAPABILITY_REGISTRY` |
| **Access Policies** | `ApiAccessPolicy`, `DataScopePolicy` |
| **Trust/Verification** | `ModuleTrustLevel`, `SignatureStatus`, `ModuleSignature`, `TrustedSigner`, `ModuleVerificationResult`, `ModuleVulnerability`, `ModuleVerificationService` |
| **Security Modules** | `SecurityModuleType` (14 types), `SecurityModuleState`, `SecurityModuleConfig`, `SecurityFallbackBehavior`, `E2EEncryptionConfig`, `DLPConfig`, `OAuthConfig` |
| **Audit** | `ModuleAuditEventType` (20+ types), `ModuleAuditEvent`, `AuditRetentionPolicy`, `ModuleAuditLogger`, `ModuleAuditFilter` |
| **Tenant** | `TenantIsolationStrategy`, `TenantConfig`, `TenantQuotas`, `TenantContext`, `TenantIsolatedDataAccess` |
| **Defaults** | `SecurityDefaults`, `PasswordPolicy`, `SessionDefaults`, `LockoutPolicy`, `CorsDefaults`, `PRODUCTION_SECURITY_DEFAULTS` |
| **Service** | `ModuleSecurityService` interface |
| **Zod Schemas** | `moduleManifestSchema`, `capabilityGrantRequestSchema`, `moduleStateChangeSchema` |

#### Comparison with Server Implementation

**Critical Finding**: `/server/security/module-security.ts` IMPORTS from this design spec!

```typescript
// Line 17-30 of /server/security/module-security.ts
import {
  type ModuleSandbox,
  type ModuleCapability,
  type ModuleTrustLevel,
  type ModuleExecutionContext,
  type ModuleVerificationResult,
  type ModuleAuditEvent,
  type ModuleAuditEventType,
  type TenantContext,
  type SecurityModuleType,
  type CapabilityRiskLevel,
  DEFAULT_RESOURCE_LIMITS,
  CAPABILITY_REGISTRY,
  PRODUCTION_SECURITY_DEFAULTS,
} from "@docs/security/module-security-architecture";
```

**Server Implementation** (`/server/security/module-security.ts`):
- Implements sandbox creation: `createSandbox(moduleName, trustLevel)`
- Implements capability checking: `checkCapability()`, `requestCapability()`, `grantCapability()`, `revokeCapability()`
- Implements API validation: `validateApiCall()`
- Implements quarantine: `quarantineModule()`
- Implements security module toggling: `enableSecurityModule()`, `disableSecurityModule()`
- Implements audit logging: `logAuditEvent()`, `queryAuditEvents()`

**The import path uses `@docs/` alias** suggesting the design spec IS the type source.

#### Assessment

**Status**: ACTIVELY REFERENCED - Types imported by implementation

**Value**: CRITICAL - Provides type definitions for security implementation

**Recommendation**: **KEEP as documentation** (it IS the type source)

This is not dead code - it's the authoritative type definition file that the implementation imports. The separation is intentional:
- Design spec = Type definitions + constants
- Server implementation = Runtime logic using those types

**Alternative**: Could move to `/server/security/types/module-security-types.ts` but current location makes architectural intent clear.

---

### 4. security-types.ts (1,243 lines)

**Location**: `/docs/architecture/design-specs/security-types.ts`

#### What It Defines

| Category | Interfaces/Types |
|----------|------------------|
| **User/Identity** | `AuthProvider`, `UserStatus`, `User`, `SafeUser`, `UserSummary`, `AuthProviderLink`, `UserPreferences`, `LocalCredentials` |
| **Roles** | `RoleTrustLevel`, `Role`, `SYSTEM_ROLES` constant |
| **Permissions** | `PermissionOperation`, `PermissionResource`, `PermissionScope`, `Permission`, `PermissionContext`, `PermissionCheckResult` |
| **Content ACL** | `ContentStatus`, `AclEntryType`, `AclPrincipalType`, `AclEntry`, `AclCondition`, `ContentAcl` |
| **Module Security** | `ModuleTrustLevel`, `ModuleCapabilities`, `ModuleManifest`, `ModuleDependency`, `ModuleSignature`, `ModuleChecksums`, `SecurityReviewStatus`, `SecurityVulnerability` |
| **Theme Security** | `ThemeManifest`, `ThemeLibrary`, `ThemeSecuritySettings` |
| **Sessions** | `SessionData`, `SessionConfig` |
| **Audit** | `AuditCategory`, `AuditSeverity`, `AuditOutcome`, `AuditActor`, `AuditResource`, `AuditEvent`, `AuditEventFilter` |
| **API Security** | `RateLimitTier`, `CorsConfig`, `ApiKey` |
| **Validation** | `ValidationRule`, `FieldValidation`, `ValidationResult`, `ValidationError` |
| **Security Events** | `SecurityEventType`, `SecurityEvent` |
| **Middleware** | `SecurityMiddlewareConfig`, `MIDDLEWARE_ORDER` |

#### Comparison with Server Implementation

**Server Security Types** (`/server/security/types.ts`):

This is a COMPLETELY DIFFERENT file focused on Zero-Trust security architecture:

| Design Spec (security-types.ts) | Server (security/types.ts) |
|--------------------------------|---------------------------|
| User/Role/Permission RBAC model | Zero-Trust SecurityContext |
| Basic session management | AI-powered threat detection |
| Simple audit logging | Quantum-safe cryptography |
| Basic validation | ABAC policy engine |
| MIDDLEWARE_ORDER | Self-healing security |
| - | Compliance automation |
| - | Risk scoring system |
| - | Behavioral analysis |

**They cover different domains**:
- Design spec: Traditional CMS security (users, roles, permissions, sessions)
- Server: Advanced zero-trust infrastructure (threat detection, risk scoring, ABAC)

**Additional Server Files**:
- `/server/security/multisite/types.ts` - Multi-site tenant isolation (899 lines)
- `/server/security/messaging/types.ts` - Messaging-specific security
- `/server/security/abac-engine.ts` - ABAC implementation
- `/server/security/risk-engine.ts` - Risk scoring
- `/server/security/quantum-crypto.ts` - Quantum-safe crypto
- `/server/security/self-healing.ts` - Auto-remediation
- `/server/security/compliance-engine.ts` - Compliance automation

#### Assessment

**Status**: DESIGN SPEC - Different scope from server types

**Value**: HIGH - Defines CMS-layer security (users, roles, permissions)

**Recommendation**: **KEEP as documentation**

These types define the CMS application-layer security model (users, roles, content permissions) which is COMPLEMENTARY to the infrastructure-layer zero-trust security in `/server/security/types.ts`. When user management and RBAC are implemented, these types should be referenced.

---

## Summary Matrix

| File | Lines | Implemented in Server? | Types Used by Server? | Recommendation |
|------|-------|----------------------|----------------------|----------------|
| `kernel-contracts.ts` | 755 | No - Server has simpler impl | No | KEEP as docs |
| `subsystem-ports.ts` | 919 | No - Subsystems not built | No | KEEP as docs |
| `module-security-architecture.ts` | 1,466 | **YES - Partially** | **YES - Imported** | KEEP as docs (type source) |
| `security-types.ts` | 1,243 | No - Different scope | No | KEEP as docs |

---

## Recommendations

### 1. KEEP All Files in `/docs/architecture/design-specs/`

**Rationale**:
- They serve as architectural documentation and target-state definitions
- `module-security-architecture.ts` is actively imported (via `@docs/` alias)
- Other specs define future subsystem boundaries
- Moving them risks breaking imports and losing architectural context

### 2. Add Reference Documentation

Create a README in the design-specs directory explaining:
- These are TYPE DEFINITIONS and ARCHITECTURAL SPECIFICATIONS
- `module-security-architecture.ts` is actively referenced
- Others are target-state for future implementation

### 3. Consider Type Aliasing

For the actively-used `module-security-architecture.ts`, could add a re-export from server:

```typescript
// /server/security/types/module-security.ts
export * from "@docs/security/module-security-architecture";
```

This would make the dependency explicit in server code.

### 4. Do NOT Delete

None of these files are dead code or duplicates. They each serve distinct purposes:
- Architectural blueprints for CQRS/ES evolution
- Hexagonal port definitions for subsystems
- Active type definitions for module security
- CMS-layer security model definitions

---

## File-by-File Verdict

| File | Action | Reason |
|------|--------|--------|
| `kernel-contracts.ts` | **KEEP** | Enterprise CQRS/ES target architecture |
| `subsystem-ports.ts` | **KEEP** | Hexagonal port definitions for future subsystems |
| `module-security-architecture.ts` | **KEEP** | Actively imported by `/server/security/module-security.ts` |
| `security-types.ts` | **KEEP** | CMS-layer security model (users, roles, permissions) |

---

## Architecture Insight

The project has a clear separation:

```
/docs/architecture/design-specs/     <- TYPE DEFINITIONS + CONSTANTS
   - module-security-architecture.ts    (actively used)
   - security-types.ts                  (future use)
   - kernel-contracts.ts                (enterprise evolution)
   - subsystem-ports.ts                 (hexagonal ports)

/server/                             <- RUNTIME IMPLEMENTATIONS
   /kernel/                             (simpler module system)
   /security/                           (zero-trust + imports from docs)
```

This is a valid architectural pattern where design specs serve as:
1. Single source of truth for type definitions
2. Architectural documentation
3. Target state for evolution
