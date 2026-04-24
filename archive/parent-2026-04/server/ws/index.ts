/**
 * @file index.ts
 * @description WebSocket server for real-time file system updates.
 * @phase Phase 3 - File System Integration
 * @author FW (File Watcher Specialist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * Features:
 * - Automatic heartbeat/ping-pong for connection health
 * - Client tracking with unique IDs
 * - Broadcast to all connected clients
 * - Channel-based subscriptions
 * - Graceful shutdown handling
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage, ServerResponse } from "http";
import type { Request, Response } from "express";
import type {
  WSMessageUnion,
  WSClientMessage,
  WSConnectionMessage,
  WSHeartbeatMessage,
} from "./types";
import { randomUUID } from "crypto";
import { wsLogger as log } from "../logger";
import { wsConnectionsActive, wsMessagesTotal } from "../metrics";
import { getSessionMiddleware } from "../auth/session";

const SERVER_VERSION = "1.0.0";
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CLIENT_TIMEOUT = 35000; // 35 seconds (slightly more than heartbeat)

// Shape of a passport-authenticated session as stored by express-session.
// Passport persists the deserialized user reference under `passport.user`.
interface PassportSession {
  passport?: { user?: unknown };
  [key: string]: unknown;
}

interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
  subscriptions: Set<string>;
  lastActivity: number;
  // Authenticated user attached during the upgrade handshake.
  // Present when requireAuth is enabled and the session validated.
  userId?: string;
}

/**
 * WebSocket server manager for real-time updates.
 */
export class WSServer {
  private wss: WebSocketServer;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private requireAuth: boolean;

  constructor(server: Server, path: string = "/ws") {
    // SECURITY: Require authentication in production
    this.requireAuth = process.env.NODE_ENV === "production" ||
                       process.env.WS_REQUIRE_AUTH === "true";

    // We do NOT use ws's verifyClient hook because it runs in a context where
    // we cannot invoke express middleware (the session middleware needs a
    // mutable response shim). Instead we attach to the HTTP server's `upgrade`
    // event ourselves, run the real session middleware, and only then call
    // wss.handleUpgrade. This is the canonical pattern for express-session +
    // ws: see https://github.com/websockets/ws#client-authentication
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      // Only handle upgrades targeting this server's path. Other WS servers
      // (e.g. the messaging server on /ws/messaging) handle their own upgrades.
      const { url } = req;
      if (!url || !url.startsWith(path)) {
        return;
      }

      this.authenticateUpgrade(req)
        .then((authResult) => {
          if (!this.requireAuth || authResult.ok) {
            this.wss.handleUpgrade(req, socket, head, (ws) => {
              // Attach the authenticated user id (if any) so handleConnection
              // can persist it on the ExtendedWebSocket.
              (req as IncomingMessage & { _wsUserId?: string })._wsUserId =
                authResult.userId;
              this.wss.emit("connection", ws, req);
            });
          } else {
            log.warn(
              {
                origin: req.headers.origin,
                reason: authResult.reason,
              },
              "WebSocket upgrade rejected"
            );
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
          }
        })
        .catch((err) => {
          log.error({ err }, "WebSocket upgrade authentication errored");
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.destroy();
        });
    });

    this.wss.on("connection", this.handleConnection.bind(this));
    this.wss.on("error", this.handleServerError.bind(this));

    // Start heartbeat checker
    this.startHeartbeat();

    log.info({ path, requireAuth: this.requireAuth }, "WebSocket server started");
  }

  /**
   * Runs the real express-session middleware against an HTTP upgrade request,
   * then inspects the populated session for a passport-authenticated user.
   *
   * Why this matters: the previous implementation only checked for the
   * presence of a cookie named `connect.sid`/`session` and accepted ANY
   * value. That is forgeable trivially. Running the session middleware
   * forces the cookie to be cryptographically verified against the secret
   * AND the underlying session id to be looked up in the store (Memory or
   * Redis), so we know the session is real and current.
   */
  private authenticateUpgrade(
    req: IncomingMessage
  ): Promise<{ ok: boolean; userId?: string; reason?: string }> {
    return new Promise((resolve) => {
      let sessionMw;
      try {
        sessionMw = getSessionMiddleware();
      } catch {
        // setupSession() has not run — fail closed. We must never accept WS
        // upgrades before the session subsystem is initialized.
        resolve({ ok: false, reason: "session-not-initialized" });
        return;
      }

      // express-session expects (req, res, next). We construct a minimal
      // response shim: it never sends data, but session middleware writes
      // Set-Cookie headers via res.setHeader which we discard since the
      // upgrade response is handled by ws.handleUpgrade.
      const resShim = {
        setHeader: () => undefined,
        getHeader: () => undefined,
        on: () => undefined,
        emit: () => undefined,
        once: () => undefined,
        end: () => undefined,
      } as unknown as ServerResponse;

      sessionMw(req as Request, resShim as Response, () => {
        const session = (req as IncomingMessage & { session?: PassportSession })
          .session;
        const passportUser = session?.passport?.user;

        if (passportUser === undefined || passportUser === null) {
          resolve({ ok: false, reason: "no-authenticated-user" });
          return;
        }

        // passport.user is whatever serializeUser stored — for this codebase
        // it's the user id (number or string). Coerce to string for logging.
        const userId =
          typeof passportUser === "object"
            ? String((passportUser as { id?: unknown }).id ?? passportUser)
            : String(passportUser);

        resolve({ ok: true, userId });
      });
    });
  }

  /**
   * Handles new client connections.
   */
  private handleConnection(ws: WebSocket, req?: IncomingMessage): void {
    const extWs = ws as ExtendedWebSocket;
    extWs.clientId = randomUUID();
    extWs.isAlive = true;
    extWs.subscriptions = new Set(["default"]);
    extWs.lastActivity = Date.now();
    extWs.userId = (req as IncomingMessage & { _wsUserId?: string } | undefined)
      ?._wsUserId;

    this.clients.set(extWs.clientId, extWs);

    // Update metrics
    wsConnectionsActive.inc();

    // Send connection confirmation
    const connMsg: WSConnectionMessage = {
      type: "connection",
      timestamp: Date.now(),
      clientId: extWs.clientId,
      serverVersion: SERVER_VERSION,
    };
    this.send(extWs, connMsg);

    // Set up event handlers
    extWs.on("message", (data) => this.handleMessage(extWs, data));
    extWs.on("pong", () => this.handlePong(extWs));
    extWs.on("close", () => this.handleClose(extWs));
    extWs.on("error", (err) => this.handleClientError(extWs, err));

    log.info({ clientId: extWs.clientId, totalClients: this.clients.size }, "Client connected");
  }

  /**
   * Handles incoming messages from clients.
   */
  private handleMessage(ws: ExtendedWebSocket, data: Buffer | ArrayBuffer | Buffer[]): void {
    ws.lastActivity = Date.now();
    ws.isAlive = true;

    try {
      const message = JSON.parse(data.toString()) as WSClientMessage;
      wsMessagesTotal.inc({ type: message.type, direction: "inbound" });

      switch (message.type) {
        case "heartbeat":
          this.sendHeartbeat(ws);
          break;

        case "subscribe":
          message.channels.forEach((ch) => ws.subscriptions.add(ch));
          break;

        case "unsubscribe":
          message.channels.forEach((ch) => ws.subscriptions.delete(ch));
          break;

        case "scan:request":
          // Will be handled by file watcher service
          this.emit("scan:request", {
            clientId: ws.clientId,
            rootPath: message.rootPath,
            configId: message.configId,
          });
          break;

        case "symlink:request":
          // Will be handled by symlink executor service
          this.emit("symlink:request", {
            clientId: ws.clientId,
            projectPath: message.projectPath,
            configId: message.configId,
          });
          break;

        default:
          log.warn({ clientId: ws.clientId }, "Unknown message type");
      }
    } catch (err) {
      log.error({ err, clientId: ws.clientId }, "Failed to parse message");
    }
  }

  /**
   * Handles pong responses from clients.
   */
  private handlePong(ws: ExtendedWebSocket): void {
    ws.isAlive = true;
    ws.lastActivity = Date.now();
  }

  /**
   * Handles client disconnection.
   */
  private handleClose(ws: ExtendedWebSocket): void {
    this.clients.delete(ws.clientId);
    wsConnectionsActive.dec();
    log.info({ clientId: ws.clientId, remainingClients: this.clients.size }, "Client disconnected");
  }

  /**
   * Handles client errors.
   */
  private handleClientError(ws: ExtendedWebSocket, err: Error): void {
    log.error({ clientId: ws.clientId, error: err.message }, "Client error");
  }

  /**
   * Handles server-level errors.
   */
  private handleServerError(err: Error): void {
    log.error({ err }, "Server error");
  }

  /**
   * Sends a heartbeat to a specific client.
   */
  private sendHeartbeat(ws: ExtendedWebSocket): void {
    const msg: WSHeartbeatMessage = {
      type: "heartbeat",
      timestamp: Date.now(),
      clientId: ws.clientId,
    };
    this.send(ws, msg);
  }

  /**
   * Starts the heartbeat interval.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      this.clients.forEach((ws) => {
        // Check if client has timed out
        if (!ws.isAlive || now - ws.lastActivity > CLIENT_TIMEOUT) {
          log.info({ clientId: ws.clientId }, "Client timeout");
          ws.terminate();
          this.clients.delete(ws.clientId);
          return;
        }

        // Send ping
        ws.isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Sends a message to a specific client.
   */
  send(ws: ExtendedWebSocket | string, message: WSMessageUnion): boolean {
    const client = typeof ws === "string" ? this.clients.get(ws) : ws;

    if (!client || client.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.send(JSON.stringify(message));
      wsMessagesTotal.inc({ type: message.type, direction: "outbound" });
      return true;
    } catch (err) {
      log.error({ err, clientId: client.clientId }, "Failed to send message");
      return false;
    }
  }

  /**
   * Broadcasts a message to all connected clients.
   */
  broadcast(message: WSMessageUnion, channel: string = "default"): void {
    let sentCount = 0;

    this.clients.forEach((ws) => {
      if (ws.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        if (this.send(ws, message)) {
          sentCount++;
        }
      }
    });

    if (sentCount > 0) {
      log.debug({ messageType: message.type, sentCount, channel }, "Broadcast to channel");
    }
  }

  /**
   * Broadcasts to all clients regardless of subscription.
   */
  broadcastAll(message: WSMessageUnion): void {
    let sentCount = 0;

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (this.send(ws, message)) {
          sentCount++;
        }
      }
    });

    if (sentCount > 0) {
      log.debug({ messageType: message.type, sentCount }, "Broadcast to all clients");
    }
  }

  /**
   * Gets the count of connected clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Gets all connected client IDs.
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Event emitter for internal communication with services.
   */
  private eventHandlers: Map<string, ((data: unknown) => void)[]> = new Map();

  on(event: string, handler: (data: unknown) => void): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: (data: unknown) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((h) => h(data));
    }
  }

  /**
   * Gracefully shuts down the WebSocket server.
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down WebSocket server");

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    const closePromises: Promise<void>[] = [];

    this.clients.forEach((ws) => {
      closePromises.push(
        new Promise((resolve) => {
          ws.close(1001, "Server shutting down");
          ws.once("close", () => resolve());
          // Force terminate after 1s
          setTimeout(() => {
            ws.terminate();
            resolve();
          }, 1000);
        })
      );
    });

    await Promise.all(closePromises);
    this.clients.clear();

    // Close the server
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    log.info("WebSocket server shutdown complete");
  }
}

// Singleton instance
let wsServerInstance: WSServer | null = null;

/**
 * Sets up the WebSocket server on the HTTP server.
 */
export function setupWebSocket(server: Server, path: string = "/ws"): WSServer {
  if (wsServerInstance) {
    log.warn("WebSocket server already initialized");
    return wsServerInstance;
  }

  wsServerInstance = new WSServer(server, path);
  return wsServerInstance;
}

/**
 * Gets the WebSocket server instance.
 */
export function getWSServer(): WSServer | null {
  return wsServerInstance;
}

/**
 * Resets the WebSocket server (for testing).
 */
export async function resetWSServer(): Promise<void> {
  if (wsServerInstance) {
    await wsServerInstance.shutdown();
    wsServerInstance = null;
  }
}
