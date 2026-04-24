/**
 * @file queue.ts
 * @description In-memory job queue for background operations.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated ALK (Auto-Link Developer Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Async job processing
 * - Retry with exponential backoff
 * - Dead letter queue for failed jobs
 * - Job status tracking
 * - Priority-based processing
 */

import { randomUUID } from "crypto";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("queue");

/**
 * Job status states.
 */
export enum JobStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  DEAD = "dead",
}

/**
 * Job priority levels.
 */
export enum JobPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
}

/**
 * Job types supported by the queue.
 */
export type JobType =
  | "symlink.create"
  | "symlink.cleanup"
  | "project.scan"
  | "config.export";

/**
 * Job definition.
 */
export interface Job<T = unknown> {
  id: string;
  type: JobType;
  data: T;
  priority: JobPriority;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: unknown;
}

/**
 * Job handler function type.
 */
export type JobHandler<T = unknown, R = unknown> = (data: T) => Promise<R>;

/**
 * Queue configuration.
 */
export interface QueueConfig {
  /** Maximum concurrent jobs */
  concurrency: number;
  /** Default max retry attempts */
  maxAttempts: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay: number;
  /** Maximum delay cap (ms) */
  maxDelay: number;
  /** Maximum queue size */
  maxQueueSize: number;
}

/**
 * Default queue configuration.
 */
const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 2,
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  maxQueueSize: 1000,
};

/**
 * In-memory job queue with retry and dead letter support.
 */
export class JobQueue {
  private queue: Map<string, Job> = new Map();
  private deadLetterQueue: Map<string, Job> = new Map();
  private handlers: Map<JobType, JobHandler> = new Map();
  private processing: Set<string> = new Set();
  private config: QueueConfig;
  private isRunning: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Registers a handler for a job type.
   */
  registerHandler<T, R>(type: JobType, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler as JobHandler);
    log.debug({ type }, "Registered job handler");
  }

  /**
   * Adds a job to the queue.
   */
  async add<T>(
    type: JobType,
    data: T,
    options: { priority?: JobPriority; maxAttempts?: number } = {}
  ): Promise<Job<T>> {
    if (this.queue.size >= this.config.maxQueueSize) {
      throw new Error("Queue is full");
    }

    const job: Job<T> = {
      id: randomUUID(),
      type,
      data,
      priority: options.priority ?? JobPriority.NORMAL,
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.config.maxAttempts,
      createdAt: new Date(),
    };

    this.queue.set(job.id, job as Job);

    log.info({ jobId: job.id, type, priority: job.priority }, "Job added to queue");

    // Trigger processing if running
    if (this.isRunning) {
      setImmediate(() => this.processNext());
    }

    return job;
  }

  /**
   * Gets a job by ID.
   */
  getJob(id: string): Job | undefined {
    return this.queue.get(id) || this.deadLetterQueue.get(id);
  }

  /**
   * Gets all jobs with optional status filter.
   */
  getJobs(status?: JobStatus): Job[] {
    const jobs = Array.from(this.queue.values());
    if (status) {
      return jobs.filter((j) => j.status === status);
    }
    return jobs;
  }

  /**
   * Gets dead letter queue jobs.
   */
  getDeadLetterJobs(): Job[] {
    return Array.from(this.deadLetterQueue.values());
  }

  /**
   * Gets queue statistics.
   */
  getStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
    total: number;
  } {
    const jobs = Array.from(this.queue.values());
    return {
      pending: jobs.filter((j) => j.status === JobStatus.PENDING).length,
      processing: jobs.filter((j) => j.status === JobStatus.PROCESSING).length,
      completed: jobs.filter((j) => j.status === JobStatus.COMPLETED).length,
      failed: jobs.filter((j) => j.status === JobStatus.FAILED).length,
      dead: this.deadLetterQueue.size,
      total: this.queue.size + this.deadLetterQueue.size,
    };
  }

  /**
   * Starts the queue processor.
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Queue already running");
      return;
    }

    this.isRunning = true;
    log.info("Job queue started");

    // Process pending jobs
    this.processNext();

    // Periodic check for retry jobs
    this.processingInterval = setInterval(() => {
      this.processNext();
    }, 1000);
  }

  /**
   * Stops the queue processor.
   */
  stop(): void {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    log.info("Job queue stopped");
  }

  /**
   * Clears completed jobs from the queue.
   */
  clearCompleted(): number {
    let count = 0;
    for (const [id, job] of this.queue.entries()) {
      if (job.status === JobStatus.COMPLETED) {
        this.queue.delete(id);
        count++;
      }
    }
    log.debug({ count }, "Cleared completed jobs");
    return count;
  }

  /**
   * Retries a dead letter job.
   */
  async retryDeadLetter(jobId: string): Promise<boolean> {
    const job = this.deadLetterQueue.get(jobId);
    if (!job) {
      return false;
    }

    // Move back to main queue
    job.status = JobStatus.PENDING;
    job.attempts = 0;
    job.error = undefined;
    this.queue.set(jobId, job);
    this.deadLetterQueue.delete(jobId);

    log.info({ jobId }, "Dead letter job retried");

    if (this.isRunning) {
      setImmediate(() => this.processNext());
    }

    return true;
  }

  /**
   * Processes the next available job.
   */
  private async processNext(): Promise<void> {
    if (!this.isRunning) return;
    if (this.processing.size >= this.config.concurrency) return;

    // Get next pending job (sorted by priority, then creation time)
    const pendingJobs = Array.from(this.queue.values())
      .filter((j) => j.status === JobStatus.PENDING)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.createdAt.getTime() - b.createdAt.getTime(); // Older first
      });

    const job = pendingJobs[0];
    if (!job) return;

    await this.processJob(job);

    // Continue processing if more jobs available
    if (this.isRunning) {
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Processes a single job.
   */
  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      log.error({ jobId: job.id, type: job.type }, "No handler registered for job type");
      job.status = JobStatus.FAILED;
      job.error = "No handler registered";
      this.moveToDeadLetter(job);
      return;
    }

    this.processing.add(job.id);
    job.status = JobStatus.PROCESSING;
    job.startedAt = new Date();
    job.attempts++;

    log.debug(
      { jobId: job.id, type: job.type, attempt: job.attempts },
      "Processing job"
    );

    try {
      const result = await handler(job.data);
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      job.result = result;
      job.error = undefined;

      log.info(
        {
          jobId: job.id,
          type: job.type,
          duration: job.completedAt.getTime() - (job.startedAt?.getTime() || 0),
        },
        "Job completed successfully"
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      job.error = error;

      log.warn(
        { jobId: job.id, type: job.type, attempt: job.attempts, error },
        "Job failed"
      );

      if (job.attempts >= job.maxAttempts) {
        // Move to dead letter queue
        this.moveToDeadLetter(job);
      } else {
        // Schedule retry with exponential backoff
        job.status = JobStatus.PENDING;
        const delay = this.calculateBackoff(job.attempts);

        log.debug(
          { jobId: job.id, delay, nextAttempt: job.attempts + 1 },
          "Scheduling job retry"
        );

        setTimeout(() => {
          if (this.isRunning) {
            this.processNext();
          }
        }, delay);
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  /**
   * Calculates exponential backoff delay.
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * Moves a job to the dead letter queue.
   */
  private moveToDeadLetter(job: Job): void {
    job.status = JobStatus.DEAD;
    this.deadLetterQueue.set(job.id, job);
    this.queue.delete(job.id);

    log.error(
      { jobId: job.id, type: job.type, attempts: job.attempts, error: job.error },
      "Job moved to dead letter queue"
    );
  }
}

// Singleton instance
let queueInstance: JobQueue | null = null;

/**
 * Gets or creates the job queue instance.
 */
export function getJobQueue(config?: Partial<QueueConfig>): JobQueue {
  if (!queueInstance) {
    queueInstance = new JobQueue(config);
  }
  return queueInstance;
}

/**
 * Resets the job queue instance (for testing).
 */
export function resetJobQueue(): void {
  if (queueInstance) {
    queueInstance.stop();
    queueInstance = null;
  }
}
