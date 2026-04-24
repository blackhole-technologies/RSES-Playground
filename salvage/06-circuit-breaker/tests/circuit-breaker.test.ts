/**
 * @file circuit-breaker.test.ts
 * @description Tests for the circuit breaker pattern implementation.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  createDatabaseCircuitBreaker,
} from "../src/circuit-breaker";

// Silence the logger stub's console output during tests.
vi.mock("../src/logger-stub", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeout: 100, // Short timeout for testing
      successThreshold: 2,
    });
  });

  describe("Initial State", () => {
    it("starts in CLOSED state", () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("has zero failure count initially", () => {
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe("Successful Operations", () => {
    it("allows operations when CLOSED", async () => {
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("resets failure count on success", async () => {
      // Cause some failures (but not enough to open)
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}

      expect(breaker.getStats().failureCount).toBe(2);

      // Success should reset
      await breaker.execute(async () => "success");
      expect(breaker.getStats().failureCount).toBe(0);
    });
  });

  describe("Failed Operations", () => {
    it("counts failures", async () => {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}

      expect(breaker.getStats().failureCount).toBe(1);
    });

    it("opens circuit after threshold failures", async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it("re-throws errors from operations", async () => {
      await expect(
        breaker.execute(async () => {
          throw new Error("test error");
        })
      ).rejects.toThrow("test error");
    });
  });

  describe("OPEN State", () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {}
      }
    });

    it("rejects requests when OPEN", async () => {
      await expect(breaker.execute(async () => "success")).rejects.toThrow(
        CircuitOpenError
      );
    });

    it("returns fallback when OPEN and fallback provided", async () => {
      const result = await breaker.execute(
        async () => "success",
        "fallback"
      );
      expect(result).toBe("fallback");
    });

    it("calls fallback function when provided", async () => {
      const result = await breaker.execute(
        async () => "success",
        () => "fallback-fn"
      );
      expect(result).toBe("fallback-fn");
    });
  });

  describe("HALF_OPEN State", () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {}
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    it("transitions to HALF_OPEN after reset timeout", async () => {
      // The next call should be allowed (transitioning to HALF_OPEN)
      await breaker.execute(async () => "success");
      // After success, check we're moving toward CLOSED
      expect(breaker.getStats().successCount).toBe(1);
    });

    it("closes circuit after success threshold in HALF_OPEN", async () => {
      // Success should transition through HALF_OPEN to CLOSED
      await breaker.execute(async () => "success");
      await breaker.execute(async () => "success");

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("re-opens circuit on failure in HALF_OPEN", async () => {
      // First call puts us in HALF_OPEN
      try {
        await breaker.execute(async () => {
          throw new Error("fail in half-open");
        });
      } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("Reset", () => {
    it("resets circuit to CLOSED state", async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().failureCount).toBe(0);
    });
  });

  describe("State Change Callback", () => {
    it("calls onStateChange when state changes", async () => {
      const onStateChange = vi.fn();
      const breakerWithCallback = new CircuitBreaker({
        name: "callback-test",
        failureThreshold: 2,
        resetTimeout: 100,
        successThreshold: 1,
        onStateChange,
      });

      // Trigger state change to OPEN
      for (let i = 0; i < 2; i++) {
        try {
          await breakerWithCallback.execute(async () => {
            throw new Error("fail");
          });
        } catch {}
      }

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.CLOSED,
        CircuitState.OPEN
      );
    });
  });

  describe("CircuitOpenError", () => {
    it("contains circuit name", () => {
      const error = new CircuitOpenError("test error", "my-circuit");
      expect(error.circuitName).toBe("my-circuit");
      expect(error.name).toBe("CircuitOpenError");
    });
  });

  describe("createDatabaseCircuitBreaker", () => {
    it("creates a circuit breaker with database defaults", () => {
      const dbBreaker = createDatabaseCircuitBreaker("test-db");
      expect(dbBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});
