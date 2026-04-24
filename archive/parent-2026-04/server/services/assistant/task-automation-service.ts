/**
 * @file task-automation-service.ts
 * @description Task Automation and Workflow Service for AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Task automation inspired by:
 * - Notion: Task and project management
 * - Todoist: Natural language task creation
 * - Zapier: Workflow automation
 * - IFTTT: Trigger-action patterns
 * - n8n: Open-source workflow automation
 *
 * Features:
 * - Natural language task parsing
 * - Automated workflow creation and execution
 * - Scheduled content publishing
 * - Reminder system with smart timing
 * - Follow-up tracking
 * - Dependency management
 * - Recurring task support
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  Task,
  Subtask,
  TaskReminder,
  TaskSource,
  Workflow,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowActionType,
  WorkflowCondition,
  WorkflowState,
  WorkflowActionResult,
  RecurrenceRule,
  ContentSchedule,
  ContentOperationType,
  ITaskService,
  TaskFilters,
  ExtractedEntity,
} from "./types";

const log = createModuleLogger("task-automation-service");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface TaskAutomationConfig {
  /** Maximum tasks per user */
  maxTasksPerUser: number;
  /** Maximum workflows per user */
  maxWorkflowsPerUser: number;
  /** Reminder check interval in ms */
  reminderCheckIntervalMs: number;
  /** Workflow execution timeout in ms */
  workflowTimeoutMs: number;
  /** Enable automatic follow-up suggestions */
  enableAutoFollowUp: boolean;
  /** Default reminder offset in minutes */
  defaultReminderOffset: number;
}

const DEFAULT_CONFIG: TaskAutomationConfig = {
  maxTasksPerUser: 1000,
  maxWorkflowsPerUser: 50,
  reminderCheckIntervalMs: 60 * 1000, // 1 minute
  workflowTimeoutMs: 5 * 60 * 1000, // 5 minutes
  enableAutoFollowUp: true,
  defaultReminderOffset: 30,
};

// =============================================================================
// NATURAL LANGUAGE PARSER
// =============================================================================

class NaturalLanguageTaskParser {
  /**
   * Parse a natural language string into task components.
   */
  parse(text: string): Partial<Task> {
    const result: Partial<Task> = {
      title: text,
      source: {
        type: "assistant",
        originalText: text,
      },
    };

    // Extract due date
    const dueDate = this.extractDueDate(text);
    if (dueDate) {
      result.dueDate = dueDate.date;
      result.title = this.removeMatch(text, dueDate.match);
    }

    // Extract priority
    const priority = this.extractPriority(text);
    if (priority) {
      result.priority = priority.priority;
      result.title = this.removeMatch(result.title!, priority.match);
    }

    // Extract tags
    const tags = this.extractTags(text);
    if (tags.length > 0) {
      result.tags = tags;
    }

    // Extract duration estimate
    const duration = this.extractDuration(text);
    if (duration) {
      result.estimatedDuration = duration.minutes;
      result.title = this.removeMatch(result.title!, duration.match);
    }

    // Clean up title
    result.title = this.cleanTitle(result.title!);

    return result;
  }

  private extractDueDate(text: string): { date: Date; match: string } | null {
    const now = new Date();
    const patterns = [
      { regex: /\btoday\b/i, offset: 0 },
      { regex: /\btomorrow\b/i, offset: 1 },
      { regex: /\bnext week\b/i, offset: 7 },
      { regex: /\bnext month\b/i, offset: 30 },
      { regex: /\bin (\d+) days?\b/i, offsetMultiplier: 1 },
      { regex: /\bin (\d+) weeks?\b/i, offsetMultiplier: 7 },
      { regex: /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, weekday: true },
      { regex: /\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, weekday: true },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        let date: Date;

        if (pattern.offset !== undefined) {
          date = new Date(now.getTime() + pattern.offset * 24 * 60 * 60 * 1000);
        } else if (pattern.offsetMultiplier !== undefined) {
          const days = parseInt(match[1]) * pattern.offsetMultiplier;
          date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        } else if (pattern.weekday) {
          date = this.getNextWeekday(match[1].toLowerCase());
        } else {
          continue;
        }

        // Set to end of day
        date.setHours(23, 59, 59, 999);

        return { date, match: match[0] };
      }
    }

    // Try to extract specific date
    const datePattern = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
    const dateMatch = text.match(datePattern);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1;
      const day = parseInt(dateMatch[2]);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
      const date = new Date(year, month, day, 23, 59, 59, 999);
      return { date, match: dateMatch[0] };
    }

    return null;
  }

  private getNextWeekday(dayName: string): Date {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = days.indexOf(dayName);
    const now = new Date();
    const currentDay = now.getDay();

    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;

    return new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
  }

  private extractPriority(text: string): { priority: Task["priority"]; match: string } | null {
    const patterns = [
      { regex: /\b(urgent|asap|critical)\b/i, priority: "urgent" as const },
      { regex: /\b(high priority|important)\b/i, priority: "high" as const },
      { regex: /\b(low priority|when you can|no rush)\b/i, priority: "low" as const },
      { regex: /!{3,}/g, priority: "urgent" as const },
      { regex: /!{2}/g, priority: "high" as const },
      { regex: /!{1}/g, priority: "medium" as const },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        return { priority: pattern.priority, match: match[0] };
      }
    }

    return null;
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];

    // Extract hashtags
    const hashtagPattern = /#(\w+)/g;
    let match;
    while ((match = hashtagPattern.exec(text)) !== null) {
      tags.push(match[1]);
    }

    // Extract @mentions as tags
    const mentionPattern = /@(\w+)/g;
    while ((match = mentionPattern.exec(text)) !== null) {
      tags.push(`person:${match[1]}`);
    }

    return tags;
  }

  private extractDuration(text: string): { minutes: number; match: string } | null {
    const patterns = [
      { regex: /\b(\d+)\s*min(ute)?s?\b/i, multiplier: 1 },
      { regex: /\b(\d+)\s*hours?\b/i, multiplier: 60 },
      { regex: /\bquick\b/i, fixed: 15 },
      { regex: /\bshort\b/i, fixed: 30 },
      { regex: /\blong\b/i, fixed: 120 },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const minutes = pattern.fixed || parseInt(match[1]) * (pattern.multiplier || 1);
        return { minutes, match: match[0] };
      }
    }

    return null;
  }

  private removeMatch(text: string, match: string): string {
    return text.replace(match, "").replace(/\s+/g, " ").trim();
  }

  private cleanTitle(title: string): string {
    // Remove common task prefixes
    title = title.replace(/^(remind me to|create task|add task|task:?)\s*/i, "");

    // Remove excess whitespace
    title = title.replace(/\s+/g, " ").trim();

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title;
  }
}

// =============================================================================
// WORKFLOW ENGINE
// =============================================================================

class WorkflowEngine extends EventEmitter {
  private runningWorkflows: Map<string, WorkflowState> = new Map();
  private actionHandlers: Map<WorkflowActionType, ActionHandler> = new Map();

  constructor(private config: TaskAutomationConfig) {
    super();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.actionHandlers.set("wait", async (action, context) => {
      const duration = action.config.duration as number || 1000;
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { success: true };
    });

    this.actionHandlers.set("send_notification", async (action, context) => {
      log.info({ action: action.id }, "Sending notification");
      return { success: true, output: { notified: true } };
    });

    this.actionHandlers.set("create_task", async (action, context) => {
      const taskData = action.config.task as Partial<Task>;
      log.info({ title: taskData.title }, "Creating task from workflow");
      return { success: true, output: { taskId: randomUUID() } };
    });

    this.actionHandlers.set("create_event", async (action, context) => {
      log.info({ action: action.id }, "Creating calendar event");
      return { success: true, output: { eventId: randomUUID() } };
    });

    this.actionHandlers.set("publish_content", async (action, context) => {
      log.info({ contentId: action.config.contentId }, "Publishing content");
      return { success: true, output: { published: true } };
    });

    this.actionHandlers.set("schedule_content", async (action, context) => {
      log.info({ contentId: action.config.contentId }, "Scheduling content");
      return { success: true, output: { scheduled: true } };
    });

    this.actionHandlers.set("call_api", async (action, context) => {
      const { url, method = "GET" } = action.config as { url: string; method?: string };
      log.info({ url, method }, "Calling external API");
      // In production, would make actual HTTP request
      return { success: true, output: { response: { status: 200 } } };
    });

    this.actionHandlers.set("conditional", async (action, context) => {
      const condition = action.config.condition as WorkflowCondition;
      const result = this.evaluateCondition(condition, context.variables);
      return { success: true, output: { conditionMet: result } };
    });
  }

  async execute(
    workflow: Workflow,
    inputs?: Record<string, unknown>
  ): Promise<WorkflowState> {
    const executionId = randomUUID();
    const now = new Date();

    const state: WorkflowState = {
      workflowId: workflow.id,
      executionId,
      status: "running",
      currentActionIndex: 0,
      variables: new Map(Object.entries(inputs || {})),
      startedAt: now,
      actionResults: [],
    };

    this.runningWorkflows.set(executionId, state);
    this.emit("workflow:started", { workflowId: workflow.id, executionId });

    try {
      // Execute actions in order
      for (let i = 0; i < workflow.actions.length; i++) {
        const action = workflow.actions[i];
        state.currentActionIndex = i;

        // Check condition if present
        if (action.condition && !this.evaluateCondition(action.condition, state.variables)) {
          state.actionResults.push({
            actionId: action.id,
            status: "skipped",
            startedAt: new Date(),
            completedAt: new Date(),
          });
          continue;
        }

        // Execute action
        const actionStarted = new Date();
        try {
          const result = await this.executeAction(action, state);
          state.actionResults.push({
            actionId: action.id,
            status: "success",
            output: result.output,
            startedAt: actionStarted,
            completedAt: new Date(),
          });

          // Store output in variables
          if (result.output) {
            state.variables.set(`action_${action.id}_output`, result.output);
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);

          state.actionResults.push({
            actionId: action.id,
            status: "failure",
            error,
            startedAt: actionStarted,
            completedAt: new Date(),
          });

          if (action.onError === "stop") {
            state.status = "failed";
            state.error = error;
            break;
          }
          // Continue if onError === "continue"
        }
      }

      if (state.status === "running") {
        state.status = "completed";
      }
    } catch (err) {
      state.status = "failed";
      state.error = err instanceof Error ? err.message : String(err);
    }

    state.completedAt = new Date();
    this.runningWorkflows.delete(executionId);

    this.emit("workflow:completed", {
      workflowId: workflow.id,
      executionId,
      status: state.status,
    });

    return state;
  }

  private async executeAction(
    action: WorkflowAction,
    context: WorkflowState
  ): Promise<{ success: boolean; output?: unknown }> {
    const handler = this.actionHandlers.get(action.type);
    if (!handler) {
      throw new Error(`No handler for action type: ${action.type}`);
    }

    // Apply timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Action timeout")), this.config.workflowTimeoutMs);
    });

    return Promise.race([handler(action, context), timeoutPromise]);
  }

  private evaluateCondition(
    condition: WorkflowCondition,
    variables: Map<string, unknown>
  ): boolean {
    switch (condition.type) {
      case "and":
        return (condition.conditions || []).every((c) =>
          this.evaluateCondition(c, variables)
        );

      case "or":
        return (condition.conditions || []).some((c) =>
          this.evaluateCondition(c, variables)
        );

      case "not":
        return condition.conditions
          ? !this.evaluateCondition(condition.conditions[0], variables)
          : false;

      case "comparison": {
        const left = typeof condition.left === "string"
          ? variables.get(condition.left) ?? condition.left
          : condition.left;
        const right = condition.right;

        switch (condition.operator) {
          case "eq":
            return left === right;
          case "ne":
            return left !== right;
          case "gt":
            return (left as number) > (right as number);
          case "gte":
            return (left as number) >= (right as number);
          case "lt":
            return (left as number) < (right as number);
          case "lte":
            return (left as number) <= (right as number);
          case "contains":
            return String(left).includes(String(right));
          case "matches":
            return new RegExp(String(right)).test(String(left));
          default:
            return false;
        }
      }

      default:
        return false;
    }
  }

  getRunningWorkflows(): WorkflowState[] {
    return Array.from(this.runningWorkflows.values());
  }

  pauseWorkflow(executionId: string): boolean {
    const state = this.runningWorkflows.get(executionId);
    if (state && state.status === "running") {
      state.status = "paused";
      return true;
    }
    return false;
  }

  resumeWorkflow(executionId: string): boolean {
    const state = this.runningWorkflows.get(executionId);
    if (state && state.status === "paused") {
      state.status = "running";
      // Would need to continue execution from currentActionIndex
      return true;
    }
    return false;
  }
}

type ActionHandler = (
  action: WorkflowAction,
  context: WorkflowState
) => Promise<{ success: boolean; output?: unknown }>;

// =============================================================================
// REMINDER SCHEDULER
// =============================================================================

class ReminderScheduler extends EventEmitter {
  private reminders: Map<string, { reminder: TaskReminder; task: Task }> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private config: TaskAutomationConfig) {
    super();
  }

  start(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, this.config.reminderCheckIntervalMs);

    log.info("Reminder scheduler started");
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    log.info("Reminder scheduler stopped");
  }

  scheduleReminder(task: Task, reminder: TaskReminder): void {
    this.reminders.set(reminder.id, { reminder, task });
  }

  cancelReminder(reminderId: string): void {
    this.reminders.delete(reminderId);
  }

  private checkReminders(): void {
    const now = new Date();

    for (const [id, { reminder, task }] of this.reminders) {
      if (reminder.sent) continue;

      let triggerTime: Date;

      if (reminder.type === "scheduled" && reminder.timing instanceof Date) {
        triggerTime = reminder.timing;
      } else if (reminder.type === "before_due" && task.dueDate) {
        const offsetMs = (reminder.timing as number) * 60 * 1000;
        triggerTime = new Date(task.dueDate.getTime() - offsetMs);
      } else if (reminder.type === "after_start" && task.startDate) {
        const offsetMs = (reminder.timing as number) * 60 * 1000;
        triggerTime = new Date(task.startDate.getTime() + offsetMs);
      } else {
        continue;
      }

      if (now >= triggerTime) {
        reminder.sent = true;
        reminder.sentAt = now;

        this.emit("reminder:trigger", {
          task,
          reminder,
        });

        log.debug({ taskId: task.id, reminderId: reminder.id }, "Reminder triggered");
      }
    }
  }
}

// =============================================================================
// CONTENT SCHEDULER
// =============================================================================

class ContentScheduler extends EventEmitter {
  private schedules: Map<string, ContentSchedule> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private checkIntervalMs: number = 60000) {
    super();
  }

  start(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkSchedules();
    }, this.checkIntervalMs);

    log.info("Content scheduler started");
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  schedule(schedule: ContentSchedule): void {
    this.schedules.set(schedule.id, schedule);
    log.info({ scheduleId: schedule.id, contentId: schedule.contentId }, "Content scheduled");
  }

  cancel(scheduleId: string): boolean {
    const schedule = this.schedules.get(scheduleId);
    if (schedule && schedule.status === "pending") {
      schedule.status = "cancelled";
      return true;
    }
    return false;
  }

  private async checkSchedules(): Promise<void> {
    const now = new Date();

    for (const [id, schedule] of this.schedules) {
      if (schedule.status !== "pending") continue;

      if (now >= schedule.scheduledFor) {
        schedule.status = "processing";

        try {
          await this.executeSchedule(schedule);
          schedule.status = "completed";
          schedule.executedAt = new Date();

          this.emit("schedule:executed", { schedule });
        } catch (err) {
          schedule.status = "failed";
          schedule.error = err instanceof Error ? err.message : String(err);

          this.emit("schedule:failed", { schedule, error: schedule.error });
        }
      }
    }
  }

  private async executeSchedule(schedule: ContentSchedule): Promise<void> {
    log.info(
      { scheduleId: schedule.id, operation: schedule.operation },
      "Executing scheduled content operation"
    );

    // In production, would call CMS service to perform the operation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  getSchedules(contentId?: string): ContentSchedule[] {
    const schedules = Array.from(this.schedules.values());
    if (contentId) {
      return schedules.filter((s) => s.contentId === contentId);
    }
    return schedules;
  }
}

// =============================================================================
// FOLLOW-UP TRACKER
// =============================================================================

class FollowUpTracker {
  private followUps: Map<string, FollowUp> = new Map();

  track(item: FollowUp): void {
    this.followUps.set(item.id, item);
  }

  complete(id: string): void {
    this.followUps.delete(id);
  }

  getDueFollowUps(userId: string): FollowUp[] {
    const now = new Date();
    return Array.from(this.followUps.values())
      .filter((f) => f.userId === userId && f.dueDate <= now);
  }

  getUpcoming(userId: string, days: number = 7): FollowUp[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return Array.from(this.followUps.values())
      .filter((f) => f.userId === userId && f.dueDate > now && f.dueDate <= cutoff)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }
}

interface FollowUp {
  id: string;
  userId: string;
  type: "task" | "email" | "meeting" | "content" | "custom";
  title: string;
  description?: string;
  relatedId?: string;
  dueDate: Date;
  createdAt: Date;
}

// =============================================================================
// TASK AUTOMATION SERVICE
// =============================================================================

export class TaskAutomationService extends EventEmitter implements ITaskService {
  private config: TaskAutomationConfig;
  private tasks: Map<string, Task> = new Map();
  private userTasks: Map<string, Set<string>> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private userWorkflows: Map<string, Set<string>> = new Map();
  private parser: NaturalLanguageTaskParser;
  private workflowEngine: WorkflowEngine;
  private reminderScheduler: ReminderScheduler;
  private contentScheduler: ContentScheduler;
  private followUpTracker: FollowUpTracker;

  constructor(config: Partial<TaskAutomationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.parser = new NaturalLanguageTaskParser();
    this.workflowEngine = new WorkflowEngine(this.config);
    this.reminderScheduler = new ReminderScheduler(this.config);
    this.contentScheduler = new ContentScheduler();
    this.followUpTracker = new FollowUpTracker();

    this.setupEventForwarding();
    this.reminderScheduler.start();
    this.contentScheduler.start();

    log.info("Task automation service initialized");
  }

  private setupEventForwarding(): void {
    this.workflowEngine.on("workflow:started", (data) => this.emit("workflow:started", data));
    this.workflowEngine.on("workflow:completed", (data) => this.emit("workflow:completed", data));
    this.reminderScheduler.on("reminder:trigger", (data) => this.emit("reminder:trigger", data));
    this.contentScheduler.on("schedule:executed", (data) => this.emit("content:executed", data));
  }

  // ===========================================================================
  // TASK MANAGEMENT
  // ===========================================================================

  async createTask(
    userId: string,
    // userId is passed as the first arg and assigned below; omit it from
    // the task payload so callers don't have to repeat it.
    task: Omit<Task, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<Task> {
    // Check limits
    const userTaskSet = this.userTasks.get(userId) || new Set();
    if (userTaskSet.size >= this.config.maxTasksPerUser) {
      throw new Error("Maximum task limit reached");
    }

    const now = new Date();
    const newTask: Task = {
      ...task,
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      subtasks: task.subtasks || [],
      reminders: task.reminders || [],
      tags: task.tags || [],
      dependencies: task.dependencies || [],
    };

    this.tasks.set(newTask.id, newTask);
    userTaskSet.add(newTask.id);
    this.userTasks.set(userId, userTaskSet);

    // Schedule reminders
    for (const reminder of newTask.reminders) {
      this.reminderScheduler.scheduleReminder(newTask, reminder);
    }

    // Create auto follow-up if enabled
    if (this.config.enableAutoFollowUp && newTask.dueDate) {
      this.createFollowUp(newTask);
    }

    this.emit("task:created", { task: newTask });
    log.info({ taskId: newTask.id, title: newTask.title }, "Task created");

    return newTask;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updatedTask: Task = {
      ...task,
      ...updates,
      id: task.id, // Prevent ID changes
      userId: task.userId,
      createdAt: task.createdAt,
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, updatedTask);

    // Update reminders if changed
    if (updates.reminders) {
      for (const reminder of task.reminders) {
        this.reminderScheduler.cancelReminder(reminder.id);
      }
      for (const reminder of updates.reminders) {
        this.reminderScheduler.scheduleReminder(updatedTask, reminder);
      }
    }

    this.emit("task:updated", { task: updatedTask });
    return updatedTask;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Cancel reminders
    for (const reminder of task.reminders) {
      this.reminderScheduler.cancelReminder(reminder.id);
    }

    this.tasks.delete(taskId);

    const userTaskSet = this.userTasks.get(task.userId);
    if (userTaskSet) {
      userTaskSet.delete(taskId);
    }

    this.emit("task:deleted", { taskId });
    log.info({ taskId }, "Task deleted");
  }

  async getTasks(userId: string, filters?: TaskFilters): Promise<Task[]> {
    const userTaskSet = this.userTasks.get(userId) || new Set();
    let tasks = Array.from(userTaskSet)
      .map((id) => this.tasks.get(id))
      .filter((t): t is Task => t !== undefined);

    // Apply filters
    if (filters) {
      if (filters.status) {
        tasks = tasks.filter((t) => filters.status!.includes(t.status));
      }
      if (filters.priority) {
        tasks = tasks.filter((t) => filters.priority!.includes(t.priority));
      }
      if (filters.tags) {
        tasks = tasks.filter((t) => filters.tags!.some((tag) => t.tags.includes(tag)));
      }
      if (filters.project) {
        tasks = tasks.filter((t) => t.project === filters.project);
      }
      if (filters.dueBefore) {
        tasks = tasks.filter((t) => t.dueDate && t.dueDate <= filters.dueBefore!);
      }
      if (filters.dueAfter) {
        tasks = tasks.filter((t) => t.dueDate && t.dueDate >= filters.dueAfter!);
      }
    }

    // Sort by due date, then priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        const dateDiff = a.dueDate.getTime() - b.dueDate.getTime();
        if (dateDiff !== 0) return dateDiff;
      } else if (a.dueDate) {
        return -1;
      } else if (b.dueDate) {
        return 1;
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return tasks;
  }

  async completeTask(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updatedTask = await this.updateTask(taskId, {
      status: "completed",
      completedAt: new Date(),
    });

    // Handle recurring task
    if (task.recurrence) {
      await this.createNextRecurrence(task);
    }

    // Complete follow-up
    this.followUpTracker.complete(`followup_${taskId}`);

    this.emit("task:completed", { task: updatedTask });
    return updatedTask;
  }

  private async createNextRecurrence(task: Task): Promise<void> {
    if (!task.recurrence || !task.dueDate) return;

    const nextDueDate = this.calculateNextOccurrence(task.dueDate, task.recurrence);
    if (!nextDueDate) return;

    await this.createTask(task.userId, {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: "pending",
      dueDate: nextDueDate,
      tags: task.tags,
      project: task.project,
      recurrence: task.recurrence,
      reminders: task.reminders.map((r) => ({
        ...r,
        id: randomUUID(),
        sent: false,
        sentAt: undefined,
      })),
      subtasks: task.subtasks.map((s) => ({ ...s, completed: false, completedAt: undefined })),
      dependencies: [],
      source: { type: "assistant" },
    });
  }

  private calculateNextOccurrence(date: Date, rule: RecurrenceRule): Date | null {
    const next = new Date(date);

    switch (rule.frequency) {
      case "daily":
        next.setDate(next.getDate() + rule.interval);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7 * rule.interval);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + rule.interval);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + rule.interval);
        break;
    }

    // Check if past until date
    if (rule.until && next > rule.until) {
      return null;
    }

    // Check count
    if (rule.count !== undefined && rule.count <= 0) {
      return null;
    }

    return next;
  }

  private createFollowUp(task: Task): void {
    if (!task.dueDate) return;

    this.followUpTracker.track({
      id: `followup_${task.id}`,
      userId: task.userId,
      type: "task",
      title: `Follow up: ${task.title}`,
      relatedId: task.id,
      dueDate: task.dueDate,
      createdAt: new Date(),
    });
  }

  // ===========================================================================
  // NATURAL LANGUAGE PARSING
  // ===========================================================================

  async parseNaturalLanguageTask(text: string): Promise<Partial<Task>> {
    return this.parser.parse(text);
  }

  async createTaskFromNaturalLanguage(userId: string, text: string): Promise<Task> {
    const parsed = await this.parseNaturalLanguageTask(text);

    return this.createTask(userId, {
      title: parsed.title || text,
      description: parsed.description,
      priority: parsed.priority || "medium",
      status: "pending",
      dueDate: parsed.dueDate,
      estimatedDuration: parsed.estimatedDuration,
      tags: parsed.tags || [],
      dependencies: [],
      subtasks: [],
      reminders: parsed.dueDate
        ? [
            {
              id: randomUUID(),
              type: "before_due",
              timing: this.config.defaultReminderOffset,
              method: "push",
              sent: false,
            },
          ]
        : [],
      source: { type: "assistant", originalText: text },
    });
  }

  // ===========================================================================
  // WORKFLOW MANAGEMENT
  // ===========================================================================

  async createWorkflow(
    userId: string,
    // userId is the first arg; omit it from the payload type to match how
    // callers (including createSuggestedWorkflow) build the object.
    workflow: Omit<Workflow, "id" | "userId" | "executionCount" | "createdAt" | "updatedAt">
  ): Promise<Workflow> {
    const userWorkflowSet = this.userWorkflows.get(userId) || new Set();
    if (userWorkflowSet.size >= this.config.maxWorkflowsPerUser) {
      throw new Error("Maximum workflow limit reached");
    }

    const now = new Date();
    const newWorkflow: Workflow = {
      ...workflow,
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
    };

    this.workflows.set(newWorkflow.id, newWorkflow);
    userWorkflowSet.add(newWorkflow.id);
    this.userWorkflows.set(userId, userWorkflowSet);

    log.info({ workflowId: newWorkflow.id, name: newWorkflow.name }, "Workflow created");
    return newWorkflow;
  }

  async executeWorkflow(
    workflowId: string,
    inputs?: Record<string, unknown>
  ): Promise<WorkflowState> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!workflow.enabled) {
      throw new Error("Workflow is disabled");
    }

    workflow.executionCount++;
    workflow.lastTriggered = new Date();

    return this.workflowEngine.execute(workflow, inputs);
  }

  async getWorkflowStatus(executionId: string): Promise<WorkflowState | null> {
    const running = this.workflowEngine.getRunningWorkflows();
    return running.find((s) => s.executionId === executionId) || null;
  }

  async suggestAutomation(userId: string, action: string): Promise<Workflow | null> {
    // Analyze the action and suggest a workflow
    const lowerAction = action.toLowerCase();

    if (lowerAction.includes("publish") && lowerAction.includes("daily")) {
      return this.createSuggestedWorkflow(userId, "daily_publish", {
        name: "Daily Content Publisher",
        description: "Automatically publish content daily",
        trigger: { type: "schedule", config: { cron: "0 9 * * *" } },
        actions: [
          {
            id: "publish",
            type: "publish_content",
            config: { contentType: "post" },
            order: 0,
            onError: "stop",
          },
        ],
      });
    }

    if (lowerAction.includes("remind") && lowerAction.includes("follow up")) {
      return this.createSuggestedWorkflow(userId, "follow_up_reminder", {
        name: "Follow-up Reminder",
        description: "Send follow-up reminders for tasks",
        trigger: { type: "event", config: { event: "task.created" } },
        actions: [
          {
            id: "wait",
            type: "wait",
            config: { duration: 24 * 60 * 60 * 1000 }, // 1 day
            order: 0,
            onError: "continue",
          },
          {
            id: "notify",
            type: "send_notification",
            config: { message: "Don't forget to follow up!" },
            order: 1,
            onError: "stop",
          },
        ],
      });
    }

    return null;
  }

  private async createSuggestedWorkflow(
    userId: string,
    _suggestionId: string,
    template: Omit<Workflow, "id" | "userId" | "createdAt" | "updatedAt" | "enabled" | "executionCount">
  ): Promise<Workflow> {
    return this.createWorkflow(userId, {
      ...template,
      enabled: false, // Start disabled, user must enable
    });
  }

  // ===========================================================================
  // CONTENT SCHEDULING
  // ===========================================================================

  async scheduleContent(
    userId: string,
    contentId: string,
    contentType: string,
    operation: ContentOperationType,
    scheduledFor: Date,
    timezone: string = "UTC"
  ): Promise<ContentSchedule> {
    const schedule: ContentSchedule = {
      id: randomUUID(),
      contentId,
      contentType,
      operation,
      scheduledFor,
      timezone,
      status: "pending",
      createdBy: userId,
      createdAt: new Date(),
    };

    this.contentScheduler.schedule(schedule);

    log.info(
      { scheduleId: schedule.id, contentId, operation, scheduledFor },
      "Content scheduled"
    );

    return schedule;
  }

  async cancelContentSchedule(scheduleId: string): Promise<boolean> {
    return this.contentScheduler.cancel(scheduleId);
  }

  getContentSchedules(contentId?: string): ContentSchedule[] {
    return this.contentScheduler.getSchedules(contentId);
  }

  // ===========================================================================
  // FOLLOW-UP TRACKING
  // ===========================================================================

  getDueFollowUps(userId: string): FollowUp[] {
    return this.followUpTracker.getDueFollowUps(userId);
  }

  getUpcomingFollowUps(userId: string, days?: number): FollowUp[] {
    return this.followUpTracker.getUpcoming(userId, days);
  }

  completeFollowUp(followUpId: string): void {
    this.followUpTracker.complete(followUpId);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async shutdown(): Promise<void> {
    log.info("Shutting down task automation service");

    this.reminderScheduler.stop();
    this.contentScheduler.stop();

    this.tasks.clear();
    this.workflows.clear();
    this.userTasks.clear();
    this.userWorkflows.clear();

    log.info("Task automation service shutdown complete");
  }

  getStats(): {
    totalTasks: number;
    tasksByStatus: Record<string, number>;
    totalWorkflows: number;
    runningWorkflows: number;
    scheduledContent: number;
    pendingReminders: number;
  } {
    const tasksByStatus: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    }

    return {
      totalTasks: this.tasks.size,
      tasksByStatus,
      totalWorkflows: this.workflows.size,
      runningWorkflows: this.workflowEngine.getRunningWorkflows().length,
      scheduledContent: this.contentScheduler.getSchedules().filter((s) => s.status === "pending").length,
      pendingReminders: 0, // Would need access to reminder count
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let taskAutomationInstance: TaskAutomationService | null = null;

export function createTaskAutomationService(
  config?: Partial<TaskAutomationConfig>
): TaskAutomationService {
  if (!taskAutomationInstance) {
    taskAutomationInstance = new TaskAutomationService(config);
  }
  return taskAutomationInstance;
}

export function getTaskAutomationService(): TaskAutomationService | null {
  return taskAutomationInstance;
}

export async function shutdownTaskAutomationService(): Promise<void> {
  if (taskAutomationInstance) {
    await taskAutomationInstance.shutdown();
    taskAutomationInstance = null;
  }
}
