# VISUAL DIRECTION

Aesthetic and interaction defaults for the admin SPA, reader SPA, and public pages. Not a comprehensive design system. Enough structure that a developer can implement the UIs without re-arguing every decision, and enough room that a real designer can tighten later without a rewrite.

Honest scope: **I am not a designer.** This doc commits to sensible defaults grounded in the product's nature (reader-first, keyboard-first, dense, self-hosted). It does not invent mockups. Visual polish is a separate phase with a designer in the loop.

---

## 1. Principles

Five, in priority order. If two conflict, higher wins.

1. **Information density wins over whitespace.** Readers of aggregators view hundreds of items a day. A list that shows 6 items per viewport is worse than one that shows 20, regardless of how pretty the 6 are.

2. **Keyboard-first navigation.** If a user can do something only with the mouse, that's a bug. Every list is navigable with `j/k`, every action has a documented shortcut, `?` shows the shortcut map.

3. **No dark patterns, no spinners masking work under 100 ms.** Optimistic updates on reads; show real latency on writes. Never show a loading state for something that's already done.

4. **Respect the user's system.** System font. Honor `prefers-color-scheme`. Honor `prefers-reduced-motion`. Don't override the user's scrollbar.

5. **Anti-ceremony.** No splash screens. No onboarding tours. No empty-state illustrations that waste a viewport. A clear empty state is `You don't have any feeds yet. [Add feed]` — that's enough.

---

## 2. References

Products whose UX approach matches where we're going. Not mimicry — orientation.

- **Miniflux** — the gold standard for RSS aggregator UX. Dense lists, keyboard shortcuts, clean typography, zero decoration. If in doubt about a reader-side decision, ask "what would Miniflux do?"
- **NetNewsWire** — native macOS reader. Three-pane layout, keyboard shortcuts, respects platform conventions. Good reference for reader-detail interaction.
- **HEY (Basecamp)** — opinionated, dense, anti-overwhelm. The idea that power users want fewer knobs but more control.
- **GitHub** — dense information UIs done well. Tables that show a lot without looking cluttered.
- **Hacker News** — dense to a fault, but the fault is part of the virtue. Proves that "unstyled HTML with good information architecture" is a valid aesthetic.
- **Linear** — keyboard-first issue tracker. Good reference for command palette + shortcut-driven interaction.

Products we are **not** trying to be:
- Notion (too playful, too ceremonial for aggregator reading).
- Substack (publisher-facing, not reader-facing).
- Medium (content is the product, UI is brand).
- WordPress admin (clear counter-example).

---

## 3. Typography

### 3.1 Font stack

System fonts. No webfont loading. Rationale: instant render, zero network cost, respects user's language preferences, survives offline.

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter",
             Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
             "Apple Color Emoji", "Segoe UI Emoji";

--font-serif: Charter, "Bitstream Charter", "Sitka Text", Cambria,
              Georgia, "Noto Serif", serif;

--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
             "Liberation Mono", "Courier New", monospace;
```

- **`--font-sans`** — UI chrome, titles in lists, form labels.
- **`--font-serif`** — body text of user posts and feed-item content in the item-detail view. Reading is long-form; serif reads better.
- **`--font-mono`** — rule expressions, URLs, code blocks, slugs, technical identifiers.

### 3.2 Size scale

Eight sizes. Use the named variable, never the number.

```css
--text-2xs:  11px;   --lh-2xs: 14px;    /* timestamps, captions */
--text-xs:   12px;   --lh-xs:  16px;    /* meta, secondary */
--text-sm:   13px;   --lh-sm:  18px;    /* UI chrome, buttons */
--text-base: 15px;   --lh-base: 22px;   /* default body, list titles */
--text-lg:   17px;   --lh-lg:  26px;    /* item detail body */
--text-xl:   20px;   --lh-xl:  28px;    /* page titles */
--text-2xl:  26px;   --lh-2xl: 32px;    /* item-detail title */
--text-3xl:  34px;   --lh-3xl: 40px;    /* rare — public post title */
```

15 px default rather than 16 px: reader UIs benefit from slightly denser body text. Single deliberate deviation from the common 16-based scale.

### 3.3 Weight

- `400` regular — body.
- `500` medium — UI emphasis, list titles.
- `600` semibold — section headings, strong emphasis.
- `700` bold — page titles only, sparingly.

No light weights (300 and below). System fonts don't render them reliably across platforms.

### 3.4 Reading body (post content, feed-item content in detail view)

```css
body-copy {
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  max-width: 70ch;       /* reading measure */
  color: var(--text-primary);
}

body-copy h1, h2, h3 {
  font-family: var(--font-sans);
  font-weight: 600;
  margin-top: 2em;
  margin-bottom: 0.5em;
}

body-copy p { margin: 0 0 1em; }
body-copy pre, body-copy code { font-family: var(--font-mono); font-size: 0.93em; }
body-copy a { text-decoration: underline; text-underline-offset: 0.15em; }
body-copy blockquote {
  border-left: 3px solid var(--border-strong);
  padding-left: 1em;
  color: var(--text-secondary);
}
body-copy img { max-width: 100%; height: auto; }
```

Readable at default browser zoom on laptop and phone. No `prose`-style library; hand-rolled CSS rules that we can reason about.

---

## 4. Color

### 4.1 Palette

Minimal. Two accents (primary + warning/danger), plus a neutral scale with light and dark variants.

```css
/* Light theme (default) */
:root {
  --bg-primary:       #ffffff;
  --bg-secondary:     #f7f7f8;
  --bg-tertiary:      #eeeff1;
  --bg-hover:         #e5e6e9;
  --bg-active:        #dadbde;

  --text-primary:     #0b0c0f;
  --text-secondary:   #5a5e66;
  --text-tertiary:    #8b9099;
  --text-link:        #0052cc;
  --text-link-hover:  #003d99;

  --border-subtle:    #e5e6e9;
  --border-strong:    #c6c8cd;
  --border-focus:     #0052cc;

  --accent-primary:   #0052cc;
  --accent-primary-bg: #e7efff;
  --accent-warning:   #b58100;
  --accent-warning-bg:#fef4dd;
  --accent-danger:    #c02828;
  --accent-danger-bg: #fbe7e7;
  --accent-success:   #1a7b41;
  --accent-success-bg:#e1f4e9;
}

/* Dark theme */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary:       #0d0e11;
    --bg-secondary:     #15171c;
    --bg-tertiary:      #1d2028;
    --bg-hover:         #252932;
    --bg-active:        #30353f;

    --text-primary:     #ebedf0;
    --text-secondary:   #a7abb3;
    --text-tertiary:    #6b707a;
    --text-link:        #6ba9ff;
    --text-link-hover:  #9bc4ff;

    --border-subtle:    #252932;
    --border-strong:    #3a3f4a;
    --border-focus:     #6ba9ff;

    --accent-primary:   #6ba9ff;
    --accent-primary-bg:#102643;
    --accent-warning:   #edb447;
    --accent-warning-bg:#3a2d0a;
    --accent-danger:    #f28a8a;
    --accent-danger-bg: #3a1313;
    --accent-success:   #8bd1a5;
    --accent-success-bg:#0f2d1a;
  }
}
```

Dark theme is not an afterthought — designed from the start. Reader-aggregator users read in low-light often.

User override: a `<html data-theme="light|dark|auto">` attribute; `auto` (default) follows system. Toggle in user menu.

### 4.2 Semantic use

- **Primary text** (`--text-primary`) — body copy, list titles.
- **Secondary** (`--text-secondary`) — timestamps, byline, meta. Faded but legible.
- **Tertiary** (`--text-tertiary`) — hints, placeholders. Low-emphasis.
- **Link** (`--text-link`) — only on actual links. Underlined.
- **Primary accent** — focus rings, primary button, unread indicator, selected tag. One accent color, restrained use.
- **Warning** — "feed is failing," "unsaved changes." Yellow-amber.
- **Danger** — delete confirmations, irreversible actions. Red.
- **Success** — confirmation of successful save, "feed is healthy." Green.

No rainbow of colors per category. Categories differentiate by typography, position, or small marker glyphs — not color.

### 4.3 Contrast

Every text/background pair meets WCAG AA (4.5:1 for body, 3:1 for large). Verified with automated contrast tests in `tests/a11y/`.

---

## 5. Spacing

4-pixel base grid.

```css
--space-0:  0;
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

Prefer the scale. Arbitrary pixel values are a smell.

- List-row vertical padding: `--space-2` (8 px top + bottom). Dense.
- Form field spacing: `--space-3` between label and input, `--space-4` between fields.
- Section-to-section gap: `--space-6`.
- Page edge padding: `--space-4` on mobile, `--space-6` on desktop.

---

## 6. Layout

### 6.1 Admin + reader SPA layout

Three-column on wide screens, collapse to single-column on < 900 px width.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar (48 px)                                                      │
├─────────────────┬────────────────────────────────────────────────────┤
│                 │                                                    │
│ Left rail       │ Main content area                                  │
│ (240 px fixed)  │ (fluid, max 1200 px centered on very wide)         │
│                 │                                                    │
│                 │                                                    │
├─────────────────┴────────────────────────────────────────────────────┤
```

- Top bar: product name / logo (plain text), global search / command, user menu.
- Left rail: menu items (from hooks). Collapsed to hamburger on narrow.
- Main: the current screen.

Reader SPA's item-detail view uses a two-column split (list + detail) when width allows, stacks on narrow.

### 6.2 Public HTML layout

Single column, centered, max 70 ch (characters). Minimal chrome.

```
  ┌────────────────────────────────────┐
  │  {user display name} / rss-cms     │  <-- tiny header, minimal
  │                                    │
  │  ═ post title ═                    │  <-- large, serif
  │    by {author}  ·  {date}          │
  │                                    │
  │    post body ...                   │  <-- serif, 70ch measure
  │                                    │
  │                                    │
  └────────────────────────────────────┘
```

No sidebar. No "related posts." No footer beyond a single line with canonical URL.

---

## 7. Components — baseline visual spec

Enough to implement. Not visual mockups, rule-based descriptions.

### 7.1 Button

```
default (primary):    bg=accent-primary, fg=#fff, padding=space-2 × space-4, font=sans 500 sm, border-radius=4px
secondary:            bg=transparent, fg=text-primary, border=1px border-strong
ghost:                bg=transparent, fg=text-primary, no border, hover=bg-hover
danger:               bg=accent-danger, fg=#fff
icon-only:            32×32, hover=bg-hover, tooltip on hover
disabled:             opacity=0.5, cursor=not-allowed, no hover state
```

### 7.2 Input

```
default:              bg=bg-primary, border=1px border-strong, padding=space-2 × space-3, font-sans, base
focus:                border-color=border-focus, box-shadow=0 0 0 2px accent-primary-bg (for 3:1 visible focus)
error:                border-color=accent-danger, hint-color=accent-danger
  ├── label (above):  font-sans sm, text-secondary
  ├── input           
  └── hint (below):   font-sans xs, text-tertiary (or accent-danger on error)
```

### 7.3 List row (inbox item)

```
height: auto (min 56 px)
padding: space-2 × space-4
border-bottom: 1px border-subtle
hover: bg-hover
focus/selected: bg-active, left-border=3px accent-primary

  read-status-indicator (10×10 dot) · title (sm, weight-500) · tags (chips)
                                       byline · time · excerpt (xs text-secondary, 1 line truncated)
```

No card shadow. No rounded corners on list rows (kills density).

### 7.4 Tag chip

```
inline:                 bg=bg-tertiary, fg=text-secondary, padding=2px × space-2, font-mono xs,
                        border-radius=4px, not bold
clickable / filter:     cursor=pointer, hover=bg-hover
selected (in facet):    bg=accent-primary-bg, fg=accent-primary
removable:              trailing × icon, hover=accent-danger bg=accent-danger-bg
```

### 7.5 Table (admin data tables)

```
head:                   background=bg-secondary, bottom-border=1px border-strong, font-sans-sm weight-500, text-secondary
body row:               padding=space-2 × space-4, font-sans-sm, border-bottom=1px border-subtle
body row hover:         bg-hover
body row selected:      bg-active
row-action column:      narrow, right-aligned, hover shows ⋯ icon
zebra-striping:         off (distracts, lower info density)
```

### 7.6 Dialog / modal

Used sparingly. Only for destructive confirmation, data that overlays current context.

```
backdrop:               rgba(0,0,0,0.5), blur (optional, only on modern browsers)
surface:                bg-primary, border-radius=8px, box-shadow=0 8px 32px rgba(0,0,0,0.2)
padding:                space-6
title:                  xl, weight-600
body:                   base, text-primary
actions:                right-aligned, gap=space-3
close on:               escape, backdrop click, ✕ button top-right
focus-trap:             yes
return-focus on close:  yes, to the trigger
```

### 7.7 Notification / toast

For transient feedback (e.g. "Rule saved"). Auto-dismiss after 3 s. Not for anything the user must acknowledge.

```
position:               bottom-right (top-right for admin)
entry:                  slide-in 120 ms
exit:                   fade 200 ms
types:                  success / info / warning / error — color from semantic palette
content:                message (required), optional action button (e.g. "Undo" for deletions)
```

### 7.8 Code / expression editor

Monaco editor (salvage already pulls it in). Config:

```
theme:                  light / dark matching system theme
font-family:            mono stack
font-size:              13px
line-numbers:           off for short inputs, on for rules ≥ 3 lines
word-wrap:              on
minimap:                off
scrollbeyondlast:       off
automaticlayout:        on
```

Safe-expression syntax highlighting mode is a small custom language; contribution target in the classification module.

---

## 8. Motion

Minimal. Functional only.

- Hover state: instant (0 ms).
- Focus ring: instant.
- Dialog entry: 200 ms ease-out.
- Dialog exit: 150 ms ease-in.
- Toast entry: 120 ms ease-out.
- Toast exit: 200 ms fade.
- Panel slide (sidebar collapse): 150 ms ease-in-out.
- Infinite scroll load-more: no animation; the new items just appear.

`@media (prefers-reduced-motion: reduce)` — disable all of the above. Use `transition: none`. Dialogs, toasts, etc. appear / disappear instantly.

No parallax. No scroll-linked effects. No hover tooltips with animations. No loading spinners longer than 100 ms that animate (if a request is slower than that, show a static progress indicator, not a rotating circle).

---

## 9. Accessibility baseline

### 9.1 Requirements

- **Keyboard**: every interaction is keyboard-reachable. Tab order is logical. `Esc` closes dialogs / deselects.
- **Focus visible**: a visible focus ring on every focusable element. Never `:focus { outline: none }` without a replacement.
- **Color contrast**: body text ≥ 4.5:1, large text ≥ 3:1, UI components ≥ 3:1 for borders / state indicators. Test in both themes.
- **Screen reader**:
  - Semantic HTML — `<nav>`, `<main>`, `<article>`, `<header>`, `<time>` with `datetime` attribute.
  - `aria-label` on icon-only buttons.
  - `aria-live` regions for toast notifications (polite) and alert-level errors (assertive).
  - `aria-current="page"` on the active left-rail item.
  - Form fields have `<label for>` or `aria-labelledby`.
  - Error messages use `aria-describedby` linking input → error.
- **Reduced motion**: respected as described above.
- **Color is never the only signal**: read/unread indicated by both a dot AND a font-weight change. Failing-feed indicated by an icon AND a label AND color.

### 9.2 Screen reader flow — reader SPA inbox

Tab order through one item:
1. Item row (container). Says: `"unread. Techcrunch: Apple unveils M5. 2 hours ago. Tagged technology, apple. Press O to open."`
2. Action buttons (save / read toggle / tag).

Arrow keys within the list, `Enter` to open, `Esc` to return to list.

### 9.3 Testing

- `@axe-core/react` in development — surfaces violations in the console.
- `tests/a11y/contrast.test.ts` — automated contrast checks against the palette.
- `tests/a11y/keyboard.test.ts` — Playwright / Testing Library verifies key shortcuts.
- Manual audit before release with a screen reader (VoiceOver or Orca).

---

## 10. Iconography

Minimal. Use system-style icons, not a heavy icon library.

- [Lucide](https://lucide.dev/) or [Phosphor](https://phosphoricons.com/) — both are MIT-licensed, tree-shakeable.
- Icons are 16 × 16 or 20 × 20, colored via `currentColor`.
- Strokes only (no filled icons) for consistency.
- No icon without a text label, except in well-known cases (✕ close, ⌕ search, ☰ menu).

No mascot. No custom illustrations in the MVP.

---

## 11. Empty states

Never a large illustration. A single sentence of what to do next:

```
You don't have any feeds yet.

  [ Add your first feed ]
```

The button is the only visual accent. No "empty folder" SVG.

Exception: the unclassified queue. When empty, it's a good thing — "All items classified." Small success indicator (the success-colored checkmark icon + text). Still no illustration.

---

## 12. What this doc does NOT specify

On purpose. Decisions better made with a designer or a specific implementation context.

- **Specific logos / branding marks.** The product name is set in plain `--font-sans` weight-500 until we have a brand.
- **Favicon.** A single-letter monogram in the primary accent works as an MVP placeholder.
- **Email template styles.** No email in MVP (see SPEC §8 non-goals).
- **Marketing / landing page.** There isn't one. The product's entry point is `/login` or the first-boot `/setup` token URL. A homepage belongs with marketing, not this MVP.
- **Exact pixel sizes of every component.** The scale + component baselines are enough for implementation; a designer can fine-tune later without a rewrite.
- **Micro-interactions.** Any animation not listed in §8 is out of scope.

---

## 13. Implementation path

1. Create `ui/shared/tokens.css` containing all the CSS custom properties above. Both SPAs import this.
2. Create `ui/shared/reset.css` with a modern CSS reset (Josh Comeau's or custom-modified).
3. Create `ui/shared/type.css` applying the type scale + default body rules.
4. Component library lives in `ui/shared/components/`:
   - `Button`, `Input`, `Label`, `FormField`, `Textarea`, `Select`
   - `ListRow`, `TagChip`, `StatusBadge`, `Pill`
   - `Dialog`, `DropdownMenu`, `Toast`, `Tooltip`
   - `DataTable` (columns spec-driven)
   - `EmptyState`
   - `KeyboardShortcut` (displays a shortcut visually)
5. Both SPAs import from `ui/shared/`. No duplication.
6. Storybook (optional but recommended) — fast iteration on components in isolation.
7. Every component gets a snapshot test for both themes.

---

## 14. Design review gates

Before the MVP ships visually:

- [ ] All palette colors check contrast in both themes (AA minimum).
- [ ] Every shortcut from DESIGN.md §6.4 and §7.4 works and is listed in the `?` help overlay.
- [ ] Every interactive element has a visible focus ring.
- [ ] Screen-reader walkthrough of: register, login, subscribe to feed, view inbox, open item, write post — no blockers.
- [ ] `prefers-reduced-motion` disables all transitions verified manually.
- [ ] Dark mode tested on at least two browsers (Safari + Firefox; Chromium is assumed).
- [ ] Print styles exist for public post page (clean reading; no nav; proper page break behavior).
- [ ] Component library has no CSS leaking between components (verified via scoped class names or CSS modules).
- [ ] Admin + reader SPAs bundle-size under 250 KB gzipped each (initial JS).

When these are checked, the MVP is visually honest. Further polish is future work — a designer pass to tighten typography, refine iconography, and add small moments of character without breaking any of the above.
