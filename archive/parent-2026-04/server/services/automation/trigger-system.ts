/**
 * @file trigger-system.ts
 * @description Trigger system for automation workflows.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Cron scheduling with timezone support
 * - Webhook receivers with HMAC validation
 * - Event bus integration
 * - API triggers with authentication
 * - Rate limiting and debouncing
 */

import { randomUUID } from "crypto";
import { createHmac } from "crypto";
import { z } from "zod";
import type {
  Trigger,
  TriggerType,
  TriggerCondition,
  ConditionOperator,
  CronTrigger,
  IntervalTrigger,
  WebhookTrigger,
  EventTrigger,
  ApiTrigger,
  ManualTrigger,
  FileChangeTrigger,
  CrossSiteTrigger,
  ConditionTrigger,
  RateLimitConfig,
  WorkflowId,
  TriggerId,
  SiteId,
} from "./types";

// ==================== Cron Parser ====================

/**
 * Cron field definition.
 */
interface CronField {
  min: number;
  max: number;
  name: string;
}

const CRON_FIELDS: CronField[] = [
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day" },
  { min: 1, max: 12, name: "month" },
  { min: 0, max: 6, name: "weekday" },
];

/**
 * Parsed cron schedule.
 */
export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
}

/**
 * Parses a cron expression into sets of valid values.
 */
export function parseCronExpression(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);

  if (parts.length < 5 || parts.length > 6) {
    throw new Error(`Invalid cron expression: expected 5-6 fields, got ${parts.length}`);
  }

  // Handle optional seconds field by ignoring it
  const fields = parts.length === 6 ? parts.slice(1) : parts;

  const parseField = (value: string, field: CronField): Set<number> => {
    const result = new Set<number>();

    // Handle */n (every n)
    if (value.startsWith("*/")) {
      const step = parseInt(value.slice(2), 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid step value in ${field.name}: ${value}`);
      }
      for (let i = field.min; i <= field.max; i += step) {
        result.add(i);
      }
      return result;
    }

    // Handle * (all values)
    if (value === "*") {
      for (let i = field.min; i <= field.max; i++) {
        result.add(i);
      }
      return result;
    }

    // Handle comma-separated values and ranges
    const ranges = value.split(",");
    for (const range of ranges) {
      if (range.includes("-")) {
        const [start, end] = range.split("-").map((n) => parseInt(n, 10));
        if (isNaN(start) || isNaN(end) || start > end) {
          throw new Error(`Invalid range in ${field.name}: ${range}`);
        }
        for (let i = start; i <= end; i++) {
          if (i >= field.min && i <= field.max) {
            result.add(i);
          }
        }
      } else {
        const num = parseInt(range, 10);
        if (isNaN(num) || num < field.min || num > field.max) {
          throw new Error(`Invalid value in ${field.name}: ${range}`);
        }
        result.add(num);
      }
    }

    return result;
  };

  return {
    minutes: parseField(fields[0], CRON_FIELDS[0]),
    hours: parseField(fields[1], CRON_FIELDS[1]),
    days: parseField(fields[2], CRON_FIELDS[2]),
    months: parseField(fields[3], CRON_FIELDS[3]),
    weekdays: parseField(fields[4], CRON_FIELDS[4]),
  };
}

/**
 * Gets the next execution time for a cron schedule.
 */
export function getNextCronExecution(
  parsed: ParsedCron,
  after: Date = new Date(),
  timezone: string = "UTC"
): Date | null {
  // Convert to timezone
  const date = new Date(after.toLocaleString("en-US", { timeZone: timezone }));

  // Start from next minute
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60; // ~1 year of minutes

  for (let i = 0; i < maxIterations; i++) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = date.getDay();
    const hour = date.getHours();
    const minute = date.getMinutes();

    if (
      parsed.months.has(month) &&
      parsed.days.has(day) &&
      parsed.weekdays.has(weekday) &&
      parsed.hours.has(hour) &&
      parsed.minutes.has(minute)
    ) {
      return date;
    }

    date.setMinutes(date.getMinutes() + 1);
  }

  return null; // No next execution found within a year
}

/**
 * Human-readable cron description.
 */
export function describeCron(expression: string): string {
  try {
    const parsed = parseCronExpression(expression);
    const parts: string[] = [];

    // Minutes
    if (parsed.minutes.size === 60) {
      parts.push("every minute");
    } else if (parsed.minutes.size === 1) {
      const minute = Array.from(parsed.minutes)[0];
      parts.push(`at minute ${minute}`);
    } else {
      parts.push(`at minutes ${Array.from(parsed.minutes).sort((a, b) => a - b).join(", ")}`);
    }

    // Hours
    if (parsed.hours.size === 24) {
      parts.push("every hour");
    } else if (parsed.hours.size === 1) {
      const hour = Array.from(parsed.hours)[0];
      parts.push(`at ${hour}:00`);
    } else {
      parts.push(`at hours ${Array.from(parsed.hours).sort((a, b) => a - b).join(", ")}`);
    }

    // Days
    if (parsed.days.size < 31) {
      parts.push(`on day(s) ${Array.from(parsed.days).sort((a, b) => a - b).join(", ")}`);
    }

    // Months
    if (parsed.months.size < 12) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const months = Array.from(parsed.months).sort((a, b) => a - b).map((m) => monthNames[m - 1]);
      parts.push(`in ${months.join(", ")}`);
    }

    // Weekdays
    if (parsed.weekdays.size < 7) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = Array.from(parsed.weekdays).sort((a, b) => a - b).map((d) => dayNames[d]);
      parts.push(`on ${days.join(", ")}`);
    }

    return parts.join(", ");
  } catch {
    return "Invalid cron expression";
  }
}

// ==================== Rate Limiter ====================

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(private config: RateLimitConfig) {}

  /**
   * Checks if request is allowed under rate limit.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const bucket = this.tokens.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Reset bucket
      this.tokens.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });
      return true;
    }

    if (bucket.count >= this.config.maxRequests) {
      return false;
    }

    bucket.count++;
    return true;
  }

  /**
   * Gets remaining requests for a key.
   */
  getRemaining(key: string): number {
    const bucket = this.tokens.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) {
      return this.config.maxRequests;
    }
    return Math.max(0, this.config.maxRequests - bucket.count);
  }

  /**
   * Gets time until rate limit resets.
   */
  getResetTime(key: string): number {
    const bucket = this.tokens.get(key);
    if (!bucket) return 0;
    return Math.max(0, bucket.resetAt - Date.now());
  }

  /**
   * Clears expired buckets.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.tokens) {
      if (now >= bucket.resetAt) {
        this.tokens.delete(key);
      }
    }
  }
}

// ==================== Debouncer ====================

/**
 * Debouncer for trigger events.
 */
export class TriggerDebouncer {
  private pending: Map<string, NodeJS.Timeout> = new Map();
  private lastData: Map<string, unknown> = new Map();

  /**
   * Debounces a trigger event.
   */
  debounce(
    key: string,
    data: unknown,
    delayMs: number,
    callback: (data: unknown) => void
  ): void {
    // Cancel existing timeout
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Store latest data
    this.lastData.set(key, data);

    // Set new timeout
    const timeout = setTimeout(() => {
      const finalData = this.lastData.get(key);
      this.pending.delete(key);
      this.lastData.delete(key);
      callback(finalData);
    }, delayMs);

    this.pending.set(key, timeout);
  }

  /**
   * Cancels a pending debounce.
   */
  cancel(key: string): void {
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing);
      this.pending.delete(key);
      this.lastData.delete(key);
    }
  }

  /**
   * Clears all pending debounces.
   */
  clear(): void {
    for (const timeout of this.pending.values()) {
      clearTimeout(timeout);
    }
    this.pending.clear();
    this.lastData.clear();
  }
}

// ==================== Condition Evaluator ====================

/**
 * Evaluates trigger conditions against data.
 */
export class ConditionEvaluator {
  /**
   * Evaluates a single condition.
   */
  evaluateCondition(condition: TriggerCondition, data: unknown): boolean {
    const value = this.getFieldValue(condition.field, data);
    const targetValue = condition.value;

    switch (condition.operator) {
      case "eq" as ConditionOperator:
        return this.equals(value, targetValue, condition.caseSensitive);

      case "neq" as ConditionOperator:
        return !this.equals(value, targetValue, condition.caseSensitive);

      case "gt" as ConditionOperator:
        return this.compare(value, targetValue) > 0;

      case "gte" as ConditionOperator:
        return this.compare(value, targetValue) >= 0;

      case "lt" as ConditionOperator:
        return this.compare(value, targetValue) < 0;

      case "lte" as ConditionOperator:
        return this.compare(value, targetValue) <= 0;

      case "contains" as ConditionOperator:
        return this.contains(value, targetValue, condition.caseSensitive);

      case "not_contains" as ConditionOperator:
        return !this.contains(value, targetValue, condition.caseSensitive);

      case "starts_with" as ConditionOperator:
        return this.startsWith(value, targetValue, condition.caseSensitive);

      case "ends_with" as ConditionOperator:
        return this.endsWith(value, targetValue, condition.caseSensitive);

      case "matches" as ConditionOperator:
        return this.matches(value, targetValue as string);

      case "in" as ConditionOperator:
        return this.isIn(value, targetValue);

      case "not_in" as ConditionOperator:
        return !this.isIn(value, targetValue);

      case "is_null" as ConditionOperator:
        return value === null || value === undefined;

      case "is_not_null" as ConditionOperator:
        return value !== null && value !== undefined;

      case "is_empty" as ConditionOperator:
        return this.isEmpty(value);

      case "is_not_empty" as ConditionOperator:
        return !this.isEmpty(value);

      default:
        return false;
    }
  }

  /**
   * Evaluates multiple conditions with AND logic.
   */
  evaluateAll(conditions: TriggerCondition[], data: unknown): boolean {
    return conditions.every((c) => this.evaluateCondition(c, data));
  }

  /**
   * Evaluates multiple conditions with OR logic.
   */
  evaluateAny(conditions: TriggerCondition[], data: unknown): boolean {
    return conditions.some((c) => this.evaluateCondition(c, data));
  }

  /**
   * Gets a nested field value using dot notation.
   */
  private getFieldValue(field: string, data: unknown): unknown {
    if (data === null || data === undefined) return undefined;

    const parts = field.split(".");
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private equals(a: unknown, b: unknown, caseSensitive = true): boolean {
    if (typeof a === "string" && typeof b === "string" && !caseSensitive) {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }

  private compare(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    if (typeof a === "string" && typeof b === "string") {
      return a.localeCompare(b);
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    return 0;
  }

  private contains(value: unknown, search: unknown, caseSensitive = true): boolean {
    if (typeof value === "string" && typeof search === "string") {
      if (!caseSensitive) {
        return value.toLowerCase().includes(search.toLowerCase());
      }
      return value.includes(search);
    }
    if (Array.isArray(value)) {
      return value.includes(search);
    }
    return false;
  }

  private startsWith(value: unknown, prefix: unknown, caseSensitive = true): boolean {
    if (typeof value === "string" && typeof prefix === "string") {
      if (!caseSensitive) {
        return value.toLowerCase().startsWith(prefix.toLowerCase());
      }
      return value.startsWith(prefix);
    }
    return false;
  }

  private endsWith(value: unknown, suffix: unknown, caseSensitive = true): boolean {
    if (typeof value === "string" && typeof suffix === "string") {
      if (!caseSensitive) {
        return value.toLowerCase().endsWith(suffix.toLowerCase());
      }
      return value.endsWith(suffix);
    }
    return false;
  }

  private matches(value: unknown, pattern: string): boolean {
    if (typeof value !== "string") return false;
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      return false;
    }
  }

  private isIn(value: unknown, collection: unknown): boolean {
    if (Array.isArray(collection)) {
      return collection.includes(value);
    }
    return false;
  }

  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  }
}

// ==================== Webhook Validator ====================

/**
 * Validates webhook HMAC signatures.
 */
export class WebhookValidator {
  /**
   * Validates an HMAC signature.
   */
  validateHmac(
    payload: string | Buffer,
    signature: string,
    secret: string,
    algorithm: "sha256" | "sha512" = "sha256"
  ): boolean {
    const expectedSignature = createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Validates IP against whitelist.
   */
  validateIp(ip: string, whitelist: string[]): boolean {
    // Direct match
    if (whitelist.includes(ip)) return true;

    // CIDR matching (simplified)
    for (const allowed of whitelist) {
      if (allowed.includes("/")) {
        if (this.isIpInCidr(ip, allowed)) return true;
      }
    }

    return false;
  }

  /**
   * Checks if IP is in CIDR range (simplified IPv4 only).
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split("/");
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);

    return (ipNum & mask) === (rangeNum & mask);
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  }
}

// ==================== Trigger Registry ====================

/**
 * Trigger registration entry.
 */
export interface TriggerRegistration {
  trigger: Trigger;
  workflowId: WorkflowId;
  siteId: SiteId;
  enabled: boolean;
  lastFired?: Date;
  fireCount: number;
}

/**
 * Trigger event data.
 */
export interface TriggerEvent {
  triggerId: TriggerId;
  workflowId: WorkflowId;
  type: TriggerType;
  data: unknown;
  timestamp: Date;
  siteId: SiteId;
  metadata?: Record<string, unknown>;
}

/**
 * Trigger event handler type.
 */
export type TriggerEventHandler = (event: TriggerEvent) => Promise<void>;

/**
 * Trigger registry manages all trigger registrations.
 */
export class TriggerRegistry {
  private triggers: Map<TriggerId, TriggerRegistration> = new Map();
  private workflowTriggers: Map<WorkflowId, Set<TriggerId>> = new Map();
  private handlers: Set<TriggerEventHandler> = new Set();

  private cronScheduler: CronScheduler;
  private intervalScheduler: IntervalScheduler;
  private rateLimiters: Map<TriggerId, RateLimiter> = new Map();
  private debouncer: TriggerDebouncer;
  private conditionEvaluator: ConditionEvaluator;
  private webhookValidator: WebhookValidator;

  constructor() {
    this.cronScheduler = new CronScheduler(this.handleCronFire.bind(this));
    this.intervalScheduler = new IntervalScheduler(this.handleIntervalFire.bind(this));
    this.debouncer = new TriggerDebouncer();
    this.conditionEvaluator = new ConditionEvaluator();
    this.webhookValidator = new WebhookValidator();
  }

  /**
   * Registers a trigger for a workflow.
   */
  register(
    trigger: Trigger,
    workflowId: WorkflowId,
    siteId: SiteId
  ): TriggerRegistration {
    const registration: TriggerRegistration = {
      trigger,
      workflowId,
      siteId,
      enabled: trigger.enabled,
      fireCount: 0,
    };

    this.triggers.set(trigger.id, registration);

    // Track workflow triggers
    let workflowSet = this.workflowTriggers.get(workflowId);
    if (!workflowSet) {
      workflowSet = new Set();
      this.workflowTriggers.set(workflowId, workflowSet);
    }
    workflowSet.add(trigger.id);

    // Set up rate limiter if configured
    if (trigger.rateLimit) {
      this.rateLimiters.set(trigger.id, new RateLimiter(trigger.rateLimit));
    }

    // Start scheduler for time-based triggers
    if (trigger.enabled) {
      this.activateTrigger(registration);
    }

    return registration;
  }

  /**
   * Unregisters a trigger.
   */
  unregister(triggerId: TriggerId): boolean {
    const registration = this.triggers.get(triggerId);
    if (!registration) return false;

    // Deactivate scheduler
    this.deactivateTrigger(registration);

    // Remove from maps
    this.triggers.delete(triggerId);
    this.rateLimiters.delete(triggerId);

    const workflowSet = this.workflowTriggers.get(registration.workflowId);
    if (workflowSet) {
      workflowSet.delete(triggerId);
    }

    return true;
  }

  /**
   * Unregisters all triggers for a workflow.
   */
  unregisterWorkflow(workflowId: WorkflowId): number {
    const triggerIds = this.workflowTriggers.get(workflowId);
    if (!triggerIds) return 0;

    let count = 0;
    for (const triggerId of triggerIds) {
      if (this.unregister(triggerId)) count++;
    }

    this.workflowTriggers.delete(workflowId);
    return count;
  }

  /**
   * Enables or disables a trigger.
   */
  setEnabled(triggerId: TriggerId, enabled: boolean): boolean {
    const registration = this.triggers.get(triggerId);
    if (!registration) return false;

    if (registration.enabled === enabled) return true;

    registration.enabled = enabled;
    registration.trigger.enabled = enabled;

    if (enabled) {
      this.activateTrigger(registration);
    } else {
      this.deactivateTrigger(registration);
    }

    return true;
  }

  /**
   * Adds an event handler.
   */
  addHandler(handler: TriggerEventHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Removes an event handler.
   */
  removeHandler(handler: TriggerEventHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Handles incoming webhook request.
   */
  async handleWebhook(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    ip: string
  ): Promise<{ matched: boolean; triggerId?: TriggerId; error?: string }> {
    // Find matching webhook trigger
    for (const [triggerId, registration] of this.triggers) {
      if (!registration.enabled) continue;

      const trigger = registration.trigger;
      if (trigger.type !== "webhook") continue;

      const webhookTrigger = trigger as WebhookTrigger;

      // Check path match
      if (webhookTrigger.path !== path) continue;

      // Check method
      if (!webhookTrigger.methods.includes(method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH")) {
        continue;
      }

      // Check IP whitelist
      if (webhookTrigger.ipWhitelist && webhookTrigger.ipWhitelist.length > 0) {
        if (!this.webhookValidator.validateIp(ip, webhookTrigger.ipWhitelist)) {
          return { matched: true, triggerId, error: "IP not in whitelist" };
        }
      }

      // Check HMAC signature
      if (webhookTrigger.secret && webhookTrigger.signatureHeader) {
        const signature = headers[webhookTrigger.signatureHeader.toLowerCase()];
        if (!signature) {
          return { matched: true, triggerId, error: "Missing signature header" };
        }

        const payload = typeof body === "string" ? body : JSON.stringify(body);
        const valid = this.webhookValidator.validateHmac(
          payload,
          signature,
          webhookTrigger.secret,
          webhookTrigger.hmacAlgorithm
        );

        if (!valid) {
          return { matched: true, triggerId, error: "Invalid signature" };
        }
      }

      // Check rate limit
      if (!this.checkRateLimit(triggerId)) {
        return { matched: true, triggerId, error: "Rate limit exceeded" };
      }

      // Check conditions
      if (webhookTrigger.conditions && webhookTrigger.conditions.length > 0) {
        if (!this.conditionEvaluator.evaluateAll(webhookTrigger.conditions, body)) {
          return { matched: true, triggerId, error: "Conditions not met" };
        }
      }

      // Validate request schema
      if (webhookTrigger.requestSchema) {
        const result = webhookTrigger.requestSchema.safeParse(body);
        if (!result.success) {
          return { matched: true, triggerId, error: `Schema validation failed: ${result.error.message}` };
        }
      }

      // Fire trigger
      await this.fireTrigger(registration, {
        method,
        headers,
        body,
        ip,
        path,
      });

      return { matched: true, triggerId };
    }

    return { matched: false };
  }

  /**
   * Handles CMS event.
   */
  async handleEvent(
    eventType: string,
    entityType: string,
    entityId: string,
    data: unknown
  ): Promise<TriggerId[]> {
    const firedTriggers: TriggerId[] = [];

    for (const [triggerId, registration] of this.triggers) {
      if (!registration.enabled) continue;

      const trigger = registration.trigger;
      if (trigger.type !== "event") continue;

      const eventTrigger = trigger as EventTrigger;

      // Check event type match
      if (!eventTrigger.eventTypes.includes(eventType) &&
          !eventTrigger.eventTypes.includes("*")) {
        continue;
      }

      // Check entity type filter
      if (eventTrigger.entityTypes && eventTrigger.entityTypes.length > 0) {
        if (!eventTrigger.entityTypes.includes(entityType)) continue;
      }

      // Check entity ID pattern
      if (eventTrigger.entityIdPattern) {
        const pattern = new RegExp(eventTrigger.entityIdPattern);
        if (!pattern.test(entityId)) continue;
      }

      // Check rate limit
      if (!this.checkRateLimit(triggerId)) continue;

      // Check conditions
      if (eventTrigger.conditions && eventTrigger.conditions.length > 0) {
        if (!this.conditionEvaluator.evaluateAll(eventTrigger.conditions, data)) {
          continue;
        }
      }

      // Handle debounce
      if (eventTrigger.debounce && eventTrigger.debounce > 0) {
        this.debouncer.debounce(
          `${triggerId}:${entityId}`,
          { eventType, entityType, entityId, data },
          eventTrigger.debounce,
          async (finalData) => {
            await this.fireTrigger(registration, finalData);
          }
        );
      } else {
        await this.fireTrigger(registration, { eventType, entityType, entityId, data });
      }

      firedTriggers.push(triggerId);
    }

    return firedTriggers;
  }

  /**
   * Manually fires a trigger.
   */
  async fireManual(
    triggerId: TriggerId,
    input: unknown,
    userId: string
  ): Promise<boolean> {
    const registration = this.triggers.get(triggerId);
    if (!registration) return false;

    const trigger = registration.trigger;
    if (trigger.type !== "manual") return false;

    const manualTrigger = trigger as ManualTrigger;

    // Validate input against form schema
    if (manualTrigger.inputForm && manualTrigger.inputForm.length > 0) {
      for (const field of manualTrigger.inputForm) {
        if (field.required && field.validation) {
          const value = (input as Record<string, unknown>)?.[field.name];
          const result = field.validation.safeParse(value);
          if (!result.success) {
            throw new Error(`Validation failed for field ${field.name}: ${result.error.message}`);
          }
        }
      }
    }

    await this.fireTrigger(registration, { input, triggeredBy: userId });
    return true;
  }

  /**
   * Gets all triggers for a workflow.
   */
  getWorkflowTriggers(workflowId: WorkflowId): TriggerRegistration[] {
    const triggerIds = this.workflowTriggers.get(workflowId);
    if (!triggerIds) return [];

    return Array.from(triggerIds)
      .map((id) => this.triggers.get(id))
      .filter((t): t is TriggerRegistration => t !== undefined);
  }

  /**
   * Gets a trigger by ID.
   */
  getTrigger(triggerId: TriggerId): TriggerRegistration | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * Starts all time-based schedulers.
   */
  start(): void {
    this.cronScheduler.start();
    this.intervalScheduler.start();
  }

  /**
   * Stops all schedulers.
   */
  stop(): void {
    this.cronScheduler.stop();
    this.intervalScheduler.stop();
    this.debouncer.clear();
  }

  /**
   * Activates a trigger's scheduler.
   */
  private activateTrigger(registration: TriggerRegistration): void {
    const trigger = registration.trigger;

    switch (trigger.type) {
      case "cron":
        this.cronScheduler.schedule(trigger.id, (trigger as CronTrigger).expression, (trigger as CronTrigger).timezone);
        break;
      case "interval":
        this.intervalScheduler.schedule(trigger.id, (trigger as IntervalTrigger).intervalMs);
        break;
    }
  }

  /**
   * Deactivates a trigger's scheduler.
   */
  private deactivateTrigger(registration: TriggerRegistration): void {
    const trigger = registration.trigger;

    switch (trigger.type) {
      case "cron":
        this.cronScheduler.unschedule(trigger.id);
        break;
      case "interval":
        this.intervalScheduler.unschedule(trigger.id);
        break;
    }
  }

  /**
   * Fires a trigger event.
   */
  private async fireTrigger(registration: TriggerRegistration, data: unknown): Promise<void> {
    registration.lastFired = new Date();
    registration.fireCount++;

    const event: TriggerEvent = {
      triggerId: registration.trigger.id,
      workflowId: registration.workflowId,
      type: registration.trigger.type as TriggerType,
      data,
      timestamp: new Date(),
      siteId: registration.siteId,
    };

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Trigger handler error: ${error}`);
      }
    }
  }

  /**
   * Handles cron scheduler fire.
   */
  private async handleCronFire(triggerId: TriggerId): Promise<void> {
    const registration = this.triggers.get(triggerId);
    if (!registration || !registration.enabled) return;

    await this.fireTrigger(registration, { scheduledAt: new Date() });
  }

  /**
   * Handles interval scheduler fire.
   */
  private async handleIntervalFire(triggerId: TriggerId): Promise<void> {
    const registration = this.triggers.get(triggerId);
    if (!registration || !registration.enabled) return;

    await this.fireTrigger(registration, { scheduledAt: new Date() });
  }

  /**
   * Checks rate limit for a trigger.
   */
  private checkRateLimit(triggerId: TriggerId): boolean {
    const limiter = this.rateLimiters.get(triggerId);
    if (!limiter) return true;
    return limiter.isAllowed(triggerId);
  }
}

// ==================== Cron Scheduler ====================

/**
 * Cron scheduler manages cron-based triggers.
 */
class CronScheduler {
  private schedules: Map<TriggerId, { parsed: ParsedCron; timezone: string; timer?: NodeJS.Timeout }> = new Map();
  private running: boolean = false;
  private checkInterval?: NodeJS.Timeout;

  constructor(private onFire: (triggerId: TriggerId) => Promise<void>) {}

  /**
   * Schedules a cron trigger.
   */
  schedule(triggerId: TriggerId, expression: string, timezone: string): void {
    const parsed = parseCronExpression(expression);
    this.schedules.set(triggerId, { parsed, timezone });

    if (this.running) {
      this.scheduleNext(triggerId);
    }
  }

  /**
   * Unschedules a cron trigger.
   */
  unschedule(triggerId: TriggerId): void {
    const schedule = this.schedules.get(triggerId);
    if (schedule?.timer) {
      clearTimeout(schedule.timer);
    }
    this.schedules.delete(triggerId);
  }

  /**
   * Starts the scheduler.
   */
  start(): void {
    this.running = true;

    // Schedule all existing triggers
    for (const triggerId of this.schedules.keys()) {
      this.scheduleNext(triggerId);
    }

    // Check every minute for missed schedules
    this.checkInterval = setInterval(() => {
      for (const triggerId of this.schedules.keys()) {
        const schedule = this.schedules.get(triggerId);
        if (schedule && !schedule.timer) {
          this.scheduleNext(triggerId);
        }
      }
    }, 60000);
  }

  /**
   * Stops the scheduler.
   */
  stop(): void {
    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    for (const schedule of this.schedules.values()) {
      if (schedule.timer) {
        clearTimeout(schedule.timer);
        schedule.timer = undefined;
      }
    }
  }

  /**
   * Schedules the next execution for a trigger.
   */
  private scheduleNext(triggerId: TriggerId): void {
    const schedule = this.schedules.get(triggerId);
    if (!schedule || !this.running) return;

    const nextExecution = getNextCronExecution(schedule.parsed, new Date(), schedule.timezone);
    if (!nextExecution) return;

    const delay = nextExecution.getTime() - Date.now();
    if (delay < 0) return;

    schedule.timer = setTimeout(async () => {
      schedule.timer = undefined;
      await this.onFire(triggerId);
      this.scheduleNext(triggerId);
    }, delay);
  }
}

// ==================== Interval Scheduler ====================

/**
 * Interval scheduler manages interval-based triggers.
 */
class IntervalScheduler {
  private intervals: Map<TriggerId, { intervalMs: number; timer?: NodeJS.Timeout }> = new Map();
  private running: boolean = false;

  constructor(private onFire: (triggerId: TriggerId) => Promise<void>) {}

  /**
   * Schedules an interval trigger.
   */
  schedule(triggerId: TriggerId, intervalMs: number): void {
    this.intervals.set(triggerId, { intervalMs });

    if (this.running) {
      this.startInterval(triggerId);
    }
  }

  /**
   * Unschedules an interval trigger.
   */
  unschedule(triggerId: TriggerId): void {
    const interval = this.intervals.get(triggerId);
    if (interval?.timer) {
      clearInterval(interval.timer);
    }
    this.intervals.delete(triggerId);
  }

  /**
   * Starts the scheduler.
   */
  start(): void {
    this.running = true;

    for (const triggerId of this.intervals.keys()) {
      this.startInterval(triggerId);
    }
  }

  /**
   * Stops the scheduler.
   */
  stop(): void {
    this.running = false;

    for (const interval of this.intervals.values()) {
      if (interval.timer) {
        clearInterval(interval.timer);
        interval.timer = undefined;
      }
    }
  }

  /**
   * Starts interval for a trigger.
   */
  private startInterval(triggerId: TriggerId): void {
    const interval = this.intervals.get(triggerId);
    if (!interval || !this.running) return;

    interval.timer = setInterval(async () => {
      await this.onFire(triggerId);
    }, interval.intervalMs);
  }
}

// ==================== Factory Functions ====================

/**
 * Creates a cron trigger.
 */
export function createCronTrigger(
  config: Omit<CronTrigger, "id" | "type">
): CronTrigger {
  return {
    id: randomUUID(),
    type: "cron" as TriggerType.CRON,
    ...config,
  };
}

/**
 * Creates a webhook trigger.
 */
export function createWebhookTrigger(
  config: Omit<WebhookTrigger, "id" | "type">
): WebhookTrigger {
  return {
    id: randomUUID(),
    type: "webhook" as TriggerType.WEBHOOK,
    ...config,
  };
}

/**
 * Creates an event trigger.
 */
export function createEventTrigger(
  config: Omit<EventTrigger, "id" | "type">
): EventTrigger {
  return {
    id: randomUUID(),
    type: "event" as TriggerType.EVENT,
    ...config,
  };
}

/**
 * Creates a manual trigger.
 */
export function createManualTrigger(
  config: Omit<ManualTrigger, "id" | "type">
): ManualTrigger {
  return {
    id: randomUUID(),
    type: "manual" as TriggerType.MANUAL,
    ...config,
  };
}

/**
 * Creates an interval trigger.
 */
export function createIntervalTrigger(
  config: Omit<IntervalTrigger, "id" | "type">
): IntervalTrigger {
  return {
    id: randomUUID(),
    type: "interval" as TriggerType.INTERVAL,
    ...config,
  };
}

// ==================== Singleton Instance ====================

let triggerRegistryInstance: TriggerRegistry | null = null;

/**
 * Gets the trigger registry instance.
 */
export function getTriggerRegistry(): TriggerRegistry {
  if (!triggerRegistryInstance) {
    triggerRegistryInstance = new TriggerRegistry();
  }
  return triggerRegistryInstance;
}

/**
 * Resets the trigger registry (for testing).
 */
export function resetTriggerRegistry(): void {
  if (triggerRegistryInstance) {
    triggerRegistryInstance.stop();
    triggerRegistryInstance = null;
  }
}
