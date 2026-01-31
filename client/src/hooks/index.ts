/**
 * @file index.ts
 * @description Central export for all custom hooks.
 * @phase Phase 4 - UI/UX Improvements
 */

// Config and data hooks
export { useConfigs, useConfig, useCreateConfig, useUpdateConfig, useDeleteConfig } from "./use-configs";
export { usePreview } from "./use-preview";
export { useToast } from "./use-toast";

// Workbench hooks (Phase 8)
export {
  useAutolinkProject,
  useWorkbenchScan,
  useBulkAutolink,
  type AutolinkInput,
  type AutolinkResponse,
  type ScanInput,
  type ScanResponse,
  type BulkAutolinkInput,
  type BulkAutolinkResponse,
} from "./use-autolink";

// WebSocket hooks
export {
  useWebSocket,
  useWSMessages,
  useProjectEvents,
  useScanProgress,
  type WSMessage,
  type WSConnectionState,
  type UseWebSocketOptions,
  type UseWebSocketReturn,
} from "./use-websocket";

// Keyboard hooks
export {
  useKeyboardShortcut,
  useKeyboardShortcuts,
  formatShortcut,
  registerGlobalShortcuts,
  getGlobalShortcuts,
  type KeyModifiers,
  type KeyboardShortcut,
} from "./use-keyboard";

// State management hooks
export {
  useUnsavedChanges,
  useNavigationGuard,
  useFieldChanges,
  type UseUnsavedChangesOptions,
  type UseUnsavedChangesReturn,
} from "./use-unsaved-changes";

// Storage hooks
export { useLocalStorage, useSessionStorage } from "./use-local-storage";

// UI hooks
export { useIsMobile } from "./use-mobile";

// Learning hooks
export { useLearning } from "./use-learning";

// AI Copilot hooks (Phase 6 - AI-Enhanced UX)
export {
  useAICopilot,
  useAIExplainer,
  useVoiceInput,
  type Suggestion,
  type SuggestionType,
  type NLIntent,
  type NLParseResult,
  type CopilotContext,
  type CopilotState,
  type ExpertiseLevel,
  type UserBehaviorModel,
} from "./use-ai-copilot";

// Adaptive UI hooks (Phase 6 - AI-Enhanced UX)
export {
  useAdaptiveUI,
  usePredictiveNavigation,
  useAdaptiveForm,
  usePersonalizedShortcuts,
  type UserPreferences,
  type NavigationPrediction,
  type ShortcutSuggestion,
  type FormAdaptation,
  type TemporalContext,
  type AdaptiveUIState,
} from "./use-adaptive-ui";

// Collaboration hooks (Phase 6 - AI-Enhanced UX)
export {
  useCollaboration,
  useCommentThread,
  usePresenceIndicators,
  useMultiplayerCursors,
  type UserPresence,
  type Position,
  type Range,
  type RemoteCursor,
  type Comment,
  type Conflict,
  type Resolution,
  type CollaborationState,
} from "./use-collaboration";

// Accessibility hooks (Phase 6 - WCAG 2.2 AAA)
export {
  useAccessibility,
  useLiveRegion,
  useFocusManagement,
  useFocusTrap,
  useRovingTabindex,
  useSkipLinks,
  useAccessibleDescription,
  useErrorAnnouncement,
  AccessibilityProvider,
  useAccessibilityContext,
  type AccessibilityPreferences,
  type Announcement,
  type FocusHistoryEntry,
  type NavigationDirection,
  type RovingTabindexConfig,
} from "./use-accessibility";

// Taxonomy hooks (CMS Transformation)
export {
  // Vocabulary hooks
  useVocabularies,
  useVocabulary,
  useSyncVocabularies,
  // Term hooks
  useTerms,
  useTermTree,
  useTerm,
  useTermSearch,
  // Classification hooks
  useClassify,
  useBatchClassify,
  useScanAndClassify,
  useCreateReclassificationPlan,
  useExecuteReclassificationPlan,
  // Content hooks
  useContentByTerm,
  // Stats hooks
  useTaxonomyStats,
  useVocabularyStats,
  // Init hook
  useInitTaxonomy,
  // Combined hook
  useTaxonomy,
  // Types
  type VocabularyWithStats,
  type TermListOptions,
  type TermTreeNode,
  type TaxonomyStats,
  type VocabularyStats,
} from "./use-taxonomy";
