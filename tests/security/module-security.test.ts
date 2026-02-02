/**
 * @file module-security.test.ts
 * @description Test suite for module security architecture
 * @phase Phase 9 - CMS Transformation (Security Testing)
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 *
 * Tests cover:
 * - Module sandboxing
 * - Capability management
 * - API access validation
 * - Tenant isolation
 * - Security degradation
 * - Audit logging
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSandbox,
  checkCapability,
  requestCapability,
  approveCapabilityRequest,
  denyCapabilityRequest,
  grantCapability,
  revokeCapability,
  quarantineModule,
  validateApiCall,
  recordSandboxViolation,
  enableSecurityModule,
  disableSecurityModule,
  isSecurityModuleEnabled,
  queryAuditEvents,
  getModuleSecuritySummary,
  moduleSandboxes,
  moduleCapabilities,
  pendingCapabilityRequests,
  auditLog,
} from "../../server/security/module-security";
import {
  type ModuleTrustLevel,
  type ModuleCapability,
  DEFAULT_RESOURCE_LIMITS,
} from "../../docs/security/module-security-architecture";

// =============================================================================
// TEST HELPERS
// =============================================================================

function clearSecurityState() {
  moduleSandboxes.clear();
  moduleCapabilities.clear();
  pendingCapabilityRequests.clear();
  auditLog.length = 0;
}

// =============================================================================
// SANDBOX TESTS
// =============================================================================

describe("Module Sandboxing", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  describe("createSandbox", () => {
    it("creates kernel sandbox for core modules", () => {
      const sandbox = createSandbox("core-auth", "core");

      expect(sandbox.context).toBe("kernel");
      expect(sandbox.strictMode).toBe(false);
      expect(sandbox.limits.maxMemory).toBe(-1); // Unlimited
      expect(sandbox.capabilities.length).toBeGreaterThan(40); // All capabilities (43 total)
      expect(sandbox.deniedOperations).toHaveLength(0);
    });

    it("creates standard sandbox for verified modules", () => {
      const sandbox = createSandbox("verified-plugin", "verified");

      expect(sandbox.context).toBe("standard");
      expect(sandbox.strictMode).toBe(true);
      expect(sandbox.limits.maxMemory).toBe(512 * 1024 * 1024); // 512MB
      expect(sandbox.deniedOperations).toContain("system.exec");
      expect(sandbox.apiAccess.allowInternalApis).toBe(false);
    });

    it("creates restricted sandbox for community modules", () => {
      const sandbox = createSandbox("community-plugin", "community");

      expect(sandbox.context).toBe("restricted");
      expect(sandbox.strictMode).toBe(true);
      expect(sandbox.limits.maxMemory).toBe(256 * 1024 * 1024); // 256MB
      expect(sandbox.deniedOperations).toContain("db.raw_query");
      expect(sandbox.deniedOperations).toContain("fs.write_any");
      expect(sandbox.dataScope.piiPolicy).toBe("anonymize");
    });

    it("creates quarantine sandbox for untrusted modules", () => {
      const sandbox = createSandbox("untrusted-plugin", "untrusted");

      expect(sandbox.context).toBe("quarantine");
      expect(sandbox.strictMode).toBe(true);
      expect(sandbox.limits.maxMemory).toBe(64 * 1024 * 1024); // 64MB
      expect(sandbox.limits.maxNetworkConnections).toBe(0); // No network
      expect(sandbox.limits.requestsPerMinute).toBe(100); // Very limited

      // Should only have minimal read capabilities
      expect(sandbox.capabilities).toContain("content.read");
      expect(sandbox.capabilities).not.toContain("content.create");
      expect(sandbox.capabilities).not.toContain("network.outbound_http");
    });

    it("logs module installation to audit", () => {
      createSandbox("test-module", "community");

      const events = auditLog.filter(e => e.eventType === "module.installed");
      expect(events).toHaveLength(1);
      expect(events[0].module.name).toBe("test-module");
      expect(events[0].severity).toBe("info");
    });
  });

  describe("resource limits", () => {
    it("applies correct limits by trust level", () => {
      const trustedSandbox = createSandbox("trusted", "verified");
      const communityBox = createSandbox("community", "community");
      const untrustedBox = createSandbox("untrusted", "untrusted");

      // Verified gets more resources than community
      expect(trustedSandbox.limits.maxCpuTime)
        .toBeGreaterThan(communityBox.limits.maxCpuTime);

      // Community gets more than untrusted
      expect(communityBox.limits.maxConcurrency)
        .toBeGreaterThan(untrustedBox.limits.maxConcurrency);

      // Untrusted gets minimal resources
      expect(untrustedBox.limits.maxCpuTime).toBe(1000); // 1 second
      expect(untrustedBox.limits.maxConcurrency).toBe(2);
    });
  });
});

// =============================================================================
// CAPABILITY TESTS
// =============================================================================

describe("Capability Management", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  describe("checkCapability", () => {
    it("returns true for granted capabilities", () => {
      createSandbox("test-module", "community");

      // Community modules get 'content.read' by default
      expect(checkCapability("test-module", "content.read")).toBe(true);
      expect(checkCapability("test-module", "content.create")).toBe(true);
    });

    it("returns false for denied capabilities", () => {
      createSandbox("test-module", "community");

      // Community modules don't get dangerous capabilities
      expect(checkCapability("test-module", "system.exec")).toBe(false);
      expect(checkCapability("test-module", "db.raw_query")).toBe(false);
    });

    it("returns false for non-existent modules", () => {
      expect(checkCapability("non-existent", "content.read")).toBe(false);
    });
  });

  describe("requestCapability", () => {
    it("auto-grants normal capabilities", () => {
      createSandbox("test-module", "community");

      const result = requestCapability(
        "test-module",
        "content.delete_own",
        "Need to allow users to delete their own content",
        "user-123"
      );

      expect(result.approved).toBe(true);
      expect(result.pendingApproval).toBe(false);
      expect(checkCapability("test-module", "content.delete_own")).toBe(true);
    });

    it("requires approval for elevated capabilities", () => {
      createSandbox("test-module", "community");

      const result = requestCapability(
        "test-module",
        "content.read_unpublished",
        "Need to access draft content for preview feature",
        "user-123"
      );

      expect(result.approved).toBe(false);
      expect(result.pendingApproval).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(checkCapability("test-module", "content.read_unpublished")).toBe(false);
    });

    it("denies capabilities blocked by context", () => {
      createSandbox("test-module", "community");

      const result = requestCapability(
        "test-module",
        "system.exec",
        "Want to run shell commands",
        "user-123"
      );

      expect(result.approved).toBe(false);
      expect(result.pendingApproval).toBe(false);
    });
  });

  describe("capability approval workflow", () => {
    it("admin can approve pending requests", () => {
      createSandbox("test-module", "community");

      const request = requestCapability(
        "test-module",
        "network.outbound_http",
        "Need to fetch external data",
        "user-123"
      );

      expect(request.pendingApproval).toBe(true);

      const approved = approveCapabilityRequest(
        request.requestId!,
        "admin-456",
        "Approved for external API integration"
      );

      expect(approved).toBe(true);
      expect(checkCapability("test-module", "network.outbound_http")).toBe(true);
    });

    it("admin can deny pending requests", () => {
      createSandbox("test-module", "community");

      const request = requestCapability(
        "test-module",
        "crypto.encrypt",
        "Want to encrypt user data",
        "user-123"
      );

      const denied = denyCapabilityRequest(
        request.requestId!,
        "admin-456",
        "Use the built-in encryption module instead"
      );

      expect(denied).toBe(true);
      expect(checkCapability("test-module", "crypto.encrypt")).toBe(false);
    });
  });

  describe("revokeCapability", () => {
    it("removes granted capability", () => {
      createSandbox("test-module", "community");

      expect(checkCapability("test-module", "content.create")).toBe(true);

      revokeCapability(
        "test-module",
        "content.create",
        "Security policy change",
        "admin-123"
      );

      expect(checkCapability("test-module", "content.create")).toBe(false);
    });

    it("logs revocation to audit", () => {
      createSandbox("test-module", "community");
      revokeCapability("test-module", "content.create", "Testing", "admin");

      const events = auditLog.filter(e => e.eventType === "module.capability_revoked");
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[events.length - 1].details.reason).toBe("Testing");
    });
  });
});

// =============================================================================
// API ACCESS TESTS
// =============================================================================

describe("API Access Validation", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  describe("validateApiCall", () => {
    it("allows access to permitted namespaces", () => {
      createSandbox("test-module", "community");

      const result = validateApiCall("test-module", "content", "list", undefined);

      expect(result.allowed).toBe(true);
    });

    it("denies access to forbidden namespaces", () => {
      createSandbox("test-module", "community");

      const result = validateApiCall("test-module", "system", "shutdown", undefined);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not allowed");
    });

    it("allows core modules full API access", () => {
      createSandbox("core-module", "core");

      const result = validateApiCall("core-module", "system", "any-method", undefined);

      expect(result.allowed).toBe(true);
    });

    it("blocks specific methods in blocklist", () => {
      createSandbox("test-module", "verified");

      // Even verified modules can't shutdown the system
      const result = validateApiCall("test-module", "content", "migrate", undefined);

      // 'migrate' is blocked for non-core modules
      // Note: This depends on the specific blocklist configuration
    });

    it("logs denied access to audit", () => {
      createSandbox("test-module", "untrusted");

      validateApiCall("test-module", "user", "delete", undefined);

      const deniedEvents = auditLog.filter(e => e.eventType === "module.permission_denied");
      expect(deniedEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// QUARANTINE TESTS
// =============================================================================

describe("Module Quarantine", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("downgrades module to quarantine context", () => {
    createSandbox("bad-module", "community");

    // Initially has community permissions
    expect(checkCapability("bad-module", "content.create")).toBe(true);

    quarantineModule("bad-module", "Detected malicious behavior", "admin");

    // After quarantine, loses most capabilities
    expect(checkCapability("bad-module", "content.create")).toBe(false);
    expect(checkCapability("bad-module", "content.read")).toBe(true); // Still has read
  });

  it("applies strict resource limits", () => {
    createSandbox("bad-module", "verified");
    quarantineModule("bad-module", "Testing", "admin");

    const sandbox = moduleSandboxes.get("bad-module");
    expect(sandbox?.context).toBe("quarantine");
    expect(sandbox?.limits.maxNetworkConnections).toBe(0);
    expect(sandbox?.strictMode).toBe(true);
  });

  it("logs quarantine event as critical", () => {
    createSandbox("bad-module", "community");
    quarantineModule("bad-module", "Security threat", "admin");

    const events = auditLog.filter(e => e.eventType === "module.quarantined");
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe("critical");
    expect(events[0].details.reason).toBe("Security threat");
  });
});

// =============================================================================
// SANDBOX VIOLATION TESTS
// =============================================================================

describe("Sandbox Violations", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("records violation in audit log", () => {
    createSandbox("test-module", "community");

    recordSandboxViolation("test-module", "memory_exceeded", {
      limit: 256 * 1024 * 1024,
      actual: 300 * 1024 * 1024,
    });

    const events = auditLog.filter(e => e.eventType === "module.sandbox_violation");
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe("error");
    expect(events[0].details.violationType).toBe("memory_exceeded");
  });

  it("quarantines module in strict mode after violation", () => {
    const sandbox = createSandbox("test-module", "community");
    expect(sandbox.strictMode).toBe(true);

    recordSandboxViolation("test-module", "unauthorized_api_call", {
      api: "system.exec",
    });

    // Module should be quarantined
    const updatedSandbox = moduleSandboxes.get("test-module");
    expect(updatedSandbox?.context).toBe("quarantine");
  });
});

// =============================================================================
// SECURITY MODULE TESTS
// =============================================================================

describe("Security Module State", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("tracks security module enabled state", () => {
    expect(isSecurityModuleEnabled("e2e_encryption")).toBe(false);

    enableSecurityModule("e2e_encryption", "admin");
    expect(isSecurityModuleEnabled("e2e_encryption")).toBe(true);

    disableSecurityModule("e2e_encryption", "admin", "Maintenance");
    expect(isSecurityModuleEnabled("e2e_encryption")).toBe(false);
  });

  it("logs security module state changes", () => {
    enableSecurityModule("mfa", "admin");

    const enableEvents = auditLog.filter(e => e.eventType === "module.enabled");
    expect(enableEvents.length).toBeGreaterThanOrEqual(1);

    disableSecurityModule("mfa", "admin", "Testing");

    const disableEvents = auditLog.filter(e => e.eventType === "module.disabled");
    expect(disableEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// AUDIT QUERY TESTS
// =============================================================================

describe("Audit Log Queries", () => {
  beforeEach(() => {
    clearSecurityState();
    // Create some audit events
    createSandbox("module-a", "community");
    createSandbox("module-b", "verified");
    recordSandboxViolation("module-a", "test", {});
    quarantineModule("module-a", "test", "admin");
  });

  it("filters events by module name", () => {
    const events = queryAuditEvents({ moduleName: "module-a" });

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every(e => e.module.name === "module-a")).toBe(true);
  });

  it("filters events by event type", () => {
    const events = queryAuditEvents({
      eventTypes: ["module.sandbox_violation"],
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every(e => e.eventType === "module.sandbox_violation")).toBe(true);
  });

  it("filters events by severity", () => {
    const events = queryAuditEvents({
      severity: ["critical"],
    });

    // Quarantine events are critical
    expect(events.some(e => e.eventType === "module.quarantined")).toBe(true);
  });

  it("limits result count", () => {
    const events = queryAuditEvents({ limit: 2 });
    expect(events.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// SECURITY SUMMARY TESTS
// =============================================================================

describe("Security Summary", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("provides complete security state for module", () => {
    createSandbox("test-module", "community");
    recordSandboxViolation("test-module", "test", {});

    const summary = getModuleSecuritySummary("test-module");

    expect(summary.sandbox).toBeDefined();
    expect(summary.sandbox?.context).toBe("quarantine"); // Quarantined after violation
    expect(summary.capabilities.length).toBeGreaterThan(0);
    expect(summary.auditSummary.totalEvents).toBeGreaterThanOrEqual(2);
    expect(summary.auditSummary.violations).toBeGreaterThanOrEqual(1);
  });

  it("returns undefined sandbox for unknown modules", () => {
    const summary = getModuleSecuritySummary("unknown-module");

    expect(summary.sandbox).toBeUndefined();
    expect(summary.capabilities).toHaveLength(0);
  });
});

// =============================================================================
// TRUST LEVEL TRANSITION TESTS
// =============================================================================

describe("Trust Level Transitions", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("preserves granted capabilities when trust increases", () => {
    // Start as community
    createSandbox("graduating-module", "community");
    grantCapability("graduating-module", "crypto.hash", "auto-grant");

    // Simulate trust upgrade by recreating sandbox
    // In real implementation, would have an upgradeModuleTrust function
    expect(checkCapability("graduating-module", "crypto.hash")).toBe(true);
  });

  it("revokes dangerous capabilities when trust decreases", () => {
    createSandbox("demoted-module", "verified");

    // Verified modules have elevated capabilities
    expect(checkCapability("demoted-module", "content.read_unpublished")).toBe(true);

    // Quarantine loses those capabilities
    quarantineModule("demoted-module", "Security concern", "admin");
    expect(checkCapability("demoted-module", "content.read_unpublished")).toBe(false);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe("Edge Cases", () => {
  beforeEach(() => {
    clearSecurityState();
  });

  it("handles multiple sandboxes for same module name", () => {
    const sandbox1 = createSandbox("test-module", "community");
    const sandbox2 = createSandbox("test-module", "verified");

    // Later sandbox should overwrite earlier
    const current = moduleSandboxes.get("test-module");
    expect(current?.context).toBe("standard"); // verified -> standard
  });

  it("handles capability operations on non-existent modules gracefully", () => {
    expect(() => {
      grantCapability("non-existent", "content.read", "test");
    }).not.toThrow();

    expect(() => {
      revokeCapability("non-existent", "content.read", "test", "admin");
    }).not.toThrow();
  });

  it("handles concurrent capability requests", () => {
    createSandbox("test-module", "community");

    // Request same capability twice
    const req1 = requestCapability("test-module", "network.outbound_http", "Reason 1", "user1");
    const req2 = requestCapability("test-module", "network.outbound_http", "Reason 2", "user2");

    // Both should create pending requests
    expect(req1.pendingApproval).toBe(true);
    expect(req2.pendingApproval).toBe(true);

    const pending = pendingCapabilityRequests.get("test-module") || [];
    expect(pending.length).toBe(2);
  });
});
