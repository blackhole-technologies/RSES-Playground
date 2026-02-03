/**
 * @file audit-service.ts
 * @description Comprehensive audit logging service
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Provides immutable audit trail for all system operations.
 * Supports async logging to prevent blocking request handlers.
 */

import { db } from "../../db";
import { auditLogs, type AuditLog, type InsertAuditLog, type EventCategory, type AuditOutcome, type ActorType } from "../../../shared/rbac-schema";
import { eq, and, gte, lte, desc, sql, or, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { safeLikePattern } from "../../lib/sql-utils";

// ============================================================================
// Types
// ============================================================================

export interface AuditContext {
  // Actor info
  actorId?: number;
  actorType: ActorType;
  actorIp?: string;
  actorUserAgent?: string;

  // Request context
  sessionId?: string;
  requestId?: string;

  // Site context
  siteId?: string;
}

export interface AuditEventOptions {
  eventType: string;
  eventCategory: EventCategory;
  action: string;
  outcome: AuditOutcome;

  // Resource being acted upon
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;

  // Change tracking
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;

  // Additional context
  metadata?: Record<string, unknown>;

  // Error info (for failures)
  errorCode?: string;
  errorMessage?: string;
}

export interface AuditQueryOptions {
  // Filters
  eventType?: string;
  eventCategory?: EventCategory;
  actorId?: number;
  resourceType?: string;
  resourceId?: string;
  siteId?: string;
  outcome?: AuditOutcome;
  action?: string;

  // Date range
  startDate?: Date;
  endDate?: Date;

  // Search
  searchTerm?: string;

  // Pagination
  limit?: number;
  offset?: number;

  // Sorting
  sortBy?: "timestamp" | "eventType" | "action";
  sortOrder?: "asc" | "desc";
}

export interface AuditQueryResult {
  entries: AuditLog[];
  total: number;
  hasMore: boolean;
}

export interface AuditStats {
  totalEvents: number;
  byCategory: Record<string, number>;
  byOutcome: Record<string, number>;
  byAction: Record<string, number>;
  recentFailures: number;
  topActors: Array<{ actorId: number; count: number }>;
}

// ============================================================================
// Audit Service
// ============================================================================

class AuditService {
  private queue: InsertAuditLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  /**
   * Log an audit event asynchronously.
   * Events are batched for performance.
   */
  async log(context: AuditContext, options: AuditEventOptions): Promise<string> {
    const eventId = randomUUID();

    // Compute changes if both previous and new state provided
    let changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> | undefined;
    if (options.previousState && options.newState) {
      changes = this.computeChanges(options.previousState, options.newState);
    }

    const entry: InsertAuditLog = {
      eventId,
      eventType: options.eventType,
      eventCategory: options.eventCategory,
      actorId: context.actorId,
      actorType: context.actorType,
      actorIp: context.actorIp,
      actorUserAgent: context.actorUserAgent,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      resourceName: options.resourceName,
      siteId: context.siteId,
      action: options.action,
      outcome: options.outcome,
      previousState: options.previousState,
      newState: this.maskSensitiveData(options.newState),
      changes,
      metadata: options.metadata,
      sessionId: context.sessionId,
      requestId: context.requestId,
      errorCode: options.errorCode,
      errorMessage: options.errorMessage,
      sensitiveDataMasked: Boolean(options.newState),
      timestamp: new Date(),
    };

    this.queue.push(entry);
    this.scheduleFlush();

    return eventId;
  }

  /**
   * Log an audit event synchronously (for critical events).
   */
  async logSync(context: AuditContext, options: AuditEventOptions): Promise<string> {
    const eventId = randomUUID();

    let changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> | undefined;
    if (options.previousState && options.newState) {
      changes = this.computeChanges(options.previousState, options.newState);
    }

    await db.insert(auditLogs).values({
      eventId,
      eventType: options.eventType,
      eventCategory: options.eventCategory,
      actorId: context.actorId,
      actorType: context.actorType,
      actorIp: context.actorIp,
      actorUserAgent: context.actorUserAgent,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      resourceName: options.resourceName,
      siteId: context.siteId,
      action: options.action,
      outcome: options.outcome,
      previousState: options.previousState,
      newState: this.maskSensitiveData(options.newState),
      changes,
      metadata: options.metadata,
      sessionId: context.sessionId,
      requestId: context.requestId,
      errorCode: options.errorCode,
      errorMessage: options.errorMessage,
      sensitiveDataMasked: Boolean(options.newState),
      timestamp: new Date(),
    });

    return eventId;
  }

  /**
   * Query audit logs with filters and pagination.
   */
  async query(options: AuditQueryOptions): Promise<AuditQueryResult> {
    const limit = Math.min(options.limit || 50, 1000);
    const offset = options.offset || 0;

    // Build conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (options.eventType) {
      conditions.push(eq(auditLogs.eventType, options.eventType));
    }
    if (options.eventCategory) {
      conditions.push(eq(auditLogs.eventCategory, options.eventCategory));
    }
    if (options.actorId) {
      conditions.push(eq(auditLogs.actorId, options.actorId));
    }
    if (options.resourceType) {
      conditions.push(eq(auditLogs.resourceType, options.resourceType));
    }
    if (options.resourceId) {
      conditions.push(eq(auditLogs.resourceId, options.resourceId));
    }
    if (options.siteId) {
      conditions.push(eq(auditLogs.siteId, options.siteId));
    }
    if (options.outcome) {
      conditions.push(eq(auditLogs.outcome, options.outcome));
    }
    if (options.action) {
      conditions.push(eq(auditLogs.action, options.action));
    }
    if (options.startDate) {
      conditions.push(gte(auditLogs.timestamp, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(auditLogs.timestamp, options.endDate));
    }
    if (options.searchTerm) {
      const searchPattern = safeLikePattern(options.searchTerm);
      conditions.push(
        or(
          like(auditLogs.eventType, searchPattern),
          like(auditLogs.resourceName || "", searchPattern)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    // Get entries
    const entries = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    return {
      entries,
      total,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get a single audit log entry by event ID.
   */
  async getByEventId(eventId: string): Promise<AuditLog | null> {
    const results = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventId, eventId))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Get audit statistics for a time period.
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<AuditStats> {
    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const end = endDate || new Date();

    const conditions = and(
      gte(auditLogs.timestamp, start),
      lte(auditLogs.timestamp, end)
    );

    // Total events
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(conditions);

    // By category
    const categoryResult = await db
      .select({
        category: auditLogs.eventCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(conditions)
      .groupBy(auditLogs.eventCategory);

    // By outcome
    const outcomeResult = await db
      .select({
        outcome: auditLogs.outcome,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(conditions)
      .groupBy(auditLogs.outcome);

    // By action
    const actionResult = await db
      .select({
        action: auditLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(conditions)
      .groupBy(auditLogs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Recent failures
    const failureResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          conditions,
          or(eq(auditLogs.outcome, "failure"), eq(auditLogs.outcome, "denied"))
        )
      );

    // Top actors
    const actorResult = await db
      .select({
        actorId: auditLogs.actorId,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(and(conditions, sql`${auditLogs.actorId} IS NOT NULL`))
      .groupBy(auditLogs.actorId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      totalEvents: totalResult[0]?.count || 0,
      byCategory: Object.fromEntries(categoryResult.map((r) => [r.category, r.count])),
      byOutcome: Object.fromEntries(outcomeResult.map((r) => [r.outcome, r.count])),
      byAction: Object.fromEntries(actionResult.map((r) => [r.action, r.count])),
      recentFailures: failureResult[0]?.count || 0,
      topActors: actorResult
        .filter((r) => r.actorId !== null)
        .map((r) => ({ actorId: r.actorId!, count: r.count })),
    };
  }

  /**
   * Get audit trail for a specific resource.
   */
  async getResourceHistory(
    resourceType: string,
    resourceId: string,
    limit = 100
  ): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceType, resourceType),
          eq(auditLogs.resourceId, resourceId)
        )
      )
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  /**
   * Get all activity for a specific user.
   */
  async getUserActivity(userId: number, limit = 100): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorId, userId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  /**
   * Flush queued audit events to database.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.BATCH_SIZE);

    try {
      await db.insert(auditLogs).values(batch);
    } catch (error) {
      // Re-queue failed entries for retry
      this.queue.unshift(...batch);
      console.error("[AuditService] Failed to flush audit logs:", error);
    }

    // Continue flushing if more in queue
    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  /**
   * Extract audit context from Express request.
   */
  contextFromRequest(req: Request): AuditContext {
    const user = (req as any).user;

    return {
      actorId: user?.id,
      actorType: user ? "user" : "system",
      actorIp: req.ip || req.socket?.remoteAddress,
      actorUserAgent: req.get("user-agent"),
      sessionId: (req as any).sessionID,
      requestId: req.get("x-request-id") || randomUUID(),
      siteId: req.get("x-site-id"),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      await this.flush();
    }, this.FLUSH_INTERVAL);
  }

  private computeChanges(
    prev: Record<string, unknown>,
    next: Record<string, unknown>
  ): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const key of allKeys) {
      const oldVal = prev[key];
      const newVal = next[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: key,
          oldValue: this.maskSensitiveField(key, oldVal),
          newValue: this.maskSensitiveField(key, newVal),
        });
      }
    }

    return changes;
  }

  private maskSensitiveData(
    data?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!data) return undefined;

    const masked = { ...data };
    const sensitiveFields = [
      "password",
      "passwordHash",
      "secret",
      "token",
      "apiKey",
      "accessToken",
      "refreshToken",
      "privateKey",
      "creditCard",
      "ssn",
    ];

    for (const field of sensitiveFields) {
      if (field in masked) {
        masked[field] = "[REDACTED]";
      }
    }

    return masked;
  }

  private maskSensitiveField(field: string, value: unknown): unknown {
    const sensitiveFields = [
      "password",
      "passwordHash",
      "secret",
      "token",
      "apiKey",
      "accessToken",
      "refreshToken",
      "privateKey",
      "creditCard",
      "ssn",
    ];

    if (sensitiveFields.some((f) => field.toLowerCase().includes(f.toLowerCase()))) {
      return "[REDACTED]";
    }

    return value;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const auditService = new AuditService();

// ============================================================================
// Helper Functions for Common Events
// ============================================================================

/**
 * Log authentication events.
 */
export async function logAuthEvent(
  context: AuditContext,
  action: "login" | "logout" | "register" | "password_change" | "password_reset" | "mfa_enable" | "mfa_disable",
  outcome: AuditOutcome,
  metadata?: Record<string, unknown>
): Promise<string> {
  return auditService.logSync(context, {
    eventType: `auth.${action}`,
    eventCategory: "auth",
    action,
    outcome,
    resourceType: "user",
    resourceId: context.actorId?.toString(),
    metadata,
  });
}

/**
 * Log data modification events.
 */
export async function logDataEvent(
  context: AuditContext,
  resourceType: string,
  resourceId: string,
  action: "create" | "update" | "delete",
  outcome: AuditOutcome,
  options?: {
    resourceName?: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  return auditService.log(context, {
    eventType: `${resourceType}.${action}`,
    eventCategory: "data",
    action,
    outcome,
    resourceType,
    resourceId,
    resourceName: options?.resourceName,
    previousState: options?.previousState,
    newState: options?.newState,
    metadata: options?.metadata,
  });
}

/**
 * Log admin actions.
 */
export async function logAdminEvent(
  context: AuditContext,
  action: string,
  resourceType: string,
  resourceId: string,
  outcome: AuditOutcome,
  metadata?: Record<string, unknown>
): Promise<string> {
  return auditService.logSync(context, {
    eventType: `admin.${action}`,
    eventCategory: "admin",
    action,
    outcome,
    resourceType,
    resourceId,
    metadata,
  });
}

/**
 * Log security events (access denied, suspicious activity, etc).
 */
export async function logSecurityEvent(
  context: AuditContext,
  action: string,
  outcome: AuditOutcome,
  metadata?: Record<string, unknown>
): Promise<string> {
  return auditService.logSync(context, {
    eventType: `security.${action}`,
    eventCategory: "security",
    action,
    outcome,
    metadata,
  });
}
