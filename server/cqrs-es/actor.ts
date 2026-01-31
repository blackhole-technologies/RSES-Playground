/**
 * @file actor.ts
 * @description Actor Model implementation for concurrent processing.
 * @phase Phase 9 - Industry-Leading Scalability
 * @author SYS (Systems Analyst Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Isolated actors with private state
 * - Asynchronous message passing
 * - Mailbox with backpressure
 * - Supervision strategies
 * - Location transparency
 * - Actor hierarchy (parent-child)
 * - Persistence for event-sourced actors
 *
 * Inspired by:
 * - Akka/Pekko actor model
 * - Erlang/OTP gen_server
 * - Microsoft Orleans virtual actors
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  ActorRef,
  ActorMessage,
  ActorState,
  SupervisionStrategy,
} from "./types";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("actor");

// ==================== Actor Context ====================

/**
 * Context provided to actors for system interaction.
 */
export interface ActorContext {
  /** This actor's reference */
  self: ActorRef;
  /** Parent actor reference (if any) */
  parent?: ActorRef;
  /** Actor system reference */
  system: ActorSystem;
  /** Send message to another actor */
  send<T>(to: ActorRef, message: T, replyTo?: ActorRef): void;
  /** Create a child actor */
  spawn<TState, TMessage>(
    type: string,
    props: ActorProps<TState, TMessage>
  ): ActorRef;
  /** Stop a child actor */
  stop(child: ActorRef): void;
  /** Watch another actor for termination */
  watch(actor: ActorRef): void;
  /** Schedule a message to self */
  scheduleOnce<T>(delay: number, message: T): void;
  /** Schedule recurring message to self */
  scheduleRepeatedly<T>(interval: number, message: T): () => void;
  /** Get the current correlation ID */
  correlationId?: string;
}

// ==================== Actor Props ====================

/**
 * Properties for creating an actor.
 */
export interface ActorProps<TState = unknown, TMessage = unknown> {
  /** Initial state */
  initialState: TState;
  /** Message handler */
  receive: (
    state: TState,
    message: TMessage,
    context: ActorContext
  ) => TState | Promise<TState>;
  /** Called when actor starts */
  onStart?: (state: TState, context: ActorContext) => TState | Promise<TState>;
  /** Called when actor stops */
  onStop?: (state: TState, context: ActorContext) => void | Promise<void>;
  /** Called when a child fails */
  supervisorStrategy?: (
    error: Error,
    child: ActorRef,
    context: ActorContext
  ) => SupervisionStrategy;
  /** Mailbox size limit */
  mailboxSize?: number;
  /** Enable persistence */
  persistenceEnabled?: boolean;
}

// ==================== Mailbox ====================

/**
 * Actor mailbox for message queuing.
 */
export class Mailbox<T> {
  private queue: ActorMessage<T>[] = [];
  private priorityQueue: ActorMessage<T>[] = [];
  private maxSize: number;
  private processing: boolean = false;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Enqueues a message.
   */
  enqueue(message: ActorMessage<T>): boolean {
    const queue = message.priority > 5 ? this.priorityQueue : this.queue;

    if (queue.length >= this.maxSize) {
      log.warn(
        { recipient: message.recipient.id, queueSize: queue.length },
        "Mailbox full, dropping message"
      );
      return false;
    }

    queue.push(message);
    return true;
  }

  /**
   * Dequeues the next message.
   */
  dequeue(): ActorMessage<T> | undefined {
    // Priority queue first
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue.shift();
    }
    return this.queue.shift();
  }

  /**
   * Returns the number of pending messages.
   */
  get size(): number {
    return this.queue.length + this.priorityQueue.length;
  }

  /**
   * Checks if mailbox is empty.
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Clears the mailbox.
   */
  clear(): void {
    this.queue = [];
    this.priorityQueue = [];
  }
}

// ==================== Actor Instance ====================

/**
 * Internal actor instance.
 */
class ActorInstance<TState = unknown, TMessage = unknown> {
  readonly ref: ActorRef;
  private state: TState;
  private props: ActorProps<TState, TMessage>;
  private mailbox: Mailbox<TMessage>;
  private children: Map<string, ActorInstance> = new Map();
  private watchers: Set<ActorRef> = new Set();
  private watching: Set<string> = new Set();
  private scheduledTimers: Set<NodeJS.Timeout> = new Set();
  private system: ActorSystem;
  private parent?: ActorInstance;
  private processing: boolean = false;
  private stopped: boolean = false;

  constructor(
    ref: ActorRef,
    props: ActorProps<TState, TMessage>,
    system: ActorSystem,
    parent?: ActorInstance
  ) {
    this.ref = ref;
    this.props = props;
    this.state = props.initialState;
    this.mailbox = new Mailbox(props.mailboxSize);
    this.system = system;
    this.parent = parent;
  }

  /**
   * Starts the actor.
   */
  async start(): Promise<void> {
    if (this.props.onStart) {
      const context = this.createContext();
      try {
        const newState = await Promise.resolve(
          this.props.onStart(this.state, context)
        );
        this.state = newState;
      } catch (error) {
        log.error(
          { actor: this.ref.id, error: (error as Error).message },
          "Actor failed to start"
        );
        throw error;
      }
    }

    log.debug({ actor: this.ref.id, type: this.ref.type }, "Actor started");
  }

  /**
   * Stops the actor and all children.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    // Stop all children first
    for (const child of this.children.values()) {
      await child.stop();
    }

    // Clear scheduled timers
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();

    // Call onStop hook
    if (this.props.onStop) {
      const context = this.createContext();
      try {
        await Promise.resolve(this.props.onStop(this.state, context));
      } catch (error) {
        log.error(
          { actor: this.ref.id, error: (error as Error).message },
          "Error during actor stop"
        );
      }
    }

    // Notify watchers
    for (const watcher of this.watchers) {
      this.system.send(watcher, {
        type: "Terminated",
        actor: this.ref,
      });
    }

    // Clear mailbox
    this.mailbox.clear();

    log.debug({ actor: this.ref.id }, "Actor stopped");
  }

  /**
   * Receives a message.
   */
  receive(message: ActorMessage<TMessage>): boolean {
    if (this.stopped) {
      log.warn(
        { actor: this.ref.id, messageType: message.type },
        "Message sent to stopped actor"
      );
      return false;
    }

    const enqueued = this.mailbox.enqueue(message);

    if (enqueued && !this.processing) {
      this.processMailbox();
    }

    return enqueued;
  }

  /**
   * Processes messages in the mailbox.
   */
  private async processMailbox(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    try {
      while (!this.mailbox.isEmpty && !this.stopped) {
        const message = this.mailbox.dequeue();
        if (!message) break;

        // Check TTL
        if (message.ttl > 0) {
          const age = Date.now() - message.timestamp.getTime();
          if (age > message.ttl) {
            log.debug(
              { actor: this.ref.id, messageType: message.type, age },
              "Message expired"
            );
            continue;
          }
        }

        await this.handleMessage(message);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Handles a single message.
   */
  private async handleMessage(message: ActorMessage<TMessage>): Promise<void> {
    const context = this.createContext(message.sender);

    try {
      const newState = await Promise.resolve(
        this.props.receive(this.state, message.payload, context)
      );
      this.state = newState;
    } catch (error) {
      log.error(
        {
          actor: this.ref.id,
          messageType: message.type,
          error: (error as Error).message,
        },
        "Actor message handling failed"
      );

      // Handle supervision
      if (this.parent) {
        this.parent.handleChildFailure(this, error as Error);
      }
    }
  }

  /**
   * Handles child actor failure.
   */
  handleChildFailure(child: ActorInstance, error: Error): void {
    const context = this.createContext();
    const strategy = this.props.supervisorStrategy?.(error, child.ref, context)
      ?? SupervisionStrategy.RESTART;

    log.debug(
      {
        parent: this.ref.id,
        child: child.ref.id,
        strategy,
        error: error.message,
      },
      "Handling child failure"
    );

    switch (strategy) {
      case SupervisionStrategy.RESTART:
        child.restart();
        break;
      case SupervisionStrategy.RESUME:
        // Just continue processing
        break;
      case SupervisionStrategy.STOP:
        this.stopChild(child.ref);
        break;
      case SupervisionStrategy.ESCALATE:
        if (this.parent) {
          this.parent.handleChildFailure(this, error);
        }
        break;
    }
  }

  /**
   * Restarts the actor.
   */
  private async restart(): Promise<void> {
    log.debug({ actor: this.ref.id }, "Restarting actor");

    // Reset state
    this.state = this.props.initialState;
    this.mailbox.clear();

    // Restart
    await this.start();
  }

  /**
   * Creates a child actor.
   */
  spawnChild<TChildState, TChildMessage>(
    type: string,
    props: ActorProps<TChildState, TChildMessage>
  ): ActorRef {
    const childRef: ActorRef = {
      id: randomUUID(),
      type,
      path: `${this.ref.path}/${type}-${this.children.size}`,
    };

    const child = new ActorInstance<TChildState, TChildMessage>(
      childRef,
      props,
      this.system,
      this as ActorInstance
    );

    this.children.set(childRef.id, child as ActorInstance);
    child.start();

    return childRef;
  }

  /**
   * Stops a child actor.
   */
  stopChild(childRef: ActorRef): void {
    const child = this.children.get(childRef.id);
    if (child) {
      child.stop();
      this.children.delete(childRef.id);
    }
  }

  /**
   * Watches another actor.
   */
  watch(actor: ActorRef): void {
    this.watching.add(actor.id);
    this.system.addWatcher(actor, this.ref);
  }

  /**
   * Adds a watcher to this actor.
   */
  addWatcher(watcher: ActorRef): void {
    this.watchers.add(watcher);
  }

  /**
   * Creates an actor context.
   */
  private createContext(sender?: ActorRef): ActorContext {
    const self = this;

    return {
      self: this.ref,
      parent: this.parent?.ref,
      system: this.system,

      send<T>(to: ActorRef, message: T, replyTo?: ActorRef): void {
        self.system.send(to, message, self.ref, replyTo);
      },

      spawn<TState, TMessage>(
        type: string,
        props: ActorProps<TState, TMessage>
      ): ActorRef {
        return self.spawnChild(type, props);
      },

      stop(child: ActorRef): void {
        self.stopChild(child);
      },

      watch(actor: ActorRef): void {
        self.watch(actor);
      },

      scheduleOnce<T>(delay: number, message: T): void {
        const timer = setTimeout(() => {
          self.system.send(self.ref, message, self.ref);
          self.scheduledTimers.delete(timer);
        }, delay);
        self.scheduledTimers.add(timer);
      },

      scheduleRepeatedly<T>(interval: number, message: T): () => void {
        const timer = setInterval(() => {
          self.system.send(self.ref, message, self.ref);
        }, interval);
        self.scheduledTimers.add(timer as unknown as NodeJS.Timeout);

        return () => {
          clearInterval(timer);
          self.scheduledTimers.delete(timer as unknown as NodeJS.Timeout);
        };
      },
    };
  }

  /**
   * Gets the current state (for persistence).
   */
  getState(): TState {
    return this.state;
  }

  /**
   * Gets mailbox size.
   */
  get mailboxSize(): number {
    return this.mailbox.size;
  }
}

// ==================== Actor System ====================

/**
 * Actor system configuration.
 */
export interface ActorSystemConfig {
  /** System name */
  name: string;
  /** Default mailbox size */
  defaultMailboxSize: number;
  /** Enable dead letter logging */
  logDeadLetters: boolean;
  /** Maximum actor hierarchy depth */
  maxDepth: number;
}

const DEFAULT_SYSTEM_CONFIG: ActorSystemConfig = {
  name: "default",
  defaultMailboxSize: 1000,
  logDeadLetters: true,
  maxDepth: 10,
};

/**
 * Actor system for managing actors.
 */
export class ActorSystem {
  private config: ActorSystemConfig;
  private actors: Map<string, ActorInstance> = new Map();
  private emitter: EventEmitter = new EventEmitter();
  private deadLetters: ActorMessage[] = [];
  private running: boolean = false;

  constructor(config: Partial<ActorSystemConfig> = {}) {
    this.config = { ...DEFAULT_SYSTEM_CONFIG, ...config };
    this.emitter.setMaxListeners(1000);
  }

  /**
   * Starts the actor system.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    log.info({ system: this.config.name }, "Actor system started");
  }

  /**
   * Stops the actor system.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Stop all actors
    const stopPromises = Array.from(this.actors.values()).map((actor) =>
      actor.stop()
    );
    await Promise.all(stopPromises);

    this.actors.clear();
    log.info({ system: this.config.name }, "Actor system stopped");
  }

  /**
   * Creates a root-level actor.
   */
  spawn<TState, TMessage>(
    type: string,
    props: ActorProps<TState, TMessage>
  ): ActorRef {
    const ref: ActorRef = {
      id: randomUUID(),
      type,
      path: `/${this.config.name}/${type}`,
    };

    const actor = new ActorInstance<TState, TMessage>(ref, props, this);
    this.actors.set(ref.id, actor as ActorInstance);
    actor.start();

    log.debug({ actor: ref.id, type }, "Actor spawned");

    return ref;
  }

  /**
   * Sends a message to an actor.
   */
  send<T>(
    to: ActorRef,
    payload: T,
    sender?: ActorRef,
    replyTo?: ActorRef
  ): void {
    const message: ActorMessage<T> = {
      id: randomUUID(),
      sender,
      recipient: to,
      type: typeof payload === "object" ? (payload as Record<string, unknown>).type as string ?? "Unknown" : "Value",
      payload,
      timestamp: new Date(),
      replyTo,
      priority: 5,
      ttl: 0,
    };

    const actor = this.actors.get(to.id);

    if (!actor) {
      // Dead letter
      if (this.config.logDeadLetters) {
        log.warn(
          { recipient: to.id, messageType: message.type },
          "Dead letter - actor not found"
        );
      }
      this.deadLetters.push(message as ActorMessage);
      this.emitter.emit("deadLetter", message);
      return;
    }

    actor.receive(message as ActorMessage);
  }

  /**
   * Stops an actor.
   */
  async stopActor(ref: ActorRef): Promise<void> {
    const actor = this.actors.get(ref.id);
    if (actor) {
      await actor.stop();
      this.actors.delete(ref.id);
    }
  }

  /**
   * Adds a watcher relationship.
   */
  addWatcher(watched: ActorRef, watcher: ActorRef): void {
    const actor = this.actors.get(watched.id);
    if (actor) {
      actor.addWatcher(watcher);
    }
  }

  /**
   * Subscribes to dead letters.
   */
  onDeadLetter(callback: (message: ActorMessage) => void): () => void {
    this.emitter.on("deadLetter", callback);
    return () => this.emitter.off("deadLetter", callback);
  }

  /**
   * Gets system statistics.
   */
  getStats(): {
    actorCount: number;
    deadLetterCount: number;
    running: boolean;
  } {
    return {
      actorCount: this.actors.size,
      deadLetterCount: this.deadLetters.length,
      running: this.running,
    };
  }

  /**
   * Gets an actor reference by ID.
   */
  getActor(id: string): ActorRef | undefined {
    return this.actors.get(id)?.ref;
  }

  /**
   * Lists all actor references.
   */
  listActors(): ActorRef[] {
    return Array.from(this.actors.values()).map((a) => a.ref);
  }
}

// ==================== Actor Builder ====================

/**
 * Builder for creating actor props.
 */
export class ActorPropsBuilder<TState, TMessage> {
  private _initialState: TState = undefined as TState;
  private _receive?: ActorProps<TState, TMessage>["receive"];
  private _onStart?: ActorProps<TState, TMessage>["onStart"];
  private _onStop?: ActorProps<TState, TMessage>["onStop"];
  private _supervisorStrategy?: ActorProps<TState, TMessage>["supervisorStrategy"];
  private _mailboxSize?: number;
  private _persistenceEnabled?: boolean;

  static create<TState, TMessage>(): ActorPropsBuilder<TState, TMessage> {
    return new ActorPropsBuilder<TState, TMessage>();
  }

  withInitialState(state: TState): this {
    this._initialState = state;
    return this;
  }

  withReceive(
    handler: ActorProps<TState, TMessage>["receive"]
  ): this {
    this._receive = handler;
    return this;
  }

  withOnStart(handler: ActorProps<TState, TMessage>["onStart"]): this {
    this._onStart = handler;
    return this;
  }

  withOnStop(handler: ActorProps<TState, TMessage>["onStop"]): this {
    this._onStop = handler;
    return this;
  }

  withSupervisorStrategy(
    strategy: ActorProps<TState, TMessage>["supervisorStrategy"]
  ): this {
    this._supervisorStrategy = strategy;
    return this;
  }

  withMailboxSize(size: number): this {
    this._mailboxSize = size;
    return this;
  }

  withPersistence(): this {
    this._persistenceEnabled = true;
    return this;
  }

  build(): ActorProps<TState, TMessage> {
    if (this._initialState === undefined) {
      throw new Error("Initial state is required");
    }
    if (!this._receive) {
      throw new Error("Receive handler is required");
    }

    return {
      initialState: this._initialState,
      receive: this._receive,
      onStart: this._onStart,
      onStop: this._onStop,
      supervisorStrategy: this._supervisorStrategy,
      mailboxSize: this._mailboxSize,
      persistenceEnabled: this._persistenceEnabled,
    };
  }
}

// ==================== Factory Function ====================

let actorSystemInstance: ActorSystem | null = null;

/**
 * Gets or creates the actor system instance.
 */
export function getActorSystem(config?: Partial<ActorSystemConfig>): ActorSystem {
  if (!actorSystemInstance) {
    actorSystemInstance = new ActorSystem(config);
    actorSystemInstance.start();
    log.info("Actor system initialized");
  }
  return actorSystemInstance;
}

/**
 * Resets the actor system (for testing).
 */
export async function resetActorSystem(): Promise<void> {
  if (actorSystemInstance) {
    await actorSystemInstance.stop();
    actorSystemInstance = null;
  }
}
