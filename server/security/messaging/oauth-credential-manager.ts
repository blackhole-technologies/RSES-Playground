/**
 * @file oauth-credential-manager.ts
 * @description OAuth Credential Manager for secure social media integrations.
 *              Provides token management, automatic refresh, permission scoping,
 *              credential vault, and audit trail for third-party API access.
 * @phase Phase 10 - Messaging & Social Media Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards OAuth 2.0, OpenID Connect, PKCE
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { EncryptedEnvelope } from './types';

// =============================================================================
// OAUTH TYPES
// =============================================================================

/**
 * Supported OAuth providers.
 */
export type OAuthProvider =
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'mastodon'
  | 'threads'
  | 'bluesky'
  | 'google'
  | 'microsoft'
  | 'slack'
  | 'discord'
  | 'zoom'
  | 'custom';

/**
 * OAuth credential stored in the vault.
 */
export interface OAuthCredential {
  /** Credential ID */
  credentialId: string;
  /** User ID who owns this credential */
  userId: string;
  /** Organization ID */
  organizationId?: string;
  /** OAuth provider */
  provider: OAuthProvider;
  /** Provider-specific account ID */
  providerAccountId: string;
  /** Provider account name/handle */
  providerAccountName?: string;
  /** Access token (encrypted) */
  accessToken: EncryptedToken;
  /** Refresh token (encrypted, if available) */
  refreshToken?: EncryptedToken;
  /** Token type (usually "Bearer") */
  tokenType: string;
  /** Granted scopes */
  scopes: string[];
  /** Token expiration time */
  expiresAt: Date;
  /** Last refresh time */
  lastRefreshedAt?: Date;
  /** Creation time */
  createdAt: Date;
  /** Last used time */
  lastUsedAt?: Date;
  /** Usage count */
  usageCount: number;
  /** Status */
  status: CredentialStatus;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface EncryptedToken {
  /** Encrypted value */
  encryptedValue: string;
  /** Encryption IV */
  iv: string;
  /** Auth tag */
  authTag: string;
  /** Key ID used for encryption */
  keyId: string;
  /** Algorithm */
  algorithm: string;
}

export type CredentialStatus =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'pending_refresh'
  | 'suspended';

/**
 * OAuth provider configuration.
 */
export interface ProviderConfig {
  /** Provider ID */
  provider: OAuthProvider;
  /** Client ID */
  clientId: string;
  /** Client secret (encrypted) */
  clientSecret: EncryptedToken;
  /** Authorization endpoint */
  authorizationUrl: string;
  /** Token endpoint */
  tokenUrl: string;
  /** Token revocation endpoint */
  revocationUrl?: string;
  /** User info endpoint */
  userInfoUrl?: string;
  /** Available scopes */
  availableScopes: ScopeDefinition[];
  /** Required scopes */
  requiredScopes: string[];
  /** Default scopes */
  defaultScopes: string[];
  /** Token lifetime (seconds) */
  tokenLifetime: number;
  /** Supports refresh tokens */
  supportsRefresh: boolean;
  /** Requires PKCE */
  requiresPkce: boolean;
  /** API rate limits */
  rateLimits: RateLimitConfig;
  /** Custom headers */
  customHeaders?: Record<string, string>;
  /** Status */
  status: 'active' | 'disabled' | 'deprecated';
}

export interface ScopeDefinition {
  /** Scope name */
  scope: string;
  /** Display name */
  displayName: string;
  /** Description */
  description: string;
  /** Required for basic functionality */
  required: boolean;
  /** Sensitive scope (requires approval) */
  sensitive: boolean;
  /** Category */
  category: 'read' | 'write' | 'admin' | 'profile' | 'email' | 'offline';
}

export interface RateLimitConfig {
  /** Requests per window */
  requestsPerWindow: number;
  /** Window duration (seconds) */
  windowSeconds: number;
  /** Burst limit */
  burstLimit?: number;
  /** Daily limit */
  dailyLimit?: number;
}

/**
 * OAuth authorization state.
 */
export interface AuthorizationState {
  /** State parameter */
  state: string;
  /** Code verifier (for PKCE) */
  codeVerifier?: string;
  /** User ID */
  userId: string;
  /** Provider */
  provider: OAuthProvider;
  /** Requested scopes */
  requestedScopes: string[];
  /** Redirect URI */
  redirectUri: string;
  /** Creation time */
  createdAt: Date;
  /** Expiration time */
  expiresAt: Date;
  /** Nonce (for OIDC) */
  nonce?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Token refresh result.
 */
export interface TokenRefreshResult {
  /** Success */
  success: boolean;
  /** New access token */
  accessToken?: string;
  /** New refresh token (if rotated) */
  refreshToken?: string;
  /** New expiration */
  expiresAt?: Date;
  /** New scopes (if changed) */
  scopes?: string[];
  /** Error message */
  error?: string;
  /** Error code */
  errorCode?: string;
}

/**
 * Credential audit event.
 */
export interface CredentialAuditEvent {
  /** Event ID */
  eventId: string;
  /** Credential ID */
  credentialId: string;
  /** User ID */
  userId: string;
  /** Event type */
  eventType: CredentialEventType;
  /** Provider */
  provider: OAuthProvider;
  /** Timestamp */
  timestamp: Date;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Result */
  result: 'success' | 'failure';
  /** Error details */
  error?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export type CredentialEventType =
  | 'credential_created'
  | 'credential_updated'
  | 'credential_deleted'
  | 'credential_revoked'
  | 'token_used'
  | 'token_refreshed'
  | 'token_refresh_failed'
  | 'token_expired'
  | 'scope_changed'
  | 'rate_limit_exceeded'
  | 'unauthorized_access'
  | 'suspicious_activity';

// =============================================================================
// CREDENTIAL MANAGER CONFIGURATION
// =============================================================================

export interface CredentialManagerConfig {
  /** Enable automatic token refresh */
  autoRefresh: boolean;
  /** Refresh tokens before expiration (seconds) */
  refreshBeforeExpiry: number;
  /** Maximum refresh attempts */
  maxRefreshAttempts: number;
  /** Retry delay (ms) */
  refreshRetryDelay: number;
  /** Enable audit logging */
  auditEnabled: boolean;
  /** Audit retention (days) */
  auditRetentionDays: number;
  /** Enable rate limit tracking */
  rateLimitTracking: boolean;
  /** Encryption key ID */
  encryptionKeyId: string;
}

const defaultConfig: CredentialManagerConfig = {
  autoRefresh: true,
  refreshBeforeExpiry: 300, // 5 minutes
  maxRefreshAttempts: 3,
  refreshRetryDelay: 1000,
  auditEnabled: true,
  auditRetentionDays: 365,
  rateLimitTracking: true,
  encryptionKeyId: 'default',
};

// =============================================================================
// CREDENTIAL MANAGER IMPLEMENTATION
// =============================================================================

/**
 * OAuth Credential Manager.
 */
export class OAuthCredentialManager extends EventEmitter {
  private config: CredentialManagerConfig;
  private providers: Map<OAuthProvider, ProviderConfig> = new Map();
  private credentials: Map<string, OAuthCredential> = new Map();
  private authorizationStates: Map<string, AuthorizationState> = new Map();
  private auditLog: CredentialAuditEvent[] = [];
  private rateLimitCounters: Map<string, RateLimitCounter> = new Map();
  private encryptionKey: Buffer;
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<CredentialManagerConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    this.encryptionKey = this.deriveEncryptionKey(this.config.encryptionKeyId);
    this.initializeDefaultProviders();
  }

  // ===========================================================================
  // PROVIDER MANAGEMENT
  // ===========================================================================

  /**
   * Register an OAuth provider.
   */
  registerProvider(config: Omit<ProviderConfig, 'clientSecret'> & { clientSecret: string }): void {
    const encryptedSecret = this.encryptToken(config.clientSecret);

    const providerConfig: ProviderConfig = {
      ...config,
      clientSecret: encryptedSecret,
    };

    this.providers.set(config.provider, providerConfig);
    this.emit('provider_registered', { provider: config.provider });
  }

  /**
   * Get provider configuration.
   */
  getProvider(provider: OAuthProvider): ProviderConfig | null {
    return this.providers.get(provider) || null;
  }

  /**
   * List all registered providers.
   */
  listProviders(): OAuthProvider[] {
    return Array.from(this.providers.keys());
  }

  // ===========================================================================
  // AUTHORIZATION FLOW
  // ===========================================================================

  /**
   * Generate authorization URL for OAuth flow.
   */
  generateAuthorizationUrl(
    provider: OAuthProvider,
    userId: string,
    scopes: string[],
    redirectUri: string,
    metadata: Record<string, unknown> = {}
  ): { url: string; state: string } {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`Provider not configured: ${provider}`);
    }

    if (providerConfig.status !== 'active') {
      throw new Error(`Provider ${provider} is ${providerConfig.status}`);
    }

    // Generate state
    const state = crypto.randomBytes(32).toString('hex');

    // Generate PKCE code verifier and challenge if required
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (providerConfig.requiresPkce) {
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    }

    // Generate nonce for OIDC
    const nonce = crypto.randomBytes(16).toString('hex');

    // Store authorization state
    const authState: AuthorizationState = {
      state,
      codeVerifier,
      userId,
      provider,
      requestedScopes: scopes,
      redirectUri,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      nonce,
      metadata,
    };

    this.authorizationStates.set(state, authState);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
    });

    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    if (providerConfig.authorizationUrl.includes('openid')) {
      params.append('nonce', nonce);
    }

    const url = `${providerConfig.authorizationUrl}?${params.toString()}`;

    this.emit('authorization_initiated', { provider, userId, state });

    return { url, state };
  }

  /**
   * Handle OAuth callback and exchange code for tokens.
   */
  async handleCallback(
    code: string,
    state: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthCredential> {
    // Validate state
    const authState = this.authorizationStates.get(state);
    if (!authState) {
      throw new Error('Invalid or expired authorization state');
    }

    if (new Date() > authState.expiresAt) {
      this.authorizationStates.delete(state);
      throw new Error('Authorization state expired');
    }

    const providerConfig = this.providers.get(authState.provider);
    if (!providerConfig) {
      throw new Error(`Provider not configured: ${authState.provider}`);
    }

    // Clean up state
    this.authorizationStates.delete(state);

    try {
      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(
        code,
        authState,
        providerConfig
      );

      // Get user info from provider
      const userInfo = await this.fetchUserInfo(
        tokenResponse.accessToken,
        providerConfig
      );

      // Create credential
      const credential = await this.createCredential(
        authState.userId,
        authState.provider,
        tokenResponse,
        userInfo,
        authState.requestedScopes
      );

      // Audit log
      this.logAuditEvent({
        credentialId: credential.credentialId,
        userId: authState.userId,
        eventType: 'credential_created',
        provider: authState.provider,
        result: 'success',
        ipAddress,
        userAgent,
        metadata: { scopes: authState.requestedScopes },
      });

      // Set up auto-refresh
      if (this.config.autoRefresh && credential.refreshToken) {
        this.scheduleTokenRefresh(credential);
      }

      this.emit('credential_created', {
        credentialId: credential.credentialId,
        provider: credential.provider,
        userId: credential.userId,
      });

      return credential;
    } catch (error) {
      this.logAuditEvent({
        credentialId: 'unknown',
        userId: authState.userId,
        eventType: 'credential_created',
        provider: authState.provider,
        result: 'failure',
        error: (error as Error).message,
        ipAddress,
        userAgent,
        metadata: {},
      });

      throw error;
    }
  }

  // ===========================================================================
  // CREDENTIAL MANAGEMENT
  // ===========================================================================

  /**
   * Get credential by ID.
   */
  async getCredential(credentialId: string): Promise<OAuthCredential | null> {
    const credential = this.credentials.get(credentialId);
    if (!credential) return null;

    // Check if refresh is needed
    if (this.shouldRefresh(credential)) {
      await this.refreshCredential(credentialId);
      return this.credentials.get(credentialId) || null;
    }

    return credential;
  }

  /**
   * Get credentials for a user.
   */
  getUserCredentials(userId: string): OAuthCredential[] {
    return Array.from(this.credentials.values())
      .filter(c => c.userId === userId && c.status === 'active');
  }

  /**
   * Get credentials for a provider.
   */
  getProviderCredentials(provider: OAuthProvider): OAuthCredential[] {
    return Array.from(this.credentials.values())
      .filter(c => c.provider === provider && c.status === 'active');
  }

  /**
   * Get decrypted access token.
   */
  async getAccessToken(credentialId: string): Promise<string | null> {
    const credential = await this.getCredential(credentialId);
    if (!credential || credential.status !== 'active') {
      return null;
    }

    // Check rate limits
    if (this.config.rateLimitTracking) {
      const providerConfig = this.providers.get(credential.provider);
      if (providerConfig && !this.checkRateLimit(credential, providerConfig)) {
        this.emit('rate_limit_exceeded', {
          credentialId,
          provider: credential.provider,
        });
        throw new Error('Rate limit exceeded');
      }
    }

    // Decrypt and return token
    const accessToken = this.decryptToken(credential.accessToken);

    // Update usage stats
    credential.lastUsedAt = new Date();
    credential.usageCount++;

    // Audit log
    this.logAuditEvent({
      credentialId,
      userId: credential.userId,
      eventType: 'token_used',
      provider: credential.provider,
      result: 'success',
      metadata: {},
    });

    return accessToken;
  }

  /**
   * Refresh a credential's tokens.
   */
  async refreshCredential(credentialId: string): Promise<boolean> {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    if (!credential.refreshToken) {
      this.emit('refresh_failed', {
        credentialId,
        reason: 'No refresh token available',
      });
      return false;
    }

    const providerConfig = this.providers.get(credential.provider);
    if (!providerConfig) {
      throw new Error(`Provider not configured: ${credential.provider}`);
    }

    credential.status = 'pending_refresh';

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < this.config.maxRefreshAttempts) {
      try {
        const result = await this.performTokenRefresh(credential, providerConfig);

        if (result.success && result.accessToken) {
          // Update credential
          credential.accessToken = this.encryptToken(result.accessToken);

          if (result.refreshToken) {
            credential.refreshToken = this.encryptToken(result.refreshToken);
          }

          if (result.expiresAt) {
            credential.expiresAt = result.expiresAt;
          }

          if (result.scopes) {
            credential.scopes = result.scopes;
          }

          credential.lastRefreshedAt = new Date();
          credential.status = 'active';

          // Reschedule refresh
          if (this.config.autoRefresh) {
            this.scheduleTokenRefresh(credential);
          }

          // Audit log
          this.logAuditEvent({
            credentialId,
            userId: credential.userId,
            eventType: 'token_refreshed',
            provider: credential.provider,
            result: 'success',
            metadata: { newExpiresAt: credential.expiresAt },
          });

          this.emit('token_refreshed', { credentialId, provider: credential.provider });

          return true;
        }

        lastError = result.error;
        attempts++;

        if (attempts < this.config.maxRefreshAttempts) {
          await this.sleep(this.config.refreshRetryDelay * attempts);
        }
      } catch (error) {
        lastError = (error as Error).message;
        attempts++;

        if (attempts < this.config.maxRefreshAttempts) {
          await this.sleep(this.config.refreshRetryDelay * attempts);
        }
      }
    }

    // Refresh failed
    credential.status = 'invalid';

    this.logAuditEvent({
      credentialId,
      userId: credential.userId,
      eventType: 'token_refresh_failed',
      provider: credential.provider,
      result: 'failure',
      error: lastError,
      metadata: { attempts },
    });

    this.emit('refresh_failed', {
      credentialId,
      provider: credential.provider,
      error: lastError,
    });

    return false;
  }

  /**
   * Revoke a credential.
   */
  async revokeCredential(
    credentialId: string,
    reason: string = 'User requested'
  ): Promise<boolean> {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    const providerConfig = this.providers.get(credential.provider);

    // Try to revoke at provider
    if (providerConfig?.revocationUrl) {
      try {
        const accessToken = this.decryptToken(credential.accessToken);
        await this.revokeTokenAtProvider(accessToken, providerConfig);
      } catch (error) {
        // Log but continue - we'll mark as revoked locally regardless
        this.emit('provider_revocation_failed', {
          credentialId,
          error: (error as Error).message,
        });
      }
    }

    // Cancel refresh timer
    const timer = this.refreshTimers.get(credentialId);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(credentialId);
    }

    // Update status
    credential.status = 'revoked';

    // Audit log
    this.logAuditEvent({
      credentialId,
      userId: credential.userId,
      eventType: 'credential_revoked',
      provider: credential.provider,
      result: 'success',
      metadata: { reason },
    });

    this.emit('credential_revoked', {
      credentialId,
      provider: credential.provider,
      reason,
    });

    return true;
  }

  /**
   * Delete a credential.
   */
  async deleteCredential(credentialId: string): Promise<boolean> {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return false;
    }

    // Revoke first if not already revoked
    if (credential.status === 'active') {
      await this.revokeCredential(credentialId, 'Credential deleted');
    }

    // Cancel refresh timer
    const timer = this.refreshTimers.get(credentialId);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(credentialId);
    }

    // Delete credential
    this.credentials.delete(credentialId);

    // Audit log
    this.logAuditEvent({
      credentialId,
      userId: credential.userId,
      eventType: 'credential_deleted',
      provider: credential.provider,
      result: 'success',
      metadata: {},
    });

    this.emit('credential_deleted', { credentialId, provider: credential.provider });

    return true;
  }

  // ===========================================================================
  // SCOPE MANAGEMENT
  // ===========================================================================

  /**
   * Check if credential has required scopes.
   */
  hasScopes(credentialId: string, requiredScopes: string[]): boolean {
    const credential = this.credentials.get(credentialId);
    if (!credential) return false;

    return requiredScopes.every(scope => credential.scopes.includes(scope));
  }

  /**
   * Get available scopes for a provider.
   */
  getAvailableScopes(provider: OAuthProvider): ScopeDefinition[] {
    const providerConfig = this.providers.get(provider);
    return providerConfig?.availableScopes || [];
  }

  /**
   * Request additional scopes (re-authorization).
   */
  requestAdditionalScopes(
    credentialId: string,
    additionalScopes: string[],
    redirectUri: string
  ): { url: string; state: string } {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    const allScopes = [...new Set([...credential.scopes, ...additionalScopes])];

    return this.generateAuthorizationUrl(
      credential.provider,
      credential.userId,
      allScopes,
      redirectUri,
      { existingCredentialId: credentialId }
    );
  }

  // ===========================================================================
  // RATE LIMIT HANDLING
  // ===========================================================================

  /**
   * Get current rate limit status.
   */
  getRateLimitStatus(credentialId: string): RateLimitStatus | null {
    const counter = this.rateLimitCounters.get(credentialId);
    if (!counter) return null;

    const credential = this.credentials.get(credentialId);
    const providerConfig = credential ? this.providers.get(credential.provider) : null;

    if (!providerConfig) return null;

    return {
      remaining: providerConfig.rateLimits.requestsPerWindow - counter.count,
      total: providerConfig.rateLimits.requestsPerWindow,
      resetsAt: new Date(counter.windowStart + providerConfig.rateLimits.windowSeconds * 1000),
      dailyRemaining: providerConfig.rateLimits.dailyLimit
        ? providerConfig.rateLimits.dailyLimit - counter.dailyCount
        : undefined,
    };
  }

  /**
   * Reset rate limit counter (for testing or admin override).
   */
  resetRateLimit(credentialId: string): void {
    this.rateLimitCounters.delete(credentialId);
  }

  // ===========================================================================
  // AUDIT & REPORTING
  // ===========================================================================

  /**
   * Get audit events for a credential.
   */
  getCredentialAuditLog(
    credentialId: string,
    options: { limit?: number; eventTypes?: CredentialEventType[] } = {}
  ): CredentialAuditEvent[] {
    let events = this.auditLog.filter(e => e.credentialId === credentialId);

    if (options.eventTypes) {
      events = events.filter(e => options.eventTypes!.includes(e.eventType));
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Get audit events for a user.
   */
  getUserAuditLog(
    userId: string,
    options: { limit?: number; startDate?: Date; endDate?: Date } = {}
  ): CredentialAuditEvent[] {
    let events = this.auditLog.filter(e => e.userId === userId);

    if (options.startDate) {
      events = events.filter(e => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      events = events.filter(e => e.timestamp <= options.endDate!);
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Generate credential usage report.
   */
  generateUsageReport(
    options: { provider?: OAuthProvider; userId?: string; startDate?: Date; endDate?: Date } = {}
  ): CredentialUsageReport {
    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options.endDate || new Date();

    let credentials = Array.from(this.credentials.values());
    let events = this.auditLog.filter(
      e => e.timestamp >= startDate && e.timestamp <= endDate
    );

    if (options.provider) {
      credentials = credentials.filter(c => c.provider === options.provider);
      events = events.filter(e => e.provider === options.provider);
    }

    if (options.userId) {
      credentials = credentials.filter(c => c.userId === options.userId);
      events = events.filter(e => e.userId === options.userId);
    }

    const tokenUsageEvents = events.filter(e => e.eventType === 'token_used');
    const refreshEvents = events.filter(e => e.eventType === 'token_refreshed');
    const failedRefreshEvents = events.filter(e => e.eventType === 'token_refresh_failed');
    const revokedEvents = events.filter(e => e.eventType === 'credential_revoked');

    // Calculate usage by provider
    const usageByProvider: Record<string, number> = {};
    for (const event of tokenUsageEvents) {
      usageByProvider[event.provider] = (usageByProvider[event.provider] || 0) + 1;
    }

    return {
      period: { startDate, endDate },
      totalCredentials: credentials.length,
      activeCredentials: credentials.filter(c => c.status === 'active').length,
      totalApiCalls: tokenUsageEvents.length,
      successfulRefreshes: refreshEvents.length,
      failedRefreshes: failedRefreshEvents.length,
      revokedCredentials: revokedEvents.length,
      usageByProvider,
      topUsers: this.getTopUsers(tokenUsageEvents, 10),
    };
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private initializeDefaultProviders(): void {
    // Note: In production, these would be loaded from secure configuration
    // Here we just define the structure

    const defaultProviders: Partial<ProviderConfig>[] = [
      {
        provider: 'twitter',
        authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        revocationUrl: 'https://api.twitter.com/2/oauth2/revoke',
        userInfoUrl: 'https://api.twitter.com/2/users/me',
        availableScopes: [
          { scope: 'tweet.read', displayName: 'Read Tweets', description: 'Read tweets', required: true, sensitive: false, category: 'read' },
          { scope: 'tweet.write', displayName: 'Write Tweets', description: 'Post tweets', required: false, sensitive: true, category: 'write' },
          { scope: 'users.read', displayName: 'Read Users', description: 'Read user info', required: true, sensitive: false, category: 'profile' },
          { scope: 'offline.access', displayName: 'Offline Access', description: 'Refresh tokens', required: false, sensitive: false, category: 'offline' },
        ],
        requiredScopes: ['tweet.read', 'users.read'],
        defaultScopes: ['tweet.read', 'users.read', 'offline.access'],
        tokenLifetime: 7200,
        supportsRefresh: true,
        requiresPkce: true,
        rateLimits: { requestsPerWindow: 300, windowSeconds: 900, dailyLimit: 100000 },
        status: 'active',
      },
      {
        provider: 'facebook',
        authorizationUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        userInfoUrl: 'https://graph.facebook.com/v18.0/me',
        availableScopes: [
          { scope: 'public_profile', displayName: 'Public Profile', description: 'Basic profile info', required: true, sensitive: false, category: 'profile' },
          { scope: 'email', displayName: 'Email', description: 'User email', required: false, sensitive: false, category: 'email' },
          { scope: 'pages_manage_posts', displayName: 'Manage Posts', description: 'Post to pages', required: false, sensitive: true, category: 'write' },
        ],
        requiredScopes: ['public_profile'],
        defaultScopes: ['public_profile', 'email'],
        tokenLifetime: 3600,
        supportsRefresh: true,
        requiresPkce: false,
        rateLimits: { requestsPerWindow: 200, windowSeconds: 3600 },
        status: 'active',
      },
      {
        provider: 'linkedin',
        authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
        availableScopes: [
          { scope: 'openid', displayName: 'OpenID', description: 'OpenID Connect', required: true, sensitive: false, category: 'profile' },
          { scope: 'profile', displayName: 'Profile', description: 'Basic profile', required: true, sensitive: false, category: 'profile' },
          { scope: 'email', displayName: 'Email', description: 'Email address', required: false, sensitive: false, category: 'email' },
          { scope: 'w_member_social', displayName: 'Post', description: 'Post to LinkedIn', required: false, sensitive: true, category: 'write' },
        ],
        requiredScopes: ['openid', 'profile'],
        defaultScopes: ['openid', 'profile', 'email'],
        tokenLifetime: 3600,
        supportsRefresh: true,
        requiresPkce: false,
        rateLimits: { requestsPerWindow: 100, windowSeconds: 60, dailyLimit: 100000 },
        status: 'active',
      },
    ];

    // Store provider configs (without secrets - those need to be configured separately)
    for (const config of defaultProviders) {
      if (config.provider) {
        // Create placeholder - actual credentials need to be configured
        this.providers.set(config.provider, {
          ...config,
          clientId: '',
          clientSecret: { encryptedValue: '', iv: '', authTag: '', keyId: '', algorithm: '' },
        } as ProviderConfig);
      }
    }
  }

  private async exchangeCodeForTokens(
    code: string,
    authState: AuthorizationState,
    providerConfig: ProviderConfig
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; scope?: string }> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: authState.redirectUri,
      client_id: providerConfig.clientId,
      client_secret: this.decryptToken(providerConfig.clientSecret),
    });

    if (authState.codeVerifier) {
      params.append('code_verifier', authState.codeVerifier);
    }

    const response = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...providerConfig.customHeaders,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || providerConfig.tokenLifetime,
      scope: data.scope,
    };
  }

  private async fetchUserInfo(
    accessToken: string,
    providerConfig: ProviderConfig
  ): Promise<{ id: string; name?: string }> {
    if (!providerConfig.userInfoUrl) {
      return { id: 'unknown' };
    }

    try {
      const response = await fetch(providerConfig.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...providerConfig.customHeaders,
        },
      });

      if (!response.ok) {
        return { id: 'unknown' };
      }

      const data = await response.json();

      return {
        id: data.id || data.sub || 'unknown',
        name: data.name || data.username || data.screen_name,
      };
    } catch {
      return { id: 'unknown' };
    }
  }

  private async createCredential(
    userId: string,
    provider: OAuthProvider,
    tokenResponse: { accessToken: string; refreshToken?: string; expiresIn: number; scope?: string },
    userInfo: { id: string; name?: string },
    requestedScopes: string[]
  ): Promise<OAuthCredential> {
    const credentialId = `cred_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const credential: OAuthCredential = {
      credentialId,
      userId,
      provider,
      providerAccountId: userInfo.id,
      providerAccountName: userInfo.name,
      accessToken: this.encryptToken(tokenResponse.accessToken),
      refreshToken: tokenResponse.refreshToken
        ? this.encryptToken(tokenResponse.refreshToken)
        : undefined,
      tokenType: 'Bearer',
      scopes: tokenResponse.scope ? tokenResponse.scope.split(' ') : requestedScopes,
      expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
      createdAt: new Date(),
      usageCount: 0,
      status: 'active',
      metadata: {},
    };

    this.credentials.set(credentialId, credential);

    return credential;
  }

  private async performTokenRefresh(
    credential: OAuthCredential,
    providerConfig: ProviderConfig
  ): Promise<TokenRefreshResult> {
    if (!credential.refreshToken) {
      return { success: false, error: 'No refresh token' };
    }

    const refreshToken = this.decryptToken(credential.refreshToken);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: providerConfig.clientId,
      client_secret: this.decryptToken(providerConfig.clientSecret),
    });

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...providerConfig.customHeaders,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: `Token refresh failed: ${error}`,
          errorCode: `HTTP_${response.status}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // May be rotated
        expiresAt: new Date(Date.now() + (data.expires_in || providerConfig.tokenLifetime) * 1000),
        scopes: data.scope ? data.scope.split(' ') : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  private async revokeTokenAtProvider(
    accessToken: string,
    providerConfig: ProviderConfig
  ): Promise<void> {
    if (!providerConfig.revocationUrl) {
      return;
    }

    const params = new URLSearchParams({
      token: accessToken,
      client_id: providerConfig.clientId,
      client_secret: this.decryptToken(providerConfig.clientSecret),
    });

    const response = await fetch(providerConfig.revocationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token revocation failed: ${error}`);
    }
  }

  private shouldRefresh(credential: OAuthCredential): boolean {
    if (!credential.refreshToken) return false;
    if (credential.status !== 'active') return false;

    const refreshThreshold = this.config.refreshBeforeExpiry * 1000;
    return credential.expiresAt.getTime() - Date.now() < refreshThreshold;
  }

  private scheduleTokenRefresh(credential: OAuthCredential): void {
    // Cancel existing timer
    const existingTimer = this.refreshTimers.get(credential.credentialId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate refresh time
    const refreshTime = credential.expiresAt.getTime() - Date.now() - this.config.refreshBeforeExpiry * 1000;

    if (refreshTime <= 0) {
      // Refresh immediately
      this.refreshCredential(credential.credentialId);
      return;
    }

    // Schedule refresh
    const timer = setTimeout(() => {
      this.refreshCredential(credential.credentialId);
    }, refreshTime);

    this.refreshTimers.set(credential.credentialId, timer);
  }

  private checkRateLimit(credential: OAuthCredential, providerConfig: ProviderConfig): boolean {
    const key = credential.credentialId;
    let counter = this.rateLimitCounters.get(key);

    const now = Date.now();
    const windowMs = providerConfig.rateLimits.windowSeconds * 1000;

    if (!counter || now - counter.windowStart > windowMs) {
      counter = {
        count: 0,
        windowStart: now,
        dailyCount: counter?.dailyCount || 0,
        dailyStart: counter?.dailyStart || now,
      };

      // Reset daily count if new day
      if (!counter.dailyStart || now - counter.dailyStart > 24 * 60 * 60 * 1000) {
        counter.dailyCount = 0;
        counter.dailyStart = now;
      }
    }

    // Check limits
    if (counter.count >= providerConfig.rateLimits.requestsPerWindow) {
      return false;
    }

    if (providerConfig.rateLimits.dailyLimit && counter.dailyCount >= providerConfig.rateLimits.dailyLimit) {
      return false;
    }

    // Increment counters
    counter.count++;
    counter.dailyCount++;
    this.rateLimitCounters.set(key, counter);

    return true;
  }

  private encryptToken(token: string): EncryptedToken {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId: this.config.encryptionKeyId,
      algorithm: 'AES-256-GCM',
    };
  }

  private decryptToken(encrypted: EncryptedToken): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(encrypted.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.encryptedValue, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private deriveEncryptionKey(keyId: string): Buffer {
    // In production, this would retrieve the key from a secure key management system
    // For now, derive a key from the keyId
    return crypto.createHash('sha256').update(`oauth-credential-key-${keyId}`).digest();
  }

  private logAuditEvent(event: Omit<CredentialAuditEvent, 'eventId' | 'timestamp'>): void {
    if (!this.config.auditEnabled) return;

    const auditEvent: CredentialAuditEvent = {
      ...event,
      eventId: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date(),
    };

    this.auditLog.push(auditEvent);
    this.trimAuditLog();

    this.emit('audit_event', auditEvent);
  }

  private trimAuditLog(): void {
    const retentionMs = this.config.auditRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    this.auditLog = this.auditLog.filter(e => e.timestamp.getTime() > cutoff);
  }

  private getTopUsers(events: CredentialAuditEvent[], limit: number): { userId: string; count: number }[] {
    const counts: Record<string, number> = {};

    for (const event of events) {
      counts[event.userId] = (counts[event.userId] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the credential manager.
   */
  shutdown(): void {
    // Clear all refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();

    this.emit('shutdown');
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

interface RateLimitCounter {
  count: number;
  windowStart: number;
  dailyCount: number;
  dailyStart: number;
}

export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetsAt: Date;
  dailyRemaining?: number;
}

export interface CredentialUsageReport {
  period: { startDate: Date; endDate: Date };
  totalCredentials: number;
  activeCredentials: number;
  totalApiCalls: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  revokedCredentials: number;
  usageByProvider: Record<string, number>;
  topUsers: { userId: string; count: number }[];
}

// Export singleton instance
export const oauthCredentialManager = new OAuthCredentialManager();
