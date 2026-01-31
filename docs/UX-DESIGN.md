# RSES CMS UX Design Specification

## Design Philosophy

This UX design draws from the quantum-os UI reference for **layout patterns and interaction paradigms** while establishing a **themeable foundation** similar to Drupal's theming system. The quantum aesthetics serve as inspiration for spatial organization, progressive disclosure, and micro-interactions - not as a fixed visual theme.

### Core Principles (Informed by Cognitive Psychology)

1. **Hick's Law** - Reduce decision time by limiting choices at each decision point
2. **Fitts's Law** - Place important actions in easily reachable positions with appropriate target sizes
3. **Miller's Law** - Chunk information into groups of 7 +/- 2 items
4. **Progressive Disclosure** - Reveal complexity gradually as users need it
5. **Clear Affordances** - Make interactive elements obviously interactive

---

## 1. Information Architecture (Site Map)

```
RSES CMS
|
+-- Dashboard (/)
|   +-- Activity Feed
|   +-- Quick Stats
|   +-- Recent Content
|   +-- Quick Actions
|
+-- Content (/content)
|   +-- List View (/content/list)
|   +-- Create (/content/create/:type)
|   +-- Edit (/content/edit/:id)
|   +-- Revisions (/content/revisions/:id)
|
+-- Structure (/structure)
|   +-- Content Types (/structure/types)
|   |   +-- List
|   |   +-- Add Type
|   |   +-- Manage Fields (/structure/types/:type/fields)
|   |   +-- Manage Display (/structure/types/:type/display)
|   |
|   +-- Taxonomy (/structure/taxonomy)
|   |   +-- Vocabularies
|   |   +-- Terms (/structure/taxonomy/:vocab/terms)
|   |   +-- RSES Rules (/structure/taxonomy/:vocab/rses)
|   |
|   +-- RSES Rules (/structure/rses)
|       +-- Editor (Monaco)
|       +-- Test Playground
|       +-- Preview/Debug
|
+-- Workbench (/workbench)
|   +-- Project Scanner
|   +-- Classification View
|   +-- Autolink Manager
|   +-- Batch Operations
|
+-- People (/people)
|   +-- Users (/people/users)
|   +-- Roles (/people/roles)
|   +-- Permissions (/people/permissions)
|
+-- Extend (/extend)
|   +-- Modules (/extend/modules)
|   +-- Themes (/extend/themes)
|   +-- Updates (/extend/updates)
|
+-- Configuration (/config)
    +-- Site Settings (/config/site)
    +-- Performance (/config/performance)
    +-- Import/Export (/config/sync)
```

---

## 2. Navigation Patterns

### 2.1 Primary Navigation: Collapsing Drawer (Hilbert-inspired)

Adapting quantum-os's Hilbert navigation pattern:

```
+--+----------------------------------------+
|  |                                        |
|N |         Main Content Area              |
|A |                                        |
|V |                                        |
|  |                                        |
|<>|                                        |  <- Collapse handle
|  |                                        |
|  |                                        |
+--+----------------------------------------+
```

**States:**
- **Expanded** (280px): Full labels + icons + section grouping
- **Collapsed** (64px): Icons only with tooltips
- **Hidden** (0px): Full-width content mode (opt-in)

**Behavior:**
- Remembers user preference via localStorage
- Auto-collapses on narrow viewports (<1024px)
- Hover-expand option in collapsed mode
- Keyboard accessible (Tab navigation, Enter to expand sections)

**Navigation Groups (7 items - Miller's Law):**
1. Dashboard (Home icon)
2. Content (Document icon)
3. Structure (Cube icon)
4. Workbench (Wrench icon)
5. People (Users icon)
6. Extend (Puzzle icon)
7. Config (Gear icon)

### 2.2 Contextual Navigation: Tabs

Within each major section, use horizontal tabs for sub-navigation:

```
Content Types | Taxonomy | RSES Rules
-----------------------------------------
[Content Area]
```

**Tab Design:**
- Underline indicator on active tab
- Clear contrast between active/inactive
- Icon + label for primary tabs
- Max 5-7 tabs visible; overflow to dropdown

### 2.3 Breadcrumbs

Always present below the header for deep navigation:

```
Dashboard > Structure > Content Types > Article > Manage Fields
```

### 2.4 Command Palette (Mission Control inspired)

Global quick-access overlay (Cmd/Ctrl + K):

```
+------------------------------------------------+
|  Search commands, content, or settings...   [x]|
+------------------------------------------------+
| Recent                                         |
|   > Edit "Homepage" (Page)                     |
|   > RSES Rules Editor                          |
|                                                |
| Actions                                        |
|   > Create new content                         |
|   > Run project scan                           |
|   > View activity log                          |
+------------------------------------------------+
```

---

## 3. Wireframe Descriptions

### 3.1 Dashboard

```
+--+--------------------------------------------------+
|  |  [Logo] RSES CMS              [?] [Bell] [User]  |
|  +--------------------------------------------------+
|N |                                                  |
|A |  +------------+ +------------+ +------------+    |
|V |  |  CONTENT   | |  PROJECTS  | |   RULES    |    |
|  |  |    47      | |    12      | |    3       |    |
|  |  +------------+ +------------+ +------------+    |
|  |                                                  |
|  |  +---------------------------+ +--------------+  |
|  |  |    ACTIVITY FEED          | | QUICK        |  |
|  |  |    ---------------------- | | ACTIONS      |  |
|  |  |    > User X edited...     | |              |  |
|  |  |    > Project Y linked     | | [+ Content]  |  |
|  |  |    > Config Z validated   | | [Scan]       |  |
|  |  |    ...                    | | [RSES Edit]  |  |
|  |  +---------------------------+ +--------------+  |
|  |                                                  |
|  |  +--------------------------------------------+  |
|  |  |    RECENT CONTENT                          |  |
|  |  |    [Card] [Card] [Card] [Card]             |  |
|  |  +--------------------------------------------+  |
+--+--------------------------------------------------+
```

**Psychology Applied:**
- **Fitts's Law:** Quick Actions positioned top-right, large touch targets
- **Miller's Law:** Stats chunked into 3 cards; Activity shows 5-7 recent items
- **Progressive Disclosure:** Activity feed expands on demand

### 3.2 Content Management Dashboard

```
+--+--------------------------------------------------+
|  | Content                                [+ Add]   |
|  +--------------------------------------------------+
|N |  All | Published | Draft | Archived              |
|A |  ------------------------------------------------|
|  |  [Search...          ] [Type v] [Date v] [More]  |
|  |  ------------------------------------------------|
|  |  [ ] | Title          | Type    | Author | Date  |
|  |  ----|----------------|---------|--------|-------|
|  |  [ ] | Homepage       | Page    | Admin  | Today |
|  |  [ ] | About Us       | Page    | Editor | -1d   |
|  |  [ ] | Blog Post 1    | Article | Writer | -2d   |
|  |  ...                                             |
|  |  ------------------------------------------------|
|  |  Showing 1-25 of 47        [<] [1] [2] [>]       |
+--+--------------------------------------------------+
```

**Interaction Patterns:**
- Bulk select with shift+click
- Row hover reveals quick actions (Edit, View, Delete)
- Inline status toggle (Publish/Unpublish)
- Click row to edit; click checkbox to select

### 3.3 Content Type Builder

```
+--+--------------------------------------------------+
|  | Article > Manage Fields                          |
|  +--------------------------------------------------+
|N |  Manage Fields | Manage Display | Delete         |
|A |  ------------------------------------------------|
|  |                                                  |
|  |  LABEL         | MACHINE NAME  | TYPE   | OPS   |
|  |  --------------|---------------|--------|-------|
|  |  Title         | title         | String | [=]   |
|  |  Body          | body          | Text   | [=][x]|
|  |  Tags          | field_tags    | Ref    | [=][x]|
|  |  Image         | field_image   | Media  | [=][x]|
|  |  RSES Category | field_rses    | RSES   | [=][x]|
|  |                                                  |
|  |  [+ Add field]                                   |
|  |                                                  |
|  |  RSES INTEGRATION                                |
|  |  +--------------------------------------------+  |
|  |  | Classify content using rules from:         |  |
|  |  | [Select RSES config  v]                    |  |
|  |  | [ ] Auto-classify on save                  |  |
|  |  | [ ] Show classification in list view       |  |
|  |  +--------------------------------------------+  |
+--+--------------------------------------------------+
```

**Add Field Flow (Progressive Disclosure):**

```
Step 1: Choose Field Type
+---------------------------+
| What type of field?       |
|                           |
| [Text]    [Number]        |
| [Boolean] [Date]          |
| [Reference] [Media]       |
| [RSES Set] [Custom...]    |
+---------------------------+

Step 2: Configure Field
+---------------------------+
| Field Settings            |
| Label: [____________]     |
| Machine name: [auto]      |
| Required: [ ]             |
| [Advanced Settings v]     |
+---------------------------+

Step 3: Display Settings
+---------------------------+
| Display Settings          |
| Widget: [Textarea    v]   |
| Help text: [__________]   |
+---------------------------+
```

### 3.4 RSES Rules Editor

```
+--+--------------------------------------------------+
|  | RSES Rules > Production Config          [Save]   |
|  +--------------------------------------------------+
|N |  [ ] Unsaved changes                             |
|A |  +----------------------+ +--------------------+  |
|  |  |                      | | Test | Workbench  |  |
|  |  |  MONACO EDITOR       | |                    |  |
|  |  |                      | | Test Path:         |  |
|  |  |  # Sets              | | [by-ai/claude/...] |  |
|  |  |  $tools = tool-*     | |                    |  |
|  |  |  $claude = {source=  | | Matched Sets:      |  |
|  |  |    claude}           | | [$tools] [$claude] |  |
|  |  |                      | |                    |  |
|  |  |  # Rules             | | Symlinks:          |  |
|  |  |  topic: $tools ->    | | > tools/project    |  |
|  |  |    tools/            | | > by-ai/claude/... |  |
|  |  |                      | |                    |  |
|  |  +----------------------+ +--------------------+  |
|  |                                                  |
|  |  VALIDATION                                      |
|  |  +--------------------------------------------+  |
|  |  | [Valid] 0 errors | [Expand/Collapse]       |  |
|  |  +--------------------------------------------+  |
+--+--------------------------------------------------+
```

**Editor Features:**
- Syntax highlighting (custom Monaco language)
- Real-time validation (debounced 500ms)
- Error markers in gutter
- Autocomplete for $set names
- Keyboard shortcuts (Cmd+S save, Cmd+1/2/3 switch tabs)

### 3.5 Taxonomy Management (RSES-Powered)

```
+--+--------------------------------------------------+
|  | Taxonomy > Topics                                |
|  +--------------------------------------------------+
|N |  Terms | RSES Rules | Settings                   |
|A |  ------------------------------------------------|
|  |                                                  |
|  |  TERM HIERARCHY           | RSES CLASSIFICATION |
|  |  ------------------------ | ------------------- |
|  |  v Development            | Matches: $dev       |
|  |    > Frontend             |   > $frontend       |
|  |    > Backend              |   > $backend        |
|  |    > DevOps               |   > $devops         |
|  |  v AI/ML                  | Matches: $ai        |
|  |    > Machine Learning     |   > $ml             |
|  |    > LLM                  |   > $llm            |
|  |  + Add term               |                     |
|  |                                                  |
|  |  BULK OPERATIONS                                 |
|  |  [Auto-classify from RSES] [Re-scan all]        |
+--+--------------------------------------------------+
```

**RSES Integration:**
- Terms can map to RSES set expressions
- Auto-classify content based on RSES rules
- Bidirectional: RSES can generate taxonomy terms

### 3.6 Project Workbench

```
+--+--------------------------------------------------+
|  | Workbench                           [Scan] [Link]|
|  +--------------------------------------------------+
|N |  Projects | Unlinked | Recently Changed          |
|A |  ------------------------------------------------|
|  |  Scan Path: [/Users/Projects/by-ai/...]  [Browse]|
|  |  ------------------------------------------------|
|  |                                                  |
|  |  +-------------------+ +----------------------+  |
|  |  | PROJECT LIST      | | CLASSIFICATION       |  |
|  |  |                   | |                      |  |
|  |  | v quantum-app     | | Sets:                |  |
|  |  |   Status: Linked  | | [$tools] [$claude]   |  |
|  |  |   Path: ...       | |                      |  |
|  |  |                   | | Topics:              |  |
|  |  | v data-viz        | | [AI/ML] [Viz]        |  |
|  |  |   Status: Pending | |                      |  |
|  |  |   [Link Now]      | | Symlinks:            |  |
|  |  |                   | | tools/quantum-app    |  |
|  |  | > another-proj    | | by-ai/claude/...     |  |
|  |  +-------------------+ +----------------------+  |
|  |                                                  |
|  |  CONVERSATION LOG                                |
|  |  +--------------------------------------------+  |
|  |  | > Scanned 12 projects                      |  |
|  |  | > Classified quantum-app as $tools, $ai   |  |
|  |  | > Created 3 symlinks                       |  |
|  |  +--------------------------------------------+  |
+--+--------------------------------------------------+
```

### 3.7 User Management

```
+--+--------------------------------------------------+
|  | People > Users                         [+ Add]   |
|  +--------------------------------------------------+
|N |  Users | Roles | Permissions                     |
|A |  ------------------------------------------------|
|  |  [Search users...]                               |
|  |  ------------------------------------------------|
|  |                                                  |
|  |  [Avatar] | Username  | Email       | Role      |
|  |  ---------|-----------|-------------|-----------|
|  |  [A]      | admin     | a@test.com  | Admin     |
|  |  [E]      | editor1   | e@test.com  | Editor    |
|  |  [W]      | writer    | w@test.com  | Author    |
|  |                                                  |
+--+--------------------------------------------------+
```

### 3.8 Module Management

```
+--+--------------------------------------------------+
|  | Extend > Modules                                 |
|  +--------------------------------------------------+
|N |  Modules | Themes | Updates                      |
|A |  ------------------------------------------------|
|  |                                                  |
|  |  CORE MODULES                                    |
|  |  +--------------------------------------------+  |
|  |  | [x] Content         Required               |  |
|  |  | [x] RSES Engine     Required               |  |
|  |  | [x] User System     Required               |  |
|  |  +--------------------------------------------+  |
|  |                                                  |
|  |  OPTIONAL MODULES                                |
|  |  +--------------------------------------------+  |
|  |  | [ ] Media Library   Add image/file fields  |  |
|  |  | [x] Taxonomy        Categorization system  |  |
|  |  | [ ] Search          Full-text search       |  |
|  |  | [ ] API             REST/GraphQL endpoints |  |
|  |  +--------------------------------------------+  |
|  |                                                  |
|  |  [Apply Changes]                                 |
+--+--------------------------------------------------+
```

### 3.9 Theme Management

```
+--+--------------------------------------------------+
|  | Extend > Themes                                  |
|  +--------------------------------------------------+
|N |  Modules | Themes | Updates                      |
|A |  ------------------------------------------------|
|  |                                                  |
|  |  ADMIN THEME                                     |
|  |  +--------------------------------------------+  |
|  |  | [Preview]                                  |  |
|  |  | Current: Quantum Dark                      |  |
|  |  | [Change Theme v]                           |  |
|  |  +--------------------------------------------+  |
|  |                                                  |
|  |  THEME SETTINGS                                  |
|  |  +--------------------------------------------+  |
|  |  | Primary Color:   [#00f0ff] [____]          |  |
|  |  | Accent Color:    [#9d00ff] [____]          |  |
|  |  | Font - Headings: [Orbitron       v]        |  |
|  |  | Font - Body:     [Space Mono     v]        |  |
|  |  | Sidebar Mode:    ( ) Expanded (o) Auto     |  |
|  |  +--------------------------------------------+  |
|  |                                                  |
|  |  CSS VARIABLES                                   |
|  |  +--------------------------------------------+  |
|  |  | --void: #000000                            |  |
|  |  | --quantum-blue: #00f0ff                    |  |
|  |  | --probability-purple: #9d00ff              |  |
|  |  | [Edit Custom CSS]                          |  |
|  |  +--------------------------------------------+  |
+--+--------------------------------------------------+
```

### 3.10 Site Configuration

```
+--+--------------------------------------------------+
|  | Configuration > Site Settings                    |
|  +--------------------------------------------------+
|N |  Site | Performance | Import/Export              |
|A |  ------------------------------------------------|
|  |                                                  |
|  |  BASIC SETTINGS                                  |
|  |  Site Name:        [RSES CMS_____________]       |
|  |  Slogan:           [Semantic file management]    |
|  |  Email:            [admin@example.com____]       |
|  |                                                  |
|  |  RSES DEFAULTS                                   |
|  |  Default Config:   [Production Rules    v]       |
|  |  Search Root:      [~/search-results_____]       |
|  |  Project Roots:    [+ Add path]                  |
|  |    - ~/Projects/by-ai                            |
|  |    - ~/Projects/experiments                      |
|  |                                                  |
|  |  [Save Configuration]                            |
+--+--------------------------------------------------+
```

---

## 4. Interaction Patterns

### 4.1 Drag and Drop

**Use Cases:**
- Reorder fields in content type builder
- Reorder taxonomy terms
- Reorder table columns (optional)

**Implementation:**
```
Drag Handle | Item Content | Actions
[=]         | Field Name   | [Edit][Delete]
```

**Feedback:**
- Grab cursor on handle hover
- Ghost/shadow of dragged item
- Drop zone highlighting
- Smooth animation on drop

### 4.2 Inline Editing

**Content List Status Toggle:**
```
Status: [Published v]  -> Click -> Status: [Draft v]
```

**Quick Edit Modal (on row):**
- Edit title, status without full page load
- Esc to cancel, Enter to save
- Autosave after 2s idle

### 4.3 Modals and Dialogs

**Modal Hierarchy:**
1. **Confirmation Dialogs** - Destructive actions (delete)
2. **Quick Edit Modals** - Simple property changes
3. **Full-Screen Modals** - Complex operations (field config)
4. **Side Panels** - Contextual details (preview, help)

**Design Principles:**
- Always have visible close button
- Click outside to dismiss (non-critical)
- Focus trap for accessibility
- Keyboard navigation (Tab, Esc)

### 4.4 Form Patterns

**Validation:**
- Inline validation on blur
- Error messages below field
- Success indicators (checkmark)
- Submit button disabled until valid

**Long Forms (Progressive Disclosure):**
```
Basic Settings          [Required fields]
+-- Advanced Settings   [Collapsed by default]
+-- RSES Integration    [Collapsed by default]
```

### 4.5 Loading States

**Skeleton Screens** (preferred over spinners):
```
+---------------------------+
| [====] [===========]      |
| [==================]      |
| [====] [===========]      |
+---------------------------+
```

**Progress Indicators:**
- Determinate progress for known operations
- Indeterminate for unknown duration
- Always show "what's happening" text

### 4.6 Empty States

```
+---------------------------+
|                           |
|      [Icon/Illustration]  |
|                           |
|   No content found        |
|   Create your first       |
|   article to get started  |
|                           |
|   [+ Create Article]      |
+---------------------------+
```

---

## 5. Micro-Interaction Recommendations

### 5.1 Button States

```css
/* Inspired by quantum-os button transitions */
.btn {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--primary), 0.3);
}

.btn:active {
  transform: translateY(0);
}
```

### 5.2 Focus Indicators

```css
/* Quantum-inspired focus ring */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 4px;
}
```

### 5.3 Status Badges

Adapting quantum-os state badges:

```
[Valid]     - Green glow
[Pending]   - Yellow/Gold pulse
[Error]     - Red static
[Linked]    - Blue connected
[Draft]     - Purple/muted
```

### 5.4 Toast Notifications

```
+-------------------------------------------+
|  [Icon]  Message text here      [X]       |
+-------------------------------------------+
```

**Position:** Bottom-right, stacked
**Animation:** Slide in from right, fade out
**Duration:** 4s (info), 6s (warning), persistent (error)

### 5.5 Validation Feedback

**Real-time in editor (RSES):**
```
Line 5: |  $invalid = missing-quote
        |  ~~~~~~~~~ Error: Unterminated string
```

**Gutter markers:**
- Red dot for errors
- Yellow dot for warnings
- Hover to show message

### 5.6 Ripple Effect (Optional)

On button/interactive element click:
```css
.ripple {
  position: relative;
  overflow: hidden;
}

.ripple::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transform: scale(0);
  animation: ripple 0.6s ease-out;
}

@keyframes ripple {
  to {
    transform: scale(4);
    opacity: 0;
  }
}
```

---

## 6. Accessibility Considerations

### 6.1 Keyboard Navigation

**Global Shortcuts:**
| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + K | Command palette |
| Ctrl/Cmd + S | Save current form |
| Ctrl/Cmd + N | New content |
| Esc | Close modal/cancel |
| Tab | Navigate forward |
| Shift+Tab | Navigate backward |
| Enter | Activate focused element |
| Space | Toggle checkbox/expand |

**Skip Links:**
```html
<a href="#main-content" class="skip-link">Skip to main content</a>
<a href="#navigation" class="skip-link">Skip to navigation</a>
```

### 6.2 ARIA Landmarks

```html
<header role="banner">...</header>
<nav role="navigation" aria-label="Main">...</nav>
<main role="main" id="main-content">...</main>
<aside role="complementary">...</aside>
<footer role="contentinfo">...</footer>
```

### 6.3 Screen Reader Considerations

**Live Regions:**
```html
<div role="status" aria-live="polite">
  <!-- Toast notifications, validation status -->
</div>

<div role="alert" aria-live="assertive">
  <!-- Critical errors -->
</div>
```

**Descriptive Labels:**
```html
<button aria-label="Delete article 'Homepage'">
  <TrashIcon aria-hidden="true" />
</button>
```

### 6.4 Color Contrast

- Text on background: minimum 4.5:1 ratio
- Large text (18px+): minimum 3:1 ratio
- Interactive elements: minimum 3:1 ratio
- Never use color alone to convey meaning

### 6.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6.6 Focus Management

- Return focus to trigger element after modal close
- Move focus to error message on form validation fail
- Trap focus within modals/dialogs
- Visible focus indicators (not outline: none)

---

## 7. User Flow Diagrams

### 7.1 Create Content Flow

```
[Dashboard]
     |
     v
[+ Create Content]
     |
     v
[Select Content Type] -- Cancel --> [Dashboard]
     |
     v
[Content Form]
     |
     +-- [Auto-classify] --> [RSES Runs] --> [Suggested Categories]
     |                                              |
     v                                              v
[Fill Fields] <------------------------------------|
     |
     v
[Preview] <-- Edit -- [Looks good?]
     |                     |
     v                     v
[Publish] ----------> [Published!]
     |                     |
     v                     v
[View Content] <------ [Dashboard]
```

### 7.2 RSES Rule Creation Flow

```
[Structure > RSES Rules]
     |
     v
[Select/Create Config]
     |
     v
[Monaco Editor Opens]
     |
     +-- [Type rules] --> [Real-time validation]
     |                            |
     v                            v
[Validation OK?] -- No --> [Show errors inline]
     |                            |
     v                            |
[Test Panel] <--------------------|
     |
     v
[Enter test path]
     |
     v
[See matched sets, preview symlinks]
     |
     +-- [Adjust rules] --> [Re-test]
     |
     v
[Save Config]
     |
     v
[Run on projects?] -- Yes --> [Workbench]
     |
     v
[Done]
```

### 7.3 Project Classification Flow

```
[Workbench]
     |
     v
[Set Scan Path]
     |
     v
[Scan for Projects]
     |
     v
[Project List Populated]
     |
     v
[Select Project]
     |
     v
[View Classification]
     |
     +-- [Preview Symlinks] --> [See proposed links]
     |
     v
[Link Project] -- Confirm --> [Symlinks Created]
     |
     v
[View in Search Results]
```

### 7.4 User Role Assignment Flow

```
[People > Users]
     |
     v
[Select User]
     |
     v
[User Detail View]
     |
     v
[Edit Roles]
     |
     v
[Checkbox: Admin, Editor, Author, etc.]
     |
     v
[Save] --> [Permissions updated]
```

---

## 8. Responsive Design Breakpoints

```css
/* Mobile First Approach */
/* Base: < 640px (Mobile) */
.sidebar { display: none; }
.content { padding: 1rem; }

/* sm: >= 640px (Large Phone/Small Tablet) */
@media (min-width: 640px) {
  .content { padding: 1.5rem; }
}

/* md: >= 768px (Tablet) */
@media (min-width: 768px) {
  .sidebar { display: block; width: 64px; } /* Collapsed */
}

/* lg: >= 1024px (Desktop) */
@media (min-width: 1024px) {
  .sidebar { width: 280px; } /* Expanded */
  .content-grid { grid-template-columns: repeat(3, 1fr); }
}

/* xl: >= 1280px (Large Desktop) */
@media (min-width: 1280px) {
  .content-grid { grid-template-columns: repeat(4, 1fr); }
}

/* 2xl: >= 1536px (Extra Large) */
@media (min-width: 1536px) {
  .main-container { max-width: 1400px; margin: 0 auto; }
}
```

---

## 9. Component Library Foundation

### 9.1 CSS Variables (Themeable)

```css
:root {
  /* Colors - Override these for theming */
  --color-background: #0a0a0a;
  --color-foreground: #ffffff;
  --color-primary: #00f0ff;
  --color-primary-hover: #00d4e0;
  --color-secondary: #9d00ff;
  --color-accent: #ffd700;
  --color-success: #00ff88;
  --color-warning: #ffd700;
  --color-error: #ff5555;
  --color-muted: #666666;

  /* Surfaces */
  --surface-1: rgba(255, 255, 255, 0.03);
  --surface-2: rgba(255, 255, 255, 0.06);
  --surface-3: rgba(255, 255, 255, 0.09);

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-default: rgba(255, 255, 255, 0.2);
  --border-strong: rgba(255, 255, 255, 0.3);

  /* Typography */
  --font-heading: 'Orbitron', system-ui, sans-serif;
  --font-body: 'Space Mono', ui-monospace, monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px;

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Z-Index Scale */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal: 300;
  --z-toast: 400;
  --z-tooltip: 500;
}
```

### 9.2 Core Components Needed

1. **Layout**
   - AppShell (sidebar + header + main)
   - Container
   - Grid
   - Stack (vertical/horizontal)

2. **Navigation**
   - Sidebar (collapsible)
   - Breadcrumbs
   - Tabs
   - CommandPalette

3. **Forms**
   - Input, Textarea
   - Select, Combobox
   - Checkbox, Radio, Switch
   - DatePicker
   - FileUpload

4. **Data Display**
   - Table (sortable, selectable)
   - Card
   - Badge
   - Avatar
   - Stats

5. **Feedback**
   - Toast/Notification
   - Progress
   - Skeleton
   - Spinner

6. **Overlay**
   - Modal/Dialog
   - Drawer/Sheet
   - Tooltip
   - Popover
   - DropdownMenu

7. **Actions**
   - Button (variants: primary, secondary, ghost, danger)
   - IconButton
   - ButtonGroup

---

## 10. Implementation Priority

### Phase 1: Foundation
- [ ] CSS variables and theming system
- [ ] AppShell layout (sidebar, header, main)
- [ ] Navigation (sidebar, breadcrumbs)
- [ ] Core form components

### Phase 2: Content Management
- [ ] Content list view with table
- [ ] Content form builder
- [ ] RSES field type integration

### Phase 3: RSES Integration
- [ ] Monaco editor with RSES language
- [ ] Test panel component
- [ ] Workbench view

### Phase 4: Administration
- [ ] User management screens
- [ ] Role/permission UI
- [ ] Module/theme management

### Phase 5: Polish
- [ ] Command palette
- [ ] Keyboard shortcuts
- [ ] Accessibility audit
- [ ] Performance optimization

---

## Appendix A: Quantum-OS Pattern Reference

The following patterns from quantum-os inform this design:

| Quantum-OS Pattern | CMS Application |
|--------------------|-----------------|
| Hilbert Navigation | Collapsing sidebar drawer |
| Desktop Row | Tab-based workspace switching |
| Minimized Dock | Quick action bar |
| Quantum Windows | Draggable, resizable panels |
| State Badges | Content/project status indicators |
| Radial Dock | Command palette (Cmd+K) |
| Collapse Animation | Form section expand/collapse |
| Glassmorphism | Card and panel backgrounds |
| Glow Effects | Focus and hover states |

---

## Appendix B: Drupal Theming Principles Applied

1. **Separation of Concerns** - CSS variables enable theme switching without code changes
2. **Template Overrides** - Component-based architecture allows partial customization
3. **Region System** - Named content areas (sidebar, header, main, footer)
4. **Asset Libraries** - Modular CSS/JS loading per feature
5. **Configuration Export** - Theme settings stored as JSON/YAML

---

*Document Version: 1.0*
*Last Updated: 2024*
*Design Expert: UX Agent*
