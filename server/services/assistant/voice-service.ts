/**
 * @file voice-service.ts
 * @description Voice Processing Pipeline for AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Voice processing capabilities inspired by:
 * - Siri: Voice commands, shortcuts, natural language
 * - Google Assistant: Multi-language, context awareness
 * - Alexa: Skills, wake word detection
 * - Whisper: State-of-the-art transcription
 * - ElevenLabs: Natural voice synthesis
 *
 * Features:
 * - Speech-to-Text with multiple provider support
 * - Text-to-Speech with voice customization
 * - Wake word detection
 * - Voice command recognition
 * - Real-time streaming transcription
 * - Multi-language support
 * - Voice activity detection
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  VoiceConfig,
  VoiceSettings,
  WakeWordConfig,
  STTRequest,
  STTResult,
  WordTimestamp,
  SpeakerSegment,
  TTSRequest,
  TTSResult,
  VoiceCommand,
  AudioContent,
  IVoiceService,
} from "./types";

const log = createModuleLogger("voice-service");

// =============================================================================
// CONFIGURATION
// =============================================================================

interface VoiceServiceConfig {
  /** Default STT provider */
  defaultSTTProvider: "whisper" | "google" | "azure" | "deepgram";
  /** Default TTS provider */
  defaultTTSProvider: "elevenlabs" | "google" | "azure" | "openai";
  /** Default voice ID */
  defaultVoiceId: string;
  /** Default voice settings */
  defaultVoiceSettings: VoiceSettings;
  /** Enable voice activity detection */
  enableVAD: boolean;
  /** VAD sensitivity (0-1) */
  vadSensitivity: number;
  /** Maximum audio duration for STT (seconds) */
  maxAudioDuration: number;
  /** Streaming chunk size (bytes) */
  streamingChunkSize: number;
  /** API keys */
  apiKeys: {
    openai?: string;
    google?: string;
    azure?: string;
    deepgram?: string;
    elevenlabs?: string;
  };
}

const DEFAULT_CONFIG: VoiceServiceConfig = {
  defaultSTTProvider: "whisper",
  defaultTTSProvider: "openai",
  defaultVoiceId: "alloy",
  defaultVoiceSettings: {
    speed: 1.0,
    pitch: 0,
    volume: 1.0,
  },
  enableVAD: true,
  vadSensitivity: 0.5,
  maxAudioDuration: 120,
  streamingChunkSize: 4096,
  apiKeys: {},
};

// =============================================================================
// STT PROVIDER INTERFACE
// =============================================================================

interface ISTTProvider {
  name: string;
  transcribe(request: STTRequest): Promise<STTResult>;
  transcribeStream?(audioStream: AsyncIterable<ArrayBuffer>): AsyncIterable<Partial<STTResult>>;
}

// =============================================================================
// WHISPER STT PROVIDER (OpenAI)
// =============================================================================

class WhisperSTTProvider implements ISTTProvider {
  name = "whisper";

  constructor(private apiKey?: string) {}

  async transcribe(request: STTRequest): Promise<STTResult> {
    const startTime = Date.now();

    // In production, this would call the Whisper API
    // For now, simulate transcription
    await this.simulateLatency(request.audio.duration || 1);

    const text = this.simulateTranscription(request);

    return {
      text,
      confidence: 0.95,
      language: request.language || "en",
      words: this.generateWordTimestamps(text),
      processingTime: Date.now() - startTime,
    };
  }

  async *transcribeStream(
    audioStream: AsyncIterable<ArrayBuffer>
  ): AsyncIterable<Partial<STTResult>> {
    let accumulatedText = "";

    for await (const chunk of audioStream) {
      // Simulate processing each chunk
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate partial transcription
      const words = ["Hello", "this", "is", "a", "test", "transcription"];
      const wordIndex = Math.floor(Math.random() * words.length);
      accumulatedText += (accumulatedText ? " " : "") + words[wordIndex];

      yield {
        text: accumulatedText,
        confidence: 0.8 + Math.random() * 0.2,
      };
    }
  }

  private async simulateLatency(duration: number): Promise<void> {
    // Simulate processing time proportional to audio duration
    const processingTime = Math.min(duration * 100, 2000);
    await new Promise((resolve) => setTimeout(resolve, processingTime));
  }

  private simulateTranscription(request: STTRequest): string {
    // If we have a pre-existing transcription, use it
    if (request.audio.transcription) {
      return request.audio.transcription;
    }

    // Generate mock transcription based on duration
    const duration = request.audio.duration || 5;
    const wordCount = Math.ceil(duration * 2.5); // ~150 words per minute

    const phrases = [
      "Schedule a meeting with",
      "Create a new task for",
      "What's on my calendar",
      "Remind me to",
      "Send a message to",
      "Search for content about",
      "Publish the article",
      "Check my notifications",
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    return phrase + " tomorrow at 3pm";
  }

  private generateWordTimestamps(text: string): WordTimestamp[] {
    const words = text.split(" ");
    let currentTime = 0;

    return words.map((word) => {
      const duration = (word.length / 10) * 0.5; // Rough estimate
      const timestamp: WordTimestamp = {
        word,
        start: currentTime,
        end: currentTime + duration,
        confidence: 0.9 + Math.random() * 0.1,
      };
      currentTime += duration + 0.1; // Gap between words
      return timestamp;
    });
  }
}

// =============================================================================
// GOOGLE STT PROVIDER
// =============================================================================

class GoogleSTTProvider implements ISTTProvider {
  name = "google";

  constructor(private apiKey?: string) {}

  async transcribe(request: STTRequest): Promise<STTResult> {
    const startTime = Date.now();

    // Simulate Google Cloud Speech-to-Text API
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      text: request.audio.transcription || "Google transcription result",
      confidence: 0.92,
      language: request.language || "en-US",
      processingTime: Date.now() - startTime,
    };
  }
}

// =============================================================================
// DEEPGRAM STT PROVIDER
// =============================================================================

class DeepgramSTTProvider implements ISTTProvider {
  name = "deepgram";

  constructor(private apiKey?: string) {}

  async transcribe(request: STTRequest): Promise<STTResult> {
    const startTime = Date.now();

    // Simulate Deepgram API - known for speed
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      text: request.audio.transcription || "Deepgram transcription result",
      confidence: 0.94,
      language: request.language || "en",
      processingTime: Date.now() - startTime,
    };
  }

  async *transcribeStream(
    audioStream: AsyncIterable<ArrayBuffer>
  ): AsyncIterable<Partial<STTResult>> {
    // Deepgram excels at real-time streaming
    for await (const chunk of audioStream) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield {
        text: "Streaming transcription...",
        confidence: 0.9,
      };
    }
  }
}

// =============================================================================
// TTS PROVIDER INTERFACE
// =============================================================================

interface ITTSProvider {
  name: string;
  synthesize(request: TTSRequest): Promise<TTSResult>;
  synthesizeStream?(text: string, options?: Partial<TTSRequest>): AsyncIterable<ArrayBuffer>;
  getVoices(): Promise<VoiceInfo[]>;
}

interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: "male" | "female" | "neutral";
  preview?: string;
}

// =============================================================================
// ELEVENLABS TTS PROVIDER
// =============================================================================

class ElevenLabsTTSProvider implements ITTSProvider {
  name = "elevenlabs";

  constructor(private apiKey?: string) {}

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const startTime = Date.now();

    // Simulate ElevenLabs API
    await new Promise((resolve) => setTimeout(resolve, 300));

    const duration = request.text.length / 15; // Rough estimate: 15 chars/second

    return {
      audio: new ArrayBuffer(Math.ceil(duration * 24000 * 2)), // 24kHz, 16-bit
      format: request.outputFormat || "mp3",
      sampleRate: request.sampleRate || 24000,
      duration,
      charactersUsed: request.text.length,
    };
  }

  async *synthesizeStream(
    text: string,
    options?: Partial<TTSRequest>
  ): AsyncIterable<ArrayBuffer> {
    const words = text.split(" ");
    const chunkSize = 5; // Words per chunk

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(" ");
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Generate mock audio chunk
      const duration = chunk.length / 15;
      yield new ArrayBuffer(Math.ceil(duration * 24000 * 2));
    }
  }

  async getVoices(): Promise<VoiceInfo[]> {
    return [
      { id: "rachel", name: "Rachel", language: "en-US", gender: "female" },
      { id: "drew", name: "Drew", language: "en-US", gender: "male" },
      { id: "clyde", name: "Clyde", language: "en-US", gender: "male" },
      { id: "paul", name: "Paul", language: "en-US", gender: "male" },
      { id: "domi", name: "Domi", language: "en-US", gender: "female" },
      { id: "dave", name: "Dave", language: "en-GB", gender: "male" },
      { id: "fin", name: "Fin", language: "en-IE", gender: "male" },
    ];
  }
}

// =============================================================================
// OPENAI TTS PROVIDER
// =============================================================================

class OpenAITTSProvider implements ITTSProvider {
  name = "openai";

  constructor(private apiKey?: string) {}

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const startTime = Date.now();

    // Simulate OpenAI TTS API
    await new Promise((resolve) => setTimeout(resolve, 200));

    const duration = request.text.length / 15;

    return {
      audio: new ArrayBuffer(Math.ceil(duration * 24000 * 2)),
      format: request.outputFormat || "mp3",
      sampleRate: request.sampleRate || 24000,
      duration,
      charactersUsed: request.text.length,
    };
  }

  async getVoices(): Promise<VoiceInfo[]> {
    return [
      { id: "alloy", name: "Alloy", language: "en", gender: "neutral" },
      { id: "echo", name: "Echo", language: "en", gender: "male" },
      { id: "fable", name: "Fable", language: "en", gender: "neutral" },
      { id: "onyx", name: "Onyx", language: "en", gender: "male" },
      { id: "nova", name: "Nova", language: "en", gender: "female" },
      { id: "shimmer", name: "Shimmer", language: "en", gender: "female" },
    ];
  }
}

// =============================================================================
// WAKE WORD DETECTOR
// =============================================================================

class WakeWordDetector extends EventEmitter {
  private config: WakeWordConfig;
  private isListening: boolean = false;
  private audioBuffer: Float32Array[] = [];

  constructor(config: WakeWordConfig) {
    super();
    this.config = config;
  }

  start(): void {
    if (this.isListening) return;
    this.isListening = true;

    log.info({ keywords: this.config.keywords }, "Wake word detection started");
  }

  stop(): void {
    this.isListening = false;
    this.audioBuffer = [];

    log.info("Wake word detection stopped");
  }

  processAudioChunk(chunk: Float32Array): void {
    if (!this.isListening) return;

    // Add to buffer
    this.audioBuffer.push(chunk);

    // Keep only last 2 seconds of audio
    const maxBufferSize = 16000 * 2; // 2 seconds at 16kHz
    let totalSamples = this.audioBuffer.reduce((sum, c) => sum + c.length, 0);
    while (totalSamples > maxBufferSize && this.audioBuffer.length > 1) {
      const removed = this.audioBuffer.shift();
      if (removed) totalSamples -= removed.length;
    }

    // Check for wake word (simplified simulation)
    if (this.detectWakeWord()) {
      this.emit("detected", {
        keyword: this.config.keywords[0],
        confidence: 0.9,
        timestamp: Date.now(),
      });

      // Clear buffer after detection
      this.audioBuffer = [];
    }
  }

  private detectWakeWord(): boolean {
    // In production, this would use a trained model like Porcupine
    // For simulation, randomly trigger with low probability
    return Math.random() < 0.001; // 0.1% chance per chunk
  }
}

// =============================================================================
// VOICE ACTIVITY DETECTOR
// =============================================================================

class VoiceActivityDetector {
  private threshold: number;
  private history: number[] = [];
  private historySize: number = 10;

  constructor(sensitivity: number = 0.5) {
    // Lower threshold = more sensitive
    this.threshold = 0.1 * (1 - sensitivity);
  }

  isVoiceActive(samples: Float32Array): boolean {
    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);

    // Add to history
    this.history.push(rms);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    // Use smoothed value to avoid jitter
    const avgRms = this.history.reduce((a, b) => a + b, 0) / this.history.length;

    return avgRms > this.threshold;
  }

  reset(): void {
    this.history = [];
  }
}

// =============================================================================
// VOICE COMMAND PROCESSOR
// =============================================================================

class VoiceCommandProcessor {
  private commands: Map<string, VoiceCommand[]> = new Map();
  private globalCommands: VoiceCommand[] = [];

  constructor() {
    this.initializeGlobalCommands();
  }

  private initializeGlobalCommands(): void {
    this.globalCommands = [
      {
        id: "stop",
        phrases: ["stop", "cancel", "never mind", "abort"],
        action: "system.stop",
        description: "Stop the current operation",
        examples: ["Stop", "Cancel that", "Never mind"],
        enabled: true,
      },
      {
        id: "repeat",
        phrases: ["repeat", "say again", "what did you say"],
        action: "system.repeat",
        description: "Repeat the last response",
        examples: ["Repeat that", "Say again", "What did you say?"],
        enabled: true,
      },
      {
        id: "help",
        phrases: ["help", "what can you do", "commands"],
        action: "system.help",
        description: "Get help with available commands",
        examples: ["Help", "What can you do?", "Show commands"],
        enabled: true,
      },
    ];
  }

  registerCommand(userId: string, command: VoiceCommand): void {
    const userCommands = this.commands.get(userId) || [];
    const existingIndex = userCommands.findIndex((c) => c.id === command.id);

    if (existingIndex >= 0) {
      userCommands[existingIndex] = command;
    } else {
      userCommands.push(command);
    }

    this.commands.set(userId, userCommands);
    log.debug({ userId, commandId: command.id }, "Voice command registered");
  }

  getCommands(userId: string): VoiceCommand[] {
    const userCommands = this.commands.get(userId) || [];
    return [...this.globalCommands, ...userCommands].filter((c) => c.enabled);
  }

  matchCommand(
    text: string,
    userId?: string
  ): { command: VoiceCommand; confidence: number } | null {
    const normalizedText = text.toLowerCase().trim();
    const allCommands = userId
      ? this.getCommands(userId)
      : this.globalCommands;

    let bestMatch: { command: VoiceCommand; confidence: number } | null = null;

    for (const command of allCommands) {
      for (const phrase of command.phrases) {
        const normalizedPhrase = phrase.toLowerCase();

        // Exact match
        if (normalizedText === normalizedPhrase) {
          return { command, confidence: 1.0 };
        }

        // Contains match
        if (normalizedText.includes(normalizedPhrase)) {
          const confidence = normalizedPhrase.length / normalizedText.length;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { command, confidence };
          }
        }

        // Fuzzy match (simple Levenshtein-inspired)
        const similarity = this.calculateSimilarity(normalizedText, normalizedPhrase);
        if (similarity > 0.7) {
          if (!bestMatch || similarity > bestMatch.confidence) {
            bestMatch = { command, confidence: similarity };
          }
        }
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(s1: string, s2: string): number {
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// =============================================================================
// VOICE SERVICE
// =============================================================================

export class VoiceService extends EventEmitter implements IVoiceService {
  private config: VoiceServiceConfig;
  private sttProviders: Map<string, ISTTProvider> = new Map();
  private ttsProviders: Map<string, ITTSProvider> = new Map();
  private wakeWordDetector?: WakeWordDetector;
  private vad: VoiceActivityDetector;
  private commandProcessor: VoiceCommandProcessor;
  private userConfigs: Map<string, VoiceConfig> = new Map();

  constructor(config: Partial<VoiceServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vad = new VoiceActivityDetector(this.config.vadSensitivity);
    this.commandProcessor = new VoiceCommandProcessor();

    this.initializeProviders();

    log.info("Voice service initialized");
  }

  private initializeProviders(): void {
    // Initialize STT providers
    this.sttProviders.set(
      "whisper",
      new WhisperSTTProvider(this.config.apiKeys.openai)
    );
    this.sttProviders.set(
      "google",
      new GoogleSTTProvider(this.config.apiKeys.google)
    );
    this.sttProviders.set(
      "deepgram",
      new DeepgramSTTProvider(this.config.apiKeys.deepgram)
    );

    // Initialize TTS providers
    this.ttsProviders.set(
      "elevenlabs",
      new ElevenLabsTTSProvider(this.config.apiKeys.elevenlabs)
    );
    this.ttsProviders.set(
      "openai",
      new OpenAITTSProvider(this.config.apiKeys.openai)
    );
  }

  // ===========================================================================
  // SPEECH-TO-TEXT
  // ===========================================================================

  async transcribe(request: STTRequest): Promise<STTResult> {
    const provider = this.sttProviders.get(this.config.defaultSTTProvider);
    if (!provider) {
      throw new Error(`STT provider ${this.config.defaultSTTProvider} not available`);
    }

    // Validate audio duration
    if (request.audio.duration && request.audio.duration > this.config.maxAudioDuration) {
      throw new Error(
        `Audio duration ${request.audio.duration}s exceeds maximum ${this.config.maxAudioDuration}s`
      );
    }

    log.debug(
      { provider: provider.name, duration: request.audio.duration },
      "Starting transcription"
    );

    const result = await provider.transcribe(request);

    this.emit("transcribed", {
      text: result.text,
      confidence: result.confidence,
      processingTime: result.processingTime,
    });

    return result;
  }

  async *transcribeStream(
    audioStream: AsyncIterable<ArrayBuffer>
  ): AsyncIterable<Partial<STTResult>> {
    const provider = this.sttProviders.get(this.config.defaultSTTProvider);
    if (!provider?.transcribeStream) {
      throw new Error("Streaming transcription not supported by current provider");
    }

    log.debug({ provider: provider.name }, "Starting streaming transcription");

    for await (const result of provider.transcribeStream(audioStream)) {
      this.emit("transcribed:partial", result);
      yield result;
    }
  }

  // ===========================================================================
  // TEXT-TO-SPEECH
  // ===========================================================================

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const provider = this.ttsProviders.get(this.config.defaultTTSProvider);
    if (!provider) {
      throw new Error(`TTS provider ${this.config.defaultTTSProvider} not available`);
    }

    // Apply defaults
    const fullRequest: TTSRequest = {
      ...request,
      voiceId: request.voiceId || this.config.defaultVoiceId,
      settings: { ...this.config.defaultVoiceSettings, ...request.settings },
      outputFormat: request.outputFormat || "mp3",
    };

    log.debug(
      { provider: provider.name, voiceId: fullRequest.voiceId },
      "Starting synthesis"
    );

    const result = await provider.synthesize(fullRequest);

    this.emit("synthesized", {
      duration: result.duration,
      charactersUsed: result.charactersUsed,
    });

    return result;
  }

  async *synthesizeStream(
    text: string,
    options?: Partial<TTSRequest>
  ): AsyncIterable<ArrayBuffer> {
    const provider = this.ttsProviders.get(this.config.defaultTTSProvider);
    if (!provider?.synthesizeStream) {
      // Fall back to non-streaming
      const result = await this.synthesize({ text, ...options });
      yield result.audio;
      return;
    }

    log.debug({ provider: provider.name }, "Starting streaming synthesis");

    for await (const chunk of provider.synthesizeStream(text, options)) {
      yield chunk;
    }
  }

  async getAvailableVoices(provider?: string): Promise<VoiceInfo[]> {
    const ttsProvider = this.ttsProviders.get(
      provider || this.config.defaultTTSProvider
    );
    if (!ttsProvider) {
      return [];
    }
    return ttsProvider.getVoices();
  }

  // ===========================================================================
  // VOICE COMMANDS
  // ===========================================================================

  async registerCommand(userId: string, command: VoiceCommand): Promise<void> {
    this.commandProcessor.registerCommand(userId, command);
  }

  async getCommands(userId: string): Promise<VoiceCommand[]> {
    return this.commandProcessor.getCommands(userId);
  }

  async processVoiceCommand(audio: AudioContent): Promise<{
    command?: VoiceCommand;
    transcription: string;
    confidence: number;
  }> {
    // First, transcribe the audio
    const transcription = await this.transcribe({ audio });

    // Then, match against commands
    const match = this.commandProcessor.matchCommand(transcription.text);

    return {
      command: match?.command,
      transcription: transcription.text,
      confidence: match?.confidence || 0,
    };
  }

  // ===========================================================================
  // WAKE WORD DETECTION
  // ===========================================================================

  startWakeWordDetection(config: WakeWordConfig): void {
    if (this.wakeWordDetector) {
      this.wakeWordDetector.stop();
    }

    this.wakeWordDetector = new WakeWordDetector(config);

    this.wakeWordDetector.on("detected", (event) => {
      this.emit("wakeword:detected", event);
    });

    this.wakeWordDetector.start();
  }

  stopWakeWordDetection(): void {
    if (this.wakeWordDetector) {
      this.wakeWordDetector.stop();
      this.wakeWordDetector = undefined;
    }
  }

  processAudioForWakeWord(samples: Float32Array): void {
    if (this.wakeWordDetector) {
      this.wakeWordDetector.processAudioChunk(samples);
    }
  }

  // ===========================================================================
  // VOICE ACTIVITY DETECTION
  // ===========================================================================

  isVoiceActive(samples: Float32Array): boolean {
    if (!this.config.enableVAD) return true;
    return this.vad.isVoiceActive(samples);
  }

  resetVAD(): void {
    this.vad.reset();
  }

  // ===========================================================================
  // USER CONFIGURATION
  // ===========================================================================

  setUserConfig(userId: string, config: VoiceConfig): void {
    this.userConfigs.set(userId, config);
  }

  getUserConfig(userId: string): VoiceConfig | undefined {
    return this.userConfigs.get(userId);
  }

  // ===========================================================================
  // DICTATION MODE
  // ===========================================================================

  async processDictation(
    audioStream: AsyncIterable<ArrayBuffer>,
    options?: {
      enablePunctuation?: boolean;
      enableFormatting?: boolean;
      language?: string;
    }
  ): Promise<string> {
    const transcriptions: string[] = [];

    for await (const result of this.transcribeStream(audioStream)) {
      if (result.text) {
        transcriptions.push(result.text);
      }
    }

    let text = transcriptions.join(" ");

    // Apply punctuation if enabled
    if (options?.enablePunctuation) {
      text = this.applyPunctuation(text);
    }

    // Apply formatting if enabled
    if (options?.enableFormatting) {
      text = this.applyFormatting(text);
    }

    return text;
  }

  private applyPunctuation(text: string): string {
    // Simple punctuation rules
    let result = text;

    // Capitalize first letter
    result = result.charAt(0).toUpperCase() + result.slice(1);

    // Add period at end if missing
    if (!result.match(/[.!?]$/)) {
      result += ".";
    }

    // Capitalize after sentence endings
    result = result.replace(/([.!?]\s+)(\w)/g, (match, p1, p2) => p1 + p2.toUpperCase());

    return result;
  }

  private applyFormatting(text: string): string {
    // Apply spoken formatting commands
    let result = text;

    // Convert "new line" to newline
    result = result.replace(/\bnew line\b/gi, "\n");

    // Convert "new paragraph" to double newline
    result = result.replace(/\bnew paragraph\b/gi, "\n\n");

    // Convert "comma" to ,
    result = result.replace(/\bcomma\b/gi, ",");

    // Convert "period" to .
    result = result.replace(/\bperiod\b/gi, ".");

    // Convert "question mark" to ?
    result = result.replace(/\bquestion mark\b/gi, "?");

    // Convert "exclamation point" to !
    result = result.replace(/\bexclamation point\b/gi, "!");

    return result;
  }

  // ===========================================================================
  // VOICE SEARCH
  // ===========================================================================

  async voiceSearch(audio: AudioContent): Promise<{
    query: string;
    confidence: number;
    isQuestion: boolean;
    entities: { type: string; value: string }[];
  }> {
    const transcription = await this.transcribe({ audio });
    const query = transcription.text;

    // Detect if it's a question
    const isQuestion =
      query.toLowerCase().startsWith("what") ||
      query.toLowerCase().startsWith("who") ||
      query.toLowerCase().startsWith("where") ||
      query.toLowerCase().startsWith("when") ||
      query.toLowerCase().startsWith("why") ||
      query.toLowerCase().startsWith("how") ||
      query.endsWith("?");

    // Extract simple entities
    const entities: { type: string; value: string }[] = [];

    // Extract dates
    const dateMatch = query.match(
      /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (dateMatch) {
      entities.push({ type: "date", value: dateMatch[0] });
    }

    // Extract times
    const timeMatch = query.match(/\b(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i);
    if (timeMatch) {
      entities.push({ type: "time", value: timeMatch[0] });
    }

    return {
      query,
      confidence: transcription.confidence,
      isQuestion,
      entities,
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async shutdown(): Promise<void> {
    log.info("Shutting down voice service");

    this.stopWakeWordDetection();
    this.userConfigs.clear();

    log.info("Voice service shutdown complete");
  }

  getStats(): {
    sttProviders: string[];
    ttsProviders: string[];
    registeredUsers: number;
    wakeWordActive: boolean;
  } {
    return {
      sttProviders: Array.from(this.sttProviders.keys()),
      ttsProviders: Array.from(this.ttsProviders.keys()),
      registeredUsers: this.userConfigs.size,
      wakeWordActive: !!this.wakeWordDetector,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let voiceServiceInstance: VoiceService | null = null;

export function createVoiceService(
  config?: Partial<VoiceServiceConfig>
): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService(config);
  }
  return voiceServiceInstance;
}

export function getVoiceService(): VoiceService | null {
  return voiceServiceInstance;
}

export async function shutdownVoiceService(): Promise<void> {
  if (voiceServiceInstance) {
    await voiceServiceInstance.shutdown();
    voiceServiceInstance = null;
  }
}
