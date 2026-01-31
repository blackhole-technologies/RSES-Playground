/**
 * @file meeting-service.ts
 * @description Video conferencing and meeting management service with WebRTC support.
 * @phase Phase 10 - AI-Native CMS (Messaging & Collaboration)
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Key Features:
 * - Video conferencing with WebRTC
 * - Screen sharing
 * - Meeting recording
 * - Live transcription
 * - AI-generated meeting summaries
 * - Action item extraction
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import type {
  Meeting,
  MeetingParticipant,
  MeetingRecording,
  MeetingTranscription,
  MeetingSummary,
  ActionItem,
  ScheduleMeetingRequest,
  TranscriptionSegment,
  SpeakerInfo,
} from "@shared/messaging/types";

const log = createModuleLogger("meeting-service");

// =============================================================================
// TYPES
// =============================================================================

interface MeetingServiceConfig {
  maxParticipantsDefault?: number;
  maxMeetingDuration?: number;  // In minutes
  recordingStoragePath?: string;
  enableAutoRecording?: boolean;
  enableLiveTranscription?: boolean;
  aiSummaryEnabled?: boolean;
  aiModelProvider?: string;
  aiModelName?: string;
  stunServers?: string[];
  turnServers?: {
    urls: string;
    username?: string;
    credential?: string;
  }[];
}

interface ActiveMeeting {
  meeting: Meeting;
  webrtcState: {
    offers: Map<string, RTCSessionDescriptionInit>;
    answers: Map<string, RTCSessionDescriptionInit>;
    iceCandidates: Map<string, RTCIceCandidateInit[]>;
  };
  liveTranscription: TranscriptionSegment[];
  screenSharers: string[];
  raisedHands: string[];
  reactions: {
    participantId: string;
    reaction: string;
    timestamp: Date;
  }[];
}

interface SummaryGenerationJob {
  meetingId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// =============================================================================
// MEETING SERVICE
// =============================================================================

export class MeetingService extends EventEmitter {
  private config: Required<MeetingServiceConfig>;
  private meetings: Map<string, Meeting>;
  private activeMeetings: Map<string, ActiveMeeting>;
  private recordings: Map<string, MeetingRecording>;
  private summaries: Map<string, MeetingSummary>;
  private actionItems: Map<string, ActionItem[]>;
  private summaryJobs: Map<string, SummaryGenerationJob>;

  constructor(config: MeetingServiceConfig = {}) {
    super();

    this.config = {
      maxParticipantsDefault: config.maxParticipantsDefault ?? 100,
      maxMeetingDuration: config.maxMeetingDuration ?? 480,  // 8 hours
      recordingStoragePath: config.recordingStoragePath ?? "/recordings",
      enableAutoRecording: config.enableAutoRecording ?? false,
      enableLiveTranscription: config.enableLiveTranscription ?? true,
      aiSummaryEnabled: config.aiSummaryEnabled ?? true,
      aiModelProvider: config.aiModelProvider ?? "anthropic",
      aiModelName: config.aiModelName ?? "claude-3-sonnet",
      stunServers: config.stunServers ?? [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
      turnServers: config.turnServers ?? [],
    };

    this.meetings = new Map();
    this.activeMeetings = new Map();
    this.recordings = new Map();
    this.summaries = new Map();
    this.actionItems = new Map();
    this.summaryJobs = new Map();

    log.info("Meeting Service initialized");
  }

  // ===========================================================================
  // MEETING LIFECYCLE
  // ===========================================================================

  /**
   * Schedule a new meeting
   */
  async scheduleMeeting(request: ScheduleMeetingRequest, hostId: string): Promise<Meeting> {
    const id = randomUUID();
    const now = new Date();
    const joinUrl = this.generateJoinUrl(id);

    const meeting: Meeting = {
      id,
      channelId: request.channelId,
      workspaceId: request.workspaceId,
      title: request.title,
      description: request.description,
      type: "scheduled",
      status: "scheduled",
      scheduledStart: request.scheduledStart,
      scheduledEnd: request.scheduledEnd,
      timezone: request.timezone,
      recurrence: request.recurrence,
      hostId,
      participants: [],
      invitedUserIds: request.inviteeIds,
      maxParticipants: this.config.maxParticipantsDefault,
      settings: {
        waitingRoomEnabled: request.settings?.waitingRoomEnabled ?? true,
        participantsCanUnmute: request.settings?.participantsCanUnmute ?? true,
        participantsCanShareScreen: request.settings?.participantsCanShareScreen ?? false,
        recordingEnabled: request.settings?.recordingEnabled ?? true,
        autoRecording: request.settings?.autoRecording ?? this.config.enableAutoRecording,
        transcriptionEnabled: request.settings?.transcriptionEnabled ?? true,
        liveTranscription: request.settings?.liveTranscription ?? this.config.enableLiveTranscription,
        chatEnabled: request.settings?.chatEnabled ?? true,
        raisedHandsEnabled: request.settings?.raisedHandsEnabled ?? true,
        breakoutRoomsEnabled: request.settings?.breakoutRoomsEnabled ?? false,
        password: request.settings?.password,
        requireAuthentication: request.settings?.requireAuthentication ?? true,
      },
      recordings: [],
      joinUrl,
      createdAt: now,
      updatedAt: now,
    };

    this.meetings.set(id, meeting);
    this.emit("meeting:created", { meeting });

    log.info(
      { meetingId: id, title: meeting.title, scheduledStart: meeting.scheduledStart },
      "Meeting scheduled"
    );

    return meeting;
  }

  /**
   * Create an instant meeting
   */
  async createInstantMeeting(
    workspaceId: string,
    hostId: string,
    title: string,
    channelId?: string
  ): Promise<Meeting> {
    const now = new Date();
    const endTime = new Date(now.getTime() + this.config.maxMeetingDuration * 60 * 1000);

    const meeting = await this.scheduleMeeting(
      {
        workspaceId,
        channelId,
        title,
        scheduledStart: now,
        scheduledEnd: endTime,
        inviteeIds: [],
        settings: {
          waitingRoomEnabled: false,  // Instant meetings don't need waiting room
        },
      },
      hostId
    );

    meeting.type = "instant";
    meeting.status = "waiting";

    return meeting;
  }

  /**
   * Get a meeting by ID
   */
  async getMeeting(meetingId: string): Promise<Meeting | null> {
    return this.meetings.get(meetingId) || null;
  }

  /**
   * Get meetings for a workspace
   */
  async getWorkspaceMeetings(
    workspaceId: string,
    options: {
      status?: Meeting["status"];
      fromDate?: Date;
      toDate?: Date;
      hostId?: string;
    } = {}
  ): Promise<Meeting[]> {
    let meetings = Array.from(this.meetings.values())
      .filter(m => m.workspaceId === workspaceId);

    if (options.status) {
      meetings = meetings.filter(m => m.status === options.status);
    }

    if (options.fromDate) {
      meetings = meetings.filter(m => m.scheduledStart && m.scheduledStart >= options.fromDate!);
    }

    if (options.toDate) {
      meetings = meetings.filter(m => m.scheduledStart && m.scheduledStart <= options.toDate!);
    }

    if (options.hostId) {
      meetings = meetings.filter(m => m.hostId === options.hostId);
    }

    // Sort by scheduled start time
    meetings.sort((a, b) => {
      const aTime = a.scheduledStart?.getTime() ?? 0;
      const bTime = b.scheduledStart?.getTime() ?? 0;
      return aTime - bTime;
    });

    return meetings;
  }

  /**
   * Update meeting details
   */
  async updateMeeting(
    meetingId: string,
    updates: Partial<Pick<Meeting, "title" | "description" | "scheduledStart" | "scheduledEnd" | "settings">>,
    updaterId: string
  ): Promise<Meeting> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    // Only host can update
    if (meeting.hostId !== updaterId) {
      throw new Error("Only the host can update the meeting");
    }

    // Can't update meetings that have ended
    if (meeting.status === "ended") {
      throw new Error("Cannot update ended meeting");
    }

    Object.assign(meeting, {
      ...updates,
      settings: updates.settings
        ? { ...meeting.settings, ...updates.settings }
        : meeting.settings,
      updatedAt: new Date(),
    });

    this.emit("meeting:updated", { meeting, updaterId });
    return meeting;
  }

  /**
   * Cancel a meeting
   */
  async cancelMeeting(meetingId: string, cancellerId: string, reason?: string): Promise<void> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (meeting.hostId !== cancellerId) {
      throw new Error("Only the host can cancel the meeting");
    }

    if (meeting.status === "in_progress") {
      await this.endMeeting(meetingId, cancellerId);
    }

    meeting.status = "cancelled";
    meeting.updatedAt = new Date();

    this.emit("meeting:cancelled", { meetingId, cancellerId, reason });
    log.info({ meetingId, reason }, "Meeting cancelled");
  }

  // ===========================================================================
  // MEETING SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Start a meeting
   */
  async startMeeting(meetingId: string, hostId: string): Promise<Meeting> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (meeting.hostId !== hostId) {
      throw new Error("Only the host can start the meeting");
    }

    if (meeting.status === "in_progress") {
      throw new Error("Meeting already in progress");
    }

    meeting.status = "in_progress";
    meeting.actualStart = new Date();
    meeting.updatedAt = new Date();

    // Initialize active meeting state
    const activeMeeting: ActiveMeeting = {
      meeting,
      webrtcState: {
        offers: new Map(),
        answers: new Map(),
        iceCandidates: new Map(),
      },
      liveTranscription: [],
      screenSharers: [],
      raisedHands: [],
      reactions: [],
    };

    this.activeMeetings.set(meetingId, activeMeeting);

    // Start auto-recording if enabled
    if (meeting.settings.autoRecording) {
      await this.startRecording(meetingId, hostId);
    }

    this.emit("meeting:started", { meetingId, startedAt: meeting.actualStart });
    log.info({ meetingId }, "Meeting started");

    return meeting;
  }

  /**
   * End a meeting
   */
  async endMeeting(meetingId: string, enderId: string): Promise<Meeting> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    // Check if ender has permission (host or co-host)
    const isHost = meeting.hostId === enderId;
    const isCoHost = meeting.participants.some(
      p => p.oderId === enderId && p.role === "co_host"
    );

    if (!isHost && !isCoHost) {
      throw new Error("Only host or co-host can end the meeting");
    }

    meeting.status = "ended";
    meeting.actualEnd = new Date();
    meeting.updatedAt = new Date();

    const activeMeeting = this.activeMeetings.get(meetingId);

    // Stop any active recordings
    for (const recording of meeting.recordings) {
      if (recording.status === "recording") {
        await this.stopRecording(meetingId, recording.id, enderId);
      }
    }

    // Calculate duration
    const duration = meeting.actualStart
      ? (meeting.actualEnd.getTime() - meeting.actualStart.getTime()) / 1000
      : 0;

    // Clean up active meeting state
    this.activeMeetings.delete(meetingId);

    this.emit("meeting:ended", {
      meetingId,
      endedAt: meeting.actualEnd,
      duration,
      participantCount: meeting.participants.length,
    });

    log.info({ meetingId, duration, participantCount: meeting.participants.length }, "Meeting ended");

    // Generate summary if enabled
    if (this.config.aiSummaryEnabled && activeMeeting && activeMeeting.liveTranscription.length > 0) {
      this.queueSummaryGeneration(meetingId);
    }

    return meeting;
  }

  /**
   * Join a meeting
   */
  async joinMeeting(
    meetingId: string,
    userId: string,
    userName: string,
    avatar?: string
  ): Promise<{
    meeting: Meeting;
    participant: MeetingParticipant;
    iceServers: RTCIceServer[];
  }> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw new Error("Meeting has ended or was cancelled");
    }

    // Check if meeting is full
    if (meeting.maxParticipants && meeting.participants.length >= meeting.maxParticipants) {
      throw new Error("Meeting is full");
    }

    // Check if user is already in the meeting
    const existingParticipant = meeting.participants.find(p => p.oderId === userId);
    if (existingParticipant) {
      // Rejoin - update joined time
      existingParticipant.joinedAt = new Date();
      existingParticipant.leftAt = undefined;

      return {
        meeting,
        participant: existingParticipant,
        iceServers: this.getIceServers(),
      };
    }

    // Determine role
    const isHost = meeting.hostId === userId;
    const role: MeetingParticipant["role"] = isHost ? "host" : "attendee";

    const participant: MeetingParticipant = {
      id: randomUUID(),
      oderId: userId,
      name: userName,
      avatar,
      role,
      joinedAt: new Date(),
      isVideoEnabled: false,
      isAudioEnabled: false,
      isScreenSharing: false,
      isHandRaised: false,
      connectionQuality: "good",
    };

    meeting.participants.push(participant);

    // If meeting is in waiting status and this is the host, start it
    if (meeting.status === "waiting" && isHost) {
      await this.startMeeting(meetingId, userId);
    }

    this.emit("meeting:participant_joined", { meetingId, participant });
    log.debug({ meetingId, participantId: participant.id, userName }, "Participant joined meeting");

    return {
      meeting,
      participant,
      iceServers: this.getIceServers(),
    };
  }

  /**
   * Leave a meeting
   */
  async leaveMeeting(meetingId: string, userId: string): Promise<void> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const participant = meeting.participants.find(p => p.oderId === userId);
    if (!participant) return;

    participant.leftAt = new Date();
    participant.isVideoEnabled = false;
    participant.isAudioEnabled = false;
    participant.isScreenSharing = false;

    this.emit("meeting:participant_left", {
      meetingId,
      participantId: participant.id,
      userId,
    });

    log.debug({ meetingId, userId }, "Participant left meeting");

    // End meeting if host leaves and no co-host
    if (meeting.hostId === userId) {
      const coHost = meeting.participants.find(
        p => p.role === "co_host" && !p.leftAt
      );

      if (!coHost) {
        // Promote someone to host or end meeting
        const activeParticipant = meeting.participants.find(
          p => p.oderId !== userId && !p.leftAt
        );

        if (activeParticipant) {
          activeParticipant.role = "host";
          meeting.hostId = activeParticipant.oderId;
          this.emit("meeting:host_changed", {
            meetingId,
            newHostId: activeParticipant.oderId,
          });
        } else {
          // No participants left, end meeting
          await this.endMeeting(meetingId, userId);
        }
      }
    }
  }

  /**
   * Update participant status
   */
  async updateParticipant(
    meetingId: string,
    participantId: string,
    updates: Partial<Pick<MeetingParticipant, "isVideoEnabled" | "isAudioEnabled" | "isScreenSharing" | "isHandRaised" | "connectionQuality">>
  ): Promise<MeetingParticipant> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const participant = meeting.participants.find(p => p.id === participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    Object.assign(participant, updates);

    // Track screen sharers
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (activeMeeting) {
      if (updates.isScreenSharing === true) {
        activeMeeting.screenSharers.push(participant.oderId);
      } else if (updates.isScreenSharing === false) {
        activeMeeting.screenSharers = activeMeeting.screenSharers.filter(
          id => id !== participant.oderId
        );
      }
    }

    this.emit("meeting:participant_updated", { meetingId, participant });
    return participant;
  }

  // ===========================================================================
  // WEBRTC SIGNALING
  // ===========================================================================

  /**
   * Get ICE servers configuration
   */
  getIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [];

    // Add STUN servers
    for (const url of this.config.stunServers) {
      servers.push({ urls: url });
    }

    // Add TURN servers
    for (const turn of this.config.turnServers) {
      servers.push({
        urls: turn.urls,
        username: turn.username,
        credential: turn.credential,
      });
    }

    return servers;
  }

  /**
   * Handle WebRTC offer
   */
  async handleOffer(
    meetingId: string,
    fromUserId: string,
    toUserId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (!activeMeeting) {
      throw new Error("Meeting is not active");
    }

    const key = `${fromUserId}:${toUserId}`;
    activeMeeting.webrtcState.offers.set(key, offer);

    this.emit("rtc:offer", { meetingId, fromUserId, toUserId, offer });
  }

  /**
   * Handle WebRTC answer
   */
  async handleAnswer(
    meetingId: string,
    fromUserId: string,
    toUserId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (!activeMeeting) {
      throw new Error("Meeting is not active");
    }

    const key = `${fromUserId}:${toUserId}`;
    activeMeeting.webrtcState.answers.set(key, answer);

    this.emit("rtc:answer", { meetingId, fromUserId, toUserId, answer });
  }

  /**
   * Handle ICE candidate
   */
  async handleIceCandidate(
    meetingId: string,
    fromUserId: string,
    toUserId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (!activeMeeting) {
      throw new Error("Meeting is not active");
    }

    const key = `${fromUserId}:${toUserId}`;
    const candidates = activeMeeting.webrtcState.iceCandidates.get(key) || [];
    candidates.push(candidate);
    activeMeeting.webrtcState.iceCandidates.set(key, candidates);

    this.emit("rtc:ice_candidate", { meetingId, fromUserId, toUserId, candidate });
  }

  // ===========================================================================
  // RECORDING
  // ===========================================================================

  /**
   * Start recording
   */
  async startRecording(
    meetingId: string,
    recorderId: string,
    type: MeetingRecording["type"] = "combined"
  ): Promise<MeetingRecording> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (!meeting.settings.recordingEnabled) {
      throw new Error("Recording is not enabled for this meeting");
    }

    const id = randomUUID();
    const now = new Date();

    const recording: MeetingRecording = {
      id,
      meetingId,
      type,
      url: `${this.config.recordingStoragePath}/${meetingId}/${id}`,
      size: 0,
      duration: 0,
      format: "webm",
      resolution: type === "audio" ? undefined : "1920x1080",
      startedAt: now,
      endedAt: now,  // Will be updated when stopped
      recordedBy: recorderId,
      status: "recording",
    };

    meeting.recordings.push(recording);
    this.recordings.set(id, recording);

    this.emit("meeting:recording_started", { meetingId, recording });
    log.info({ meetingId, recordingId: id, type }, "Recording started");

    return recording;
  }

  /**
   * Stop recording
   */
  async stopRecording(
    meetingId: string,
    recordingId: string,
    stopperId: string
  ): Promise<MeetingRecording> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    if (recording.status !== "recording") {
      throw new Error("Recording is not active");
    }

    recording.status = "processing";
    recording.endedAt = new Date();
    recording.duration = (recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000;

    this.emit("meeting:recording_stopped", { meetingId, recordingId, stopperId });
    log.info({ meetingId, recordingId, duration: recording.duration }, "Recording stopped");

    // Simulate processing
    setTimeout(() => {
      recording.status = "ready";
      recording.size = Math.round(recording.duration * 100000);  // Rough estimate
      this.emit("meeting:recording_ready", { meetingId, recording });
    }, 5000);

    return recording;
  }

  /**
   * Get meeting recordings
   */
  async getMeetingRecordings(meetingId: string): Promise<MeetingRecording[]> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    return meeting.recordings;
  }

  // ===========================================================================
  // LIVE TRANSCRIPTION
  // ===========================================================================

  /**
   * Add transcription segment (from live transcription)
   */
  async addTranscriptionSegment(
    meetingId: string,
    segment: Omit<TranscriptionSegment, "id">
  ): Promise<TranscriptionSegment> {
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (!activeMeeting) {
      throw new Error("Meeting is not active");
    }

    const fullSegment: TranscriptionSegment = {
      ...segment,
      id: activeMeeting.liveTranscription.length,
    };

    activeMeeting.liveTranscription.push(fullSegment);

    this.emit("meeting:transcription_update", { meetingId, segment: fullSegment });

    return fullSegment;
  }

  /**
   * Get meeting transcription
   */
  async getMeetingTranscription(meetingId: string): Promise<MeetingTranscription | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;

    // For ended meetings, return stored transcription
    if (meeting.transcription) {
      return meeting.transcription;
    }

    // For active meetings, construct from live transcription
    const activeMeeting = this.activeMeetings.get(meetingId);
    if (activeMeeting && activeMeeting.liveTranscription.length > 0) {
      return this.buildTranscriptionFromSegments(meetingId, activeMeeting.liveTranscription);
    }

    return null;
  }

  /**
   * Build transcription object from segments
   */
  private buildTranscriptionFromSegments(
    meetingId: string,
    segments: TranscriptionSegment[]
  ): MeetingTranscription {
    const text = segments.map(s => s.text).join(" ");
    const speakers = this.extractSpeakers(segments);
    const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

    return {
      id: randomUUID(),
      recordingId: "",
      meetingId,
      text,
      segments,
      speakers,
      language: "en",
      duration,
      processedAt: new Date(),
    };
  }

  /**
   * Extract speaker information from segments
   */
  private extractSpeakers(segments: TranscriptionSegment[]): SpeakerInfo[] {
    const speakerMap = new Map<string, SpeakerInfo>();

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const speakerId = segment.speaker || "unknown";

      if (!speakerMap.has(speakerId)) {
        speakerMap.set(speakerId, {
          id: speakerId,
          label: speakerId,
          speakingTime: 0,
          wordCount: 0,
          segments: [],
        });
      }

      const speaker = speakerMap.get(speakerId)!;
      speaker.speakingTime += segment.end - segment.start;
      speaker.wordCount += segment.text.split(/\s+/).length;
      speaker.segments.push(i);
    }

    return Array.from(speakerMap.values());
  }

  // ===========================================================================
  // AI SUMMARY GENERATION
  // ===========================================================================

  /**
   * Queue summary generation for a meeting
   */
  private queueSummaryGeneration(meetingId: string): void {
    const job: SummaryGenerationJob = {
      meetingId,
      status: "pending",
      progress: 0,
    };

    this.summaryJobs.set(meetingId, job);

    // Process in background
    this.processSummaryGeneration(meetingId);
  }

  /**
   * Process summary generation
   */
  private async processSummaryGeneration(meetingId: string): Promise<void> {
    const job = this.summaryJobs.get(meetingId);
    if (!job) return;

    const meeting = this.meetings.get(meetingId);
    if (!meeting) return;

    const transcription = await this.getMeetingTranscription(meetingId);
    if (!transcription) return;

    try {
      job.status = "processing";
      job.startedAt = new Date();

      // Generate summary using AI
      const summary = await this.generateAISummary(meeting, transcription);

      // Store summary
      meeting.summary = summary;
      this.summaries.set(meetingId, summary);

      // Extract action items
      const actionItems = await this.extractActionItems(meeting, transcription);
      this.actionItems.set(meetingId, actionItems);

      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date();

      this.emit("meeting:summary_ready", { meetingId, summary, actionItems });
      log.info({ meetingId }, "Meeting summary generated");
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      log.error({ meetingId, error: job.error }, "Summary generation failed");
    }
  }

  /**
   * Generate AI summary for a meeting
   */
  private async generateAISummary(
    meeting: Meeting,
    transcription: MeetingTranscription
  ): Promise<MeetingSummary> {
    // In production, this would call the AI service
    // For now, we generate a mock summary

    const participants = transcription.speakers.map(speaker => ({
      userId: speaker.userId || speaker.id,
      name: speaker.userName || speaker.label,
      contributions: [`Spoke for ${Math.round(speaker.speakingTime)} seconds`],
    }));

    // Extract key points from transcription
    const sentences = transcription.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keyPoints = sentences.slice(0, 5).map(s => s.trim());

    // Mock topics
    const topics = [
      {
        name: "Project Updates",
        duration: transcription.duration * 0.4,
        summary: "Discussion of current project status and milestones.",
      },
      {
        name: "Action Items",
        duration: transcription.duration * 0.3,
        summary: "Review of pending tasks and new assignments.",
      },
      {
        name: "General Discussion",
        duration: transcription.duration * 0.3,
        summary: "Open discussion and Q&A.",
      },
    ];

    return {
      id: randomUUID(),
      meetingId: meeting.id,
      title: meeting.title,
      overview: `Meeting "${meeting.title}" lasted ${Math.round(transcription.duration / 60)} minutes with ${participants.length} participants. The discussion covered project updates, action items, and general topics.`,
      keyPoints,
      decisions: ["Continue with current approach", "Schedule follow-up meeting"],
      actionItems: [],  // Will be populated separately
      participants,
      topics,
      sentiment: "neutral",
      generatedAt: new Date(),
      model: `${this.config.aiModelProvider}/${this.config.aiModelName}`,
    };
  }

  /**
   * Extract action items from meeting transcription
   */
  private async extractActionItems(
    meeting: Meeting,
    transcription: MeetingTranscription
  ): Promise<ActionItem[]> {
    // In production, this would use NLP/AI to extract action items
    // For now, we look for common action patterns

    const actionItems: ActionItem[] = [];
    const actionPatterns = [
      /(?:I will|I'll|we will|we'll|should|need to|have to|must)\s+(.+)/gi,
      /action item[:\s]+(.+)/gi,
      /task[:\s]+(.+)/gi,
      /(?:assigned to|assign to)\s+(\w+)[:\s]+(.+)/gi,
    ];

    for (const segment of transcription.segments) {
      for (const pattern of actionPatterns) {
        const matches = segment.text.matchAll(pattern);
        for (const match of matches) {
          actionItems.push({
            id: randomUUID(),
            meetingId: meeting.id,
            title: match[1]?.substring(0, 100) || segment.text.substring(0, 100),
            description: segment.text,
            priority: "medium",
            status: "pending",
            source: {
              timestamp: segment.start,
              transcriptSegmentId: segment.id,
              quote: segment.text,
            },
            createdAt: new Date(),
          });
          break;  // One action per segment
        }
      }
    }

    return actionItems.slice(0, 10);  // Limit to 10 items
  }

  /**
   * Get meeting summary
   */
  async getMeetingSummary(meetingId: string): Promise<MeetingSummary | null> {
    return this.summaries.get(meetingId) || null;
  }

  /**
   * Get meeting action items
   */
  async getMeetingActionItems(meetingId: string): Promise<ActionItem[]> {
    return this.actionItems.get(meetingId) || [];
  }

  /**
   * Update action item status
   */
  async updateActionItem(
    meetingId: string,
    actionItemId: string,
    updates: Partial<Pick<ActionItem, "status" | "assigneeId" | "assigneeName" | "dueDate" | "priority">>
  ): Promise<ActionItem | null> {
    const items = this.actionItems.get(meetingId);
    if (!items) return null;

    const item = items.find(i => i.id === actionItemId);
    if (!item) return null;

    Object.assign(item, updates);
    return item;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Generate join URL for a meeting
   */
  private generateJoinUrl(meetingId: string): string {
    const baseUrl = process.env.APP_URL || "http://localhost:5000";
    return `${baseUrl}/meeting/${meetingId}`;
  }

  /**
   * Check if a user can join a meeting
   */
  async canJoinMeeting(meetingId: string, userId: string): Promise<{
    canJoin: boolean;
    reason?: string;
    requiresPassword?: boolean;
    inWaitingRoom?: boolean;
  }> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      return { canJoin: false, reason: "Meeting not found" };
    }

    if (meeting.status === "ended") {
      return { canJoin: false, reason: "Meeting has ended" };
    }

    if (meeting.status === "cancelled") {
      return { canJoin: false, reason: "Meeting was cancelled" };
    }

    if (meeting.maxParticipants && meeting.participants.length >= meeting.maxParticipants) {
      return { canJoin: false, reason: "Meeting is full" };
    }

    // Check if user is invited (if authentication required)
    if (meeting.settings.requireAuthentication) {
      const isInvited = meeting.invitedUserIds.includes(userId) || meeting.hostId === userId;
      if (!isInvited) {
        return { canJoin: false, reason: "You are not invited to this meeting" };
      }
    }

    return {
      canJoin: true,
      requiresPassword: !!meeting.settings.password,
      inWaitingRoom: meeting.settings.waitingRoomEnabled && meeting.hostId !== userId,
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    // End all active meetings
    for (const [meetingId, activeMeeting] of this.activeMeetings) {
      this.endMeeting(meetingId, activeMeeting.meeting.hostId).catch(() => {});
    }

    this.removeAllListeners();
    this.meetings.clear();
    this.activeMeetings.clear();
    this.recordings.clear();
    this.summaries.clear();
    this.actionItems.clear();
    this.summaryJobs.clear();

    log.info("Meeting Service shut down");
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let meetingServiceInstance: MeetingService | null = null;

export function getMeetingService(): MeetingService | null {
  return meetingServiceInstance;
}

export function initMeetingService(config?: MeetingServiceConfig): MeetingService {
  if (meetingServiceInstance) {
    log.warn("Meeting Service already initialized");
    return meetingServiceInstance;
  }

  meetingServiceInstance = new MeetingService(config);
  return meetingServiceInstance;
}

export function shutdownMeetingService(): void {
  if (meetingServiceInstance) {
    meetingServiceInstance.shutdown();
    meetingServiceInstance = null;
  }
}
