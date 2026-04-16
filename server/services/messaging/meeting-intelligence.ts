/**
 * @file meeting-intelligence.ts
 * @description Real-time meeting intelligence with sentiment, topics, and engagement
 * @phase Phase 4 - Intelligence Layer
 *
 * Features:
 * - Real-time sentiment analysis per speaker segment
 * - Topic extraction via keyword/NLP
 * - Engagement scoring (participation, questions)
 * - WebSocket events for live dashboard
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../../logger";
import type { TranscriptionSegment, SpeakerInfo } from "@shared/messaging/types";

const log = createModuleLogger("meeting-intelligence");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  score: number; // -1 (negative) to 1 (positive)
  label: "positive" | "neutral" | "negative";
  confidence: number;
}

/**
 * Topic with relevance score
 */
export interface Topic {
  name: string;
  keywords: string[];
  relevance: number;
  mentions: number;
  firstMentionAt: number; // timestamp in seconds
  lastMentionAt: number;
}

/**
 * Engagement metrics for a participant
 */
export interface ParticipantEngagement {
  participantId: string;
  speakingTimeSeconds: number;
  wordCount: number;
  questionCount: number;
  interruptionCount: number;
  reactionCount: number;
  sentimentAverage: number;
  engagementScore: number;
}

/**
 * Meeting intelligence snapshot
 */
export interface MeetingIntelligence {
  meetingId: string;
  timestamp: Date;
  overallSentiment: SentimentResult;
  sentimentTrend: { time: number; score: number }[];
  topics: Topic[];
  engagementByParticipant: Map<string, ParticipantEngagement>;
  overallEngagementScore: number;
  questionCount: number;
  actionItemsDetected: DetectedActionItem[];
  keyMoments: KeyMoment[];
}

/**
 * Detected action item from conversation
 */
export interface DetectedActionItem {
  id: string;
  text: string;
  assignee?: string;
  dueDate?: string;
  confidence: number;
  segmentId: number;
  timestamp: number;
}

/**
 * Key moment in the meeting
 */
export interface KeyMoment {
  type: "decision" | "question" | "agreement" | "disagreement" | "action_item" | "important";
  timestamp: number;
  text: string;
  speaker?: string;
  confidence: number;
}

/**
 * Real-time intelligence update event
 */
export interface IntelligenceUpdate {
  meetingId: string;
  type: "sentiment" | "topic" | "engagement" | "action_item" | "key_moment";
  data: unknown;
  timestamp: Date;
}

// =============================================================================
// SENTIMENT ANALYSIS
// =============================================================================

/**
 * Simple lexicon-based sentiment analyzer
 * In production, replace with ML model (e.g., BERT-based)
 */
class SentimentAnalyzer {
  // Positive words weighted by intensity
  private positiveWords: Map<string, number> = new Map([
    ["great", 0.8], ["excellent", 0.9], ["amazing", 0.9], ["good", 0.6],
    ["agree", 0.5], ["thanks", 0.4], ["thank", 0.4], ["love", 0.8],
    ["perfect", 0.9], ["wonderful", 0.8], ["fantastic", 0.9], ["yes", 0.3],
    ["definitely", 0.5], ["absolutely", 0.6], ["happy", 0.7], ["excited", 0.7],
    ["impressive", 0.7], ["brilliant", 0.8], ["helpful", 0.6], ["awesome", 0.8],
  ]);

  // Negative words weighted by intensity
  private negativeWords: Map<string, number> = new Map([
    ["bad", -0.6], ["terrible", -0.9], ["awful", -0.9], ["problem", -0.5],
    ["issue", -0.4], ["disagree", -0.5], ["no", -0.3], ["wrong", -0.5],
    ["fail", -0.7], ["failure", -0.7], ["concern", -0.4], ["worried", -0.5],
    ["unfortunately", -0.4], ["hate", -0.8], ["disappointed", -0.6],
    ["frustrating", -0.6], ["annoying", -0.5], ["confusing", -0.4],
  ]);

  // Intensifiers
  private intensifiers: Map<string, number> = new Map([
    ["very", 1.3], ["really", 1.3], ["extremely", 1.5], ["absolutely", 1.4],
    ["completely", 1.4], ["totally", 1.3], ["quite", 1.1], ["somewhat", 0.8],
  ]);

  // Negators
  private negators = new Set(["not", "no", "never", "neither", "nobody", "nothing"]);

  analyze(text: string): SentimentResult {
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    let wordCount = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, "");

      // Check for negation
      const isNegated = i > 0 && this.negators.has(words[i - 1].replace(/[^\w]/g, ""));

      // Check for intensifier
      let intensifier = 1;
      if (i > 0) {
        const prevWord = words[i - 1].replace(/[^\w]/g, "");
        if (this.intensifiers.has(prevWord)) {
          intensifier = this.intensifiers.get(prevWord)!;
        }
      }

      // Check sentiment
      if (this.positiveWords.has(word)) {
        let value = this.positiveWords.get(word)! * intensifier;
        if (isNegated) value = -value * 0.8;
        score += value;
        wordCount++;
      } else if (this.negativeWords.has(word)) {
        let value = this.negativeWords.get(word)! * intensifier;
        if (isNegated) value = -value * 0.8;
        score += value;
        wordCount++;
      }
    }

    // Normalize score
    const normalizedScore = wordCount > 0 ? score / wordCount : 0;
    const clampedScore = Math.max(-1, Math.min(1, normalizedScore));

    return {
      score: clampedScore,
      label: clampedScore > 0.1 ? "positive" : clampedScore < -0.1 ? "negative" : "neutral",
      confidence: Math.min(1, wordCount * 0.1 + 0.3),
    };
  }
}

// =============================================================================
// TOPIC EXTRACTOR
// =============================================================================

class TopicExtractor {
  // Common stop words to ignore
  private stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "ought", "used", "i", "you", "he", "she", "it", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "its", "our", "their",
    "this", "that", "these", "those", "what", "which", "who", "whom",
    "and", "or", "but", "so", "if", "then", "because", "as", "of", "at",
    "by", "for", "with", "about", "to", "from", "in", "on", "up", "down",
    "just", "also", "very", "really", "going", "thing", "things", "lot",
    "yeah", "okay", "ok", "um", "uh", "like", "know", "think", "want",
    "got", "get", "let", "make", "take", "see", "come", "go", "way",
  ]);

  // Minimum word length for topics
  private minWordLength = 4;

  extract(segments: TranscriptionSegment[], maxTopics: number = 10): Topic[] {
    const wordFrequency = new Map<string, { count: number; firstAt: number; lastAt: number }>();

    // Count word frequency
    for (const segment of segments) {
      const words = segment.text.toLowerCase().split(/\s+/);

      for (const rawWord of words) {
        const word = rawWord.replace(/[^\w]/g, "");

        if (
          word.length >= this.minWordLength &&
          !this.stopWords.has(word) &&
          !/^\d+$/.test(word)
        ) {
          const existing = wordFrequency.get(word);
          if (existing) {
            existing.count++;
            existing.lastAt = segment.start;
          } else {
            wordFrequency.set(word, {
              count: 1,
              firstAt: segment.start,
              lastAt: segment.start,
            });
          }
        }
      }
    }

    // Convert to topics and sort by frequency
    const topics: Topic[] = [];

    for (const [word, data] of wordFrequency) {
      if (data.count >= 2) {
        topics.push({
          name: word,
          keywords: [word],
          relevance: Math.min(1, data.count / 10),
          mentions: data.count,
          firstMentionAt: data.firstAt,
          lastMentionAt: data.lastAt,
        });
      }
    }

    // Sort by mentions descending
    topics.sort((a, b) => b.mentions - a.mentions);

    // Merge related topics (simple prefix matching)
    const mergedTopics: Topic[] = [];
    const used = new Set<string>();

    for (const topic of topics) {
      if (used.has(topic.name)) continue;

      // Find related topics
      const related = topics.filter(
        (t) =>
          !used.has(t.name) &&
          t.name !== topic.name &&
          (t.name.startsWith(topic.name) || topic.name.startsWith(t.name))
      );

      for (const r of related) {
        topic.mentions += r.mentions;
        topic.keywords.push(...r.keywords);
        topic.firstMentionAt = Math.min(topic.firstMentionAt, r.firstMentionAt);
        topic.lastMentionAt = Math.max(topic.lastMentionAt, r.lastMentionAt);
        used.add(r.name);
      }

      topic.relevance = Math.min(1, topic.mentions / 10);
      mergedTopics.push(topic);
      used.add(topic.name);

      if (mergedTopics.length >= maxTopics) break;
    }

    return mergedTopics;
  }
}

// =============================================================================
// ACTION ITEM DETECTOR
// =============================================================================

class ActionItemDetector {
  // Patterns that indicate action items
  private patterns: Array<{ regex: RegExp; confidence: number }> = [
    { regex: /\b(i will|i'll|we will|we'll)\s+(.+)/i, confidence: 0.8 },
    { regex: /\b(need to|needs to|have to|has to)\s+(.+)/i, confidence: 0.7 },
    { regex: /\b(action item|todo|to-do)[:\s]+(.+)/i, confidence: 0.9 },
    { regex: /\b(please|can you|could you)\s+(.+)/i, confidence: 0.6 },
    { regex: /\b(let's|let us)\s+(.+)/i, confidence: 0.5 },
    { regex: /\b(should)\s+(.+)/i, confidence: 0.4 },
    { regex: /\b(make sure|ensure)\s+(.+)/i, confidence: 0.7 },
    { regex: /\b(follow up|follow-up)\s+(.+)?/i, confidence: 0.8 },
    { regex: /\b(deadline|due date|due by)\s*[:\s]*(.+)/i, confidence: 0.8 },
  ];

  // Assignee patterns
  private assigneePatterns = [
    /\b([A-Z][a-z]+)\s+will\b/,
    /\b([A-Z][a-z]+)\s+should\b/,
    /\bassigned to\s+([A-Z][a-z]+)/i,
  ];

  // Due date patterns
  private dueDatePatterns = [
    /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /\bby\s+(tomorrow|next week|end of week|end of day|eod)/i,
    /\bby\s+(\d{1,2}\/\d{1,2})/,
  ];

  detect(segment: TranscriptionSegment): DetectedActionItem | null {
    const text = segment.text;

    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const actionText = match[2] || match[0];

        // Extract assignee
        let assignee: string | undefined;
        for (const ap of this.assigneePatterns) {
          const am = text.match(ap);
          if (am) {
            assignee = am[1];
            break;
          }
        }

        // Extract due date
        let dueDate: string | undefined;
        for (const dp of this.dueDatePatterns) {
          const dm = text.match(dp);
          if (dm) {
            dueDate = dm[1];
            break;
          }
        }

        return {
          id: `ai-${segment.id}-${Date.now()}`,
          text: actionText.trim(),
          assignee,
          dueDate,
          confidence: pattern.confidence,
          segmentId: segment.id,
          timestamp: segment.start,
        };
      }
    }

    return null;
  }
}

// =============================================================================
// KEY MOMENT DETECTOR
// =============================================================================

class KeyMomentDetector {
  private patterns: Array<{ regex: RegExp; type: KeyMoment["type"]; confidence: number }> = [
    // Questions
    { regex: /\?$/, type: "question", confidence: 0.9 },
    { regex: /^(what|why|how|when|where|who|which|can|could|would|do|does|is|are)\s/i, type: "question", confidence: 0.7 },

    // Decisions
    { regex: /\b(decided|decision|we'll go with|let's do|agreed to)\b/i, type: "decision", confidence: 0.8 },

    // Agreement
    { regex: /\b(i agree|that's right|exactly|absolutely|definitely)\b/i, type: "agreement", confidence: 0.7 },

    // Disagreement
    { regex: /\b(i disagree|don't think|not sure|concern|problem with)\b/i, type: "disagreement", confidence: 0.7 },

    // Important
    { regex: /\b(important|critical|crucial|key point|priority)\b/i, type: "important", confidence: 0.6 },
  ];

  detect(segment: TranscriptionSegment): KeyMoment | null {
    const text = segment.text.trim();

    for (const pattern of this.patterns) {
      if (pattern.regex.test(text)) {
        return {
          type: pattern.type,
          timestamp: segment.start,
          text: text.substring(0, 200),
          speaker: segment.speaker,
          confidence: pattern.confidence,
        };
      }
    }

    return null;
  }
}

// =============================================================================
// MEETING INTELLIGENCE SERVICE
// =============================================================================

export class MeetingIntelligenceService extends EventEmitter {
  private sentimentAnalyzer: SentimentAnalyzer;
  private topicExtractor: TopicExtractor;
  private actionItemDetector: ActionItemDetector;
  private keyMomentDetector: KeyMomentDetector;

  // Per-meeting state
  private meetingState: Map<string, {
    segments: TranscriptionSegment[];
    sentimentHistory: { time: number; score: number }[];
    engagementByParticipant: Map<string, ParticipantEngagement>;
    actionItems: DetectedActionItem[];
    keyMoments: KeyMoment[];
    lastUpdate: Date;
  }> = new Map();

  constructor() {
    super();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.topicExtractor = new TopicExtractor();
    this.actionItemDetector = new ActionItemDetector();
    this.keyMomentDetector = new KeyMomentDetector();
  }

  /**
   * Initialize state for a new meeting
   */
  initializeMeeting(meetingId: string): void {
    this.meetingState.set(meetingId, {
      segments: [],
      sentimentHistory: [],
      engagementByParticipant: new Map(),
      actionItems: [],
      keyMoments: [],
      lastUpdate: new Date(),
    });
    log.debug({ meetingId }, "Meeting intelligence initialized");
  }

  /**
   * Process a new transcription segment
   */
  processSegment(meetingId: string, segment: TranscriptionSegment): void {
    let state = this.meetingState.get(meetingId);
    if (!state) {
      this.initializeMeeting(meetingId);
      state = this.meetingState.get(meetingId)!;
    }

    state.segments.push(segment);
    state.lastUpdate = new Date();

    // Analyze sentiment
    const sentiment = this.sentimentAnalyzer.analyze(segment.text);
    state.sentimentHistory.push({ time: segment.start, score: sentiment.score });

    this.emitUpdate(meetingId, "sentiment", {
      segmentId: segment.id,
      sentiment,
      timestamp: segment.start,
    });

    // Update participant engagement
    const participantId = segment.speaker || "unknown";
    let engagement = state.engagementByParticipant.get(participantId);

    if (!engagement) {
      engagement = {
        participantId,
        speakingTimeSeconds: 0,
        wordCount: 0,
        questionCount: 0,
        interruptionCount: 0,
        reactionCount: 0,
        sentimentAverage: 0,
        engagementScore: 0,
      };
      state.engagementByParticipant.set(participantId, engagement);
    }

    engagement.speakingTimeSeconds += segment.end - segment.start;
    engagement.wordCount += segment.text.split(/\s+/).length;

    if (segment.text.includes("?")) {
      engagement.questionCount++;
    }

    // Running average of sentiment
    const participantSegments = state.segments.filter((s) => s.speaker === participantId);
    engagement.sentimentAverage =
      state.sentimentHistory
        .filter((_, i) => state.segments[i]?.speaker === participantId)
        .reduce((sum, h) => sum + h.score, 0) / Math.max(1, participantSegments.length);

    // Calculate engagement score
    engagement.engagementScore = this.calculateEngagementScore(engagement);

    this.emitUpdate(meetingId, "engagement", {
      participantId,
      engagement,
    });

    // Detect action items
    const actionItem = this.actionItemDetector.detect(segment);
    if (actionItem) {
      state.actionItems.push(actionItem);
      this.emitUpdate(meetingId, "action_item", actionItem);
    }

    // Detect key moments
    const keyMoment = this.keyMomentDetector.detect(segment);
    if (keyMoment) {
      state.keyMoments.push(keyMoment);
      this.emitUpdate(meetingId, "key_moment", keyMoment);
    }
  }

  /**
   * Calculate engagement score for a participant
   */
  private calculateEngagementScore(engagement: ParticipantEngagement): number {
    // Weighted combination of factors
    const speakingWeight = 0.3;
    const questionWeight = 0.3;
    const sentimentWeight = 0.2;
    const participationWeight = 0.2;

    // Normalize speaking time (max 10 minutes = 1.0)
    const speakingScore = Math.min(1, engagement.speakingTimeSeconds / 600);

    // Question score (max 5 questions = 1.0)
    const questionScore = Math.min(1, engagement.questionCount / 5);

    // Sentiment score (shift from -1..1 to 0..1)
    const sentimentScore = (engagement.sentimentAverage + 1) / 2;

    // Word participation (max 500 words = 1.0)
    const participationScore = Math.min(1, engagement.wordCount / 500);

    return (
      speakingScore * speakingWeight +
      questionScore * questionWeight +
      sentimentScore * sentimentWeight +
      participationScore * participationWeight
    );
  }

  /**
   * Get current intelligence snapshot for a meeting
   */
  getIntelligence(meetingId: string): MeetingIntelligence | null {
    const state = this.meetingState.get(meetingId);
    if (!state) return null;

    // Calculate overall sentiment
    const recentSentiments = state.sentimentHistory.slice(-20);
    const avgSentiment = recentSentiments.length > 0
      ? recentSentiments.reduce((sum, h) => sum + h.score, 0) / recentSentiments.length
      : 0;

    const overallSentiment: SentimentResult = {
      score: avgSentiment,
      label: avgSentiment > 0.1 ? "positive" : avgSentiment < -0.1 ? "negative" : "neutral",
      confidence: Math.min(1, state.segments.length * 0.05),
    };

    // Extract topics
    const topics = this.topicExtractor.extract(state.segments);

    // Calculate overall engagement
    const engagements = Array.from(state.engagementByParticipant.values());
    const overallEngagementScore = engagements.length > 0
      ? engagements.reduce((sum, e) => sum + e.engagementScore, 0) / engagements.length
      : 0;

    // Count questions
    const questionCount = state.segments.filter((s) => s.text.includes("?")).length;

    return {
      meetingId,
      timestamp: state.lastUpdate,
      overallSentiment,
      sentimentTrend: state.sentimentHistory,
      topics,
      engagementByParticipant: state.engagementByParticipant,
      overallEngagementScore,
      questionCount,
      actionItemsDetected: state.actionItems,
      keyMoments: state.keyMoments,
    };
  }

  /**
   * Clean up meeting state
   */
  finalizeMeeting(meetingId: string): MeetingIntelligence | null {
    const intelligence = this.getIntelligence(meetingId);
    this.meetingState.delete(meetingId);
    log.debug({ meetingId }, "Meeting intelligence finalized");
    return intelligence;
  }

  /**
   * Emit an intelligence update event
   */
  private emitUpdate(meetingId: string, type: IntelligenceUpdate["type"], data: unknown): void {
    const update: IntelligenceUpdate = {
      meetingId,
      type,
      data,
      timestamp: new Date(),
    };

    this.emit("update", update);
    this.emit(`update:${meetingId}`, update);
  }

  /**
   * Subscribe to updates for a specific meeting
   */
  onMeetingUpdate(meetingId: string, handler: (update: IntelligenceUpdate) => void): () => void {
    const eventName = `update:${meetingId}`;
    this.on(eventName, handler);
    return () => this.off(eventName, handler);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let intelligenceServiceInstance: MeetingIntelligenceService | null = null;

export function getMeetingIntelligenceService(): MeetingIntelligenceService {
  if (!intelligenceServiceInstance) {
    intelligenceServiceInstance = new MeetingIntelligenceService();
  }
  return intelligenceServiceInstance;
}

export function resetMeetingIntelligenceService(): void {
  intelligenceServiceInstance = null;
}
