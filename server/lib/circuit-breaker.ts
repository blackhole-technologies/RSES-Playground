/**
 * @file circuit-breaker.ts
 * @description Circuit breaker pattern implementation for database resilience.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated SEC (Security Specialist Agent)
 * @created 2026-01-31
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests are rejected
 * - HALF_OPEN: Testing if the service has recovered
 */

import { dbLogger as log } from "../logger";

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Name for logging purposes */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before testing recovery */
  resetTimeout: number;
  /** Number of successful calls to close circuit from half-open */
  successThreshold: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Default circuit breaker configuration.
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  name: "default",
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
};

/**
 * Circuit breaker for protecting against cascading failures.
 *
 * @example
 * const breaker = new CircuitBreaker({ name: "database", failureThreshold: 5 });
 *
 * async function queryDatabase() {
 *   return breaker.execute(async () => {
 *     return db.query("SELECT 1");
 *   });
 * }
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets the current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime || null,
    };
  }

  /**
   * Executes an operation with circuit breaker protection.
   *
   * @param operation - Async operation to execute
   * @param fallback - Optional fallback value if circuit is open
   * @returns Result of operation or fallback
   * @throws CircuitOpenError if circuit is open and no fallback provided
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: T | (() => T)
  ): Promise<T> {
    // Check if we should attempt half-open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        log.warn(
          { circuit: this.config.name, state: this.state },
          "Circuit is open, rejecting request"
        );

        if (fallback !== undefined) {
          return typeof fallback === "function"
            ? (fallback as () => T)()
            : fallback;
        }

        throw new CircuitOpenError(
          `Circuit ${this.config.name} is open`,
          this.config.name
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  /**
   * Records a successful operation.
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  /**
   * Records a failed operation.
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    log.warn(
      {
        circuit: this.config.name,
        failureCount: this.failureCount,
        error: error.message,
      },
      "Circuit breaker recorded failure"
    );

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens the circuit
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Checks if enough time has passed to attempt recovery.
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  /**
   * Transitions to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    log.info(
      { circuit: this.config.name, from: oldState, to: newState },
      "Circuit breaker state change"
    );

    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState);
    }
  }

  /**
   * Resets the circuit breaker to closed state.
   * Use with caution - typically for testing or manual intervention.
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.transitionTo(CircuitState.CLOSED);
  }
}

/**
 * Error thrown when circuit is open.
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;

  constructor(message: string, circuitName: string) {
    super(message);
    this.name = "CircuitOpenError";
    this.circuitName = circuitName;
  }
}

/**
 * Creates a circuit breaker with database-optimized defaults.
 */
export function createDatabaseCircuitBreaker(
  name: string = "database"
): CircuitBreaker {
  return new CircuitBreaker({
    name,
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
    onStateChange: (from, to) => {
      if (to === CircuitState.OPEN) {
        log.error(
          { circuit: name },
          "Database circuit breaker opened - connections will be rejected"
        );
      } else if (to === CircuitState.CLOSED) {
        log.info(
          { circuit: name },
          "Database circuit breaker closed - normal operation resumed"
        );
      }
    },
  });
}
