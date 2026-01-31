/**
 * @file use-collaboration.ts
 * @description Real-time collaboration system with presence awareness, multiplayer cursors,
 * comments, and conflict resolution.
 * @phase Phase 6 - AI-Enhanced UX
 * @author UX (UX Design Expert Agent)
 * @created 2026-02-01
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useWebSocket, type WSMessage } from "./use-websocket";

// =============================================================================
// Types
// =============================================================================

/**
 * User presence information.
 */
export interface UserPresence {
  userId: string;
  displayName: string;
  avatar?: string;
  color: string;
  status: "active" | "idle" | "away";
  location: {
    view: string;
    file?: string;
    cursor?: Position;
    selection?: Range;
  };
  lastActivity: Date;
}

/**
 * Position in a document.
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Range in a document.
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Remote cursor information.
 */
export interface RemoteCursor {
  userId: string;
  displayName: string;
  color: string;
  position: Position;
  selection?: Range;
  timestamp: Date;
}

/**
 * Comment on a document.
 */
export interface Comment {
  id: string;
  author: {
    userId: string;
    displayName: string;
    avatar?: string;
  };
  content: string;
  mentions: Mention[];
  attachedTo: {
    type: "line" | "range" | "file" | "element";
    target: string | Range;
  };
  thread: Comment[];
  reactions: Reaction[];
  status: "open" | "resolved";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mention in a comment.
 */
export interface Mention {
  userId: string;
  displayName: string;
  position: { start: number; end: number };
}

/**
 * Reaction to a comment.
 */
export interface Reaction {
  emoji: string;
  users: string[];
}

/**
 * Edit conflict information.
 */
export interface Conflict {
  id: string;
  location: Range;
  type: "content" | "delete" | "structure";
  localChange: Change;
  remoteChange: Change;
  baseContent: string;
  suggestedResolution?: Resolution;
}

/**
 * A document change.
 */
export interface Change {
  author: string;
  timestamp: Date;
  type: "insert" | "delete" | "replace";
  content: string;
  position: Position;
}

/**
 * Conflict resolution strategy.
 */
export type Resolution =
  | { type: "accept-local" }
  | { type: "accept-remote" }
  | { type: "merge"; content: string }
  | { type: "custom"; content: string };

/**
 * Document version information.
 */
export interface Version {
  id: string;
  number: string;
  author: string;
  timestamp: Date;
  summary: string;
  changes: Change[];
}

/**
 * Collaboration session state.
 */
export interface CollaborationState {
  isConnected: boolean;
  sessionId: string | null;
  currentUser: UserPresence | null;
  users: UserPresence[];
  cursors: RemoteCursor[];
  comments: Comment[];
  conflicts: Conflict[];
  versions: Version[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generates a unique color for a user based on their ID.
 */
function generateUserColor(userId: string): string {
  const colors = [
    "#FF6B6B", // Red
    "#4ECDC4", // Teal
    "#45B7D1", // Blue
    "#96CEB4", // Green
    "#FFEAA7", // Yellow
    "#DDA0DD", // Plum
    "#98D8C8", // Mint
    "#F7DC6F", // Gold
    "#BB8FCE", // Purple
    "#85C1E9", // Light Blue
  ];

  // Hash the user ID to get a consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Generates a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parses mentions from comment content.
 */
function parseMentions(content: string): Mention[] {
  const mentions: Mention[] = [];
  const regex = /@(\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    mentions.push({
      userId: match[1],
      displayName: match[1],
      position: { start: match.index, end: match.index + match[0].length },
    });
  }

  return mentions;
}

/**
 * Suggests a merge resolution for a conflict.
 */
function suggestMergeResolution(conflict: Conflict): Resolution | null {
  const { localChange, remoteChange, baseContent } = conflict;

  // Simple merge: if changes are on different lines, merge them
  if (localChange.position.line !== remoteChange.position.line) {
    const merged = localChange.position.line < remoteChange.position.line
      ? `${localChange.content}\n${remoteChange.content}`
      : `${remoteChange.content}\n${localChange.content}`;

    return { type: "merge", content: merged };
  }

  // If both are inserts at different columns, try to merge
  if (localChange.type === "insert" && remoteChange.type === "insert") {
    if (localChange.position.column !== remoteChange.position.column) {
      const merged = localChange.position.column < remoteChange.position.column
        ? `${localChange.content}${remoteChange.content}`
        : `${remoteChange.content}${localChange.content}`;

      return { type: "merge", content: merged };
    }
  }

  return null;
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Collaboration hook for real-time multi-user editing.
 */
export function useCollaboration(documentId?: string) {
  // WebSocket connection
  const {
    state: wsState,
    clientId,
    lastMessage,
    send,
    subscribe,
    unsubscribe,
  } = useWebSocket({
    channels: documentId ? [`doc:${documentId}`] : [],
    autoReconnect: true,
  });

  // Local state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);

  // Current user
  const [currentUser, setCurrentUser] = useState<UserPresence | null>(null);

  // Refs for tracking
  const cursorUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCursorPositionRef = useRef<Position | null>(null);

  // Initialize current user
  useEffect(() => {
    if (clientId && !currentUser) {
      const user: UserPresence = {
        userId: clientId,
        displayName: `User ${clientId.substring(0, 6)}`,
        color: generateUserColor(clientId),
        status: "active",
        location: { view: "editor" },
        lastActivity: new Date(),
      };
      setCurrentUser(user);
    }
  }, [clientId, currentUser]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as WSMessage & { data?: unknown };

    switch (msg.type) {
      case "presence:update": {
        const presence = msg.data as UserPresence;
        setUsers(prev => {
          const existing = prev.findIndex(u => u.userId === presence.userId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = presence;
            return updated;
          }
          return [...prev, presence];
        });
        break;
      }

      case "presence:leave": {
        const { userId } = msg.data as { userId: string };
        setUsers(prev => prev.filter(u => u.userId !== userId));
        setCursors(prev => prev.filter(c => c.userId !== userId));
        break;
      }

      case "cursor:update": {
        const cursor = msg.data as RemoteCursor;
        if (cursor.userId !== clientId) {
          setCursors(prev => {
            const existing = prev.findIndex(c => c.userId === cursor.userId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = cursor;
              return updated;
            }
            return [...prev, cursor];
          });
        }
        break;
      }

      case "comment:add": {
        const comment = msg.data as Comment;
        setComments(prev => [...prev, comment]);
        break;
      }

      case "comment:update": {
        const comment = msg.data as Comment;
        setComments(prev =>
          prev.map(c => c.id === comment.id ? comment : c)
        );
        break;
      }

      case "comment:delete": {
        const { commentId } = msg.data as { commentId: string };
        setComments(prev => prev.filter(c => c.id !== commentId));
        break;
      }

      case "conflict:detected": {
        const conflict = msg.data as Conflict;
        setConflicts(prev => [...prev, conflict]);
        break;
      }

      case "conflict:resolved": {
        const { conflictId } = msg.data as { conflictId: string };
        setConflicts(prev => prev.filter(c => c.id !== conflictId));
        break;
      }

      case "version:created": {
        const version = msg.data as Version;
        setVersions(prev => [version, ...prev]);
        break;
      }
    }
  }, [lastMessage, clientId]);

  /**
   * Joins a collaboration session.
   */
  const joinSession = useCallback((docId: string) => {
    const newSessionId = generateId();
    setSessionId(newSessionId);
    subscribe([`doc:${docId}`]);

    if (currentUser) {
      send({
        type: "presence:join",
        sessionId: newSessionId,
        documentId: docId,
        user: currentUser,
      });
    }
  }, [subscribe, send, currentUser]);

  /**
   * Leaves the current session.
   */
  const leaveSession = useCallback(() => {
    if (sessionId && currentUser) {
      send({
        type: "presence:leave",
        sessionId,
        userId: currentUser.userId,
      });
      unsubscribe([`doc:${documentId}`]);
      setSessionId(null);
      setUsers([]);
      setCursors([]);
    }
  }, [sessionId, currentUser, send, unsubscribe, documentId]);

  /**
   * Updates the current user's cursor position.
   * Debounced to avoid flooding the server.
   */
  const updateCursor = useCallback((position: Position, selection?: Range) => {
    if (!currentUser || !sessionId) return;

    // Debounce cursor updates
    if (cursorUpdateTimeoutRef.current) {
      clearTimeout(cursorUpdateTimeoutRef.current);
    }

    lastCursorPositionRef.current = position;

    cursorUpdateTimeoutRef.current = setTimeout(() => {
      send({
        type: "cursor:update",
        sessionId,
        cursor: {
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          color: currentUser.color,
          position,
          selection,
          timestamp: new Date(),
        },
      });
    }, 50); // 50ms debounce
  }, [currentUser, sessionId, send]);

  /**
   * Updates the current user's presence status.
   */
  const updatePresence = useCallback((updates: Partial<UserPresence>) => {
    if (!currentUser || !sessionId) return;

    const updatedUser: UserPresence = {
      ...currentUser,
      ...updates,
      lastActivity: new Date(),
    };

    setCurrentUser(updatedUser);

    send({
      type: "presence:update",
      sessionId,
      user: updatedUser,
    });
  }, [currentUser, sessionId, send]);

  /**
   * Adds a new comment.
   */
  const addComment = useCallback((
    content: string,
    attachedTo: Comment["attachedTo"]
  ): Comment | null => {
    if (!currentUser || !sessionId) return null;

    const comment: Comment = {
      id: generateId(),
      author: {
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
      },
      content,
      mentions: parseMentions(content),
      attachedTo,
      thread: [],
      reactions: [],
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setComments(prev => [...prev, comment]);

    send({
      type: "comment:add",
      sessionId,
      comment,
    });

    return comment;
  }, [currentUser, sessionId, send]);

  /**
   * Replies to a comment.
   */
  const replyToComment = useCallback((
    parentId: string,
    content: string
  ): Comment | null => {
    if (!currentUser || !sessionId) return null;

    const reply: Comment = {
      id: generateId(),
      author: {
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
      },
      content,
      mentions: parseMentions(content),
      attachedTo: { type: "element", target: parentId },
      thread: [],
      reactions: [],
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setComments(prev =>
      prev.map(c => {
        if (c.id === parentId) {
          return { ...c, thread: [...c.thread, reply], updatedAt: new Date() };
        }
        return c;
      })
    );

    send({
      type: "comment:reply",
      sessionId,
      parentId,
      reply,
    });

    return reply;
  }, [currentUser, sessionId, send]);

  /**
   * Resolves a comment.
   */
  const resolveComment = useCallback((commentId: string) => {
    if (!sessionId) return;

    setComments(prev =>
      prev.map(c => {
        if (c.id === commentId) {
          return { ...c, status: "resolved", updatedAt: new Date() };
        }
        return c;
      })
    );

    send({
      type: "comment:resolve",
      sessionId,
      commentId,
    });
  }, [sessionId, send]);

  /**
   * Adds a reaction to a comment.
   */
  const addReaction = useCallback((commentId: string, emoji: string) => {
    if (!currentUser || !sessionId) return;

    setComments(prev =>
      prev.map(c => {
        if (c.id === commentId) {
          const existingReaction = c.reactions.find(r => r.emoji === emoji);
          if (existingReaction) {
            if (!existingReaction.users.includes(currentUser.userId)) {
              existingReaction.users.push(currentUser.userId);
            }
          } else {
            c.reactions.push({ emoji, users: [currentUser.userId] });
          }
          return { ...c, updatedAt: new Date() };
        }
        return c;
      })
    );

    send({
      type: "comment:react",
      sessionId,
      commentId,
      emoji,
      userId: currentUser.userId,
    });
  }, [currentUser, sessionId, send]);

  /**
   * Resolves a conflict with a chosen resolution.
   */
  const resolveConflict = useCallback((
    conflictId: string,
    resolution: Resolution
  ) => {
    if (!sessionId) return;

    setConflicts(prev => prev.filter(c => c.id !== conflictId));

    send({
      type: "conflict:resolve",
      sessionId,
      conflictId,
      resolution,
    });
  }, [sessionId, send]);

  /**
   * Gets a suggested resolution for a conflict.
   */
  const getSuggestedResolution = useCallback((conflictId: string): Resolution | null => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return null;

    return suggestMergeResolution(conflict);
  }, [conflicts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cursorUpdateTimeoutRef.current) {
        clearTimeout(cursorUpdateTimeoutRef.current);
      }
      leaveSession();
    };
  }, [leaveSession]);

  // State object
  const state: CollaborationState = useMemo(() => ({
    isConnected: wsState === "connected",
    sessionId,
    currentUser,
    users,
    cursors,
    comments,
    conflicts,
    versions,
  }), [wsState, sessionId, currentUser, users, cursors, comments, conflicts, versions]);

  return {
    // State
    state,
    isConnected: wsState === "connected",
    sessionId,
    currentUser,
    users,
    cursors,
    comments,
    conflicts,
    versions,

    // Session management
    joinSession,
    leaveSession,

    // Presence
    updatePresence,
    updateCursor,

    // Comments
    addComment,
    replyToComment,
    resolveComment,
    addReaction,

    // Conflicts
    resolveConflict,
    getSuggestedResolution,
  };
}

/**
 * Hook for comment threads.
 */
export function useCommentThread(commentId: string) {
  const {
    comments,
    replyToComment,
    resolveComment,
    addReaction,
  } = useCollaboration();

  const thread = useMemo(() => {
    return comments.find(c => c.id === commentId) || null;
  }, [comments, commentId]);

  const reply = useCallback((content: string) => {
    return replyToComment(commentId, content);
  }, [commentId, replyToComment]);

  const resolve = useCallback(() => {
    resolveComment(commentId);
  }, [commentId, resolveComment]);

  const react = useCallback((emoji: string) => {
    addReaction(commentId, emoji);
  }, [commentId, addReaction]);

  return {
    thread,
    replies: thread?.thread || [],
    reactions: thread?.reactions || [],
    isResolved: thread?.status === "resolved",
    reply,
    resolve,
    react,
  };
}

/**
 * Hook for presence indicators.
 */
export function usePresenceIndicators() {
  const { users, currentUser, isConnected } = useCollaboration();

  const otherUsers = useMemo(() => {
    if (!currentUser) return users;
    return users.filter(u => u.userId !== currentUser.userId);
  }, [users, currentUser]);

  const activeUsers = useMemo(() => {
    return otherUsers.filter(u => u.status === "active");
  }, [otherUsers]);

  const idleUsers = useMemo(() => {
    return otherUsers.filter(u => u.status === "idle");
  }, [otherUsers]);

  const awayUsers = useMemo(() => {
    return otherUsers.filter(u => u.status === "away");
  }, [otherUsers]);

  return {
    isConnected,
    totalUsers: otherUsers.length + (currentUser ? 1 : 0),
    otherUsers,
    activeUsers,
    idleUsers,
    awayUsers,
    currentUser,
  };
}

/**
 * Hook for multiplayer cursors in the editor.
 */
export function useMultiplayerCursors() {
  const { cursors, updateCursor, currentUser } = useCollaboration();

  const remoteCursors = useMemo(() => {
    if (!currentUser) return cursors;
    return cursors.filter(c => c.userId !== currentUser.userId);
  }, [cursors, currentUser]);

  const setCursorPosition = useCallback((line: number, column: number, selection?: Range) => {
    updateCursor({ line, column }, selection);
  }, [updateCursor]);

  return {
    remoteCursors,
    setCursorPosition,
    cursorColors: remoteCursors.map(c => ({ userId: c.userId, color: c.color })),
  };
}

export default useCollaboration;
