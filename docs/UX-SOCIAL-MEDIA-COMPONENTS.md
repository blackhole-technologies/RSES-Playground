# Social Media Integration Component Specifications

This document provides detailed component specifications for implementing the Social Media Integration UX design for RSES CMS.

---

## Table of Contents

1. [PlatformConnectionCard](#1-platformconnectioncard)
2. [SocialAccountManager](#2-socialaccountmanager)
3. [MultiPlatformComposer](#3-multiplatformcomposer)
4. [PlatformPreview](#4-platformpreview)
5. [CharacterLimitIndicator](#5-characterlimitindicator)
6. [MediaCompatibilityPanel](#6-mediacompatibilitypanel)
7. [HashtagSuggester](#7-hashtagsuggester)
8. [ContentCalendar](#8-contentcalendar)
9. [SchedulePicker](#9-schedulepicker)
10. [ApprovalWorkflowPanel](#10-approvalworkflowpanel)
11. [AnalyticsDashboard](#11-analyticsdashboard)
12. [EngagementChart](#12-engagementchart)
13. [BestTimeHeatmap](#13-besttimeheatmap)
14. [CompetitorTracker](#14-competitortracker)
15. [ContentRecycler](#15-contentrecycler)

---

## 1. PlatformConnectionCard

A card component for displaying and managing individual platform connections.

### Props Interface

```typescript
interface PlatformConnectionCardProps {
  platform: Platform;
  connection?: PlatformConnection;
  onConnect: () => void;
  onDisconnect: () => void;
  onSettings: () => void;
  loading?: boolean;
}

interface Platform {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description?: string;
  features: string[];
}

interface PlatformConnection {
  id: string;
  platformId: string;
  account: {
    id: string;
    handle: string;
    name: string;
    avatar?: string;
    type: 'personal' | 'business' | 'creator';
  };
  status: 'active' | 'expired' | 'error';
  lastSynced: Date;
  permissions: string[];
}
```

### Visual States

**Disconnected:**
```
+---------------------------+
|  [Platform Icon]          |
|  Platform Name            |
|                           |
|  Connect to start         |
|  publishing               |
|                           |
|  [Connect]                |
+---------------------------+
```

**Connected:**
```
+---------------------------+
|  [Platform Icon]          |
|  Platform Name            |
|  @handle                  |
|                           |
|  [Connected] Last sync:   |
|             2 min ago     |
|                           |
|  [Settings] [Disconnect]  |
+---------------------------+
```

**Error State:**
```
+---------------------------+
|  [Platform Icon]          |
|  Platform Name            |
|  @handle                  |
|                           |
|  [Error] Token expired    |
|  Please reconnect         |
|                           |
|  [Reconnect] [Remove]     |
+---------------------------+
```

### CSS Styles

```css
.platform-connection-card {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: all var(--transition-base);
}

.platform-connection-card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-md);
}

.platform-connection-card[data-status="connected"] {
  border-left: 4px solid var(--color-success);
}

.platform-connection-card[data-status="error"] {
  border-left: 4px solid var(--color-error);
}

.platform-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.platform-icon--twitter { background: #000000; color: white; }
.platform-icon--facebook { background: #1877F2; color: white; }
.platform-icon--instagram { background: linear-gradient(45deg, #F58529, #DD2A7B, #8134AF); color: white; }
.platform-icon--linkedin { background: #0A66C2; color: white; }
.platform-icon--tiktok { background: #000000; color: white; }
.platform-icon--youtube { background: #FF0000; color: white; }
.platform-icon--pinterest { background: #BD081C; color: white; }
.platform-icon--threads { background: #000000; color: white; }
.platform-icon--mastodon { background: #6364FF; color: white; }
```

---

## 2. SocialAccountManager

Manages multiple accounts for a single platform.

### Props Interface

```typescript
interface SocialAccountManagerProps {
  platform: Platform;
  accounts: PlatformConnection[];
  maxAccounts?: number;
  onAddAccount: () => void;
  onRemoveAccount: (accountId: string) => void;
  onSetPrimary: (accountId: string) => void;
  onViewAnalytics: (accountId: string) => void;
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Twitter/X Accounts                               [+ Add Account]  |
+------------------------------------------------------------------+
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] @company_handle                        [Primary]   |   |
| |          Company Main                                       |   |
| |          Followers: 45.2K | Posts: 2,341                    |   |
| |                                                             |   |
| |          Team: [A][A][A]                                    |   |
| |                                                             |   |
| | [Analytics] [Settings] [Remove]                             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] @company_support                                   |   |
| |          Support Team                                       |   |
| |          Followers: 12.8K | Posts: 8,921                    |   |
| |                                                             |   |
| |          Team: [A][A]                                       |   |
| |                                                             |   |
| | [Analytics] [Settings] [Make Primary] [Remove]              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Account Item Component

```typescript
interface AccountItemProps {
  account: PlatformConnection;
  isPrimary: boolean;
  onRemove: () => void;
  onSetPrimary: () => void;
  onAnalytics: () => void;
  onSettings: () => void;
}
```

---

## 3. MultiPlatformComposer

The main content composition interface for multi-platform posting.

### Props Interface

```typescript
interface MultiPlatformComposerProps {
  mode: 'create' | 'edit' | 'duplicate';
  initialContent?: PostDraft;
  availablePlatforms: PlatformConnection[];
  onSave: (draft: PostDraft) => void;
  onSchedule: (draft: PostDraft, date: Date) => void;
  onPublish: (draft: PostDraft) => void;
  enableAI?: boolean;
  maxMediaFiles?: number;
}

interface PostDraft {
  id?: string;
  baseContent: string;
  platformVariants: Map<string, PlatformVariant>;
  media: MediaAttachment[];
  hashtags: string[];
  mentions: string[];
  link?: string;
  scheduledFor?: Date;
  status: DraftStatus;
  approvalStatus?: ApprovalStatus;
}

interface PlatformVariant {
  platformId: string;
  content: string;
  characterCount: number;
  isWithinLimit: boolean;
  platformOptions: PlatformSpecificOptions;
  media: MediaAttachment[];
  hashtags: string[];
}

type DraftStatus = 'draft' | 'scheduled' | 'pending_approval' | 'approved' | 'published' | 'failed';
```

### Visual Structure

```
+------------------------------------------------------------------+
| Create Post                            [Save Draft] [Schedule]     |
+------------------------------------------------------------------+
|                                                                    |
| PUBLISH TO                                                         |
| +-------------------------------------------------------------+   |
| | [x] Twitter/X  [x] LinkedIn  [x] Instagram  [ ] Facebook    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +---------------------------+----------------------------------+   |
| |                           |                                  |   |
| | COMPOSE                   | PREVIEW                          |   |
| | +-----------------------+ | +------------------------------+ |   |
| | |                       | | |                              | |   |
| | | [Textarea]            | | | [Platform Preview Card]      | |   |
| | |                       | | |                              | |   |
| | +-----------------------+ | +------------------------------+ |   |
| |                           |                                  |   |
| | [Image][Video][GIF][Link] | [Platform Tabs: TW | LI | IN]   |   |
| |                           |                                  |   |
| | CHARACTER LIMITS          |                                  |   |
| | +-----------------------+ |                                  |   |
| | | TW: 142/280  [OK]     | |                                  |   |
| | | LI: 142/3000 [OK]     | |                                  |   |
| | | IN: 142/2200 [OK]     | |                                  |   |
| | +-----------------------+ |                                  |   |
| +---------------------------+----------------------------------+   |
|                                                                    |
| MEDIA                                                              |
| +-------------------------------------------------------------+   |
| | [+ Add Media] [img1.jpg] [img2.png]                         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI SUGGESTIONS                                                     |
| +-------------------------------------------------------------+   |
| | [Lightbulb] Add hashtags: #AI #ContentMarketing             |   |
| | [Clock] Best time: 10:00 AM EST                             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Internal State

```typescript
interface ComposerState {
  baseContent: string;
  selectedPlatforms: Set<string>;
  platformVariants: Map<string, PlatformVariant>;
  media: MediaAttachment[];
  isAISuggesting: boolean;
  validationErrors: ValidationError[];
  isDirty: boolean;
}
```

---

## 4. PlatformPreview

Shows how a post will appear on a specific platform.

### Props Interface

```typescript
interface PlatformPreviewProps {
  platform: Platform;
  account: PlatformConnection;
  content: PlatformVariant;
  media: MediaAttachment[];
  showEngagementEstimate?: boolean;
}
```

### Platform-Specific Previews

**Twitter/X Preview:**
```
+------------------------------+
| [Avatar] Company Name        |
| @company_handle              |
|------------------------------|
|                              |
| Post content here with       |
| #hashtags and @mentions      |
|                              |
| [Image Preview]              |
|                              |
|------------------------------|
| [Comment] [Retweet] [Like]   |
| 2:30 PM - Feb 1, 2026        |
+------------------------------+
```

**LinkedIn Preview:**
```
+------------------------------+
| [Avatar] Company Name        |
| Company description          |
| 2h - [Globe Icon]            |
|------------------------------|
|                              |
| Professional post content    |
| with industry insights.      |
|                              |
| Key points:                  |
| - Point 1                    |
| - Point 2                    |
|                              |
| #Hashtags                    |
|                              |
| [Image Preview]              |
|                              |
|------------------------------|
| [Like] [Comment] [Share]     |
+------------------------------+
```

**Instagram Preview:**
```
+------------------------------+
| [Avatar] company_official    |
|                              |
| +------------------------+   |
| |                        |   |
| |    [Image Preview]     |   |
| |                        |   |
| +------------------------+   |
|                              |
| [Heart] [Comment] [Share]    |
|                              |
| company_official             |
| Caption text here with       |
| #hashtags                    |
|                              |
| View all 24 comments         |
| 2 hours ago                  |
+------------------------------+
```

### CSS Styles

```css
.platform-preview {
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  max-width: 400px;
}

.platform-preview--twitter {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.platform-preview--linkedin {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.platform-preview--instagram {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
}

.preview-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.preview-content {
  padding: var(--space-3);
  line-height: 1.5;
}

.preview-media {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
}

.preview-actions {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-3);
  border-top: 1px solid var(--border-subtle);
}
```

---

## 5. CharacterLimitIndicator

Visual indicator for character limits across platforms.

### Props Interface

```typescript
interface CharacterLimitIndicatorProps {
  platforms: CharacterLimitPlatform[];
  showProgressBars?: boolean;
  compact?: boolean;
  onPlatformClick?: (platformId: string) => void;
}

interface CharacterLimitPlatform {
  id: string;
  name: string;
  icon: React.ComponentType;
  current: number;
  limit: number;
  status: 'ok' | 'warning' | 'error';
}
```

### Visual Variants

**Expanded View:**
```
+------------------------------------------+
| CHARACTER LIMITS                          |
|------------------------------------------|
|                                          |
| Twitter/X  [==================--] 245/280 |
|            [OK] 35 remaining             |
|                                          |
| LinkedIn   [====------------------] 245/3000 |
|            [OK] 2,755 remaining          |
|                                          |
| Instagram  [=======---------------] 245/2200 |
|            [OK] 1,955 remaining          |
|                                          |
+------------------------------------------+
```

**Compact View:**
```
+------------------------------------------+
| TW: 245/280 [OK] | LI: 245/3K [OK] | IN: 245/2.2K [OK] |
+------------------------------------------+
```

### CSS Styles

```css
.character-limit-indicator {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.character-limit-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.character-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--surface-2);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.character-progress-fill {
  height: 100%;
  transition: width var(--transition-base), background var(--transition-base);
}

.character-progress-fill[data-status="ok"] {
  background: var(--color-success);
}

.character-progress-fill[data-status="warning"] {
  background: var(--color-warning);
}

.character-progress-fill[data-status="error"] {
  background: var(--color-error);
}

.character-count {
  font-variant-numeric: tabular-nums;
  min-width: 80px;
  text-align: right;
}
```

---

## 6. MediaCompatibilityPanel

Checks and displays media compatibility across platforms.

### Props Interface

```typescript
interface MediaCompatibilityPanelProps {
  media: MediaFile[];
  selectedPlatforms: Platform[];
  onAutoConvert: (mediaId: string, platform: Platform, options: ConversionOptions) => void;
  onRemoveMedia: (mediaId: string) => void;
  onSkipPlatform: (platformId: string) => void;
}

interface MediaFile {
  id: string;
  file: File;
  url: string;
  type: 'image' | 'video' | 'gif';
  width: number;
  height: number;
  duration?: number;
  size: number;
  format: string;
}

interface CompatibilityCheck {
  platform: Platform;
  status: 'pass' | 'warning' | 'fail';
  checks: {
    dimension: CheckResult;
    size: CheckResult;
    format: CheckResult;
    duration?: CheckResult;
    aspectRatio?: CheckResult;
  };
  suggestions: string[];
  autoFixAvailable: boolean;
}

interface CheckResult {
  passed: boolean;
  message: string;
  current?: string;
  required?: string;
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Media Compatibility                                                |
+------------------------------------------------------------------+
|                                                                    |
| UPLOADED: video.mp4 (45s, 1920x1080, 28MB)                         |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Twitter/X                                          [Pass]   |   |
| | [Check] Duration: 45s / 2:20 max                            |   |
| | [Check] Size: 28MB / 512MB max                              |   |
| | [Check] Resolution: 1920x1080                               |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | TikTok                                             [Warning]|   |
| | [Check] Duration: 45s / 3min max                            |   |
| | [Warning] Aspect Ratio: 16:9 (9:16 recommended)             |   |
| |                                                              |   |
| | [Create Vertical Version] [Post Anyway] [Skip TikTok]       |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | YouTube Shorts                                     [Fail]   |   |
| | [Fail] Aspect Ratio: Must be 9:16 vertical                  |   |
| | [Check] Duration: 45s / 60s max                             |   |
| |                                                              |   |
| | [Create Vertical Version] [Skip YouTube Shorts]             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 7. HashtagSuggester

AI-powered hashtag suggestion component.

### Props Interface

```typescript
interface HashtagSuggesterProps {
  content: string;
  selectedPlatforms: Platform[];
  currentHashtags: string[];
  onAddHashtag: (hashtag: string) => void;
  onRemoveHashtag: (hashtag: string) => void;
  maxHashtags?: number;
  showTrending?: boolean;
  showBrandTags?: boolean;
}

interface HashtagSuggestion {
  tag: string;
  category: 'trending' | 'niche' | 'brand' | 'content';
  popularity: number; // posts per day
  relevanceScore: number; // 0-1
  platforms: string[]; // platforms where this tag is popular
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Hashtag Suggestions                                    [Settings]  |
+------------------------------------------------------------------+
|                                                                    |
| TRENDING NOW                                                       |
| +-------------------------------------------------------------+   |
| | #AI              2.4M/day    [+ Add]                        |   |
| | #ContentCreation 890K/day    [+ Add]                        |   |
| | #SocialMedia     1.2M/day    [+ Add]                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| CONTENT RELEVANT                                                   |
| +-------------------------------------------------------------+   |
| | #ContentManagement  45K/day  [+ Add]                        |   |
| | #MarTech            28K/day  [+ Add]                        |   |
| | #AIMarketing        67K/day  [+ Add]                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| BRAND TAGS                                                         |
| +-------------------------------------------------------------+   |
| | #YourBrand          [+ Add]                                 |   |
| | #YourProduct        [+ Add]                                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| SELECTED (4)                                                       |
| [#AI x] [#ContentManagement x] [#YourBrand x] [#MarTech x]        |
|                                                                    |
| PLATFORM RECOMMENDATIONS                                           |
| Twitter: 2-3 optimal (you: 4)                                      |
| Instagram: 5-10 optimal (you: 4, add more)                         |
| LinkedIn: 3-5 optimal (you: 4)                                     |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 8. ContentCalendar

Full calendar component for content scheduling.

### Props Interface

```typescript
interface ContentCalendarProps {
  view: 'month' | 'week' | 'day' | 'queue';
  currentDate: Date;
  posts: ScheduledPost[];
  filters: CalendarFilters;
  onViewChange: (view: CalendarView) => void;
  onDateChange: (date: Date) => void;
  onPostClick: (post: ScheduledPost) => void;
  onPostDrop: (postId: string, newDate: Date) => Promise<void>;
  onCreatePost: (date: Date, platform?: Platform) => void;
  onFilterChange: (filters: CalendarFilters) => void;
}

interface CalendarFilters {
  platforms: string[];
  authors: string[];
  status: PostStatus[];
  approvalStatus: ApprovalStatus[];
}

interface ScheduledPost {
  id: string;
  title: string;
  content: string;
  platforms: Platform[];
  scheduledFor: Date;
  author: User;
  status: PostStatus;
  approvalStatus?: ApprovalStatus;
  media?: MediaAttachment[];
}
```

### Month View Structure

```
+------------------------------------------------------------------+
| [<] February 2026 [>]                        [Month][Week][Day]    |
+------------------------------------------------------------------+
| Sun | Mon | Tue | Wed | Thu | Fri | Sat                           |
+------------------------------------------------------------------+
|     |     |     |     |     |     |  1  |                         |
|     |     |     |     |     |     |     |                         |
+-----+-----+-----+-----+-----+-----+-----+                         |
|  2  |  3  |  4  |  5  |  6  |  7  |  8  |                         |
|     |[TW] |[TW] |[LI] |[TW] |     |     |                         |
|     |[IN] |     |[TW] |[IN] |     |     |                         |
+-----+-----+-----+-----+-----+-----+-----+                         |
...
```

### Week View Structure

```
+------------------------------------------------------------------+
|        | Mon 10  | Tue 11  | Wed 12  | Thu 13  | Fri 14  |        |
+--------+---------+---------+---------+---------+---------+        |
| 6 AM   |         |         |         |         |         |        |
+--------+---------+---------+---------+---------+---------+        |
| 8 AM   |         |         |         |         |         |        |
+--------+---------+---------+---------+---------+---------+        |
| 10 AM  | [Post1] | [Post2] |         | [Post3] | [Post4] |        |
+--------+---------+---------+---------+---------+---------+        |
| 12 PM  |         | [Post5] | [Post6] |         | [Post7] |        |
+--------+---------+---------+---------+---------+---------+        |
...
```

### CSS Styles

```css
.content-calendar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: 1;
}

.calendar-cell {
  min-height: 120px;
  border: 1px solid var(--border-subtle);
  padding: var(--space-2);
  position: relative;
}

.calendar-cell:hover {
  background: var(--surface-2);
}

.calendar-cell--today {
  background: rgba(var(--color-primary-rgb), 0.1);
}

.calendar-post {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.calendar-post:hover {
  transform: translateX(2px);
}

.calendar-post--twitter { background: rgba(0, 0, 0, 0.1); border-left: 3px solid #000000; }
.calendar-post--linkedin { background: rgba(10, 102, 194, 0.1); border-left: 3px solid #0A66C2; }
.calendar-post--instagram { background: rgba(228, 64, 95, 0.1); border-left: 3px solid #E4405F; }

/* Drag and drop states */
.calendar-cell--drag-over {
  background: rgba(var(--color-primary-rgb), 0.2);
  border: 2px dashed var(--color-primary);
}

.calendar-post--dragging {
  opacity: 0.5;
  transform: scale(1.05);
}
```

---

## 9. SchedulePicker

Time and date picker for scheduling posts.

### Props Interface

```typescript
interface SchedulePickerProps {
  selectedDate?: Date;
  selectedTime?: string;
  timezone: string;
  platforms: Platform[];
  onChange: (date: Date | null, time: string | null) => void;
  showOptimalTimes?: boolean;
  optimalTimes?: OptimalTime[];
  minDate?: Date;
  maxDate?: Date;
}

interface OptimalTime {
  date: Date;
  time: string;
  platform: Platform;
  engagementScore: number; // 0-100
  reason: string;
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Schedule Post                                                      |
+------------------------------------------------------------------+
|                                                                    |
| POST TIMING                                                        |
| ( ) Post Now                                                       |
| (x) Schedule for Later                                             |
| ( ) Add to Queue                                                   |
| ( ) AI Optimal Time                                                |
|                                                                    |
| DATE & TIME                                                        |
| +-------------------------------------------------------------+   |
| | Date: [February 15, 2026     ] [Calendar]                   |   |
| | Time: [10:00 AM              ] [Clock]                      |   |
| | Zone: [America/New_York (EST)]                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI INSIGHTS                                                        |
| +-------------------------------------------------------------+   |
| | [Chart showing engagement by hour]                          |   |
| |                                                              |   |
| | Recommended: 10:00 AM (highest engagement)                   |   |
| | Your selection: 10:00 AM [Optimal]                          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PLATFORM TIMING                                                    |
| +-------------------------------------------------------------+   |
| | [ ] Same time for all                                        |   |
| | [x] Optimize per platform                                    |   |
| |                                                              |   |
| | Twitter/X:  10:00 AM EST                                     |   |
| | LinkedIn:   10:30 AM EST                                     |   |
| | Instagram:  11:00 AM EST                                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 10. ApprovalWorkflowPanel

Displays and manages content approval workflows.

### Props Interface

```typescript
interface ApprovalWorkflowPanelProps {
  post: PostDraft;
  workflow: WorkflowDefinition;
  currentStage: WorkflowStage;
  history: ApprovalAction[];
  currentUser: User;
  onApprove: (comment?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRequestChanges: (feedback: ChangeRequest) => Promise<void>;
  onComment: (comment: string) => Promise<void>;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  stages: WorkflowStage[];
  rules: ApprovalRule[];
}

interface WorkflowStage {
  id: string;
  name: string;
  order: number;
  approvers: User[];
  requiredApprovals: number;
  currentApprovals: number;
}

interface ApprovalAction {
  id: string;
  stage: WorkflowStage;
  user: User;
  action: 'approved' | 'rejected' | 'changes_requested' | 'comment';
  comment?: string;
  timestamp: Date;
}

interface ChangeRequest {
  categories: ChangeCategory[];
  feedback: string;
  priority: 'low' | 'medium' | 'high';
}

type ChangeCategory = 'copy' | 'media' | 'hashtags' | 'timing' | 'platforms' | 'other';
```

### Visual Structure

```
+------------------------------------------------------------------+
| Approval Status                                                    |
+------------------------------------------------------------------+
|                                                                    |
| WORKFLOW: Two-Stage Approval                                       |
|                                                                    |
| STAGES                                                             |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | [1] DRAFT -----> [2] REVIEW -----> [3] APPROVED --> [4] LIVE|   |
| |   [Done]          [Current]         [Pending]       [Pending]|   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| CURRENT STAGE: Review                                              |
| Approvers: Marketing Team (1 of 2 required)                        |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] Alice M. approved                     2 hours ago  |   |
| | "Looks great! Ready for final approval."                    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| YOUR ACTIONS                                                       |
| [Approve] [Request Changes] [Reject] [Comment]                     |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 11. AnalyticsDashboard

Main analytics overview dashboard.

### Props Interface

```typescript
interface AnalyticsDashboardProps {
  dateRange: DateRange;
  platforms: Platform[];
  metrics: AnalyticsMetrics;
  topContent: TopContent[];
  onDateRangeChange: (range: DateRange) => void;
  onPlatformFilter: (platforms: string[]) => void;
  onExport: (format: ExportFormat) => void;
  onDrillDown: (metric: string, filters?: Record<string, unknown>) => void;
}

interface AnalyticsMetrics {
  impressions: MetricValue;
  engagementRate: MetricValue;
  followersGained: MetricValue;
  postsPublished: MetricValue;
  clicks: MetricValue;
  shares: MetricValue;
  comments: MetricValue;
  reach: MetricValue;
}

interface MetricValue {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

interface TopContent {
  post: ScheduledPost;
  impressions: number;
  engagement: number;
  engagementRate: number;
  platform: Platform;
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Analytics Dashboard                        [Export] [Date Range]   |
+------------------------------------------------------------------+
|                                                                    |
| OVERVIEW CARDS                                                     |
| +-------------+ +-------------+ +-------------+ +-------------+    |
| | Impressions | | Engagement  | | Followers   | | Posts       |    |
| | 1.2M        | | 4.8%        | | +2,847      | | 156         |    |
| | +15% [Up]   | | +0.3% [Up]  | | +12% [Up]   | | +8% [Up]    |    |
| +-------------+ +-------------+ +-------------+ +-------------+    |
|                                                                    |
| ENGAGEMENT CHART                                                   |
| +-------------------------------------------------------------+   |
| | [Line chart showing engagement over time]                   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PLATFORM BREAKDOWN                                                 |
| +-------------------------------------------------------------+   |
| | [Horizontal bar chart by platform]                          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| TOP CONTENT                                                        |
| +-------------------------------------------------------------+   |
| | #1 "Announcing..." | TW | 45K imp | 8.2% eng | [View]       |   |
| | #2 "Behind the..." | IN | 38K imp | 6.8% eng | [View]       |   |
| | #3 "Industry..."   | LI | 32K imp | 5.4% eng | [View]       |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 12. EngagementChart

Line/area chart for engagement metrics over time.

### Props Interface

```typescript
interface EngagementChartProps {
  data: ChartDataPoint[];
  metrics: ChartMetric[];
  dateRange: DateRange;
  granularity: 'hour' | 'day' | 'week' | 'month';
  showLegend?: boolean;
  showTooltip?: boolean;
  height?: number;
  onPointClick?: (point: ChartDataPoint) => void;
}

interface ChartDataPoint {
  date: Date;
  values: Record<string, number>;
}

interface ChartMetric {
  id: string;
  label: string;
  color: string;
  type: 'line' | 'area' | 'bar';
  yAxisId?: 'left' | 'right';
}
```

### Visual Example

```
+------------------------------------------------------------------+
| Engagement Over Time                                               |
+------------------------------------------------------------------+
|                                                                    |
|  8K |                           ****                               |
|  6K |        ****         ****      ****                          |
|  4K |  ****      ****  ***              ****                      |
|  2K |                                        ****                 |
|   0 +---------------------------------------------------->        |
|     Week 1    Week 2    Week 3    Week 4                          |
|                                                                    |
| [---] Impressions  [***] Engagements  [ooo] Clicks                 |
+------------------------------------------------------------------+
```

---

## 13. BestTimeHeatmap

Heatmap showing optimal posting times.

### Props Interface

```typescript
interface BestTimeHeatmapProps {
  data: HeatmapData;
  platform?: Platform;
  onCellClick?: (day: DayOfWeek, hour: number) => void;
  showLegend?: boolean;
  interactive?: boolean;
}

interface HeatmapData {
  cells: HeatmapCell[];
  minValue: number;
  maxValue: number;
  averageValue: number;
}

interface HeatmapCell {
  day: DayOfWeek;
  hour: number;
  value: number;
  label?: string;
}

type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
```

### Visual Structure

```
+------------------------------------------------------------------+
| Best Time to Post                                                  |
+------------------------------------------------------------------+
|       Mon   Tue   Wed   Thu   Fri   Sat   Sun                     |
|  6AM  [  ]  [  ]  [  ]  [  ]  [  ]  [  ]  [  ]                    |
|  8AM  [**]  [***] [***] [***] [**]  [  ]  [  ]                    |
|  9AM  [***] [****][****][****][***] [  ]  [  ]                    |
| 10AM  [****][****][****][****][****][**]  [  ]                    |
| 11AM  [****][****][***] [***] [****][***] [*]                     |
| 12PM  [***] [***] [***] [***] [***] [***] [**]                    |
|  1PM  [**]  [**]  [**]  [**]  [**]  [***] [***]                   |
|  ...                                                               |
|                                                                    |
| Legend: [****] Best  [***] Good  [**] Average  [*] Low            |
+------------------------------------------------------------------+
```

### CSS Styles

```css
.heatmap-grid {
  display: grid;
  grid-template-columns: auto repeat(7, 1fr);
  gap: 2px;
}

.heatmap-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.heatmap-cell:hover {
  transform: scale(1.1);
  z-index: 1;
}

.heatmap-cell[data-intensity="0"] { background: var(--surface-1); }
.heatmap-cell[data-intensity="1"] { background: rgba(var(--color-success-rgb), 0.2); }
.heatmap-cell[data-intensity="2"] { background: rgba(var(--color-success-rgb), 0.4); }
.heatmap-cell[data-intensity="3"] { background: rgba(var(--color-success-rgb), 0.6); }
.heatmap-cell[data-intensity="4"] { background: rgba(var(--color-success-rgb), 0.8); }
.heatmap-cell[data-intensity="5"] { background: var(--color-success); }
```

---

## 14. CompetitorTracker

Track and compare competitor social metrics.

### Props Interface

```typescript
interface CompetitorTrackerProps {
  competitors: Competitor[];
  ownMetrics: CompetitorMetrics;
  dateRange: DateRange;
  onAddCompetitor: () => void;
  onRemoveCompetitor: (id: string) => void;
  onCompare: (competitorIds: string[]) => void;
}

interface Competitor {
  id: string;
  name: string;
  handle: string;
  platform: Platform;
  avatar?: string;
  metrics: CompetitorMetrics;
  lastUpdated: Date;
}

interface CompetitorMetrics {
  followers: number;
  followersGrowth: number;
  engagementRate: number;
  postsPerWeek: number;
  avgLikes: number;
  avgComments: number;
  shareOfVoice?: number;
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Competitor Analysis                           [+ Add Competitor]   |
+------------------------------------------------------------------+
|                                                                    |
| TRACKED (3)                                                        |
| +-------------------------------------------------------------+   |
| | Competitor A (@comp_a)                                      |   |
| | Followers: 125K (+5% vs you)                                |   |
| | Engagement: 5.2% (+0.4% vs you)                             |   |
| | Posts/Week: 18 (vs your 12)                                 |   |
| | [Compare] [View Profile] [Remove]                           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| COMPARISON TABLE                                                   |
| +-------------------------------------------------------------+   |
| |           | You    | Comp A | Comp B | Comp C               |   |
| |-----------|--------|--------|--------|----------------------|   |
| | Followers | 127.8K | 125K   | 89K    | 156K                 |   |
| | Eng. Rate | 4.8%   | 5.2%   | 3.9%   | 4.1%                 |   |
| | Growth    | +2.2%  | +1.8%  | +3.1%  | +0.9%                |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| SHARE OF VOICE                                                     |
| +-------------------------------------------------------------+   |
| | You:    [=================--------] 32%                     |   |
| | Comp A: [=================---------] 28%                    |   |
| | Comp B: [==========---------------] 18%                     |   |
| | Comp C: [============-------------] 22%                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 15. ContentRecycler

Manage and recycle evergreen content.

### Props Interface

```typescript
interface ContentRecyclerProps {
  evergreenPosts: EvergreenPost[];
  recycleSettings: RecycleSettings;
  onMarkEvergreen: (postId: string) => void;
  onUnmarkEvergreen: (postId: string) => void;
  onRecycleNow: (postId: string, variation?: ContentVariation) => void;
  onUpdateSettings: (settings: RecycleSettings) => void;
  onGenerateVariation: (postId: string) => Promise<ContentVariation[]>;
}

interface EvergreenPost {
  id: string;
  originalPost: ScheduledPost;
  originalDate: Date;
  lastRecycled?: Date;
  timesRecycled: number;
  performance: {
    avgEngagement: number;
    totalImpressions: number;
    bestPerformingVariation?: string;
  };
  nextSuggestedDate?: Date;
  variations: ContentVariation[];
}

interface ContentVariation {
  id: string;
  content: string;
  usedCount: number;
  performance?: {
    engagementRate: number;
    impressions: number;
  };
}

interface RecycleSettings {
  minInterval: number; // days
  maxRecycles: number;
  autoRecycle: boolean;
  requireVariation: boolean;
  minEngagementThreshold: number; // percentage
}
```

### Visual Structure

```
+------------------------------------------------------------------+
| Content Recycling                                      [Settings]  |
+------------------------------------------------------------------+
|                                                                    |
| EVERGREEN LIBRARY                                                  |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Star] "5 Tips for Better Content Management"               |   |
| |        Originally: Jan 15 | Performance: 6.2% avg           |   |
| |        Last recycled: Feb 1 | Times: 3                      |   |
| |        Next suggested: March 1                               |   |
| |                                                              |   |
| |        Platforms: [TW] [LI]                                  |   |
| |        [Edit] [Recycle Now] [Remove]                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| VARIATION SUGGESTIONS                                              |
| +-------------------------------------------------------------+   |
| | Original: "5 Tips for Better Content Management"             |   |
| |                                                              |   |
| | Variation 1: "Still struggling with content? Here are 5..." |   |
| | Variation 2: "Content management doesn't have to be hard..."|   |
| | Variation 3: "Your content workflow needs these 5..."       |   |
| |                                                              |   |
| | [Use 1] [Use 2] [Use 3] [Generate More]                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Implementation Checklist

### Core Components (Priority 1)
- [ ] PlatformConnectionCard
- [ ] MultiPlatformComposer
- [ ] PlatformPreview
- [ ] CharacterLimitIndicator
- [ ] ContentCalendar

### Publishing Components (Priority 2)
- [ ] MediaCompatibilityPanel
- [ ] HashtagSuggester
- [ ] SchedulePicker
- [ ] ApprovalWorkflowPanel

### Analytics Components (Priority 3)
- [ ] AnalyticsDashboard
- [ ] EngagementChart
- [ ] BestTimeHeatmap

### Advanced Components (Priority 4)
- [ ] SocialAccountManager
- [ ] CompetitorTracker
- [ ] ContentRecycler

---

*Document Version: 1.0*
*Last Updated: February 2026*
*Author: UX Design Expert Agent*
