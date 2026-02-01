# Potentially Unused UI Components

The following shadcn/ui components appear to be unused and could be removed to reduce bundle size.

## Confirmed Unused

These components have no imports outside of `components/ui/`:

| Component | File | Size (approx) |
|-----------|------|---------------|
| input-otp | `input-otp.tsx` | 2KB |
| chart | `chart.tsx` | 3KB |
| calendar | `calendar.tsx` | 2KB |
| carousel | `carousel.tsx` | 3KB |
| avatar | `avatar.tsx` | 1KB |
| drawer | `drawer.tsx` | 2KB |
| menubar | `menubar.tsx` | 3KB |
| navigation-menu | `navigation-menu.tsx` | 3KB |
| aspect-ratio | `aspect-ratio.tsx` | 0.5KB |
| hover-card | `hover-card.tsx` | 1KB |
| radio-group | `radio-group.tsx` | 1KB |
| slider | `slider.tsx` | 1KB |
| toggle-group | `toggle-group.tsx` | 2KB |
| collapsible | `collapsible.tsx` | 1KB |

**Estimated savings: ~25KB** (before minification)

## Currently Used

These components are actively used:

- `button` - Used everywhere
- `card` - Config sidebar, error boundary
- `dialog` - Modal dialogs
- `dropdown-menu` - Context menus
- `form` - Form handling
- `input` - Text inputs
- `label` - Form labels
- `popover` - Tooltips and popovers
- `scroll-area` - Scrollable areas
- `select` - Dropdowns
- `separator` - Visual dividers
- `sheet` - Slide-out panels
- `skeleton` - Loading states
- `tabs` - Tab navigation
- `textarea` - Text areas
- `toast` - Notifications
- `toaster` - Toast container
- `tooltip` - Hover tooltips
- `badge` - Status badges
- `status-badge` - Custom status badges
- `resizable` - Resizable panels
- `editor-textarea` - Code editor

## How to Remove

```bash
# Remove unused component files
cd client/src/components/ui
rm input-otp.tsx chart.tsx calendar.tsx carousel.tsx avatar.tsx drawer.tsx menubar.tsx navigation-menu.tsx aspect-ratio.tsx hover-card.tsx radio-group.tsx slider.tsx toggle-group.tsx collapsible.tsx
```

**Note:** Run a full build after removal to verify no hidden dependencies.
