/**
 * @file sync-queue.ts
 * @description Real-Time Sync Queue Management (Kafka-inspired)
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Implements event-driven sync queue management inspired by:
 * - Kafka: Partitions, offsets, consumer groups
 * - RabbitMQ: Acknowledge, retry, dead letter
 * - Redis Streams: Consumer groups, pending entries
 */

import { EventEmitter } from "events";
import {
  SyncEvent,
  SyncQueueMessage,
  SyncConsumer,
  SyncConsumerGroup,
  ChangeDocument,
  SyncError,
} from "./types";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Queue options
 */
export interface QueueOptions {
  /** Maximum queue size per partition */
  maxSize?: number;
  /** Message TTL in ms */
  messageTtl?: number;
  /** Lock timeout in ms */
  lockTimeout?: number;
  /** Max retry attempts */
  maxRetries?: number;
  /** Retry delay in ms */
  retryDelay?: number;
  /** Enable dead letter queue */
  enableDeadLetter?: boolean;
}

/**
 * Consumer options
 */
export interface ConsumerOptions {
  /** Consumer ID */
  id?: string;
  /** Consumer group */
  group?: string;
  /** Partitions to subscribe to */
  partitions?: string[];
  /** Batch size */
  batchSize?: number;
  /** Auto-acknowledge */
  autoAck?: boolean;
  /** Processing timeout */
  timeout?: number;
}

/**
 * Message handler
 */
export type MessageHandler = (
  message: SyncQueueMessage
) => Promise<void>;

// =============================================================================
// PARTITION
// =============================================================================

/**
 * Queue partition
 */
export class Partition {
  readonly name: string;
  private messages: SyncQueueMessage[];
  private offset: number;
  private maxSize: number;
  private messageTtl: number;

  constructor(name: string, options: QueueOptions = {}) {
    this.name = name;
    this.messages = [];
    this.offset = 0;
    this.maxSize = options.maxSize || 10000;
    this.messageTtl = options.messageTtl || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Append message to partition
   */
  append(message: SyncQueueMessage): number {
    if (this.messages.length >= this.maxSize) {
      // Remove oldest message
      this.messages.shift();
    }

    message.id = `${this.name}-${this.offset}`;
    this.messages.push(message);
    this.offset++;

    return this.offset - 1;
  }

  /**
   * Get messages from offset
   */
  getFrom(offset: number, limit: number = 100): SyncQueueMessage[] {
    const startIndex = offset - (this.offset - this.messages.length);
    if (startIndex < 0 || startIndex >= this.messages.length) {
      return [];
    }
    return this.messages.slice(startIndex, startIndex + limit);
  }

  /**
   * Get latest offset
   */
  getLatestOffset(): number {
    return this.offset;
  }

  /**
   * Get earliest available offset
   */
  getEarliestOffset(): number {
    return this.offset - this.messages.length;
  }

  /**
   * Get message count
   */
  get length(): number {
    return this.messages.length;
  }

  /**
   * Prune expired messages
   */
  prune(): number {
    const now = Date.now();
    const cutoff = new Date(now - this.messageTtl);

    const originalLength = this.messages.length;
    this.messages = this.messages.filter(
      (m) => m.createdAt.getTime() > cutoff.getTime()
    );

    return originalLength - this.messages.length;
  }
}

// =============================================================================
// SYNC QUEUE
// =============================================================================

/**
 * Events emitted by sync queue
 */
export interface SyncQueueEvents {
  message_enqueued: (message: SyncQueueMessage) => void;
  message_processed: (message: SyncQueueMessage) => void;
  message_failed: (message: SyncQueueMessage, error: Error) => void;
  message_dead_lettered: (message: SyncQueueMessage) => void;
  consumer_joined: (consumer: SyncConsumer) => void;
  consumer_left: (consumerId: string) => void;
  rebalance: (group: SyncConsumerGroup) => void;
}

/**
 * Sync queue - manages partitioned message queues
 */
export class SyncQueue extends EventEmitter {
  private partitions: Map<string, Partition>;
  private consumerGroups: Map<string, SyncConsumerGroup>;
  private deadLetterQueue: SyncQueueMessage[];
  private options: Required<QueueOptions>;
  private lockedMessages: Map<string, { consumerId: string; expires: Date }>;
  private pruneInterval: NodeJS.Timeout | null;

  constructor(options: QueueOptions = {}) {
    super();

    this.partitions = new Map();
    this.consumerGroups = new Map();
    this.deadLetterQueue = [];
    this.lockedMessages = new Map();
    this.pruneInterval = null;

    this.options = {
      maxSize: options.maxSize || 10000,
      messageTtl: options.messageTtl || 24 * 60 * 60 * 1000,
      lockTimeout: options.lockTimeout || 30000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      enableDeadLetter: options.enableDeadLetter ?? true,
    };

    // Start pruning timer
    this.startPruning();
  }

  /**
   * Create a partition
   */
  createPartition(name: string): Partition {
    if (this.partitions.has(name)) {
      return this.partitions.get(name)!;
    }

    const partition = new Partition(name, this.options);
    this.partitions.set(name, partition);
    return partition;
  }

  /**
   * Get or create a partition
   */
  getPartition(name: string): Partition {
    if (!this.partitions.has(name)) {
      return this.createPartition(name);
    }
    return this.partitions.get(name)!;
  }

  /**
   * Enqueue a message
   */
  enqueue(
    partition: string,
    payload: ChangeDocument,
    priority: number = 0
  ): SyncQueueMessage {
    const part = this.getPartition(partition);

    const message: SyncQueueMessage = {
      id: "",
      queue: partition,
      payload,
      priority,
      attempts: 0,
      maxAttempts: this.options.maxRetries,
      createdAt: new Date(),
      processAfter: new Date(),
      lockedBy: null,
      lockExpires: null,
      status: "pending",
    };

    part.append(message);
    this.emit("message_enqueued", message);

    return message;
  }

  /**
   * Dequeue a message for processing
   */
  dequeue(
    partition: string,
    consumerId: string
  ): SyncQueueMessage | null {
    const part = this.getPartition(partition);
    const now = new Date();

    // Find first available message
    const messages = part.getFrom(part.getEarliestOffset(), part.length);

    for (const message of messages) {
      if (message.status !== "pending") continue;
      if (message.processAfter > now) continue;

      // Check if locked by another consumer
      const lock = this.lockedMessages.get(message.id);
      if (lock && lock.expires > now && lock.consumerId !== consumerId) {
        continue;
      }

      // Lock the message
      message.status = "processing";
      message.lockedBy = consumerId;
      message.lockExpires = new Date(Date.now() + this.options.lockTimeout);
      message.attempts++;

      this.lockedMessages.set(message.id, {
        consumerId,
        expires: message.lockExpires,
      });

      return message;
    }

    return null;
  }

  /**
   * Acknowledge message processing success
   */
  ack(messageId: string): void {
    this.lockedMessages.delete(messageId);
    const message = this.findMessage(messageId);
    if (message) {
      message.status = "completed";
      this.emit("message_processed", message);
    }
  }

  /**
   * Negative acknowledge - message failed
   */
  nack(messageId: string, error?: Error): void {
    this.lockedMessages.delete(messageId);
    const message = this.findMessage(messageId);

    if (!message) return;

    if (message.attempts >= message.maxAttempts) {
      // Move to dead letter queue
      message.status = "dead";
      if (this.options.enableDeadLetter) {
        this.deadLetterQueue.push(message);
        this.emit("message_dead_lettered", message);
      }
    } else {
      // Retry with delay
      message.status = "pending";
      message.lockedBy = null;
      message.lockExpires = null;
      message.processAfter = new Date(
        Date.now() + this.options.retryDelay * message.attempts
      );
    }

    if (error) {
      this.emit("message_failed", message, error);
    }
  }

  /**
   * Create a consumer group
   */
  createConsumerGroup(
    groupId: string,
    partitions: string[] = []
  ): SyncConsumerGroup {
    if (this.consumerGroups.has(groupId)) {
      return this.consumerGroups.get(groupId)!;
    }

    const group: SyncConsumerGroup = {
      id: groupId,
      name: groupId,
      partitions: partitions.length > 0 ? partitions : Array.from(this.partitions.keys()),
      consumers: [],
      offsets: {},
      rebalanceStrategy: "roundrobin",
    };

    // Initialize offsets
    for (const partition of group.partitions) {
      const part = this.getPartition(partition);
      group.offsets[partition] = part.getLatestOffset();
    }

    this.consumerGroups.set(groupId, group);
    return group;
  }

  /**
   * Join a consumer group
   */
  joinConsumerGroup(
    groupId: string,
    consumerId: string,
    host: string
  ): SyncConsumer {
    let group = this.consumerGroups.get(groupId);
    if (!group) {
      group = this.createConsumerGroup(groupId);
    }

    const consumer: SyncConsumer = {
      id: consumerId,
      host,
      assignedPartitions: [],
      lastHeartbeat: new Date(),
      active: true,
    };

    group.consumers.push(consumer);
    this.rebalanceGroup(group);
    this.emit("consumer_joined", consumer);

    return consumer;
  }

  /**
   * Leave a consumer group
   */
  leaveConsumerGroup(groupId: string, consumerId: string): void {
    const group = this.consumerGroups.get(groupId);
    if (!group) return;

    group.consumers = group.consumers.filter((c) => c.id !== consumerId);
    this.rebalanceGroup(group);
    this.emit("consumer_left", consumerId);
  }

  /**
   * Rebalance partitions in a consumer group
   */
  private rebalanceGroup(group: SyncConsumerGroup): void {
    if (group.consumers.length === 0) return;

    // Clear existing assignments
    for (const consumer of group.consumers) {
      consumer.assignedPartitions = [];
    }

    // Assign partitions based on strategy
    switch (group.rebalanceStrategy) {
      case "roundrobin":
        this.roundRobinAssign(group);
        break;
      case "range":
        this.rangeAssign(group);
        break;
      case "sticky":
        this.stickyAssign(group);
        break;
    }

    this.emit("rebalance", group);
  }

  private roundRobinAssign(group: SyncConsumerGroup): void {
    let consumerIndex = 0;
    for (const partition of group.partitions) {
      group.consumers[consumerIndex].assignedPartitions.push(partition);
      consumerIndex = (consumerIndex + 1) % group.consumers.length;
    }
  }

  private rangeAssign(group: SyncConsumerGroup): void {
    const partitionsPerConsumer = Math.ceil(
      group.partitions.length / group.consumers.length
    );

    let partitionIndex = 0;
    for (const consumer of group.consumers) {
      for (
        let i = 0;
        i < partitionsPerConsumer && partitionIndex < group.partitions.length;
        i++
      ) {
        consumer.assignedPartitions.push(group.partitions[partitionIndex]);
        partitionIndex++;
      }
    }
  }

  private stickyAssign(group: SyncConsumerGroup): void {
    // Sticky assignment tries to preserve existing assignments
    // For simplicity, fall back to round robin
    this.roundRobinAssign(group);
  }

  /**
   * Commit offset for a consumer group
   */
  commitOffset(
    groupId: string,
    partition: string,
    offset: number
  ): void {
    const group = this.consumerGroups.get(groupId);
    if (group) {
      group.offsets[partition] = offset;
    }
  }

  /**
   * Get committed offset for a consumer group
   */
  getCommittedOffset(groupId: string, partition: string): number {
    const group = this.consumerGroups.get(groupId);
    if (!group) return 0;
    return group.offsets[partition] || 0;
  }

  /**
   * Update consumer heartbeat
   */
  heartbeat(groupId: string, consumerId: string): void {
    const group = this.consumerGroups.get(groupId);
    if (!group) return;

    const consumer = group.consumers.find((c) => c.id === consumerId);
    if (consumer) {
      consumer.lastHeartbeat = new Date();
    }
  }

  /**
   * Get dead letter queue messages
   */
  getDeadLetterQueue(): SyncQueueMessage[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry a dead letter message
   */
  retryDeadLetter(messageId: string): boolean {
    const index = this.deadLetterQueue.findIndex((m) => m.id === messageId);
    if (index < 0) return false;

    const message = this.deadLetterQueue.splice(index, 1)[0];
    message.status = "pending";
    message.attempts = 0;
    message.processAfter = new Date();

    const partition = this.getPartition(message.queue);
    partition.append(message);

    return true;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    let totalMessages = 0;
    let pendingMessages = 0;
    let processingMessages = 0;
    const partitionStats: Record<string, { length: number; offset: number }> = {};

    for (const [name, partition] of this.partitions) {
      const messages = partition.getFrom(
        partition.getEarliestOffset(),
        partition.length
      );

      totalMessages += messages.length;
      pendingMessages += messages.filter((m) => m.status === "pending").length;
      processingMessages += messages.filter(
        (m) => m.status === "processing"
      ).length;

      partitionStats[name] = {
        length: partition.length,
        offset: partition.getLatestOffset(),
      };
    }

    return {
      totalMessages,
      pendingMessages,
      processingMessages,
      deadLetterCount: this.deadLetterQueue.length,
      partitionCount: this.partitions.size,
      consumerGroupCount: this.consumerGroups.size,
      partitions: partitionStats,
    };
  }

  /**
   * Stop the queue
   */
  stop(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private findMessage(messageId: string): SyncQueueMessage | null {
    const [partitionName] = messageId.split("-");
    const partition = this.partitions.get(partitionName);
    if (!partition) return null;

    const messages = partition.getFrom(
      partition.getEarliestOffset(),
      partition.length
    );
    return messages.find((m) => m.id === messageId) || null;
  }

  private startPruning(): void {
    this.pruneInterval = setInterval(() => {
      for (const partition of this.partitions.values()) {
        partition.prune();
      }

      // Prune expired locks
      const now = new Date();
      for (const [messageId, lock] of this.lockedMessages) {
        if (lock.expires < now) {
          this.lockedMessages.delete(messageId);
          const message = this.findMessage(messageId);
          if (message && message.status === "processing") {
            message.status = "pending";
            message.lockedBy = null;
            message.lockExpires = null;
          }
        }
      }

      // Remove stale consumers
      for (const group of this.consumerGroups.values()) {
        const staleThreshold = new Date(Date.now() - 60000); // 1 minute
        const staleConsumers = group.consumers.filter(
          (c) => c.lastHeartbeat < staleThreshold
        );

        if (staleConsumers.length > 0) {
          group.consumers = group.consumers.filter(
            (c) => c.lastHeartbeat >= staleThreshold
          );
          this.rebalanceGroup(group);

          for (const consumer of staleConsumers) {
            this.emit("consumer_left", consumer.id);
          }
        }
      }
    }, 60000); // Every minute
  }
}

// =============================================================================
// QUEUE STATS
// =============================================================================

/**
 * Queue statistics
 */
export interface QueueStats {
  totalMessages: number;
  pendingMessages: number;
  processingMessages: number;
  deadLetterCount: number;
  partitionCount: number;
  consumerGroupCount: number;
  partitions: Record<string, { length: number; offset: number }>;
}

// =============================================================================
// SYNC CONSUMER
// =============================================================================

/**
 * Sync queue consumer
 */
export class SyncQueueConsumer extends EventEmitter {
  private queue: SyncQueue;
  private options: Required<ConsumerOptions>;
  private running: boolean;
  private handlers: Map<string, MessageHandler>;
  private consumerId: string;
  private groupId: string | null;

  constructor(queue: SyncQueue, options: ConsumerOptions = {}) {
    super();

    this.queue = queue;
    this.options = {
      id: options.id || uuidv4(),
      group: options.group || "",
      partitions: options.partitions || [],
      batchSize: options.batchSize || 10,
      autoAck: options.autoAck ?? true,
      timeout: options.timeout || 30000,
    };

    this.running = false;
    this.handlers = new Map();
    this.consumerId = this.options.id;
    this.groupId = this.options.group || null;
  }

  /**
   * Subscribe to partitions with a handler
   */
  subscribe(partitions: string[], handler: MessageHandler): void {
    for (const partition of partitions) {
      this.handlers.set(partition, handler);
    }

    if (this.groupId) {
      for (const partition of partitions) {
        this.queue.joinConsumerGroup(this.groupId, this.consumerId, "localhost");
      }
    }
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    this.running = true;

    while (this.running) {
      let processed = 0;

      for (const [partition, handler] of this.handlers) {
        if (!this.running) break;

        for (let i = 0; i < this.options.batchSize; i++) {
          const message = this.queue.dequeue(partition, this.consumerId);
          if (!message) break;

          try {
            await Promise.race([
              handler(message),
              this.timeout(this.options.timeout),
            ]);

            if (this.options.autoAck) {
              this.queue.ack(message.id);
            }

            processed++;
          } catch (error) {
            this.queue.nack(
              message.id,
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }
      }

      // If no messages processed, wait a bit
      if (processed === 0) {
        await this.sleep(100);
      }

      // Send heartbeat
      if (this.groupId) {
        this.queue.heartbeat(this.groupId, this.consumerId);
      }
    }
  }

  /**
   * Stop consuming
   */
  stop(): void {
    this.running = false;
    if (this.groupId) {
      this.queue.leaveConsumerGroup(this.groupId, this.consumerId);
    }
  }

  /**
   * Manually acknowledge a message
   */
  ack(messageId: string): void {
    this.queue.ack(messageId);
  }

  /**
   * Manually negative acknowledge a message
   */
  nack(messageId: string, error?: Error): void {
    this.queue.nack(messageId, error);
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Processing timeout")), ms);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================
// All entries are inline-exported. Trailing block removed 2026-04-14 to
// fix duplicate-export errors.
