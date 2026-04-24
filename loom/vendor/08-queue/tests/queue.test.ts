/**
 * @file queue.test.ts
 * @description Tests for the background job queue.
 * @phase Phase 7 - Production Readiness
 * @author SYS (Systems Analyst Agent)
 * @validated ALK (Auto-Link Developer Agent)
 * @created 2026-01-31
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  JobQueue,
  JobStatus,
  JobPriority,
  getJobQueue,
  resetJobQueue,
} from "../src/queue";

// Silence the logger stub's console output during tests.
vi.mock("../src/logger-stub", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue({
      concurrency: 1,
      maxAttempts: 3,
      baseDelay: 10, // Fast retries for testing
      maxDelay: 100,
      maxQueueSize: 100,
    });
  });

  afterEach(() => {
    queue.stop();
  });

  describe("Job Addition", () => {
    it("adds a job to the queue", async () => {
      const job = await queue.add("symlink.create", { path: "/test" });

      expect(job.id).toBeDefined();
      expect(job.type).toBe("symlink.create");
      expect(job.data).toEqual({ path: "/test" });
      expect(job.status).toBe(JobStatus.PENDING);
    });

    it("assigns default priority of NORMAL", async () => {
      const job = await queue.add("symlink.create", {});
      expect(job.priority).toBe(JobPriority.NORMAL);
    });

    it("accepts custom priority", async () => {
      const job = await queue.add(
        "symlink.create",
        {},
        { priority: JobPriority.HIGH }
      );
      expect(job.priority).toBe(JobPriority.HIGH);
    });

    it("throws when queue is full", async () => {
      const smallQueue = new JobQueue({ maxQueueSize: 2, concurrency: 1 });
      smallQueue.registerHandler("symlink.create", async () => {});

      await smallQueue.add("symlink.create", {});
      await smallQueue.add("symlink.create", {});

      await expect(smallQueue.add("symlink.create", {})).rejects.toThrow(
        "Queue is full"
      );

      smallQueue.stop();
    });
  });

  describe("Job Retrieval", () => {
    it("gets job by ID", async () => {
      const job = await queue.add("symlink.create", { test: true });
      const retrieved = queue.getJob(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(job.id);
    });

    it("returns undefined for unknown job ID", () => {
      expect(queue.getJob("unknown")).toBeUndefined();
    });

    it("gets all jobs", async () => {
      await queue.add("symlink.create", {});
      await queue.add("symlink.cleanup", {});

      const jobs = queue.getJobs();
      expect(jobs.length).toBe(2);
    });

    it("filters jobs by status", async () => {
      await queue.add("symlink.create", {});
      await queue.add("symlink.cleanup", {});

      const pendingJobs = queue.getJobs(JobStatus.PENDING);
      expect(pendingJobs.length).toBe(2);
    });
  });

  describe("Job Processing", () => {
    it("processes jobs when started", async () => {
      const handler = vi.fn().mockResolvedValue("done");
      queue.registerHandler("symlink.create", handler);

      const job = await queue.add("symlink.create", { data: "test" });
      queue.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledWith({ data: "test" });

      const processed = queue.getJob(job.id);
      expect(processed?.status).toBe(JobStatus.COMPLETED);
    });

    it("processes high priority jobs first", async () => {
      const order: string[] = [];
      queue.registerHandler("symlink.create", async (data: { id: string }) => {
        order.push(data.id);
      });

      await queue.add("symlink.create", { id: "low" }, { priority: JobPriority.LOW });
      await queue.add("symlink.create", { id: "high" }, { priority: JobPriority.HIGH });
      await queue.add("symlink.create", { id: "normal" }, { priority: JobPriority.NORMAL });

      queue.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(order).toEqual(["high", "normal", "low"]);
    });

    it("stores result on successful completion", async () => {
      queue.registerHandler("symlink.create", async () => ({ created: true }));

      const job = await queue.add("symlink.create", {});
      queue.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const completed = queue.getJob(job.id);
      expect(completed?.result).toEqual({ created: true });
    });
  });

  describe("Retry Logic", () => {
    it("retries failed jobs with exponential backoff", async () => {
      let attempts = 0;
      queue.registerHandler("symlink.create", async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary failure");
        }
        return "success";
      });

      const job = await queue.add("symlink.create", {});
      queue.start();

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(attempts).toBe(2);
      const completed = queue.getJob(job.id);
      expect(completed?.status).toBe(JobStatus.COMPLETED);
    });

    it("moves to dead letter queue after max attempts", async () => {
      queue.registerHandler("symlink.create", async () => {
        throw new Error("Permanent failure");
      });

      const job = await queue.add("symlink.create", {}, { maxAttempts: 2 });
      queue.start();

      // Wait for all retries
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(queue.getJob(job.id)?.status).toBe(JobStatus.DEAD);
      expect(queue.getDeadLetterJobs().length).toBe(1);
    });
  });

  describe("Dead Letter Queue", () => {
    it("can retry dead letter jobs", async () => {
      let shouldFail = true;
      queue.registerHandler("symlink.create", async () => {
        if (shouldFail) {
          throw new Error("Failure");
        }
        return "success";
      });

      const job = await queue.add("symlink.create", {}, { maxAttempts: 1 });
      queue.start();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(queue.getDeadLetterJobs().length).toBe(1);

      // Now fix the issue and retry
      shouldFail = false;
      const retried = await queue.retryDeadLetter(job.id);
      expect(retried).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(queue.getJob(job.id)?.status).toBe(JobStatus.COMPLETED);
    });

    it("returns false when retrying non-existent job", async () => {
      const result = await queue.retryDeadLetter("unknown");
      expect(result).toBe(false);
    });
  });

  describe("Queue Statistics", () => {
    it("provides accurate statistics", async () => {
      queue.registerHandler("symlink.create", async () => "done");

      await queue.add("symlink.create", {});
      await queue.add("symlink.create", {});

      let stats = queue.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.total).toBe(2);

      queue.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      stats = queue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(0);
    });
  });

  describe("Cleanup", () => {
    it("clears completed jobs", async () => {
      queue.registerHandler("symlink.create", async () => "done");

      await queue.add("symlink.create", {});
      await queue.add("symlink.create", {});
      queue.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queue.getJobs().length).toBe(2);

      const cleared = queue.clearCompleted();
      expect(cleared).toBe(2);
      expect(queue.getJobs().length).toBe(0);
    });
  });

  describe("Missing Handler", () => {
    it("moves job to dead letter when no handler exists", async () => {
      const job = await queue.add("symlink.create", {});
      queue.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(queue.getDeadLetterJobs().length).toBe(1);
      expect(queue.getJob(job.id)?.error).toBe("No handler registered");
    });
  });
});

describe("getJobQueue", () => {
  afterEach(() => {
    resetJobQueue();
  });

  it("returns singleton instance", () => {
    const q1 = getJobQueue();
    const q2 = getJobQueue();
    expect(q1).toBe(q2);
  });

  it("resets with resetJobQueue", () => {
    const q1 = getJobQueue();
    resetJobQueue();
    const q2 = getJobQueue();
    expect(q1).not.toBe(q2);
  });
});
