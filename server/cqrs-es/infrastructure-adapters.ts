/**
 * @file infrastructure-adapters.ts
 * @description Infrastructure adapters for AIOps auto-remediation
 * @phase Phase 4 - Intelligence Layer
 *
 * Provides real infrastructure integration for:
 * - Kubernetes (pods, deployments, services)
 * - PM2 (local process management)
 * - Docker (container operations)
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../logger";
import type { RemediationAction } from "./types";

const log = createModuleLogger("infrastructure-adapters");

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Result of an infrastructure operation
 */
export interface InfrastructureResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number;
}

/**
 * Health status of a service
 */
export interface ServiceHealth {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  replicas?: { ready: number; desired: number };
  lastCheck: Date;
  details?: Record<string, unknown>;
}

/**
 * Infrastructure adapter interface
 */
export interface IInfrastructureAdapter {
  readonly type: "kubernetes" | "pm2" | "docker" | "mock";

  /** Check if adapter is available */
  isAvailable(): Promise<boolean>;

  /** Restart a service */
  restart(target: string): Promise<InfrastructureResult>;

  /** Scale a service */
  scale(target: string, replicas: number): Promise<InfrastructureResult>;

  /** Get service health */
  getHealth(target: string): Promise<ServiceHealth>;

  /** Execute failover */
  failover(target: string): Promise<InfrastructureResult>;

  /** Apply rate limiting/throttle */
  throttle(target: string, rate: number): Promise<InfrastructureResult>;
}

// =============================================================================
// KUBERNETES ADAPTER
// =============================================================================

/**
 * Kubernetes adapter using @kubernetes/client-node
 */
export class KubernetesAdapter implements IInfrastructureAdapter {
  readonly type = "kubernetes" as const;

  private namespace: string;
  private k8sApi: unknown; // KubeConfig types
  private appsApi: unknown;
  private initialized: boolean = false;

  constructor(namespace: string = "default") {
    this.namespace = namespace;
  }

  /**
   * Initialize Kubernetes client
   */
  private async init(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Dynamic import to avoid requiring k8s client in non-k8s environments.
      // The package is not in package.json; @ts-ignore lets TS skip the
      // missing-module check. The runtime catch handles the actual failure.
      // @ts-ignore - optional dep, intentionally not in package.json
      const k8s = await import("@kubernetes/client-node").catch(() => null);

      if (!k8s) {
        log.warn("@kubernetes/client-node not installed");
        return false;
      }

      const kc = new k8s.KubeConfig();

      // Try in-cluster config first, then local kubeconfig
      try {
        kc.loadFromCluster();
      } catch {
        kc.loadFromDefault();
      }

      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
      this.initialized = true;

      log.info({ namespace: this.namespace }, "Kubernetes adapter initialized");
      return true;
    } catch (error) {
      log.warn({ error }, "Failed to initialize Kubernetes adapter");
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.init();
  }

  async restart(target: string): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "Kubernetes not available", duration: Date.now() - start };
    }

    try {
      // Parse target: deployment/name or pod/name
      const [kind, name] = target.includes("/") ? target.split("/") : ["deployment", target];

      if (kind === "deployment") {
        // Rolling restart by updating annotation
        const patch = {
          spec: {
            template: {
              metadata: {
                annotations: {
                  "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
                },
              },
            },
          },
        };

        await (this.appsApi as any).patchNamespacedDeployment(
          name,
          this.namespace,
          patch,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
        );

        log.info({ deployment: name, namespace: this.namespace }, "Triggered deployment restart");
        return {
          success: true,
          message: `Restarted deployment ${name}`,
          duration: Date.now() - start
        };
      } else if (kind === "pod") {
        // Delete pod to trigger restart
        await (this.k8sApi as any).deleteNamespacedPod(name, this.namespace);

        log.info({ pod: name, namespace: this.namespace }, "Deleted pod for restart");
        return {
          success: true,
          message: `Deleted pod ${name} (will be recreated)`,
          duration: Date.now() - start
        };
      }

      return { success: false, message: `Unknown resource kind: ${kind}`, duration: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error({ target, error: message }, "Failed to restart");
      return { success: false, message, duration: Date.now() - start };
    }
  }

  async scale(target: string, replicas: number): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "Kubernetes not available", duration: Date.now() - start };
    }

    try {
      const name = target.includes("/") ? target.split("/")[1] : target;

      const patch = { spec: { replicas } };

      await (this.appsApi as any).patchNamespacedDeploymentScale(
        name,
        this.namespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
      );

      log.info({ deployment: name, replicas, namespace: this.namespace }, "Scaled deployment");
      return {
        success: true,
        message: `Scaled ${name} to ${replicas} replicas`,
        details: { previousReplicas: undefined, newReplicas: replicas },
        duration: Date.now() - start
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error({ target, replicas, error: message }, "Failed to scale");
      return { success: false, message, duration: Date.now() - start };
    }
  }

  async getHealth(target: string): Promise<ServiceHealth> {
    if (!await this.init()) {
      return { name: target, status: "unknown", lastCheck: new Date() };
    }

    try {
      const name = target.includes("/") ? target.split("/")[1] : target;

      const response = await (this.appsApi as any).readNamespacedDeployment(name, this.namespace);
      const deployment = response.body;

      const ready = deployment.status?.readyReplicas || 0;
      const desired = deployment.spec?.replicas || 0;

      return {
        name: target,
        status: ready >= desired ? "healthy" : "unhealthy",
        replicas: { ready, desired },
        lastCheck: new Date(),
        details: {
          availableReplicas: deployment.status?.availableReplicas,
          conditions: deployment.status?.conditions,
        },
      };
    } catch (error) {
      return { name: target, status: "unknown", lastCheck: new Date() };
    }
  }

  async failover(target: string): Promise<InfrastructureResult> {
    // In K8s, failover typically means deleting unhealthy pods
    return this.restart(target);
  }

  async throttle(target: string, rate: number): Promise<InfrastructureResult> {
    const start = Date.now();

    // Throttling in K8s requires updating a ConfigMap or custom resource
    // This is a simplified implementation
    log.info({ target, rate }, "Throttle requested - requires custom implementation");

    return {
      success: false,
      message: "Throttling requires custom K8s resource (e.g., Istio VirtualService)",
      details: { suggestedRate: rate },
      duration: Date.now() - start,
    };
  }
}

// =============================================================================
// PM2 ADAPTER
// =============================================================================

/**
 * PM2 adapter for local process management
 */
export class PM2Adapter implements IInfrastructureAdapter {
  readonly type = "pm2" as const;

  private pm2: unknown;
  private connected: boolean = false;

  private async init(): Promise<boolean> {
    if (this.connected) return true;

    try {
      // @ts-ignore - optional dep, intentionally not in package.json
      const pm2 = await import("pm2").catch(() => null);

      if (!pm2) {
        log.warn("pm2 not installed");
        return false;
      }

      return new Promise((resolve) => {
        pm2.connect((err: Error | null) => {
          if (err) {
            log.warn({ error: err.message }, "Failed to connect to PM2");
            resolve(false);
          } else {
            this.pm2 = pm2;
            this.connected = true;
            log.info("PM2 adapter initialized");
            resolve(true);
          }
        });
      });
    } catch (error) {
      log.warn({ error }, "Failed to initialize PM2 adapter");
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.init();
  }

  async restart(target: string): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "PM2 not available", duration: Date.now() - start };
    }

    return new Promise((resolve) => {
      (this.pm2 as any).restart(target, (err: Error | null) => {
        if (err) {
          log.error({ target, error: err.message }, "PM2 restart failed");
          resolve({ success: false, message: err.message, duration: Date.now() - start });
        } else {
          log.info({ target }, "PM2 process restarted");
          resolve({ success: true, message: `Restarted ${target}`, duration: Date.now() - start });
        }
      });
    });
  }

  async scale(target: string, replicas: number): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "PM2 not available", duration: Date.now() - start };
    }

    return new Promise((resolve) => {
      (this.pm2 as any).scale(target, replicas, (err: Error | null) => {
        if (err) {
          log.error({ target, replicas, error: err.message }, "PM2 scale failed");
          resolve({ success: false, message: err.message, duration: Date.now() - start });
        } else {
          log.info({ target, replicas }, "PM2 process scaled");
          resolve({
            success: true,
            message: `Scaled ${target} to ${replicas} instances`,
            duration: Date.now() - start
          });
        }
      });
    });
  }

  async getHealth(target: string): Promise<ServiceHealth> {
    if (!await this.init()) {
      return { name: target, status: "unknown", lastCheck: new Date() };
    }

    return new Promise((resolve) => {
      (this.pm2 as any).describe(target, (err: Error | null, processDesc: any[]) => {
        if (err || !processDesc || processDesc.length === 0) {
          resolve({ name: target, status: "unknown", lastCheck: new Date() });
        } else {
          const proc = processDesc[0];
          const status = proc.pm2_env?.status === "online" ? "healthy" : "unhealthy";

          resolve({
            name: target,
            status,
            replicas: { ready: processDesc.filter((p) => p.pm2_env?.status === "online").length, desired: processDesc.length },
            lastCheck: new Date(),
            details: {
              pid: proc.pid,
              memory: proc.monit?.memory,
              cpu: proc.monit?.cpu,
              uptime: proc.pm2_env?.pm_uptime,
            },
          });
        }
      });
    });
  }

  async failover(target: string): Promise<InfrastructureResult> {
    return this.restart(target);
  }

  async throttle(_target: string, _rate: number): Promise<InfrastructureResult> {
    return {
      success: false,
      message: "PM2 does not support throttling",
      duration: 0,
    };
  }
}

// =============================================================================
// DOCKER ADAPTER
// =============================================================================

/**
 * Docker adapter for container operations
 */
export class DockerAdapter implements IInfrastructureAdapter {
  readonly type = "docker" as const;

  private docker: unknown;
  private initialized: boolean = false;

  private async init(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // @ts-ignore - optional dep, intentionally not in package.json
      const Docker = (await import("dockerode").catch(() => null))?.default;

      if (!Docker) {
        log.warn("dockerode not installed");
        return false;
      }

      this.docker = new Docker();

      // Test connection
      await (this.docker as any).ping();

      this.initialized = true;
      log.info("Docker adapter initialized");
      return true;
    } catch (error) {
      log.warn({ error }, "Failed to initialize Docker adapter");
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.init();
  }

  async restart(target: string): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "Docker not available", duration: Date.now() - start };
    }

    try {
      const container = (this.docker as any).getContainer(target);
      await container.restart();

      log.info({ container: target }, "Docker container restarted");
      return { success: true, message: `Restarted container ${target}`, duration: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error({ target, error: message }, "Docker restart failed");
      return { success: false, message, duration: Date.now() - start };
    }
  }

  async scale(target: string, replicas: number): Promise<InfrastructureResult> {
    const start = Date.now();

    if (!await this.init()) {
      return { success: false, message: "Docker not available", duration: Date.now() - start };
    }

    try {
      // Docker Swarm scaling
      const service = (this.docker as any).getService(target);
      const info = await service.inspect();

      await service.update({
        ...info.Spec,
        Mode: {
          Replicated: { Replicas: replicas },
        },
      });

      log.info({ service: target, replicas }, "Docker service scaled");
      return {
        success: true,
        message: `Scaled service ${target} to ${replicas} replicas`,
        duration: Date.now() - start
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      // Check if it's a standalone container
      if (message.includes("service") || message.includes("swarm")) {
        return {
          success: false,
          message: "Scaling requires Docker Swarm mode",
          duration: Date.now() - start,
        };
      }

      log.error({ target, replicas, error: message }, "Docker scale failed");
      return { success: false, message, duration: Date.now() - start };
    }
  }

  async getHealth(target: string): Promise<ServiceHealth> {
    if (!await this.init()) {
      return { name: target, status: "unknown", lastCheck: new Date() };
    }

    try {
      const container = (this.docker as any).getContainer(target);
      const info = await container.inspect();

      const running = info.State?.Running === true;
      const healthy = info.State?.Health?.Status === "healthy";

      return {
        name: target,
        status: running ? (healthy ? "healthy" : "unhealthy") : "unhealthy",
        lastCheck: new Date(),
        details: {
          state: info.State?.Status,
          startedAt: info.State?.StartedAt,
          health: info.State?.Health,
        },
      };
    } catch {
      return { name: target, status: "unknown", lastCheck: new Date() };
    }
  }

  async failover(target: string): Promise<InfrastructureResult> {
    return this.restart(target);
  }

  async throttle(_target: string, _rate: number): Promise<InfrastructureResult> {
    return {
      success: false,
      message: "Docker throttling requires container update with resource limits",
      duration: 0,
    };
  }
}

// =============================================================================
// MOCK ADAPTER (for testing)
// =============================================================================

/**
 * Mock adapter for testing and development
 */
export class MockInfrastructureAdapter implements IInfrastructureAdapter {
  readonly type = "mock" as const;

  private services: Map<string, { replicas: number; healthy: boolean }> = new Map();
  private emitter: EventEmitter = new EventEmitter();
  private simulateLatency: number = 100;
  private simulateFailureRate: number = 0;

  constructor(config?: { latencyMs?: number; failureRate?: number }) {
    this.simulateLatency = config?.latencyMs ?? 100;
    this.simulateFailureRate = config?.failureRate ?? 0;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private async simulate(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.simulateLatency));
    if (Math.random() < this.simulateFailureRate) {
      throw new Error("Simulated failure");
    }
  }

  async restart(target: string): Promise<InfrastructureResult> {
    const start = Date.now();

    try {
      await this.simulate();

      log.info({ target }, "[MOCK] Restart");
      this.emitter.emit("restart", target);

      return { success: true, message: `[MOCK] Restarted ${target}`, duration: Date.now() - start };
    } catch (error) {
      return { success: false, message: (error as Error).message, duration: Date.now() - start };
    }
  }

  async scale(target: string, replicas: number): Promise<InfrastructureResult> {
    const start = Date.now();

    try {
      await this.simulate();

      const prev = this.services.get(target)?.replicas ?? 1;
      this.services.set(target, { replicas, healthy: true });

      log.info({ target, from: prev, to: replicas }, "[MOCK] Scale");
      this.emitter.emit("scale", target, prev, replicas);

      return {
        success: true,
        message: `[MOCK] Scaled ${target} to ${replicas}`,
        details: { previousReplicas: prev, newReplicas: replicas },
        duration: Date.now() - start
      };
    } catch (error) {
      return { success: false, message: (error as Error).message, duration: Date.now() - start };
    }
  }

  async getHealth(target: string): Promise<ServiceHealth> {
    const service = this.services.get(target);

    return {
      name: target,
      status: service?.healthy ? "healthy" : "unknown",
      replicas: service ? { ready: service.replicas, desired: service.replicas } : undefined,
      lastCheck: new Date(),
    };
  }

  async failover(target: string): Promise<InfrastructureResult> {
    const start = Date.now();

    try {
      await this.simulate();

      log.info({ target }, "[MOCK] Failover");
      this.emitter.emit("failover", target);

      return { success: true, message: `[MOCK] Failover ${target}`, duration: Date.now() - start };
    } catch (error) {
      return { success: false, message: (error as Error).message, duration: Date.now() - start };
    }
  }

  async throttle(target: string, rate: number): Promise<InfrastructureResult> {
    const start = Date.now();

    try {
      await this.simulate();

      log.info({ target, rate }, "[MOCK] Throttle");
      this.emitter.emit("throttle", target, rate);

      return { success: true, message: `[MOCK] Throttled ${target} to ${rate}`, duration: Date.now() - start };
    } catch (error) {
      return { success: false, message: (error as Error).message, duration: Date.now() - start };
    }
  }

  /** Subscribe to mock events for testing */
  on(event: string, callback: (...args: unknown[]) => void): void {
    this.emitter.on(event, callback);
  }

  /** Set mock service state */
  setServiceState(name: string, replicas: number, healthy: boolean): void {
    this.services.set(name, { replicas, healthy });
  }
}

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

export type AdapterType = "kubernetes" | "pm2" | "docker" | "mock" | "auto";

/**
 * Factory for creating infrastructure adapters
 */
export class InfrastructureAdapterFactory {
  private static instance: IInfrastructureAdapter | null = null;

  /**
   * Create an adapter based on type or auto-detect
   */
  static async create(type: AdapterType = "auto"): Promise<IInfrastructureAdapter> {
    if (type === "auto") {
      return this.autoDetect();
    }

    switch (type) {
      case "kubernetes":
        return new KubernetesAdapter();
      case "pm2":
        return new PM2Adapter();
      case "docker":
        return new DockerAdapter();
      case "mock":
        return new MockInfrastructureAdapter();
    }
  }

  /**
   * Auto-detect available infrastructure
   */
  private static async autoDetect(): Promise<IInfrastructureAdapter> {
    // Check environment variables for hints
    if (process.env.KUBERNETES_SERVICE_HOST) {
      const k8s = new KubernetesAdapter();
      if (await k8s.isAvailable()) {
        log.info("Auto-detected Kubernetes environment");
        return k8s;
      }
    }

    // Try PM2
    const pm2 = new PM2Adapter();
    if (await pm2.isAvailable()) {
      log.info("Auto-detected PM2 environment");
      return pm2;
    }

    // Try Docker
    const docker = new DockerAdapter();
    if (await docker.isAvailable()) {
      log.info("Auto-detected Docker environment");
      return docker;
    }

    // Fall back to mock
    log.info("No infrastructure detected, using mock adapter");
    return new MockInfrastructureAdapter();
  }

  /**
   * Get or create singleton adapter
   */
  static async getAdapter(): Promise<IInfrastructureAdapter> {
    if (!this.instance) {
      this.instance = await this.create("auto");
    }
    return this.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    this.instance = null;
  }
}

// =============================================================================
// REMEDIATION EXECUTOR
// =============================================================================

/**
 * Executes remediation actions using infrastructure adapters
 */
export class RemediationExecutor {
  private adapter: IInfrastructureAdapter;
  private emitter: EventEmitter = new EventEmitter();

  constructor(adapter: IInfrastructureAdapter) {
    this.adapter = adapter;
  }

  /**
   * Execute a remediation action
   */
  async execute(action: RemediationAction): Promise<InfrastructureResult> {
    const start = Date.now();

    log.info({ type: action.type, target: action.target }, "Executing remediation");
    this.emitter.emit("start", action);

    let result: InfrastructureResult;

    try {
      switch (action.type) {
        case "restart":
          result = await this.adapter.restart(action.target);
          break;

        case "scale": {
          // params is Record<string, unknown> so the value comes back as
          // unknown; coerce to number with a fallback.
          const replicas = Number(action.params?.replicas ?? 1);
          result = await this.adapter.scale(action.target, replicas);
          break;
        }

        case "failover":
          result = await this.adapter.failover(action.target);
          break;

        case "throttle": {
          const rate = Number(action.params?.rate ?? 100);
          result = await this.adapter.throttle(action.target, rate);
          break;
        }

        case "circuit-break":
          // Circuit break is typically handled at application level
          // Here we simulate by scaling to 0 and back
          await this.adapter.scale(action.target, 0);
          await new Promise((r) => setTimeout(r, 5000)); // 5s break
          result = await this.adapter.scale(action.target, 1);
          result.message = `Circuit break completed for ${action.target}`;
          break;

        default:
          result = {
            success: false,
            message: `Unknown action type: ${action.type}`,
            duration: Date.now() - start,
          };
      }

      if (result.success) {
        this.emitter.emit("success", action, result);
      } else {
        this.emitter.emit("failure", action, result);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result = { success: false, message, duration: Date.now() - start };
      this.emitter.emit("failure", action, result);
      return result;
    }
  }

  /**
   * Subscribe to execution events
   */
  on(event: "start" | "success" | "failure", callback: (action: RemediationAction, result?: InfrastructureResult) => void): void {
    this.emitter.on(event, callback);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================
// All adapter classes are inline-exported above. Trailing block removed
// 2026-04-14 to fix duplicate-export errors.
