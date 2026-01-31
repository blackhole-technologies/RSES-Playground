/**
 * @file integration-connectors.ts
 * @description Integration connector framework (Zapier/n8n style).
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - OAuth2 app connection management
 * - Pre-built connectors (webhook, HTTP, email)
 * - Custom webhook handlers
 * - Integration marketplace types
 * - Rate limiting and quotas
 * - Credential encryption
 */

import { randomUUID } from "crypto";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { RateLimiter } from "./trigger-system";
import type {
  IntegrationConnector,
  ConnectorId,
  ConnectorAuthType,
  ConnectorAction,
  ConnectorTrigger,
  Connection,
  RateLimitConfig,
} from "./types";

const scryptAsync = promisify(scrypt);

// ==================== Credential Encryption ====================

/**
 * Encryption configuration.
 */
interface EncryptionConfig {
  algorithm: "aes-256-gcm";
  keyLength: number;
  ivLength: number;
  saltLength: number;
  tagLength: number;
}

const ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: "aes-256-gcm",
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  tagLength: 16,
};

/**
 * Credential manager for secure storage.
 */
export class CredentialManager {
  private encryptionKey: string;

  constructor(encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error("Encryption key must be at least 32 characters");
    }
    this.encryptionKey = encryptionKey;
  }

  /**
   * Encrypts credentials.
   */
  async encrypt(credentials: Record<string, unknown>): Promise<string> {
    const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);
    const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);

    const key = (await scryptAsync(
      this.encryptionKey,
      salt,
      ENCRYPTION_CONFIG.keyLength
    )) as Buffer;

    const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    const plaintext = JSON.stringify(credentials);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: salt:iv:authTag:encrypted (all base64)
    return [
      salt.toString("base64"),
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  /**
   * Decrypts credentials.
   */
  async decrypt(encryptedCredentials: string): Promise<Record<string, unknown>> {
    const parts = encryptedCredentials.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted credentials format");
    }

    const [saltB64, ivB64, authTagB64, encryptedB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const key = (await scryptAsync(
      this.encryptionKey,
      salt,
      ENCRYPTION_CONFIG.keyLength
    )) as Buffer;

    const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }
}

// ==================== OAuth2 Manager ====================

/**
 * OAuth2 configuration.
 */
export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

/**
 * OAuth2 tokens.
 */
export interface OAuth2Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
}

/**
 * OAuth2 manager for handling authorization flows.
 */
export class OAuth2Manager {
  private configs: Map<ConnectorId, OAuth2Config> = new Map();
  private pendingAuthorizations: Map<string, { connectorId: ConnectorId; userId: string; state: string }> = new Map();

  /**
   * Registers OAuth2 configuration for a connector.
   */
  registerConfig(connectorId: ConnectorId, config: OAuth2Config): void {
    this.configs.set(connectorId, config);
  }

  /**
   * Generates authorization URL.
   */
  generateAuthUrl(connectorId: ConnectorId, userId: string): string {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`No OAuth2 config for connector ${connectorId}`);
    }

    const state = randomUUID();
    this.pendingAuthorizations.set(state, { connectorId, userId, state });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
    });

    return `${config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for tokens.
   */
  async exchangeCode(state: string, code: string): Promise<{
    connectorId: ConnectorId;
    userId: string;
    tokens: OAuth2Tokens;
  }> {
    const pending = this.pendingAuthorizations.get(state);
    if (!pending) {
      throw new Error("Invalid or expired authorization state");
    }

    this.pendingAuthorizations.delete(state);

    const config = this.configs.get(pending.connectorId);
    if (!config) {
      throw new Error("Connector config not found");
    }

    // Exchange code for tokens (simplified - would use fetch)
    const tokens: OAuth2Tokens = {
      accessToken: `access_${randomUUID()}`,
      refreshToken: `refresh_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: "Bearer",
      scope: config.scopes.join(" "),
    };

    return {
      connectorId: pending.connectorId,
      userId: pending.userId,
      tokens,
    };
  }

  /**
   * Refreshes access token.
   */
  async refreshTokens(connectorId: ConnectorId, refreshToken: string): Promise<OAuth2Tokens> {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`No OAuth2 config for connector ${connectorId}`);
    }

    // Refresh tokens (simplified - would use fetch)
    return {
      accessToken: `access_${randomUUID()}`,
      refreshToken: `refresh_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: "Bearer",
      scope: config.scopes.join(" "),
    };
  }
}

// ==================== Connector Registry ====================

/**
 * Manages integration connectors.
 */
export class ConnectorRegistry {
  private connectors: Map<ConnectorId, IntegrationConnector> = new Map();
  private connections: Map<string, Connection> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private credentialManager: CredentialManager;
  private oauth2Manager: OAuth2Manager;

  constructor(encryptionKey: string) {
    this.credentialManager = new CredentialManager(encryptionKey);
    this.oauth2Manager = new OAuth2Manager();
    this.registerBuiltInConnectors();
  }

  /**
   * Registers a connector.
   */
  registerConnector(connector: IntegrationConnector): void {
    this.connectors.set(connector.id, connector);

    // Set up rate limiter if configured
    if (connector.rateLimit) {
      this.rateLimiters.set(connector.id, new RateLimiter(connector.rateLimit));
    }
  }

  /**
   * Gets a connector by ID.
   */
  getConnector(connectorId: ConnectorId): IntegrationConnector | undefined {
    return this.connectors.get(connectorId);
  }

  /**
   * Gets all connectors.
   */
  getAllConnectors(): IntegrationConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Gets connectors by category.
   */
  getConnectorsByCategory(category: string): IntegrationConnector[] {
    // Would filter by metadata.category
    return Array.from(this.connectors.values());
  }

  /**
   * Searches connectors.
   */
  searchConnectors(query: string): IntegrationConnector[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.connectors.values()).filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Creates a new connection.
   */
  async createConnection(
    userId: string,
    connectorId: ConnectorId,
    name: string,
    credentials: Record<string, unknown>
  ): Promise<Connection> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    // Validate credentials against schema
    const validationResult = connector.authConfigSchema.safeParse(credentials);
    if (!validationResult.success) {
      throw new Error(`Invalid credentials: ${validationResult.error.message}`);
    }

    // Encrypt credentials
    const encryptedCredentials = await this.credentialManager.encrypt(credentials);

    const connection: Connection = {
      id: randomUUID(),
      userId,
      connectorId,
      name,
      credentials: encryptedCredentials,
      active: true,
      createdAt: new Date(),
    };

    this.connections.set(connection.id, connection);

    // Test connection
    try {
      await this.testConnection(connection.id);
    } catch (err) {
      connection.active = false;
      connection.error = err instanceof Error ? err.message : String(err);
    }

    return connection;
  }

  /**
   * Gets a connection by ID.
   */
  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Gets all connections for a user.
   */
  getUserConnections(userId: string): Connection[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.userId === userId
    );
  }

  /**
   * Updates a connection.
   */
  async updateConnection(
    connectionId: string,
    updates: { name?: string; credentials?: Record<string, unknown> }
  ): Promise<Connection> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    if (updates.name) {
      connection.name = updates.name;
    }

    if (updates.credentials) {
      connection.credentials = await this.credentialManager.encrypt(updates.credentials);
    }

    return connection;
  }

  /**
   * Deletes a connection.
   */
  deleteConnection(connectionId: string): boolean {
    return this.connections.delete(connectionId);
  }

  /**
   * Tests a connection.
   */
  async testConnection(connectionId: string): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const connector = this.connectors.get(connection.connectorId);
    if (!connector) {
      throw new Error("Connector not found");
    }

    // Decrypt credentials
    const credentials = await this.credentialManager.decrypt(connection.credentials);

    // Test based on auth type
    switch (connector.authType) {
      case ConnectorAuthType.API_KEY:
        // Validate API key exists
        if (!credentials.apiKey) {
          throw new Error("API key missing");
        }
        break;

      case ConnectorAuthType.OAUTH2:
        // Check token validity
        const tokens = credentials as OAuth2Tokens;
        if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
          // Try to refresh
          if (tokens.refreshToken) {
            const newTokens = await this.oauth2Manager.refreshTokens(
              connection.connectorId,
              tokens.refreshToken
            );
            connection.credentials = await this.credentialManager.encrypt(newTokens);
            connection.refreshedAt = new Date();
          } else {
            throw new Error("Token expired and no refresh token available");
          }
        }
        break;

      case ConnectorAuthType.BASIC:
        if (!credentials.username || !credentials.password) {
          throw new Error("Username or password missing");
        }
        break;

      case ConnectorAuthType.BEARER:
        if (!credentials.token) {
          throw new Error("Bearer token missing");
        }
        break;
    }

    connection.active = true;
    connection.error = undefined;
    connection.lastUsedAt = new Date();

    return true;
  }

  /**
   * Gets decrypted credentials for a connection.
   */
  async getCredentials(connectionId: string): Promise<Record<string, unknown>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    return this.credentialManager.decrypt(connection.credentials);
  }

  /**
   * Executes a connector action.
   */
  async executeAction(
    connectionId: string,
    actionId: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    if (!connection.active) {
      throw new Error("Connection is not active");
    }

    const connector = this.connectors.get(connection.connectorId);
    if (!connector) {
      throw new Error("Connector not found");
    }

    const action = connector.actions.find((a) => a.id === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found`);
    }

    // Check rate limit
    const rateLimiter = this.rateLimiters.get(connector.id);
    if (rateLimiter && !rateLimiter.isAllowed(connectionId)) {
      throw new Error("Rate limit exceeded");
    }

    // Validate input
    const inputValidation = action.inputSchema.safeParse(input);
    if (!inputValidation.success) {
      throw new Error(`Invalid input: ${inputValidation.error.message}`);
    }

    // Get credentials
    const credentials = await this.getCredentials(connectionId);

    // Execute action (delegated to connector-specific handler)
    const handler = this.getActionHandler(connector.id, actionId);
    if (!handler) {
      throw new Error(`No handler for action ${actionId}`);
    }

    connection.lastUsedAt = new Date();

    return handler(input, credentials);
  }

  /**
   * Gets action handler.
   */
  private getActionHandler(
    connectorId: ConnectorId,
    actionId: string
  ): ((input: unknown, credentials: Record<string, unknown>) => Promise<unknown>) | undefined {
    // Would return registered handler
    return undefined;
  }

  /**
   * Registers built-in connectors.
   */
  private registerBuiltInConnectors(): void {
    // Webhook connector
    this.registerConnector(createWebhookConnector());

    // HTTP connector
    this.registerConnector(createHttpConnector());

    // Email connector
    this.registerConnector(createEmailConnector());

    // Slack connector
    this.registerConnector(createSlackConnector());

    // GitHub connector
    this.registerConnector(createGitHubConnector());

    // Google Sheets connector
    this.registerConnector(createGoogleSheetsConnector());
  }
}

// ==================== Built-in Connectors ====================

/**
 * Creates the webhook connector.
 */
function createWebhookConnector(): IntegrationConnector {
  return {
    id: "webhook",
    name: "Webhook",
    description: "Send and receive HTTP webhooks",
    iconUrl: "/icons/webhook.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.NONE,
    authConfigSchema: z.object({}),
    actions: [
      {
        id: "send",
        name: "Send Webhook",
        description: "Send a POST request to a URL",
        inputSchema: z.object({
          url: z.string().url(),
          headers: z.record(z.string()).optional(),
          body: z.unknown(),
          method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
        }),
        outputSchema: z.object({
          statusCode: z.number(),
          body: z.unknown(),
          headers: z.record(z.string()),
        }),
      },
    ],
    triggers: [
      {
        id: "receive",
        name: "Receive Webhook",
        description: "Triggered when a webhook is received",
        type: "webhook",
        outputSchema: z.object({
          method: z.string(),
          headers: z.record(z.string()),
          body: z.unknown(),
          query: z.record(z.string()),
        }),
      },
    ],
    status: "active",
  };
}

/**
 * Creates the HTTP connector.
 */
function createHttpConnector(): IntegrationConnector {
  return {
    id: "http",
    name: "HTTP Request",
    description: "Make HTTP requests to any URL",
    iconUrl: "/icons/http.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.CUSTOM,
    authConfigSchema: z.object({
      baseUrl: z.string().url().optional(),
      headers: z.record(z.string()).optional(),
      auth: z.object({
        type: z.enum(["none", "basic", "bearer", "api_key"]),
        username: z.string().optional(),
        password: z.string().optional(),
        token: z.string().optional(),
        apiKey: z.string().optional(),
        apiKeyHeader: z.string().optional(),
      }).optional(),
    }),
    actions: [
      {
        id: "request",
        name: "HTTP Request",
        description: "Make an HTTP request",
        inputSchema: z.object({
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
          url: z.string(),
          headers: z.record(z.string()).optional(),
          body: z.unknown().optional(),
          queryParams: z.record(z.string()).optional(),
          timeout: z.number().positive().optional(),
        }),
        outputSchema: z.object({
          statusCode: z.number(),
          body: z.unknown(),
          headers: z.record(z.string()),
          duration: z.number(),
        }),
      },
    ],
    triggers: [],
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000,
      strategy: "reject",
    },
    status: "active",
  };
}

/**
 * Creates the email connector.
 */
function createEmailConnector(): IntegrationConnector {
  return {
    id: "email",
    name: "Email",
    description: "Send emails via SMTP",
    iconUrl: "/icons/email.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.CUSTOM,
    authConfigSchema: z.object({
      host: z.string(),
      port: z.number(),
      secure: z.boolean().default(true),
      user: z.string(),
      password: z.string(),
      from: z.string().email(),
    }),
    actions: [
      {
        id: "send",
        name: "Send Email",
        description: "Send an email",
        inputSchema: z.object({
          to: z.array(z.string().email()),
          cc: z.array(z.string().email()).optional(),
          bcc: z.array(z.string().email()).optional(),
          subject: z.string(),
          text: z.string().optional(),
          html: z.string().optional(),
          attachments: z.array(z.object({
            filename: z.string(),
            content: z.string(),
            contentType: z.string().optional(),
          })).optional(),
        }),
        outputSchema: z.object({
          messageId: z.string(),
          accepted: z.array(z.string()),
          rejected: z.array(z.string()),
        }),
      },
    ],
    triggers: [],
    rateLimit: {
      maxRequests: 50,
      windowMs: 60000,
      strategy: "queue",
    },
    status: "active",
  };
}

/**
 * Creates the Slack connector.
 */
function createSlackConnector(): IntegrationConnector {
  return {
    id: "slack",
    name: "Slack",
    description: "Send messages and interact with Slack",
    iconUrl: "/icons/slack.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.OAUTH2,
    authConfigSchema: z.object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.date().optional(),
      teamId: z.string().optional(),
    }),
    actions: [
      {
        id: "sendMessage",
        name: "Send Message",
        description: "Send a message to a Slack channel",
        inputSchema: z.object({
          channel: z.string(),
          text: z.string().optional(),
          blocks: z.array(z.unknown()).optional(),
          attachments: z.array(z.unknown()).optional(),
          threadTs: z.string().optional(),
          unfurlLinks: z.boolean().optional(),
          unfurlMedia: z.boolean().optional(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
          ts: z.string(),
          channel: z.string(),
        }),
      },
      {
        id: "uploadFile",
        name: "Upload File",
        description: "Upload a file to Slack",
        inputSchema: z.object({
          channels: z.array(z.string()),
          content: z.string(),
          filename: z.string(),
          title: z.string().optional(),
          initialComment: z.string().optional(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
          file: z.object({
            id: z.string(),
            name: z.string(),
          }),
        }),
      },
      {
        id: "createChannel",
        name: "Create Channel",
        description: "Create a new Slack channel",
        inputSchema: z.object({
          name: z.string(),
          isPrivate: z.boolean().optional(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
          channel: z.object({
            id: z.string(),
            name: z.string(),
          }),
        }),
      },
    ],
    triggers: [
      {
        id: "newMessage",
        name: "New Message",
        description: "Triggered when a new message is posted",
        type: "webhook",
        outputSchema: z.object({
          type: z.literal("message"),
          channel: z.string(),
          user: z.string(),
          text: z.string(),
          ts: z.string(),
        }),
      },
      {
        id: "reaction",
        name: "Reaction Added",
        description: "Triggered when a reaction is added",
        type: "webhook",
        outputSchema: z.object({
          type: z.literal("reaction_added"),
          reaction: z.string(),
          user: z.string(),
          itemUser: z.string(),
          item: z.object({
            channel: z.string(),
            ts: z.string(),
          }),
        }),
      },
    ],
    rateLimit: {
      maxRequests: 60,
      windowMs: 60000,
      strategy: "throttle",
    },
    status: "active",
  };
}

/**
 * Creates the GitHub connector.
 */
function createGitHubConnector(): IntegrationConnector {
  return {
    id: "github",
    name: "GitHub",
    description: "Interact with GitHub repositories and issues",
    iconUrl: "/icons/github.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.OAUTH2,
    authConfigSchema: z.object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.date().optional(),
    }),
    actions: [
      {
        id: "createIssue",
        name: "Create Issue",
        description: "Create a new issue in a repository",
        inputSchema: z.object({
          owner: z.string(),
          repo: z.string(),
          title: z.string(),
          body: z.string().optional(),
          labels: z.array(z.string()).optional(),
          assignees: z.array(z.string()).optional(),
          milestone: z.number().optional(),
        }),
        outputSchema: z.object({
          id: z.number(),
          number: z.number(),
          url: z.string(),
          htmlUrl: z.string(),
        }),
      },
      {
        id: "createPullRequest",
        name: "Create Pull Request",
        description: "Create a new pull request",
        inputSchema: z.object({
          owner: z.string(),
          repo: z.string(),
          title: z.string(),
          body: z.string().optional(),
          head: z.string(),
          base: z.string(),
          draft: z.boolean().optional(),
        }),
        outputSchema: z.object({
          id: z.number(),
          number: z.number(),
          url: z.string(),
          htmlUrl: z.string(),
        }),
      },
      {
        id: "addComment",
        name: "Add Comment",
        description: "Add a comment to an issue or PR",
        inputSchema: z.object({
          owner: z.string(),
          repo: z.string(),
          issueNumber: z.number(),
          body: z.string(),
        }),
        outputSchema: z.object({
          id: z.number(),
          url: z.string(),
        }),
      },
      {
        id: "createRelease",
        name: "Create Release",
        description: "Create a new release",
        inputSchema: z.object({
          owner: z.string(),
          repo: z.string(),
          tagName: z.string(),
          name: z.string().optional(),
          body: z.string().optional(),
          draft: z.boolean().optional(),
          prerelease: z.boolean().optional(),
        }),
        outputSchema: z.object({
          id: z.number(),
          url: z.string(),
          htmlUrl: z.string(),
          uploadUrl: z.string(),
        }),
      },
    ],
    triggers: [
      {
        id: "push",
        name: "Push Event",
        description: "Triggered on push to repository",
        type: "webhook",
        outputSchema: z.object({
          ref: z.string(),
          commits: z.array(z.object({
            id: z.string(),
            message: z.string(),
            author: z.object({
              name: z.string(),
              email: z.string(),
            }),
          })),
          repository: z.object({
            fullName: z.string(),
          }),
        }),
      },
      {
        id: "pullRequest",
        name: "Pull Request Event",
        description: "Triggered on pull request activity",
        type: "webhook",
        outputSchema: z.object({
          action: z.string(),
          number: z.number(),
          pullRequest: z.object({
            title: z.string(),
            body: z.string().optional(),
            head: z.object({ ref: z.string() }),
            base: z.object({ ref: z.string() }),
          }),
        }),
      },
      {
        id: "issue",
        name: "Issue Event",
        description: "Triggered on issue activity",
        type: "webhook",
        outputSchema: z.object({
          action: z.string(),
          issue: z.object({
            number: z.number(),
            title: z.string(),
            body: z.string().optional(),
          }),
        }),
      },
    ],
    rateLimit: {
      maxRequests: 5000,
      windowMs: 3600000, // 1 hour
      strategy: "reject",
    },
    status: "active",
  };
}

/**
 * Creates the Google Sheets connector.
 */
function createGoogleSheetsConnector(): IntegrationConnector {
  return {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets",
    iconUrl: "/icons/google-sheets.svg",
    version: "1.0.0",
    authType: ConnectorAuthType.OAUTH2,
    authConfigSchema: z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.date().optional(),
    }),
    actions: [
      {
        id: "readRows",
        name: "Read Rows",
        description: "Read rows from a spreadsheet",
        inputSchema: z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          majorDimension: z.enum(["ROWS", "COLUMNS"]).optional(),
        }),
        outputSchema: z.object({
          values: z.array(z.array(z.unknown())),
          range: z.string(),
        }),
      },
      {
        id: "appendRows",
        name: "Append Rows",
        description: "Append rows to a spreadsheet",
        inputSchema: z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.unknown())),
          valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
        }),
        outputSchema: z.object({
          updatedRange: z.string(),
          updatedRows: z.number(),
          updatedCells: z.number(),
        }),
      },
      {
        id: "updateRows",
        name: "Update Rows",
        description: "Update existing rows in a spreadsheet",
        inputSchema: z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.unknown())),
          valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
        }),
        outputSchema: z.object({
          updatedRange: z.string(),
          updatedRows: z.number(),
          updatedCells: z.number(),
        }),
      },
      {
        id: "createSpreadsheet",
        name: "Create Spreadsheet",
        description: "Create a new spreadsheet",
        inputSchema: z.object({
          title: z.string(),
          sheets: z.array(z.object({
            title: z.string(),
          })).optional(),
        }),
        outputSchema: z.object({
          spreadsheetId: z.string(),
          spreadsheetUrl: z.string(),
        }),
      },
    ],
    triggers: [
      {
        id: "rowAdded",
        name: "Row Added",
        description: "Triggered when a new row is added",
        type: "polling",
        pollingInterval: 60000, // 1 minute
        outputSchema: z.object({
          row: z.number(),
          values: z.array(z.unknown()),
        }),
      },
    ],
    rateLimit: {
      maxRequests: 100,
      windowMs: 100000, // Per 100 seconds
      strategy: "queue",
    },
    status: "active",
  };
}

// ==================== Singleton Instance ====================

let connectorRegistryInstance: ConnectorRegistry | null = null;

/**
 * Initializes the connector registry.
 */
export function initializeConnectorRegistry(encryptionKey: string): ConnectorRegistry {
  connectorRegistryInstance = new ConnectorRegistry(encryptionKey);
  return connectorRegistryInstance;
}

/**
 * Gets the connector registry instance.
 */
export function getConnectorRegistry(): ConnectorRegistry | null {
  return connectorRegistryInstance;
}

/**
 * Resets the connector registry (for testing).
 */
export function resetConnectorRegistry(): void {
  connectorRegistryInstance = null;
}
