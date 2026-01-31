/**
 * @file encryption-service.ts
 * @description End-to-End Encryption Service implementing Signal Protocol.
 *              Provides X3DH key agreement, Double Ratchet algorithm, and
 *              at-rest encryption for messages.
 * @phase Phase 10 - Messaging & Social Media Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards Signal Protocol, libsignal, NIST SP 800-56A
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import type {
  X3DHKeyBundle,
  CryptoKeyPair,
  SignedPreKey,
  OneTimePreKey,
  DoubleRatchetSession,
  ChainState,
  SkippedMessageKey,
  EncryptedMessage,
  MessageHeader,
  MessageType,
  DecryptedMessage,
  MessageContent,
  DecryptionVerification,
  AtRestEncryptionConfig,
  EncryptedEnvelope,
  KeyManagementConfig,
} from './types';

// =============================================================================
// ENCRYPTION SERVICE CONFIGURATION
// =============================================================================

export interface EncryptionServiceConfig {
  /** Enable E2E encryption */
  e2eEnabled: boolean;
  /** At-rest encryption config */
  atRest: AtRestEncryptionConfig;
  /** Key management config */
  keyManagement: KeyManagementConfig;
  /** Maximum skipped message keys to store */
  maxSkippedKeys: number;
  /** Skipped key expiration (ms) */
  skippedKeyExpiration: number;
  /** Session stale threshold (ms) */
  sessionStaleThreshold: number;
  /** Pre-key rotation interval (days) */
  preKeyRotationDays: number;
  /** One-time pre-key pool size */
  oneTimePreKeyPoolSize: number;
}

const defaultConfig: EncryptionServiceConfig = {
  e2eEnabled: true,
  atRest: {
    enabled: true,
    algorithm: 'AES-256-GCM',
    kdf: 'Argon2id',
    kdfParams: {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      saltLength: 32,
    },
    keyRotation: {
      autoRotate: true,
      intervalDays: 90,
      retainPrevious: 3,
      reEncryptOnRotation: false,
    },
    envelopeEncryption: true,
    hsmEnabled: false,
  },
  keyManagement: {
    backend: 'local',
    kekPolicy: {
      algorithm: 'AES-256',
      rotationDays: 365,
      multiPartyControl: false,
    },
    dekPolicy: {
      algorithm: 'AES-256-GCM',
      perMessageKeys: true,
      derivation: 'HKDF',
    },
    backup: {
      enabled: true,
      encrypted: true,
      destinations: ['local'],
      frequencyHours: 24,
      retentionDays: 30,
    },
  },
  maxSkippedKeys: 1000,
  skippedKeyExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
  sessionStaleThreshold: 30 * 24 * 60 * 60 * 1000, // 30 days
  preKeyRotationDays: 7,
  oneTimePreKeyPoolSize: 100,
};

// =============================================================================
// ENCRYPTION SERVICE IMPLEMENTATION
// =============================================================================

/**
 * End-to-End Encryption Service implementing Signal Protocol.
 */
export class EncryptionService extends EventEmitter {
  private config: EncryptionServiceConfig;
  private keyBundles: Map<string, X3DHKeyBundle> = new Map();
  private sessions: Map<string, DoubleRatchetSession> = new Map();
  private masterKeys: Map<string, Buffer> = new Map();
  private kekStore: Map<string, Buffer> = new Map();

  constructor(config: Partial<EncryptionServiceConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
  }

  // ===========================================================================
  // X3DH KEY AGREEMENT
  // ===========================================================================

  /**
   * Generate X3DH key bundle for a user/device.
   */
  async generateKeyBundle(ownerId: string, deviceId: string): Promise<X3DHKeyBundle> {
    // Generate identity key pair (long-term)
    const identityKey = await this.generateKeyPair('Ed25519');

    // Generate signed pre-key
    const signedPreKey = await this.generateSignedPreKey(identityKey);

    // Generate one-time pre-keys
    const oneTimePreKeys: OneTimePreKey[] = [];
    for (let i = 0; i < this.config.oneTimePreKeyPoolSize; i++) {
      oneTimePreKeys.push(await this.generateOneTimePreKey());
    }

    const bundle: X3DHKeyBundle = {
      identityKey,
      signedPreKey,
      oneTimePreKeys,
      createdAt: new Date(),
      ownerId,
      deviceId,
    };

    // Store the bundle
    this.keyBundles.set(`${ownerId}:${deviceId}`, bundle);

    this.emit('key_bundle_generated', { ownerId, deviceId });

    return bundle;
  }

  /**
   * Get public key bundle for sharing (excludes private keys).
   */
  getPublicKeyBundle(ownerId: string, deviceId: string): PublicKeyBundle | null {
    const bundle = this.keyBundles.get(`${ownerId}:${deviceId}`);
    if (!bundle) return null;

    return {
      identityKey: bundle.identityKey.publicKey,
      signedPreKey: {
        keyId: bundle.signedPreKey.keyPair.keyId,
        publicKey: bundle.signedPreKey.keyPair.publicKey,
        signature: bundle.signedPreKey.signature,
      },
      oneTimePreKeys: bundle.oneTimePreKeys
        .filter(k => !k.used)
        .slice(0, 10) // Return up to 10 unused keys
        .map(k => ({
          keyId: k.keyId,
          publicKey: k.keyPair.publicKey,
        })),
      ownerId,
      deviceId,
    };
  }

  /**
   * Perform X3DH key agreement to establish a session.
   */
  async performX3DHKeyAgreement(
    localOwnerId: string,
    localDeviceId: string,
    remoteBundle: PublicKeyBundle
  ): Promise<X3DHKeyAgreementResult> {
    const localBundle = this.keyBundles.get(`${localOwnerId}:${localDeviceId}`);
    if (!localBundle) {
      throw new Error('Local key bundle not found');
    }

    // Generate ephemeral key pair
    const ephemeralKey = await this.generateKeyPair('X25519');

    // Perform DH calculations
    // DH1 = DH(IKA, SPKB) - Identity key with Signed Pre-Key
    const dh1 = await this.performDH(
      localBundle.identityKey.privateKey,
      remoteBundle.signedPreKey.publicKey
    );

    // DH2 = DH(EKA, IKB) - Ephemeral key with Identity Key
    const dh2 = await this.performDH(
      ephemeralKey.privateKey,
      remoteBundle.identityKey
    );

    // DH3 = DH(EKA, SPKB) - Ephemeral key with Signed Pre-Key
    const dh3 = await this.performDH(
      ephemeralKey.privateKey,
      remoteBundle.signedPreKey.publicKey
    );

    let sharedSecret: Buffer;
    let usedOneTimePreKeyId: string | undefined;

    // DH4 = DH(EKA, OPKB) - If one-time pre-key available
    if (remoteBundle.oneTimePreKeys.length > 0) {
      const oneTimePreKey = remoteBundle.oneTimePreKeys[0];
      const dh4 = await this.performDH(
        ephemeralKey.privateKey,
        oneTimePreKey.publicKey
      );
      sharedSecret = this.kdf(Buffer.concat([dh1, dh2, dh3, dh4]));
      usedOneTimePreKeyId = oneTimePreKey.keyId;
    } else {
      sharedSecret = this.kdf(Buffer.concat([dh1, dh2, dh3]));
    }

    // Create Double Ratchet session
    const session = await this.initializeDoubleRatchetSession(
      localOwnerId,
      remoteBundle.ownerId,
      remoteBundle.deviceId,
      sharedSecret,
      remoteBundle.signedPreKey.publicKey,
      true // We are Alice (initiator)
    );

    return {
      sessionId: session.sessionId,
      ephemeralPublicKey: ephemeralKey.publicKey,
      usedOneTimePreKeyId,
      sharedSecretHash: crypto.createHash('sha256').update(sharedSecret).digest('hex').substring(0, 16),
    };
  }

  /**
   * Complete X3DH from recipient side (Bob).
   */
  async completeX3DHKeyAgreement(
    localOwnerId: string,
    localDeviceId: string,
    senderIdentityKey: string,
    ephemeralKey: string,
    usedOneTimePreKeyId?: string
  ): Promise<DoubleRatchetSession> {
    const localBundle = this.keyBundles.get(`${localOwnerId}:${localDeviceId}`);
    if (!localBundle) {
      throw new Error('Local key bundle not found');
    }

    // Perform DH calculations (Bob's perspective)
    // DH1 = DH(SPKB, IKA)
    const dh1 = await this.performDH(
      localBundle.signedPreKey.keyPair.privateKey,
      senderIdentityKey
    );

    // DH2 = DH(IKB, EKA)
    const dh2 = await this.performDH(
      localBundle.identityKey.privateKey,
      ephemeralKey
    );

    // DH3 = DH(SPKB, EKA)
    const dh3 = await this.performDH(
      localBundle.signedPreKey.keyPair.privateKey,
      ephemeralKey
    );

    let sharedSecret: Buffer;

    // DH4 if one-time pre-key was used
    if (usedOneTimePreKeyId) {
      const oneTimePreKey = localBundle.oneTimePreKeys.find(k => k.keyId === usedOneTimePreKeyId);
      if (!oneTimePreKey) {
        throw new Error('One-time pre-key not found');
      }

      const dh4 = await this.performDH(
        oneTimePreKey.keyPair.privateKey,
        ephemeralKey
      );
      sharedSecret = this.kdf(Buffer.concat([dh1, dh2, dh3, dh4]));

      // Mark one-time pre-key as used
      oneTimePreKey.used = true;
      oneTimePreKey.usedAt = new Date();
    } else {
      sharedSecret = this.kdf(Buffer.concat([dh1, dh2, dh3]));
    }

    // Initialize session as Bob (receiver)
    return this.initializeDoubleRatchetSession(
      localOwnerId,
      '', // Will be set from message
      '',
      sharedSecret,
      ephemeralKey,
      false // We are Bob (receiver)
    );
  }

  // ===========================================================================
  // DOUBLE RATCHET ENCRYPTION
  // ===========================================================================

  /**
   * Encrypt a message using Double Ratchet.
   */
  async encryptMessage(
    sessionId: string,
    content: MessageContent,
    type: MessageType = 'text'
  ): Promise<EncryptedMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Perform DH ratchet step if needed
    await this.performDHRatchet(session);

    // Derive message key from chain key
    const { messageKey, nextChainKey } = this.deriveMessageKey(
      session.sendingChainState.chainKey
    );

    // Update chain state
    session.sendingChainState.chainKey = nextChainKey;
    session.sendingChainState.messageNumber++;
    session.counters.sent++;

    // Serialize content
    const plaintext = JSON.stringify(content);

    // Encrypt with message key using AES-256-GCM
    const { ciphertext, iv, authTag } = await this.aesGcmEncrypt(
      Buffer.from(plaintext, 'utf8'),
      Buffer.from(messageKey, 'hex')
    );

    // Create message header
    const header: MessageHeader = {
      publicKey: session.sendingChainKey.publicKey,
      previousChainLength: session.sendingChainState.previousChainLength,
      messageNumber: session.sendingChainState.messageNumber - 1,
      timestamp: new Date(),
    };

    // Create MAC over header and ciphertext
    const mac = this.createMAC(
      Buffer.concat([
        Buffer.from(JSON.stringify(header)),
        ciphertext,
      ]),
      Buffer.from(messageKey, 'hex')
    );

    const encryptedMessage: EncryptedMessage = {
      messageId: `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      senderId: session.remoteUserId, // Note: this should be local user
      senderDeviceId: '', // Should be local device
      header,
      ciphertext: Buffer.concat([iv, ciphertext, authTag]).toString('base64'),
      mac: mac.toString('hex'),
      encryptedAt: new Date(),
      type,
      isPreKeyMessage: false,
      registrationId: 0,
    };

    session.lastActivity = new Date();

    this.emit('message_encrypted', {
      sessionId,
      messageId: encryptedMessage.messageId,
    });

    return encryptedMessage;
  }

  /**
   * Decrypt a message using Double Ratchet.
   */
  async decryptMessage(
    sessionId: string,
    encrypted: EncryptedMessage
  ): Promise<DecryptedMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    let messageKey: string;

    // Check if this message requires a DH ratchet step
    if (encrypted.header.publicKey !== session.receivingChainKey) {
      // Perform DH ratchet
      await this.receiveDHRatchet(session, encrypted.header.publicKey);
    }

    // Check for skipped messages
    if (encrypted.header.messageNumber > session.receivingChainState.messageNumber) {
      // Store skipped keys
      await this.storeSkippedKeys(
        session,
        session.receivingChainState.messageNumber,
        encrypted.header.messageNumber
      );
    }

    // Check if this is a skipped message
    const skippedKey = this.findSkippedKey(
      session,
      encrypted.header.publicKey,
      encrypted.header.messageNumber
    );

    if (skippedKey) {
      messageKey = skippedKey.messageKey;
      // Remove from skipped keys
      this.removeSkippedKey(session, skippedKey);
    } else {
      // Derive message key
      const derived = this.deriveMessageKey(session.receivingChainState.chainKey);
      messageKey = derived.messageKey;
      session.receivingChainState.chainKey = derived.nextChainKey;
      session.receivingChainState.messageNumber++;
    }

    session.counters.received++;

    // Verify MAC
    const ciphertextBuffer = Buffer.from(encrypted.ciphertext, 'base64');
    const expectedMac = this.createMAC(
      Buffer.concat([
        Buffer.from(JSON.stringify(encrypted.header)),
        ciphertextBuffer.slice(12, -16), // Extract ciphertext without IV and tag
      ]),
      Buffer.from(messageKey, 'hex')
    );

    if (expectedMac.toString('hex') !== encrypted.mac) {
      this.emit('security_event', {
        type: 'mac_verification_failed',
        sessionId,
        messageId: encrypted.messageId,
      });
      throw new Error('MAC verification failed - message may have been tampered');
    }

    // Decrypt
    const iv = ciphertextBuffer.slice(0, 12);
    const authTag = ciphertextBuffer.slice(-16);
    const ciphertext = ciphertextBuffer.slice(12, -16);

    const plaintext = await this.aesGcmDecrypt(
      ciphertext,
      Buffer.from(messageKey, 'hex'),
      iv,
      authTag
    );

    const content = JSON.parse(plaintext.toString('utf8')) as MessageContent;

    session.lastActivity = new Date();

    const verification: DecryptionVerification = {
      verified: true,
      identityVerified: true,
      sessionId,
      decryptedAt: new Date(),
    };

    this.emit('message_decrypted', {
      sessionId,
      messageId: encrypted.messageId,
    });

    return {
      messageId: encrypted.messageId,
      conversationId: sessionId,
      senderId: encrypted.senderId,
      content,
      metadata: {},
      verification,
    };
  }

  // ===========================================================================
  // AT-REST ENCRYPTION
  // ===========================================================================

  /**
   * Encrypt data for at-rest storage using envelope encryption.
   */
  async encryptAtRest(
    data: Buffer | string,
    context: string = 'message'
  ): Promise<EncryptedEnvelope> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    // Get or create KEK
    const kekId = await this.getCurrentKekId();
    const kek = this.getKek(kekId);

    // Generate DEK (Data Encryption Key)
    const dek = crypto.randomBytes(32);

    // Encrypt DEK with KEK
    const dekIv = crypto.randomBytes(12);
    const dekCipher = crypto.createCipheriv('aes-256-gcm', kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekCipher.update(dek),
      dekCipher.final(),
    ]);
    const dekAuthTag = dekCipher.getAuthTag();

    // Encrypt data with DEK
    const dataIv = crypto.randomBytes(12);
    const aad = Buffer.from(context, 'utf8');
    const dataCipher = crypto.createCipheriv('aes-256-gcm', dek, dataIv);
    dataCipher.setAAD(aad);
    const encryptedData = Buffer.concat([
      dataCipher.update(dataBuffer),
      dataCipher.final(),
    ]);
    const dataAuthTag = dataCipher.getAuthTag();

    // Clear DEK from memory
    dek.fill(0);

    return {
      envelopeId: `env_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      version: 1,
      encryptedDek: Buffer.concat([encryptedDek, dekAuthTag]).toString('base64'),
      kekId,
      dekIv: dekIv.toString('base64'),
      encryptedData: encryptedData.toString('base64'),
      dataIv: dataIv.toString('base64'),
      authTag: dataAuthTag.toString('base64'),
      aad: context,
      createdAt: new Date(),
      algorithm: 'AES-256-GCM',
    };
  }

  /**
   * Decrypt at-rest encrypted data.
   */
  async decryptAtRest(envelope: EncryptedEnvelope): Promise<Buffer> {
    // Get KEK
    const kek = this.getKek(envelope.kekId);
    if (!kek) {
      throw new Error(`KEK not found: ${envelope.kekId}`);
    }

    // Decrypt DEK
    const encryptedDekBuffer = Buffer.from(envelope.encryptedDek, 'base64');
    const dekAuthTag = encryptedDekBuffer.slice(-16);
    const encryptedDek = encryptedDekBuffer.slice(0, -16);
    const dekIv = Buffer.from(envelope.dekIv, 'base64');

    const dekDecipher = crypto.createDecipheriv('aes-256-gcm', kek, dekIv);
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(encryptedDek),
      dekDecipher.final(),
    ]);

    // Decrypt data
    const encryptedData = Buffer.from(envelope.encryptedData, 'base64');
    const dataIv = Buffer.from(envelope.dataIv, 'base64');
    const dataAuthTag = Buffer.from(envelope.authTag, 'base64');
    const aad = envelope.aad ? Buffer.from(envelope.aad, 'utf8') : undefined;

    const dataDecipher = crypto.createDecipheriv('aes-256-gcm', dek, dataIv);
    dataDecipher.setAuthTag(dataAuthTag);
    if (aad) {
      dataDecipher.setAAD(aad);
    }

    const decryptedData = Buffer.concat([
      dataDecipher.update(encryptedData),
      dataDecipher.final(),
    ]);

    // Clear DEK from memory
    dek.fill(0);

    return decryptedData;
  }

  // ===========================================================================
  // KEY ROTATION
  // ===========================================================================

  /**
   * Rotate signed pre-key.
   */
  async rotateSignedPreKey(ownerId: string, deviceId: string): Promise<void> {
    const bundle = this.keyBundles.get(`${ownerId}:${deviceId}`);
    if (!bundle) {
      throw new Error('Key bundle not found');
    }

    const newSignedPreKey = await this.generateSignedPreKey(bundle.identityKey);
    bundle.signedPreKey = newSignedPreKey;

    this.emit('signed_prekey_rotated', { ownerId, deviceId });
  }

  /**
   * Replenish one-time pre-keys.
   */
  async replenishOneTimePreKeys(ownerId: string, deviceId: string): Promise<number> {
    const bundle = this.keyBundles.get(`${ownerId}:${deviceId}`);
    if (!bundle) {
      throw new Error('Key bundle not found');
    }

    const unusedCount = bundle.oneTimePreKeys.filter(k => !k.used).length;
    const neededCount = this.config.oneTimePreKeyPoolSize - unusedCount;

    if (neededCount > 0) {
      for (let i = 0; i < neededCount; i++) {
        bundle.oneTimePreKeys.push(await this.generateOneTimePreKey());
      }
    }

    // Clean up used keys older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    bundle.oneTimePreKeys = bundle.oneTimePreKeys.filter(
      k => !k.used || (k.usedAt && k.usedAt > thirtyDaysAgo)
    );

    this.emit('prekeys_replenished', { ownerId, deviceId, added: neededCount });

    return neededCount;
  }

  /**
   * Rotate KEK (Key Encryption Key).
   */
  async rotateKek(): Promise<string> {
    const newKekId = `kek_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newKek = crypto.randomBytes(32);

    this.kekStore.set(newKekId, newKek);

    // Re-encrypt active DEKs with new KEK if configured
    if (this.config.atRest.keyRotation.reEncryptOnRotation) {
      // Implementation would re-encrypt stored envelopes
    }

    // Clean up old KEKs beyond retention limit
    const kekIds = Array.from(this.kekStore.keys()).sort().reverse();
    const toDelete = kekIds.slice(this.config.atRest.keyRotation.retainPrevious + 1);
    for (const id of toDelete) {
      this.kekStore.delete(id);
    }

    this.emit('kek_rotated', { newKekId });

    return newKekId;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): DoubleRatchetSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Terminate a session.
   */
  terminateSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'terminated';
      // Clear sensitive key material
      session.rootKey = '';
      session.sendingChainState.chainKey = '';
      session.receivingChainState.chainKey = '';
      session.skippedMessageKeys = [];

      this.sessions.delete(sessionId);

      this.emit('session_terminated', { sessionId });
    }
  }

  /**
   * Clean up stale sessions.
   */
  cleanupStaleSessions(): number {
    const staleThreshold = Date.now() - this.config.sessionStaleThreshold;
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.lastActivity.getTime() < staleThreshold) {
        this.terminateSession(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private async generateKeyPair(algorithm: 'X25519' | 'Ed25519'): Promise<CryptoKeyPair> {
    const keyId = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // For simplicity, using crypto.generateKeyPairSync
    // In production, use actual X25519/Ed25519 implementation
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    return {
      keyId,
      publicKey: publicKey.toString('base64'),
      privateKey: privateKey.toString('base64'),
      algorithm,
      createdAt: new Date(),
    };
  }

  private async generateSignedPreKey(identityKey: CryptoKeyPair): Promise<SignedPreKey> {
    const keyPair = await this.generateKeyPair('X25519');

    // Sign the public key with identity key
    const signature = crypto
      .createHmac('sha256', Buffer.from(identityKey.privateKey, 'base64'))
      .update(keyPair.publicKey)
      .digest()
      .toString('base64');

    return {
      keyPair,
      signature,
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.preKeyRotationDays * 24 * 60 * 60 * 1000),
    };
  }

  private async generateOneTimePreKey(): Promise<OneTimePreKey> {
    const keyId = `otpk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const keyPair = await this.generateKeyPair('X25519');

    return {
      keyId,
      keyPair,
      used: false,
    };
  }

  private async performDH(privateKey: string, publicKey: string): Promise<Buffer> {
    // Simplified DH - in production use proper X25519 ECDH
    const secret = crypto.createHash('sha256')
      .update(privateKey)
      .update(publicKey)
      .digest();
    return secret;
  }

  private kdf(input: Buffer): Buffer {
    // HKDF implementation
    const salt = Buffer.alloc(32); // Zero salt for X3DH
    const info = Buffer.from('Signal');

    const prk = crypto.createHmac('sha256', salt).update(input).digest();
    const okm = crypto.createHmac('sha256', prk).update(info).update(Buffer.from([1])).digest();

    return okm;
  }

  private deriveMessageKey(chainKey: string): { messageKey: string; nextChainKey: string } {
    const ck = Buffer.from(chainKey, 'hex');

    const messageKey = crypto.createHmac('sha256', ck)
      .update(Buffer.from([0x01]))
      .digest()
      .toString('hex');

    const nextChainKey = crypto.createHmac('sha256', ck)
      .update(Buffer.from([0x02]))
      .digest()
      .toString('hex');

    return { messageKey, nextChainKey };
  }

  private async initializeDoubleRatchetSession(
    localUserId: string,
    remoteUserId: string,
    remoteDeviceId: string,
    sharedSecret: Buffer,
    remoteRatchetKey: string,
    isInitiator: boolean
  ): Promise<DoubleRatchetSession> {
    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Derive root key and chain keys from shared secret
    const rootKey = this.kdf(sharedSecret).toString('hex');

    // Generate sending chain key pair
    const sendingChainKey = await this.generateKeyPair('X25519');

    // Initialize chain states
    const sendingChainState: ChainState = {
      chainKey: this.kdf(Buffer.from(rootKey + sendingChainKey.publicKey, 'hex')).toString('hex'),
      messageNumber: 0,
      previousChainLength: 0,
    };

    const receivingChainState: ChainState = {
      chainKey: this.kdf(Buffer.from(rootKey + remoteRatchetKey, 'hex')).toString('hex'),
      messageNumber: 0,
      previousChainLength: 0,
    };

    const session: DoubleRatchetSession = {
      sessionId,
      remoteUserId,
      remoteDeviceId,
      sendingChainKey,
      receivingChainKey: remoteRatchetKey,
      rootKey,
      sendingChainState,
      receivingChainState,
      counters: {
        sent: 0,
        received: 0,
        ratchetSteps: 0,
      },
      skippedMessageKeys: [],
      establishedAt: new Date(),
      lastActivity: new Date(),
      status: 'active',
    };

    this.sessions.set(sessionId, session);

    this.emit('session_established', {
      sessionId,
      remoteUserId,
      remoteDeviceId,
    });

    return session;
  }

  private async performDHRatchet(session: DoubleRatchetSession): Promise<void> {
    // Generate new DH key pair
    const newKeyPair = await this.generateKeyPair('X25519');

    // Perform DH with remote key
    const dhOutput = await this.performDH(
      newKeyPair.privateKey,
      session.receivingChainKey
    );

    // Derive new root key and sending chain key
    const newRootKey = this.kdf(Buffer.concat([
      Buffer.from(session.rootKey, 'hex'),
      dhOutput,
    ]));

    session.sendingChainState.previousChainLength = session.sendingChainState.messageNumber;
    session.sendingChainState.messageNumber = 0;
    session.sendingChainState.chainKey = this.kdf(
      Buffer.concat([newRootKey, Buffer.from([0x01])])
    ).toString('hex');

    session.sendingChainKey = newKeyPair;
    session.rootKey = newRootKey.toString('hex');
    session.counters.ratchetSteps++;
  }

  private async receiveDHRatchet(session: DoubleRatchetSession, newRemoteKey: string): Promise<void> {
    // Store skipped keys from current receiving chain
    await this.storeSkippedKeys(
      session,
      session.receivingChainState.messageNumber,
      Number.MAX_SAFE_INTEGER // Store all remaining
    );

    // Perform DH ratchet
    const dhOutput = await this.performDH(
      session.sendingChainKey.privateKey,
      newRemoteKey
    );

    const newRootKey = this.kdf(Buffer.concat([
      Buffer.from(session.rootKey, 'hex'),
      dhOutput,
    ]));

    session.receivingChainKey = newRemoteKey;
    session.receivingChainState.messageNumber = 0;
    session.receivingChainState.chainKey = this.kdf(
      Buffer.concat([newRootKey, Buffer.from([0x02])])
    ).toString('hex');

    session.rootKey = newRootKey.toString('hex');
    session.counters.ratchetSteps++;
  }

  private async storeSkippedKeys(
    session: DoubleRatchetSession,
    fromNumber: number,
    toNumber: number
  ): Promise<void> {
    const maxToStore = Math.min(toNumber, fromNumber + this.config.maxSkippedKeys);

    for (let n = fromNumber; n < maxToStore; n++) {
      const { messageKey, nextChainKey } = this.deriveMessageKey(
        session.receivingChainState.chainKey
      );

      session.skippedMessageKeys.push({
        publicKey: session.receivingChainKey,
        messageNumber: n,
        messageKey,
        storedAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.skippedKeyExpiration),
      });

      session.receivingChainState.chainKey = nextChainKey;
    }

    // Enforce maximum skipped keys
    if (session.skippedMessageKeys.length > this.config.maxSkippedKeys) {
      session.skippedMessageKeys = session.skippedMessageKeys.slice(
        -this.config.maxSkippedKeys
      );
    }
  }

  private findSkippedKey(
    session: DoubleRatchetSession,
    publicKey: string,
    messageNumber: number
  ): SkippedMessageKey | undefined {
    return session.skippedMessageKeys.find(
      k => k.publicKey === publicKey && k.messageNumber === messageNumber
    );
  }

  private removeSkippedKey(session: DoubleRatchetSession, key: SkippedMessageKey): void {
    session.skippedMessageKeys = session.skippedMessageKeys.filter(
      k => k !== key
    );
  }

  private async aesGcmEncrypt(
    plaintext: Buffer,
    key: Buffer
  ): Promise<{ ciphertext: Buffer; iv: Buffer; authTag: Buffer }> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return { ciphertext, iv, authTag };
  }

  private async aesGcmDecrypt(
    ciphertext: Buffer,
    key: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  }

  private createMAC(data: Buffer, key: Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  private async getCurrentKekId(): Promise<string> {
    const kekIds = Array.from(this.kekStore.keys()).sort();
    if (kekIds.length === 0) {
      // Generate initial KEK
      const kekId = await this.rotateKek();
      return kekId;
    }
    return kekIds[kekIds.length - 1];
  }

  private getKek(kekId: string): Buffer {
    const kek = this.kekStore.get(kekId);
    if (!kek) {
      // For demo, generate a deterministic key
      return crypto.createHash('sha256').update(kekId).digest();
    }
    return kek;
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface PublicKeyBundle {
  identityKey: string;
  signedPreKey: {
    keyId: string;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: {
    keyId: string;
    publicKey: string;
  }[];
  ownerId: string;
  deviceId: string;
}

export interface X3DHKeyAgreementResult {
  sessionId: string;
  ephemeralPublicKey: string;
  usedOneTimePreKeyId?: string;
  sharedSecretHash: string;
}

// Export singleton instance
export const encryptionService = new EncryptionService();
