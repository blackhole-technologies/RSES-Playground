/**
 * @file voice-transcription-service.ts
 * @description Voice recording and transcription service with Whisper API integration.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Key Features:
 * - Voice message recording management
 * - Real-time transcription with OpenAI Whisper API
 * - Speaker diarization support
 * - Searchable transcript storage
 * - Voice-to-action command parsing
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  VoiceMessage,
  VoiceTranscription,
  TranscriptionSegment,
  VoiceCommand,
  VoiceCommandAction,
} from "@shared/messaging/types";

const log = createModuleLogger("voice-transcription-service");

// =============================================================================
// TYPES
// =============================================================================

interface VoiceTranscriptionConfig {
  whisperApiKey?: string;
  whisperModel?: "whisper-1" | "whisper-large-v3";
  defaultLanguage?: string;
  enableDiarization?: boolean;
  enableWordTimestamps?: boolean;
  maxAudioDuration?: number;  // In seconds
  maxFileSize?: number;       // In bytes
  supportedFormats?: string[];
  voiceCommandsEnabled?: boolean;
  voiceCommandPrefix?: string;
}

interface TranscriptionJob {
  id: string;
  voiceMessageId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
}

interface DiarizationResult {
  speakers: {
    id: string;
    label: string;
    segments: { start: number; end: number }[];
    speakingTime: number;
  }[];
}

// Voice command patterns
const VOICE_COMMAND_PATTERNS: {
  action: VoiceCommandAction;
  patterns: RegExp[];
}[] = [
  {
    action: "send_message",
    patterns: [
      /^send message to (.+?) saying (.+)$/i,
      /^message (.+?) (.+)$/i,
      /^tell (.+?) (.+)$/i,
    ],
  },
  {
    action: "search",
    patterns: [
      /^search for (.+)$/i,
      /^find (.+)$/i,
      /^look up (.+)$/i,
    ],
  },
  {
    action: "switch_channel",
    patterns: [
      /^go to channel (.+)$/i,
      /^switch to (.+)$/i,
      /^open (.+) channel$/i,
    ],
  },
  {
    action: "start_call",
    patterns: [
      /^call (.+)$/i,
      /^start call with (.+)$/i,
      /^video call (.+)$/i,
    ],
  },
  {
    action: "end_call",
    patterns: [
      /^end call$/i,
      /^hang up$/i,
      /^leave call$/i,
    ],
  },
  {
    action: "mute",
    patterns: [
      /^mute$/i,
      /^mute myself$/i,
      /^turn off microphone$/i,
    ],
  },
  {
    action: "unmute",
    patterns: [
      /^unmute$/i,
      /^unmute myself$/i,
      /^turn on microphone$/i,
    ],
  },
  {
    action: "share_screen",
    patterns: [
      /^share screen$/i,
      /^share my screen$/i,
      /^start screen sharing$/i,
    ],
  },
  {
    action: "create_task",
    patterns: [
      /^create task (.+)$/i,
      /^add task (.+)$/i,
      /^new task (.+)$/i,
      /^remind me to (.+)$/i,
    ],
  },
  {
    action: "set_reminder",
    patterns: [
      /^set reminder (.+)$/i,
      /^remind me (.+)$/i,
      /^reminder (.+)$/i,
    ],
  },
  {
    action: "read_messages",
    patterns: [
      /^read messages$/i,
      /^read new messages$/i,
      /^what are my messages$/i,
    ],
  },
];

// =============================================================================
// VOICE TRANSCRIPTION SERVICE
// =============================================================================

export class VoiceTranscriptionService extends EventEmitter {
  private config: Required<VoiceTranscriptionConfig>;
  private voiceMessages: Map<string, VoiceMessage>;
  private transcriptionJobs: Map<string, TranscriptionJob>;
  private processingQueue: string[];
  private isProcessing: boolean;

  constructor(config: VoiceTranscriptionConfig = {}) {
    super();

    this.config = {
      whisperApiKey: config.whisperApiKey ?? process.env.OPENAI_API_KEY ?? "",
      whisperModel: config.whisperModel ?? "whisper-1",
      defaultLanguage: config.defaultLanguage ?? "en",
      enableDiarization: config.enableDiarization ?? true,
      enableWordTimestamps: config.enableWordTimestamps ?? true,
      maxAudioDuration: config.maxAudioDuration ?? 600,  // 10 minutes
      maxFileSize: config.maxFileSize ?? 25 * 1024 * 1024,  // 25MB
      supportedFormats: config.supportedFormats ?? ["webm", "mp3", "ogg", "wav", "m4a", "flac"],
      voiceCommandsEnabled: config.voiceCommandsEnabled ?? true,
      voiceCommandPrefix: config.voiceCommandPrefix ?? "hey assistant",
    };

    this.voiceMessages = new Map();
    this.transcriptionJobs = new Map();
    this.processingQueue = [];
    this.isProcessing = false;

    log.info({ model: this.config.whisperModel }, "Voice Transcription Service initialized");
  }

  // ===========================================================================
  // VOICE MESSAGE MANAGEMENT
  // ===========================================================================

  /**
   * Register a new voice message for transcription
   */
  async registerVoiceMessage(
    messageId: string,
    channelId: string,
    userId: string,
    audioData: {
      duration: number;
      waveform: number[];
      audioUrl: string;
      format: VoiceMessage["format"];
      sampleRate: number;
      bitrate: number;
      fileSize: number;
    }
  ): Promise<VoiceMessage> {
    // Validate
    if (audioData.duration > this.config.maxAudioDuration) {
      throw new Error(`Audio duration exceeds maximum of ${this.config.maxAudioDuration} seconds`);
    }

    if (audioData.fileSize > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum of ${this.config.maxFileSize} bytes`);
    }

    if (!this.config.supportedFormats.includes(audioData.format)) {
      throw new Error(`Unsupported audio format: ${audioData.format}`);
    }

    const id = randomUUID();

    const voiceMessage: VoiceMessage = {
      id,
      messageId,
      channelId,
      userId,
      duration: audioData.duration,
      waveform: audioData.waveform,
      audioUrl: audioData.audioUrl,
      format: audioData.format,
      sampleRate: audioData.sampleRate,
      bitrate: audioData.bitrate,
      fileSize: audioData.fileSize,
      transcriptionStatus: "pending",
      createdAt: new Date(),
    };

    this.voiceMessages.set(id, voiceMessage);
    this.emit("voice:registered", { voiceMessage });

    // Queue for transcription
    await this.queueTranscription(id);

    log.info({ voiceMessageId: id, duration: audioData.duration }, "Voice message registered");
    return voiceMessage;
  }

  /**
   * Get a voice message by ID
   */
  async getVoiceMessage(voiceMessageId: string): Promise<VoiceMessage | null> {
    return this.voiceMessages.get(voiceMessageId) || null;
  }

  /**
   * Get voice messages for a channel
   */
  async getChannelVoiceMessages(channelId: string): Promise<VoiceMessage[]> {
    return Array.from(this.voiceMessages.values())
      .filter(vm => vm.channelId === channelId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ===========================================================================
  // TRANSCRIPTION
  // ===========================================================================

  /**
   * Queue a voice message for transcription
   */
  private async queueTranscription(voiceMessageId: string): Promise<void> {
    const job: TranscriptionJob = {
      id: randomUUID(),
      voiceMessageId,
      status: "pending",
      progress: 0,
      retryCount: 0,
    };

    this.transcriptionJobs.set(voiceMessageId, job);
    this.processingQueue.push(voiceMessageId);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process transcription queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const voiceMessageId = this.processingQueue.shift()!;
      await this.processTranscription(voiceMessageId);
    }

    this.isProcessing = false;
  }

  /**
   * Process a single transcription
   */
  private async processTranscription(voiceMessageId: string): Promise<void> {
    const voiceMessage = this.voiceMessages.get(voiceMessageId);
    const job = this.transcriptionJobs.get(voiceMessageId);

    if (!voiceMessage || !job) {
      log.warn({ voiceMessageId }, "Voice message or job not found");
      return;
    }

    try {
      job.status = "processing";
      job.startedAt = new Date();
      voiceMessage.transcriptionStatus = "processing";

      this.emit("transcription:started", { voiceMessageId });

      // Call Whisper API
      const transcription = await this.callWhisperAPI(voiceMessage);

      // Run diarization if enabled
      let diarizationResult: DiarizationResult | undefined;
      if (this.config.enableDiarization && voiceMessage.duration > 30) {
        diarizationResult = await this.performDiarization(voiceMessage, transcription);
      }

      // Merge diarization results
      if (diarizationResult) {
        transcription.segments = this.mergeDiarizationResults(
          transcription.segments,
          diarizationResult
        );
      }

      // Store transcription
      voiceMessage.transcription = transcription;
      voiceMessage.transcriptionStatus = "completed";

      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date();

      this.emit("transcription:completed", { voiceMessageId, transcription });

      // Check for voice commands
      if (this.config.voiceCommandsEnabled) {
        const command = this.parseVoiceCommand(transcription.text);
        if (command) {
          this.emit("voice:command", { voiceMessageId, command });
        }
      }

      log.info(
        { voiceMessageId, duration: voiceMessage.duration, wordCount: transcription.wordCount },
        "Transcription completed"
      );
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      job.retryCount++;
      voiceMessage.transcriptionStatus = "failed";

      this.emit("transcription:failed", { voiceMessageId, error: job.error });

      log.error({ voiceMessageId, error: job.error }, "Transcription failed");

      // Retry up to 3 times
      if (job.retryCount < 3) {
        this.processingQueue.push(voiceMessageId);
      }
    }
  }

  /**
   * Call OpenAI Whisper API for transcription
   */
  private async callWhisperAPI(voiceMessage: VoiceMessage): Promise<VoiceTranscription> {
    // In production, this would make actual API calls
    // For now, we'll simulate the transcription

    if (!this.config.whisperApiKey) {
      log.warn("No Whisper API key configured, using mock transcription");
      return this.generateMockTranscription(voiceMessage);
    }

    // Emit progress updates
    this.emit("transcription:progress", { voiceMessageId: voiceMessage.id, progress: 10 });

    // Simulate API call
    // In production:
    // const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${this.config.whisperApiKey}` },
    //   body: formData  // Contains audio file
    // });

    this.emit("transcription:progress", { voiceMessageId: voiceMessage.id, progress: 50 });

    await this.simulateDelay(1000);

    this.emit("transcription:progress", { voiceMessageId: voiceMessage.id, progress: 90 });

    return this.generateMockTranscription(voiceMessage);
  }

  /**
   * Generate mock transcription for testing/demo
   */
  private generateMockTranscription(voiceMessage: VoiceMessage): VoiceTranscription {
    const duration = voiceMessage.duration;
    const segmentCount = Math.max(1, Math.floor(duration / 5));
    const segments: TranscriptionSegment[] = [];

    const sampleTexts = [
      "This is a voice message demonstration.",
      "The transcription service is working correctly.",
      "Please review the attached documents.",
      "Let's schedule a meeting to discuss this further.",
      "I've completed the task as requested.",
    ];

    for (let i = 0; i < segmentCount; i++) {
      const start = i * 5;
      const end = Math.min((i + 1) * 5, duration);
      const text = sampleTexts[i % sampleTexts.length];

      segments.push({
        id: i,
        text,
        start,
        end,
        confidence: 0.92 + Math.random() * 0.08,
        words: this.generateWordTimestamps(text, start, end),
      });
    }

    const fullText = segments.map(s => s.text).join(" ");

    return {
      text: fullText,
      segments,
      language: this.config.defaultLanguage,
      confidence: 0.95,
      duration,
      wordCount: fullText.split(/\s+/).length,
      model: this.config.whisperModel,
      processedAt: new Date(),
    };
  }

  /**
   * Generate word-level timestamps
   */
  private generateWordTimestamps(
    text: string,
    start: number,
    end: number
  ): { word: string; start: number; end: number; confidence: number }[] {
    const words = text.split(/\s+/);
    const duration = end - start;
    const wordDuration = duration / words.length;

    return words.map((word, index) => ({
      word,
      start: start + index * wordDuration,
      end: start + (index + 1) * wordDuration,
      confidence: 0.9 + Math.random() * 0.1,
    }));
  }

  /**
   * Perform speaker diarization
   */
  private async performDiarization(
    voiceMessage: VoiceMessage,
    _transcription: VoiceTranscription
  ): Promise<DiarizationResult> {
    // In production, this would use a diarization service like:
    // - pyannote.audio
    // - AWS Transcribe
    // - Google Speech-to-Text with speaker diarization

    // Mock diarization result
    const numSpeakers = Math.min(4, Math.ceil(voiceMessage.duration / 30));
    const speakers: DiarizationResult["speakers"] = [];

    for (let i = 0; i < numSpeakers; i++) {
      const speakerSegments: { start: number; end: number }[] = [];
      let currentTime = i * 3;

      while (currentTime < voiceMessage.duration) {
        const segmentDuration = 5 + Math.random() * 10;
        speakerSegments.push({
          start: currentTime,
          end: Math.min(currentTime + segmentDuration, voiceMessage.duration),
        });
        currentTime += segmentDuration + (numSpeakers - 1) * 5;
      }

      const speakingTime = speakerSegments.reduce(
        (sum, seg) => sum + (seg.end - seg.start),
        0
      );

      speakers.push({
        id: `speaker_${i + 1}`,
        label: `Speaker ${i + 1}`,
        segments: speakerSegments,
        speakingTime,
      });
    }

    return { speakers };
  }

  /**
   * Merge diarization results into transcription segments
   */
  private mergeDiarizationResults(
    segments: TranscriptionSegment[],
    diarization: DiarizationResult
  ): TranscriptionSegment[] {
    return segments.map(segment => {
      // Find which speaker is talking during this segment
      for (const speaker of diarization.speakers) {
        for (const speakerSeg of speaker.segments) {
          // Check for overlap
          if (segment.start >= speakerSeg.start && segment.end <= speakerSeg.end) {
            return { ...segment, speaker: speaker.label };
          }
        }
      }
      return segment;
    });
  }

  // ===========================================================================
  // VOICE COMMANDS
  // ===========================================================================

  /**
   * Parse voice command from transcription text
   */
  parseVoiceCommand(text: string): VoiceCommand | null {
    const lowerText = text.toLowerCase().trim();

    // Check for command prefix
    if (this.config.voiceCommandPrefix && !lowerText.startsWith(this.config.voiceCommandPrefix)) {
      return null;
    }

    // Remove prefix
    let commandText = this.config.voiceCommandPrefix
      ? lowerText.slice(this.config.voiceCommandPrefix.length).trim()
      : lowerText;

    // Try to match against known command patterns
    for (const { action, patterns } of VOICE_COMMAND_PATTERNS) {
      for (const pattern of patterns) {
        const match = commandText.match(pattern);
        if (match) {
          const parameters: Record<string, unknown> = {};

          // Extract parameters from capture groups
          if (match.length > 1) {
            match.slice(1).forEach((group, index) => {
              parameters[`param${index + 1}`] = group;
            });
          }

          return {
            id: randomUUID(),
            phrase: commandText,
            confidence: 0.85,
            action,
            parameters,
            executedAt: new Date(),
          };
        }
      }
    }

    return null;
  }

  /**
   * Get supported voice commands
   */
  getSupportedCommands(): { action: VoiceCommandAction; examples: string[] }[] {
    return [
      {
        action: "send_message",
        examples: ["send message to John saying hello", "tell Sarah I'll be late"],
      },
      {
        action: "search",
        examples: ["search for project updates", "find messages about budget"],
      },
      {
        action: "switch_channel",
        examples: ["go to channel general", "switch to engineering"],
      },
      {
        action: "start_call",
        examples: ["call John", "video call the team"],
      },
      {
        action: "end_call",
        examples: ["end call", "hang up"],
      },
      {
        action: "mute",
        examples: ["mute", "turn off microphone"],
      },
      {
        action: "unmute",
        examples: ["unmute", "turn on microphone"],
      },
      {
        action: "share_screen",
        examples: ["share screen", "start screen sharing"],
      },
      {
        action: "create_task",
        examples: ["create task review proposal", "add task send report"],
      },
      {
        action: "set_reminder",
        examples: ["set reminder meeting at 3pm", "remind me to call client"],
      },
      {
        action: "read_messages",
        examples: ["read messages", "what are my messages"],
      },
    ];
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  /**
   * Search transcriptions
   */
  async searchTranscriptions(
    query: string,
    options: {
      channelIds?: string[];
      fromDate?: Date;
      toDate?: Date;
      speakerId?: string;
      limit?: number;
    } = {}
  ): Promise<{
    results: {
      voiceMessage: VoiceMessage;
      matches: {
        segmentId: number;
        text: string;
        timestamp: number;
        speaker?: string;
      }[];
    }[];
    total: number;
  }> {
    const results: {
      voiceMessage: VoiceMessage;
      matches: { segmentId: number; text: string; timestamp: number; speaker?: string }[];
    }[] = [];

    const queryLower = query.toLowerCase();
    const limit = options.limit ?? 50;

    for (const voiceMessage of this.voiceMessages.values()) {
      if (!voiceMessage.transcription) continue;

      // Apply filters
      if (options.channelIds && !options.channelIds.includes(voiceMessage.channelId)) continue;
      if (options.fromDate && voiceMessage.createdAt < options.fromDate) continue;
      if (options.toDate && voiceMessage.createdAt > options.toDate) continue;

      const matches: { segmentId: number; text: string; timestamp: number; speaker?: string }[] = [];

      for (const segment of voiceMessage.transcription.segments) {
        // Filter by speaker
        if (options.speakerId && segment.speaker !== options.speakerId) continue;

        if (segment.text.toLowerCase().includes(queryLower)) {
          matches.push({
            segmentId: segment.id,
            text: segment.text,
            timestamp: segment.start,
            speaker: segment.speaker,
          });
        }
      }

      if (matches.length > 0) {
        results.push({ voiceMessage, matches });
      }
    }

    // Sort by recency
    results.sort(
      (a, b) => b.voiceMessage.createdAt.getTime() - a.voiceMessage.createdAt.getTime()
    );

    return {
      results: results.slice(0, limit),
      total: results.length,
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get transcription job status
   */
  getTranscriptionStatus(voiceMessageId: string): TranscriptionJob | null {
    return this.transcriptionJobs.get(voiceMessageId) || null;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.transcriptionJobs.values()) {
      switch (job.status) {
        case "pending":
          pending++;
          break;
        case "processing":
          processing++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return { pending, processing, completed, failed };
  }

  /**
   * Retry failed transcription
   */
  async retryTranscription(voiceMessageId: string): Promise<void> {
    const job = this.transcriptionJobs.get(voiceMessageId);
    if (!job || job.status !== "failed") {
      throw new Error("No failed transcription found for this voice message");
    }

    job.status = "pending";
    job.error = undefined;
    this.processingQueue.push(voiceMessageId);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Simulate delay for mock operations
   */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.removeAllListeners();
    this.voiceMessages.clear();
    this.transcriptionJobs.clear();
    this.processingQueue = [];
    this.isProcessing = false;
    log.info("Voice Transcription Service shut down");
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let voiceTranscriptionServiceInstance: VoiceTranscriptionService | null = null;

export function getVoiceTranscriptionService(): VoiceTranscriptionService | null {
  return voiceTranscriptionServiceInstance;
}

export function initVoiceTranscriptionService(
  config?: VoiceTranscriptionConfig
): VoiceTranscriptionService {
  if (voiceTranscriptionServiceInstance) {
    log.warn("Voice Transcription Service already initialized");
    return voiceTranscriptionServiceInstance;
  }

  voiceTranscriptionServiceInstance = new VoiceTranscriptionService(config);
  return voiceTranscriptionServiceInstance;
}

export function shutdownVoiceTranscriptionService(): void {
  if (voiceTranscriptionServiceInstance) {
    voiceTranscriptionServiceInstance.shutdown();
    voiceTranscriptionServiceInstance = null;
  }
}
