/**
 * @file notification-service.ts
 * @description Proactive Notification and Suggestion Service for AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Proactive notification system inspired by:
 * - Google Assistant: Proactive suggestions
 * - Siri Suggestions: Context-aware recommendations
 * - Outlook: Meeting prep notifications
 * - Notion AI: Workspace insights
 *
 * Features:
 * - Multi-channel notification delivery
 * - Proactive suggestion engine
 * - Smart timing optimization
 * - User preference learning
 * - Quiet hours handling
 * - Notification batching
 * - Priority-based delivery
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  Notification,
  NotificationType,
  NotificationAction,
  ProactiveSuggestion,
  SuggestionType,
  SuggestionAction,
  UserPreferences,
  CalendarEvent,
  Task,
  INotificationService,
  NotificationFilters,
  RichContent,
} from "./types";

const log = createModuleLogger("notification-service");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface NotificationServiceConfig {
  /** Maximum notifications per user per day */
  maxNotificationsPerDay: number;
  /** Notification check interval in ms */
  checkIntervalMs: number;
  /** Batch window in ms */
  batchWindowMs: number;
  /** Enable proactive suggestions */
  enableProactiveSuggestions: boolean;
  /** Maximum suggestions to show */
  maxSuggestionsToShow: number;
  /** Suggestion refresh interval in ms */
  suggestionRefreshIntervalMs: number;
  /** Minimum confidence for suggestions */
  minSuggestionConfidence: number;
}

const DEFAULT_CONFIG: NotificationServiceConfig = {
  maxNotificationsPerDay: 50,
  checkIntervalMs: 60 * 1000, // 1 minute
  batchWindowMs: 5 * 60 * 1000, // 5 minutes
  enableProactiveSuggestions: true,
  maxSuggestionsToShow: 5,
  suggestionRefreshIntervalMs: 15 * 60 * 1000, // 15 minutes
  minSuggestionConfidence: 0.6,
};

// =============================================================================
// NOTIFICATION CHANNEL INTERFACES
// =============================================================================

interface NotificationChannel {
  name: string;
  send(notification: Notification): Promise<boolean>;
  isAvailable(): boolean;
}

// =============================================================================
// IN-APP NOTIFICATION CHANNEL
// =============================================================================

class InAppNotificationChannel implements NotificationChannel {
  name = "inApp";
  private subscribers: Map<string, (notification: Notification) => void> = new Map();

  send(notification: Notification): Promise<boolean> {
    const handler = this.subscribers.get(notification.userId);
    if (handler) {
      handler(notification);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  isAvailable(): boolean {
    return true;
  }

  subscribe(userId: string, handler: (notification: Notification) => void): void {
    this.subscribers.set(userId, handler);
  }

  unsubscribe(userId: string): void {
    this.subscribers.delete(userId);
  }
}

// =============================================================================
// PUSH NOTIFICATION CHANNEL
// =============================================================================

class PushNotificationChannel implements NotificationChannel {
  name = "push";
  private subscriptions: Map<string, PushSubscription[]> = new Map();

  async send(notification: Notification): Promise<boolean> {
    const userSubscriptions = this.subscriptions.get(notification.userId) || [];
    if (userSubscriptions.length === 0) return false;

    // In production, would use web-push or FCM
    log.debug(
      { userId: notification.userId, subscriptionCount: userSubscriptions.length },
      "Sending push notification"
    );

    return true;
  }

  isAvailable(): boolean {
    return true;
  }

  registerSubscription(userId: string, subscription: PushSubscription): void {
    const subscriptions = this.subscriptions.get(userId) || [];
    subscriptions.push(subscription);
    this.subscriptions.set(userId, subscriptions);
  }

  removeSubscription(userId: string, endpoint: string): void {
    const subscriptions = this.subscriptions.get(userId) || [];
    const filtered = subscriptions.filter((s) => s.endpoint !== endpoint);
    this.subscriptions.set(userId, filtered);
  }
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// =============================================================================
// EMAIL NOTIFICATION CHANNEL
// =============================================================================

class EmailNotificationChannel implements NotificationChannel {
  name = "email";
  private userEmails: Map<string, string> = new Map();

  async send(notification: Notification): Promise<boolean> {
    const email = this.userEmails.get(notification.userId);
    if (!email) return false;

    // In production, would use nodemailer or similar
    log.debug({ userId: notification.userId, email }, "Sending email notification");

    return true;
  }

  isAvailable(): boolean {
    return true;
  }

  setUserEmail(userId: string, email: string): void {
    this.userEmails.set(userId, email);
  }
}

// =============================================================================
// SMS NOTIFICATION CHANNEL
// =============================================================================

class SMSNotificationChannel implements NotificationChannel {
  name = "sms";
  private userPhones: Map<string, string> = new Map();

  async send(notification: Notification): Promise<boolean> {
    const phone = this.userPhones.get(notification.userId);
    if (!phone) return false;

    // In production, would use Twilio or similar
    log.debug({ userId: notification.userId, phone }, "Sending SMS notification");

    return true;
  }

  isAvailable(): boolean {
    return !!process.env.TWILIO_ACCOUNT_SID;
  }

  setUserPhone(userId: string, phone: string): void {
    this.userPhones.set(userId, phone);
  }
}

// =============================================================================
// SUGGESTION ENGINE
// =============================================================================

class SuggestionEngine extends EventEmitter {
  private userPatterns: Map<string, UserPattern[]> = new Map();
  private activeSuggestions: Map<string, ProactiveSuggestion[]> = new Map();

  constructor(private config: NotificationServiceConfig) {
    super();
  }

  async generateSuggestions(
    userId: string,
    context: SuggestionContext
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Check upcoming events for meeting prep
    if (context.upcomingEvents) {
      for (const event of context.upcomingEvents) {
        const prepSuggestion = this.generateMeetingPrepSuggestion(userId, event);
        if (prepSuggestion) suggestions.push(prepSuggestion);
      }
    }

    // Check tasks for prioritization suggestions
    if (context.tasks) {
      const prioritySuggestion = this.generateTaskPrioritizationSuggestion(
        userId,
        context.tasks
      );
      if (prioritySuggestion) suggestions.push(prioritySuggestion);
    }

    // Check for follow-up suggestions
    if (context.recentActions) {
      const followUpSuggestion = this.generateFollowUpSuggestion(
        userId,
        context.recentActions
      );
      if (followUpSuggestion) suggestions.push(followUpSuggestion);
    }

    // Check for schedule optimization
    if (context.upcomingEvents && context.tasks) {
      const optimizationSuggestion = this.generateScheduleOptimizationSuggestion(
        userId,
        context.upcomingEvents,
        context.tasks
      );
      if (optimizationSuggestion) suggestions.push(optimizationSuggestion);
    }

    // Check for automation opportunities
    if (context.recentActions) {
      const automationSuggestion = this.generateAutomationSuggestion(
        userId,
        context.recentActions
      );
      if (automationSuggestion) suggestions.push(automationSuggestion);
    }

    // Filter by confidence
    const filtered = suggestions.filter(
      (s) => s.confidence >= this.config.minSuggestionConfidence
    );

    // Sort by priority and confidence
    filtered.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Limit to max suggestions
    const limited = filtered.slice(0, this.config.maxSuggestionsToShow);

    this.activeSuggestions.set(userId, limited);

    return limited;
  }

  private generateMeetingPrepSuggestion(
    userId: string,
    event: CalendarEvent
  ): ProactiveSuggestion | null {
    const now = new Date();
    const timeUntilMeeting = event.startTime.getTime() - now.getTime();
    const hoursUntil = timeUntilMeeting / (60 * 60 * 1000);

    // Only suggest if meeting is 30 min to 24 hours away
    if (hoursUntil < 0.5 || hoursUntil > 24) return null;

    const hasAttendees = event.attendees.length > 1;
    const hasDescription = !!event.description;

    return {
      id: randomUUID(),
      userId,
      type: "meeting_prep",
      title: `Prepare for: ${event.title}`,
      description: hasAttendees
        ? `Meeting with ${event.attendees.length} attendees in ${Math.round(hoursUntil)} hours`
        : `Event in ${Math.round(hoursUntil)} hours`,
      reasoning: "Upcoming meeting detected. Preparation time recommended.",
      confidence: hasDescription ? 0.9 : 0.7,
      actions: [
        {
          id: "view_details",
          label: "View Details",
          action: "calendar.viewEvent",
          parameters: { eventId: event.id },
          confidence: 1.0,
        },
        {
          id: "add_notes",
          label: "Add Notes",
          action: "calendar.addNotes",
          parameters: { eventId: event.id },
          confidence: 0.8,
        },
      ],
      context: { eventId: event.id, eventTitle: event.title },
      priority: hoursUntil < 1 ? 9 : hoursUntil < 4 ? 7 : 5,
      dismissed: false,
      createdAt: now,
    };
  }

  private generateTaskPrioritizationSuggestion(
    userId: string,
    tasks: Task[]
  ): ProactiveSuggestion | null {
    const overdueTasks = tasks.filter(
      (t) =>
        t.dueDate &&
        t.dueDate < new Date() &&
        t.status !== "completed" &&
        t.status !== "cancelled"
    );

    const highPriorityTasks = tasks.filter(
      (t) =>
        (t.priority === "high" || t.priority === "urgent") &&
        t.status !== "completed" &&
        t.status !== "cancelled"
    );

    if (overdueTasks.length === 0 && highPriorityTasks.length === 0) {
      return null;
    }

    return {
      id: randomUUID(),
      userId,
      type: "task_prioritization",
      title: overdueTasks.length > 0
        ? `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} need attention`
        : `${highPriorityTasks.length} high priority task${highPriorityTasks.length > 1 ? "s" : ""} pending`,
      description: "Review and update your task priorities",
      reasoning: overdueTasks.length > 0
        ? "Overdue tasks detected that may need rescheduling or completion."
        : "High priority tasks should be addressed soon.",
      confidence: overdueTasks.length > 0 ? 0.95 : 0.8,
      actions: [
        {
          id: "view_tasks",
          label: "View Tasks",
          action: "tasks.list",
          parameters: { filter: "priority" },
          confidence: 1.0,
        },
        {
          id: "reschedule",
          label: "Reschedule Overdue",
          action: "tasks.reschedule",
          parameters: { taskIds: overdueTasks.map((t) => t.id) },
          confidence: 0.7,
        },
      ],
      context: {
        overdueCount: overdueTasks.length,
        highPriorityCount: highPriorityTasks.length,
      },
      priority: overdueTasks.length > 0 ? 8 : 6,
      dismissed: false,
      createdAt: new Date(),
    };
  }

  private generateFollowUpSuggestion(
    userId: string,
    recentActions: RecentAction[]
  ): ProactiveSuggestion | null {
    // Look for actions that typically need follow-up
    const followUpCandidates = recentActions.filter(
      (a) =>
        ["email.sent", "meeting.scheduled", "content.published"].includes(a.type) &&
        !a.followedUp
    );

    if (followUpCandidates.length === 0) return null;

    const mostRecent = followUpCandidates[0];

    return {
      id: randomUUID(),
      userId,
      type: "follow_up",
      title: `Follow up on: ${mostRecent.description}`,
      description: "Consider checking in on this recent action",
      reasoning: `${mostRecent.type} actions often benefit from follow-up`,
      confidence: 0.75,
      actions: [
        {
          id: "create_followup",
          label: "Create Follow-up Task",
          action: "tasks.create",
          parameters: {
            title: `Follow up: ${mostRecent.description}`,
            relatedId: mostRecent.id,
          },
          confidence: 0.9,
        },
        {
          id: "dismiss",
          label: "Not Needed",
          action: "suggestion.dismiss",
          confidence: 1.0,
        },
      ],
      context: { actionId: mostRecent.id, actionType: mostRecent.type },
      priority: 4,
      dismissed: false,
      createdAt: new Date(),
    };
  }

  private generateScheduleOptimizationSuggestion(
    userId: string,
    events: CalendarEvent[],
    tasks: Task[]
  ): ProactiveSuggestion | null {
    // Check for gaps in schedule that could be used for tasks
    const today = new Date();
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayEvents = events.filter(
      (e) => e.startTime >= today && e.startTime <= todayEnd
    );

    const pendingTasks = tasks.filter(
      (t) => t.status === "pending" && t.estimatedDuration
    );

    if (todayEvents.length === 0 || pendingTasks.length === 0) return null;

    // Find gaps (simplified)
    const totalEventTime = todayEvents.reduce((sum, e) => {
      return sum + (e.endTime.getTime() - e.startTime.getTime());
    }, 0);

    const availableMinutes = (8 * 60) - (totalEventTime / (60 * 1000)); // Assume 8 hour day

    if (availableMinutes < 30) return null;

    const tasksThatFit = pendingTasks.filter(
      (t) => t.estimatedDuration && t.estimatedDuration <= availableMinutes
    );

    if (tasksThatFit.length === 0) return null;

    return {
      id: randomUUID(),
      userId,
      type: "schedule_optimization",
      title: "Optimize your schedule",
      description: `You have ${Math.round(availableMinutes)} minutes free today. ${tasksThatFit.length} tasks could fit.`,
      reasoning: "Detected free time in your schedule that could be used productively.",
      confidence: 0.7,
      actions: [
        {
          id: "schedule_task",
          label: "Schedule a Task",
          action: "calendar.scheduleTask",
          parameters: { taskIds: tasksThatFit.slice(0, 3).map((t) => t.id) },
          confidence: 0.8,
        },
        {
          id: "block_time",
          label: "Block Focus Time",
          action: "calendar.createFocusBlock",
          confidence: 0.6,
        },
      ],
      context: {
        availableMinutes,
        fittingTaskCount: tasksThatFit.length,
      },
      priority: 5,
      dismissed: false,
      createdAt: new Date(),
    };
  }

  private generateAutomationSuggestion(
    userId: string,
    recentActions: RecentAction[]
  ): ProactiveSuggestion | null {
    // Detect repetitive patterns
    const actionCounts = new Map<string, number>();
    for (const action of recentActions) {
      const count = actionCounts.get(action.type) || 0;
      actionCounts.set(action.type, count + 1);
    }

    // Find actions performed 3+ times
    const frequentActions = Array.from(actionCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([type, count]) => ({ type, count }));

    if (frequentActions.length === 0) return null;

    const mostFrequent = frequentActions[0];

    return {
      id: randomUUID(),
      userId,
      type: "automation_opportunity",
      title: "Automation opportunity detected",
      description: `You've performed "${mostFrequent.type}" ${mostFrequent.count} times recently`,
      reasoning: "Repetitive actions can often be automated to save time.",
      confidence: 0.65,
      actions: [
        {
          id: "create_workflow",
          label: "Create Automation",
          action: "workflow.create",
          parameters: { baseAction: mostFrequent.type },
          confidence: 0.8,
        },
        {
          id: "learn_more",
          label: "Learn More",
          action: "help.automation",
          confidence: 1.0,
        },
      ],
      context: { actionType: mostFrequent.type, frequency: mostFrequent.count },
      priority: 3,
      dismissed: false,
      createdAt: new Date(),
    };
  }

  learnFromFeedback(
    userId: string,
    suggestionId: string,
    accepted: boolean,
    actionId?: string
  ): void {
    // In production, would update ML model or pattern weights
    log.debug(
      { userId, suggestionId, accepted, actionId },
      "Learning from suggestion feedback"
    );
  }

  getActiveSuggestions(userId: string): ProactiveSuggestion[] {
    return this.activeSuggestions.get(userId) || [];
  }

  dismissSuggestion(suggestionId: string, reason?: string): boolean {
    for (const [userId, suggestions] of this.activeSuggestions) {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (suggestion) {
        suggestion.dismissed = true;
        suggestion.dismissedReason = reason;
        return true;
      }
    }
    return false;
  }
}

interface SuggestionContext {
  upcomingEvents?: CalendarEvent[];
  tasks?: Task[];
  recentActions?: RecentAction[];
  preferences?: UserPreferences;
}

interface RecentAction {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  followedUp?: boolean;
}

interface UserPattern {
  type: string;
  frequency: number;
  lastSeen: Date;
  confidence: number;
}

// =============================================================================
// TIMING OPTIMIZER
// =============================================================================

class TimingOptimizer {
  private userEngagement: Map<string, HourlyEngagement> = new Map();

  getOptimalTime(
    userId: string,
    notification: Notification,
    preferences: UserPreferences["notifications"]
  ): Date | null {
    const now = new Date();

    // Check quiet hours
    if (this.isInQuietHours(now, preferences)) {
      return this.getNextNonQuietTime(preferences);
    }

    // For high priority, send immediately
    if (notification.priority === "urgent" || notification.priority === "high") {
      return now;
    }

    // Get user's typical engagement hours
    const engagement = this.userEngagement.get(userId);
    if (engagement) {
      const bestHour = this.findBestHour(engagement);
      if (bestHour !== null) {
        const optimal = new Date(now);
        optimal.setHours(bestHour, 0, 0, 0);
        if (optimal < now) {
          optimal.setDate(optimal.getDate() + 1);
        }
        return optimal;
      }
    }

    // Default: send now if not in quiet hours
    return now;
  }

  private isInQuietHours(
    time: Date,
    preferences: UserPreferences["notifications"]
  ): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const [startHour, startMin] = preferences.quietHoursStart.split(":").map(Number);
    const [endHour, endMin] = preferences.quietHoursEnd.split(":").map(Number);

    const currentMinutes = time.getHours() * 60 + time.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  private getNextNonQuietTime(
    preferences: UserPreferences["notifications"]
  ): Date {
    if (!preferences.quietHoursEnd) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    }

    const [endHour, endMin] = preferences.quietHoursEnd.split(":").map(Number);
    const nextTime = new Date();
    nextTime.setHours(endHour, endMin, 0, 0);

    if (nextTime < new Date()) {
      nextTime.setDate(nextTime.getDate() + 1);
    }

    return nextTime;
  }

  private findBestHour(engagement: HourlyEngagement): number | null {
    let bestHour = null;
    let bestScore = 0;

    for (let hour = 8; hour < 20; hour++) {
      const score = engagement[hour] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestHour = hour;
      }
    }

    return bestHour;
  }

  recordEngagement(userId: string, hour: number): void {
    const engagement = this.userEngagement.get(userId) || {};
    engagement[hour] = (engagement[hour] || 0) + 1;
    this.userEngagement.set(userId, engagement);
  }
}

type HourlyEngagement = Record<number, number>;

// =============================================================================
// NOTIFICATION BATCHER
// =============================================================================

class NotificationBatcher {
  private batches: Map<string, { notifications: Notification[]; timer: NodeJS.Timeout }> = new Map();

  constructor(private batchWindowMs: number, private onFlush: (batch: Notification[]) => void) {}

  add(notification: Notification): void {
    const key = `${notification.userId}:${notification.channel}`;
    let batch = this.batches.get(key);

    if (!batch) {
      const timer = setTimeout(() => this.flush(key), this.batchWindowMs);
      batch = { notifications: [], timer };
      this.batches.set(key, batch);
    }

    batch.notifications.push(notification);
  }

  private flush(key: string): void {
    const batch = this.batches.get(key);
    if (batch && batch.notifications.length > 0) {
      this.onFlush(batch.notifications);
      clearTimeout(batch.timer);
      this.batches.delete(key);
    }
  }

  flushAll(): void {
    for (const key of this.batches.keys()) {
      this.flush(key);
    }
  }
}

// =============================================================================
// NOTIFICATION SERVICE
// =============================================================================

export class NotificationService extends EventEmitter implements INotificationService {
  private config: NotificationServiceConfig;
  private channels: Map<string, NotificationChannel> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private userNotifications: Map<string, string[]> = new Map();
  private userPreferences: Map<string, UserPreferences> = new Map();
  private suggestionEngine: SuggestionEngine;
  private timingOptimizer: TimingOptimizer;
  private batcher: NotificationBatcher;
  private scheduledNotifications: Map<string, NodeJS.Timeout> = new Map();
  private dailyCounts: Map<string, { date: string; count: number }> = new Map();

  constructor(config: Partial<NotificationServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.suggestionEngine = new SuggestionEngine(this.config);
    this.timingOptimizer = new TimingOptimizer();
    this.batcher = new NotificationBatcher(
      this.config.batchWindowMs,
      this.deliverBatch.bind(this)
    );

    this.initializeChannels();

    log.info("Notification service initialized");
  }

  private initializeChannels(): void {
    this.channels.set("inApp", new InAppNotificationChannel());
    this.channels.set("push", new PushNotificationChannel());
    this.channels.set("email", new EmailNotificationChannel());
    this.channels.set("sms", new SMSNotificationChannel());
  }

  // ===========================================================================
  // NOTIFICATION MANAGEMENT
  // ===========================================================================

  async send(
    notification: Omit<Notification, "id" | "createdAt">
  ): Promise<Notification> {
    // Check daily limit
    if (!this.checkDailyLimit(notification.userId)) {
      throw new Error("Daily notification limit reached");
    }

    const newNotification: Notification = {
      ...notification,
      id: randomUUID(),
      createdAt: new Date(),
    };

    this.storeNotification(newNotification);

    // Get user preferences
    const preferences = this.userPreferences.get(notification.userId);

    // Determine optimal timing if not scheduled
    if (!notification.scheduledFor && preferences?.notifications) {
      const optimalTime = this.timingOptimizer.getOptimalTime(
        notification.userId,
        newNotification,
        preferences.notifications
      );

      if (optimalTime && optimalTime > new Date()) {
        return this.scheduleNotification(newNotification, optimalTime);
      }
    }

    // Check if batching is appropriate
    if (
      preferences?.notifications?.frequency === "batched" &&
      notification.priority !== "urgent" &&
      notification.priority !== "high"
    ) {
      this.batcher.add(newNotification);
      return newNotification;
    }

    // Deliver immediately
    await this.deliverNotification(newNotification);

    return newNotification;
  }

  async schedule(
    notification: Omit<Notification, "id" | "createdAt">
  ): Promise<Notification> {
    if (!notification.scheduledFor) {
      throw new Error("scheduledFor is required for scheduled notifications");
    }

    const newNotification: Notification = {
      ...notification,
      id: randomUUID(),
      status: "pending",
      createdAt: new Date(),
    };

    return this.scheduleNotification(newNotification, notification.scheduledFor);
  }

  private scheduleNotification(
    notification: Notification,
    scheduledFor: Date
  ): Notification {
    const delay = scheduledFor.getTime() - Date.now();

    if (delay <= 0) {
      // Schedule for immediate delivery
      this.deliverNotification(notification);
      return notification;
    }

    const timer = setTimeout(async () => {
      this.scheduledNotifications.delete(notification.id);
      await this.deliverNotification(notification);
    }, delay);

    this.scheduledNotifications.set(notification.id, timer);
    this.storeNotification(notification);

    log.debug(
      { notificationId: notification.id, scheduledFor },
      "Notification scheduled"
    );

    return notification;
  }

  async cancel(notificationId: string): Promise<void> {
    const timer = this.scheduledNotifications.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      this.scheduledNotifications.delete(notificationId);
    }

    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.status = "dismissed";
    }
  }

  async getNotifications(
    userId: string,
    filters?: NotificationFilters
  ): Promise<Notification[]> {
    const notificationIds = this.userNotifications.get(userId) || [];
    let notifications = notificationIds
      .map((id) => this.notifications.get(id))
      .filter((n): n is Notification => n !== undefined);

    if (filters) {
      if (filters.types) {
        notifications = notifications.filter((n) => filters.types!.includes(n.type));
      }
      if (filters.status) {
        notifications = notifications.filter((n) => filters.status!.includes(n.status));
      }
      if (filters.priority) {
        notifications = notifications.filter((n) => filters.priority!.includes(n.priority));
      }
      if (filters.channel) {
        notifications = notifications.filter((n) => n.channel === filters.channel);
      }
      if (filters.since) {
        notifications = notifications.filter((n) => n.createdAt >= filters.since!);
      }
      if (filters.until) {
        notifications = notifications.filter((n) => n.createdAt <= filters.until!);
      }
    }

    // Sort by created date, newest first
    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return notifications;
  }

  async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.status = "read";
      notification.readAt = new Date();

      // Record engagement
      const hour = new Date().getHours();
      this.timingOptimizer.recordEngagement(notification.userId, hour);

      this.emit("notification:read", { notificationId });
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const notificationIds = this.userNotifications.get(userId) || [];
    const now = new Date();

    for (const id of notificationIds) {
      const notification = this.notifications.get(id);
      if (notification && notification.status !== "read") {
        notification.status = "read";
        notification.readAt = now;
      }
    }
  }

  private async deliverNotification(notification: Notification): Promise<void> {
    const channel = this.channels.get(notification.channel);
    if (!channel || !channel.isAvailable()) {
      log.warn(
        { channel: notification.channel, notificationId: notification.id },
        "Channel not available"
      );
      return;
    }

    try {
      const success = await channel.send(notification);
      if (success) {
        notification.status = "sent";
        notification.sentAt = new Date();
        this.incrementDailyCount(notification.userId);
        this.emit("notification:sent", { notification });
      }
    } catch (err) {
      log.error(
        { err, notificationId: notification.id },
        "Failed to deliver notification"
      );
    }
  }

  private async deliverBatch(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;

    // Create a digest notification
    const firstNotification = notifications[0];
    const digestNotification: Notification = {
      id: randomUUID(),
      userId: firstNotification.userId,
      type: "update",
      priority: "normal",
      title: `You have ${notifications.length} notifications`,
      body: notifications.map((n) => `- ${n.title}`).join("\n"),
      richContent: {
        type: "list",
        data: notifications.map((n) => ({
          id: n.id,
          title: n.title,
          type: n.type,
        })),
      },
      channel: firstNotification.channel,
      status: "pending",
      createdAt: new Date(),
    };

    await this.deliverNotification(digestNotification);
  }

  private storeNotification(notification: Notification): void {
    this.notifications.set(notification.id, notification);

    const userNotifs = this.userNotifications.get(notification.userId) || [];
    userNotifs.push(notification.id);
    this.userNotifications.set(notification.userId, userNotifs);
  }

  private checkDailyLimit(userId: string): boolean {
    const today = new Date().toISOString().split("T")[0];
    const userCount = this.dailyCounts.get(userId);

    if (!userCount || userCount.date !== today) {
      return true;
    }

    return userCount.count < this.config.maxNotificationsPerDay;
  }

  private incrementDailyCount(userId: string): void {
    const today = new Date().toISOString().split("T")[0];
    const userCount = this.dailyCounts.get(userId);

    if (!userCount || userCount.date !== today) {
      this.dailyCounts.set(userId, { date: today, count: 1 });
    } else {
      userCount.count++;
    }
  }

  // ===========================================================================
  // PROACTIVE SUGGESTIONS
  // ===========================================================================

  async generateSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
    if (!this.config.enableProactiveSuggestions) {
      return [];
    }

    // In production, would gather context from other services
    const context: SuggestionContext = {
      // Would be populated from calendar and task services
    };

    return this.suggestionEngine.generateSuggestions(userId, context);
  }

  async evaluateSuggestionTiming(
    suggestion: ProactiveSuggestion
  ): Promise<Date | null> {
    const preferences = this.userPreferences.get(suggestion.userId);
    if (!preferences?.notifications) {
      return new Date(); // Now
    }

    // Create a mock notification to evaluate timing
    const mockNotification: Notification = {
      id: "mock",
      userId: suggestion.userId,
      type: "suggestion",
      priority: suggestion.priority > 7 ? "high" : suggestion.priority > 4 ? "normal" : "low",
      title: suggestion.title,
      body: suggestion.description,
      channel: "inApp",
      status: "pending",
      createdAt: new Date(),
    };

    return this.timingOptimizer.getOptimalTime(
      suggestion.userId,
      mockNotification,
      preferences.notifications
    );
  }

  getActiveSuggestions(userId: string): ProactiveSuggestion[] {
    return this.suggestionEngine.getActiveSuggestions(userId);
  }

  async dismissSuggestion(suggestionId: string, reason?: string): Promise<void> {
    const dismissed = this.suggestionEngine.dismissSuggestion(suggestionId, reason);
    if (dismissed) {
      this.emit("suggestion:dismissed", { suggestionId, reason });
    }
  }

  async acceptSuggestion(suggestionId: string, actionId: string): Promise<void> {
    const suggestions = Array.from(this.suggestionEngine.getActiveSuggestions("")).flat();
    const suggestion = suggestions.find((s) => s.id === suggestionId);

    if (suggestion) {
      suggestion.acceptedAction = actionId;
      this.suggestionEngine.learnFromFeedback(
        suggestion.userId,
        suggestionId,
        true,
        actionId
      );
      this.emit("suggestion:accepted", { suggestionId, actionId });
    }
  }

  // ===========================================================================
  // USER PREFERENCES
  // ===========================================================================

  setUserPreferences(userId: string, preferences: UserPreferences): void {
    this.userPreferences.set(userId, preferences);
  }

  // ===========================================================================
  // CHANNEL MANAGEMENT
  // ===========================================================================

  subscribeToInApp(
    userId: string,
    handler: (notification: Notification) => void
  ): void {
    const channel = this.channels.get("inApp") as InAppNotificationChannel;
    channel.subscribe(userId, handler);
  }

  unsubscribeFromInApp(userId: string): void {
    const channel = this.channels.get("inApp") as InAppNotificationChannel;
    channel.unsubscribe(userId);
  }

  registerPushSubscription(userId: string, subscription: PushSubscription): void {
    const channel = this.channels.get("push") as PushNotificationChannel;
    channel.registerSubscription(userId, subscription);
  }

  setUserEmail(userId: string, email: string): void {
    const channel = this.channels.get("email") as EmailNotificationChannel;
    channel.setUserEmail(userId, email);
  }

  setUserPhone(userId: string, phone: string): void {
    const channel = this.channels.get("sms") as SMSNotificationChannel;
    channel.setUserPhone(userId, phone);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async shutdown(): Promise<void> {
    log.info("Shutting down notification service");

    // Cancel all scheduled notifications
    for (const timer of this.scheduledNotifications.values()) {
      clearTimeout(timer);
    }
    this.scheduledNotifications.clear();

    // Flush pending batches
    this.batcher.flushAll();

    // Clear data
    this.notifications.clear();
    this.userNotifications.clear();

    log.info("Notification service shutdown complete");
  }

  getStats(): {
    totalNotifications: number;
    notificationsByStatus: Record<string, number>;
    scheduledCount: number;
    activeSuggestionCount: number;
  } {
    const byStatus: Record<string, number> = {};
    for (const notification of this.notifications.values()) {
      byStatus[notification.status] = (byStatus[notification.status] || 0) + 1;
    }

    return {
      totalNotifications: this.notifications.size,
      notificationsByStatus: byStatus,
      scheduledCount: this.scheduledNotifications.size,
      activeSuggestionCount: Array.from(this.userPreferences.keys())
        .reduce((sum, userId) => {
          return sum + this.suggestionEngine.getActiveSuggestions(userId).length;
        }, 0),
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let notificationServiceInstance: NotificationService | null = null;

export function createNotificationService(
  config?: Partial<NotificationServiceConfig>
): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService(config);
  }
  return notificationServiceInstance;
}

export function getNotificationService(): NotificationService | null {
  return notificationServiceInstance;
}

export async function shutdownNotificationService(): Promise<void> {
  if (notificationServiceInstance) {
    await notificationServiceInstance.shutdown();
    notificationServiceInstance = null;
  }
}
