# RSES CMS Component Specifications

This document provides detailed component specifications for implementing the UX design.

---

## 1. AppShell Component

The root layout component that provides the overall structure.

### Structure

```tsx
interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

// Usage
<AppShell
  sidebar={<Sidebar />}
  header={<Header />}
>
  <MainContent />
</AppShell>
```

### Layout CSS

```css
.app-shell {
  display: grid;
  grid-template-areas:
    "sidebar header"
    "sidebar main"
    "sidebar footer";
  grid-template-columns: var(--sidebar-width, 280px) 1fr;
  grid-template-rows: var(--header-height, 56px) 1fr auto;
  min-height: 100vh;
  background: var(--color-background);
}

.app-shell[data-sidebar-collapsed="true"] {
  --sidebar-width: 64px;
}

.app-shell__sidebar {
  grid-area: sidebar;
  background: var(--surface-1);
  border-right: 1px solid var(--border-subtle);
  overflow-y: auto;
  transition: width var(--transition-base);
}

.app-shell__header {
  grid-area: header;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
}

.app-shell__main {
  grid-area: main;
  overflow-y: auto;
  padding: var(--space-6);
}

.app-shell__footer {
  grid-area: footer;
  background: var(--surface-1);
  border-top: 1px solid var(--border-subtle);
  padding: var(--space-4);
}
```

---

## 2. Sidebar Component

Collapsible navigation drawer inspired by quantum-os Hilbert navigation.

### States

```typescript
type SidebarState = 'expanded' | 'collapsed' | 'hidden';

interface SidebarProps {
  state: SidebarState;
  onStateChange: (state: SidebarState) => void;
  items: NavItem[];
  activeItem?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType;
  href: string;
  badge?: string | number;
  children?: NavItem[];
}
```

### Visual Structure

```
+---------------------------+
| [Logo]        [Collapse]  |
+---------------------------+
| [Icon] Dashboard          |
| [Icon] Content      [23]  |
| [Icon] Structure    [v]   |
|   > Content Types         |
|   > Taxonomy              |
|   > RSES Rules            |
| [Icon] Workbench          |
| [Icon] People             |
| [Icon] Extend             |
| [Icon] Config             |
+---------------------------+
|                           |
| [Avatar] User Name        |
| admin@site.com            |
+---------------------------+
```

### Collapsed State

```
+----+
|Logo|
+----+
| D  |
| C  |
| S  |
| W  |
| P  |
| E  |
| G  |
+----+
|[A] |
+----+
```

### Interactions

1. **Collapse Button**: Click toggles between expanded/collapsed
2. **Edge Hover**: When collapsed, hovering near edge shows expanded state temporarily
3. **Submenu**: Click to expand/collapse children
4. **Item Click**: Navigate to href
5. **Keyboard**: Arrow keys to navigate, Enter to select, Escape to collapse

### Animation

```css
.sidebar {
  width: var(--sidebar-width);
  transition: width var(--transition-slow);
}

.sidebar[data-state="collapsed"] {
  --sidebar-width: 64px;
}

.sidebar[data-state="expanded"] {
  --sidebar-width: 280px;
}

.sidebar__label {
  opacity: 1;
  transition: opacity var(--transition-fast);
}

.sidebar[data-state="collapsed"] .sidebar__label {
  opacity: 0;
  pointer-events: none;
}
```

---

## 3. Header Component

Top bar with breadcrumbs, title, and actions.

### Structure

```tsx
interface HeaderProps {
  title?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  notifications?: number;
}

interface Breadcrumb {
  label: string;
  href?: string;
}
```

### Visual Layout

```
+------------------------------------------------------------------+
| Home > Structure > Content Types > Article                        |
|                                                                   |
| Article                              [?Help] [Bell] [UserMenu]    |
+------------------------------------------------------------------+
```

### User Menu Dropdown

```
+------------------+
| [Avatar]         |
| John Doe         |
| john@example.com |
|------------------|
| Profile          |
| Settings         |
|------------------|
| Sign Out         |
+------------------+
```

---

## 4. DataTable Component

Reusable table with sorting, selection, and row actions.

### Props

```typescript
interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  sortable?: boolean;
  width?: string | number;
}
```

### Visual States

**Loading:**
```
+----------------------------------------------------------+
| [ ] | Title          | Type    | Author | Date    | Ops  |
|-----|----------------|---------|--------|---------|------|
| [=] | [========]     | [====]  | [===]  | [====]  |      |
| [=] | [==========]   | [====]  | [===]  | [====]  |      |
| [=] | [======]       | [====]  | [===]  | [====]  |      |
+----------------------------------------------------------+
```

**Empty:**
```
+----------------------------------------------------------+
|                                                           |
|                    [Empty State Icon]                     |
|                                                           |
|                   No content found                        |
|           Create your first item to get started           |
|                                                           |
|                   [+ Create Content]                      |
|                                                           |
+----------------------------------------------------------+
```

**With Data:**
```
+----------------------------------------------------------+
| [x] | Title          | Type    | Author | Date    | Ops  |
|-----|----------------|---------|--------|---------|------|
| [ ] | Homepage       | Page    | Admin  | Today   | ...  |
| [x] | About Us       | Page    | Editor | -1d     | ...  |
| [ ] | Blog Post 1    | Article | Writer | -2d     | ...  |
+----------------------------------------------------------+
| Showing 1-25 of 47                     [<] [1] [2] [>]    |
+----------------------------------------------------------+
```

### Row Hover Actions

```
| [ ] | Blog Post 1    | Article | ... | [Edit] [View] [Delete] |
```

---

## 5. Form Components

### TextField

```tsx
interface TextFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'url';
}
```

**States:**

```
Default:
+---------------------------+
| Label                     |
| +---------------------+   |
| | Placeholder...      |   |
| +---------------------+   |
| Hint text                 |
+---------------------------+

Focus:
+---------------------------+
| Label                     |
| +=====================+   | <- Primary border glow
| | User input|         |   |
| +=====================+   |
+---------------------------+

Error:
+---------------------------+
| Label                     |
| +---------------------+   | <- Red border
| | Invalid input       |   |
| +---------------------+   |
| [!] Error message         | <- Red text
+---------------------------+

Success:
+---------------------------+
| Label                 [v] | <- Green check
| +---------------------+   |
| | Valid input         |   |
| +---------------------+   |
+---------------------------+
```

### Select

```tsx
interface SelectProps {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  searchable?: boolean;
}
```

**Dropdown:**

```
+---------------------------+
| [Selected Item        v]  |
+===========================+
| [Search...]               |
|---------------------------|
| Option 1                  |
| Option 2             [v]  | <- Selected indicator
| Option 3                  |
| Option 4                  |
+---------------------------+
```

### Checkbox Group

```tsx
interface CheckboxGroupProps {
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value: string[];
  onChange: (value: string[]) => void;
}
```

**Visual:**

```
+---------------------------+
| Permissions               |
|                           |
| [x] View content          |
| [x] Edit own content      |
| [ ] Edit all content      |
| [ ] Delete content        | <- Disabled, grayed
| [x] Administer            |
+---------------------------+
```

---

## 6. Card Component

Container for grouped content.

### Variants

```tsx
type CardVariant = 'default' | 'outlined' | 'elevated' | 'interactive';

interface CardProps {
  variant?: CardVariant;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}
```

### Visual Variants

**Default (subtle background):**
```
+---------------------------+
| Card Header               |
|---------------------------|
|                           |
| Card content goes here    |
|                           |
|---------------------------|
| Footer actions            |
+---------------------------+
```

**Elevated (shadow):**
```css
.card--elevated {
  box-shadow: var(--shadow-md);
}
```

**Interactive (hover effect):**
```css
.card--interactive {
  cursor: pointer;
  transition: transform var(--transition-fast),
              box-shadow var(--transition-fast);
}

.card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 0 20px var(--color-primary-alpha);
}
```

---

## 7. Badge Component

Status and count indicators.

### Variants

```tsx
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  dot?: boolean; // Just show colored dot, no content
  pulse?: boolean; // Animated pulse effect
}
```

### Visual Examples

```
Status Badges:
[Published]    <- Green background
[Draft]        <- Purple/gray background
[Pending]      <- Yellow background, optional pulse
[Error]        <- Red background

Count Badges:
Content [23]   <- Primary color, rounded pill
Users [5]      <- Subtle background

Dot Badges:
[*] Online     <- Green dot before text
[*] Away       <- Yellow dot
[*] Offline    <- Gray dot
```

### CSS

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge--success {
  background: rgba(0, 255, 136, 0.2);
  color: var(--color-success);
}

.badge--warning {
  background: rgba(255, 215, 0, 0.2);
  color: var(--color-warning);
}

.badge--error {
  background: rgba(255, 85, 85, 0.2);
  color: var(--color-error);
}

.badge--pulse {
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

## 8. Modal/Dialog Component

Overlay dialogs for focused tasks.

### Sizes

```tsx
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}
```

### Size Specifications

| Size | Max Width | Use Case |
|------|-----------|----------|
| sm | 400px | Confirmations, simple forms |
| md | 560px | Standard forms |
| lg | 720px | Complex forms, preview |
| xl | 960px | Multi-column content |
| fullscreen | 100% - 32px | Editors, large data views |

### Visual Structure

```
+========================================+
|                                    [X] |
|  Modal Title                           |
|  Description text (optional)           |
|----------------------------------------|
|                                        |
|  Modal content goes here               |
|                                        |
|  This can include forms, tables,       |
|  or any other content.                 |
|                                        |
|----------------------------------------|
|                   [Cancel] [Confirm]   |
+========================================+

Backdrop: semi-transparent dark overlay
```

### Animation

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  animation: fadeIn var(--transition-fast);
}

.modal-content {
  animation: modalSlideIn var(--transition-base);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

---

## 9. Toast/Notification Component

Non-blocking feedback messages.

### Types

```tsx
type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastProps {
  type: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number; // ms, 0 for persistent
}
```

### Visual Layout

```
+------------------------------------------+
| [Icon]  Title of the notification    [X] |
|         Description text if provided     |
|                           [Action]       |
+------------------------------------------+
```

### Position & Stacking

```
                                    +--------+
                                    | Toast 3|
                                    +--------+
                                    | Toast 2|
                                    +--------+
                                    | Toast 1|
+---------------------------+       +--------+
|     Main Application      |
|                           |
|                           |
+---------------------------+
```

**Stacking Rules:**
- Maximum 5 visible toasts
- Older toasts slide up when new ones appear
- Auto-dismiss from oldest

### Animation

```css
.toast-enter {
  animation: toastSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-exit {
  animation: toastSlideOut 0.2s ease-out forwards;
}

@keyframes toastSlideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toastSlideOut {
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

---

## 10. Command Palette Component

Global quick-access overlay (Cmd+K).

### Structure

```tsx
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  recentCommands?: Command[];
}

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType;
  shortcut?: string;
  action: () => void;
  category?: string;
}
```

### Visual Layout

```
+================================================+
|  [Search icon] Search commands...         [X]  |
+================================================+
|                                                |
| RECENT                                         |
|   [icon] Edit "Homepage"              Ctrl+E   |
|   [icon] RSES Rules Editor            Ctrl+R   |
|                                                |
| ACTIONS                                        |
|   [icon] Create new content           Ctrl+N   |
|   [icon] Run project scan                      |
|   [icon] View activity log                     |
|                                                |
| NAVIGATION                                     |
|   [icon] Go to Dashboard              Ctrl+1   |
|   [icon] Go to Content                Ctrl+2   |
|   [icon] Go to Structure              Ctrl+3   |
|                                                |
+================================================+
```

### Keyboard Navigation

- **Arrow Up/Down**: Navigate items
- **Enter**: Execute selected command
- **Escape**: Close palette
- **Type**: Filter commands

### Search Behavior

1. Fuzzy match against label and description
2. Prioritize recent commands
3. Group by category
4. Highlight matching characters

---

## 11. Monaco Editor Integration

RSES-specific editor configuration.

### Props

```tsx
interface RSESEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: ValidationError[];
  onSave?: () => void;
  readOnly?: boolean;
}
```

### Language Features

```typescript
// Monaco language registration
monaco.languages.register({ id: 'rses' });

monaco.languages.setMonarchTokensProvider('rses', {
  tokenizer: {
    root: [
      // Comments
      [/#.*$/, 'comment'],

      // Section headers
      [/\[[\w-]+\]/, 'keyword'],

      // Set references
      [/\$[\w-]+/, 'variable'],

      // Operators
      [/->|=|\||&/, 'operator'],

      // Strings
      [/"[^"]*"/, 'string'],

      // Patterns
      [/[\w-]+\*|\*[\w-]+/, 'regexp'],

      // Attributes
      [/\{[^}]+\}/, 'attribute'],
    ]
  }
});
```

### Editor Theme (Quantum-inspired)

```typescript
monaco.editor.defineTheme('rses-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a737d' },
    { token: 'keyword', foreground: '00f0ff', fontStyle: 'bold' },
    { token: 'variable', foreground: '9d00ff' },
    { token: 'operator', foreground: 'ffd700' },
    { token: 'string', foreground: '00ff88' },
    { token: 'regexp', foreground: 'ff00aa' },
    { token: 'attribute', foreground: '00f0ff', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#0a0a0a',
    'editor.foreground': '#ffffff',
    'editor.lineHighlightBackground': '#1a1a1a',
    'editor.selectionBackground': '#00f0ff33',
    'editorCursor.foreground': '#00f0ff',
    'editorLineNumber.foreground': '#555555',
    'editorLineNumber.activeForeground': '#00f0ff',
  }
});
```

### Error Markers

```typescript
// Add error markers to editor
function setErrorMarkers(errors: ValidationError[]) {
  const markers = errors.map(err => ({
    severity: monaco.MarkerSeverity.Error,
    message: err.message,
    startLineNumber: err.line,
    startColumn: err.column || 1,
    endLineNumber: err.line,
    endColumn: err.endColumn || 1000,
  }));

  monaco.editor.setModelMarkers(model, 'rses', markers);
}
```

---

## 12. Resizable Panel Component

Split views for editor + preview layouts.

### Props

```tsx
interface ResizablePanelGroupProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode;
  onResize?: (sizes: number[]) => void;
}

interface ResizablePanelProps {
  defaultSize?: number; // percentage
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  children: React.ReactNode;
}
```

### Visual

```
+----------------------------+--+---------------------------+
|                            |  |                           |
|   Left Panel               |==|   Right Panel             |
|   (e.g., Editor)           |  |   (e.g., Preview)         |
|                            |  |                           |
|                            |  |                           |
+----------------------------+--+---------------------------+
                              ^
                    Resize handle (draggable)
```

### Resize Handle Styling

```css
.resize-handle {
  width: 4px;
  background: var(--border-subtle);
  cursor: col-resize;
  transition: background var(--transition-fast);
  position: relative;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--color-primary);
}

.resize-handle::before {
  content: '';
  position: absolute;
  inset: -4px;
}

/* Vertical handle */
.resize-handle--vertical {
  width: 100%;
  height: 4px;
  cursor: row-resize;
}
```

---

## 13. Empty State Component

Consistent empty states across the application.

### Props

```tsx
interface EmptyStateProps {
  icon?: React.ComponentType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}
```

### Visual Variants

**Simple:**
```
+---------------------------+
|                           |
|         [Icon]            |
|                           |
|    No results found       |
|                           |
+---------------------------+
```

**With Action:**
```
+---------------------------+
|                           |
|         [Icon]            |
|                           |
|   No content created yet  |
|   Get started by creating |
|   your first article.     |
|                           |
|   [+ Create Article]      |
|                           |
+---------------------------+
```

**With Search Context:**
```
+---------------------------+
|                           |
|         [Icon]            |
|                           |
|   No results for "xyz"    |
|   Try adjusting your      |
|   search or filters.      |
|                           |
|   [Clear Filters]         |
|                           |
+---------------------------+
```

---

## 14. Skeleton/Loading Component

Loading placeholders that match content layout.

### Variants

```tsx
type SkeletonVariant = 'text' | 'circular' | 'rectangular';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}
```

### Examples

**Text Lines:**
```
[====================]
[================]
[==================]
```

**Card:**
```
+---------------------------+
| [====] [========]         |
|                           |
| [====================]    |
| [================]        |
| [==================]      |
|                           |
| [====]         [======]   |
+---------------------------+
```

**Table Row:**
```
| [=] | [==========] | [====] | [===] | [====] |
```

### Animation CSS

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-1) 0%,
    var(--surface-3) 50%,
    var(--surface-1) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 15. Tooltip Component

Contextual help and abbreviation expansion.

### Props

```tsx
type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: React.ReactNode;
  position?: TooltipPosition;
  delay?: number;
  children: React.ReactNode;
}
```

### Visual

```
              +------------------+
              | Tooltip content  |
              | can span lines   |
              +--------+---------+
                       |
                       v
              [Hover Target]
```

### Positioning Logic

```typescript
// Automatic repositioning to stay in viewport
function calculatePosition(trigger: DOMRect, tooltip: DOMRect): Position {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };

  // Default to top
  let position = 'top';

  // Check if tooltip would go off-screen
  if (trigger.top - tooltip.height < 0) {
    position = 'bottom';
  }

  // Similar checks for left/right...

  return position;
}
```

---

## Implementation Checklist

### Core Components (Priority 1)
- [ ] AppShell
- [ ] Sidebar
- [ ] Header
- [ ] Button (all variants)
- [ ] Input, Select, Checkbox
- [ ] Card
- [ ] Badge

### Data Components (Priority 2)
- [ ] DataTable
- [ ] Pagination
- [ ] EmptyState
- [ ] Skeleton

### Feedback Components (Priority 3)
- [ ] Toast
- [ ] Modal/Dialog
- [ ] Tooltip
- [ ] Progress

### Advanced Components (Priority 4)
- [ ] CommandPalette
- [ ] ResizablePanel
- [ ] Monaco Editor (RSES)
- [ ] Tabs
- [ ] Accordion

### Utility Components (Priority 5)
- [ ] Breadcrumbs
- [ ] Avatar
- [ ] DropdownMenu
- [ ] ContextMenu

---

*Document Version: 1.0*
*Last Updated: 2024*
