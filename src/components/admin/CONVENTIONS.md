# Admin UI Conventions — "Mushroom & forest floor"

The admin (`src/app/admin/*`) uses Tailwind CSS v4 with a custom earthy theme
defined in `src/app/admin/admin.css` (imported by the admin layout only — the
public site is unaffected). Pages must be styled with Tailwind classes and the
shared components in this directory — no `React.CSSProperties` style objects.
Inline `style={{}}` is allowed only for truly dynamic values (computed widths,
user-generated colors).

## Theme tokens (use these, not default Tailwind palette names)

| Scale | Use |
|---|---|
| `bone-50..400` | Surfaces: `bone-50` cards, `bone-100` page bg, `bone-200` subtle fills, `bone-300` borders |
| `bark-100..900` | Warm brown neutrals: `bark-800` headings, `bark-600/700` body, `bark-400` muted, `bark-900` dark surfaces |
| `moss-50..900` | Primary green: `moss-600` primary actions, `moss-100`/`moss-700` success badge |
| `amber-50..800` | Honey/ochre (custom values, overrides Tailwind amber): pending, warnings |
| `clay-50..800` | Burnt terracotta: errors, destructive |
| `lichen-100..700` | Muted blue-green: info |

Fonts: `font-sans` (default), `font-display` (serif — page titles, logo).
Animations: `animate-fade-in`, `animate-sheet-up`, `animate-drawer-in`.

## Shared components (`@/components/admin`)

- `Button` — `variant`: primary | secondary | ghost | danger | danger-ghost; `size`: sm | md; `loading`, `full`. Always use for buttons (44px touch targets).
- `Card` — bordered cream surface; `padded={false}` for list cards with `divide-y divide-bone-200`.
- `Badge` + `statusTone(status)` — status pills; `tone`: neutral | success | warning | danger | info | moss.
- `Alert` — `tone`: success | error | warning | info; optional `onDismiss`. Use for page-level error/success messages.
- `Modal` — `open`, `onClose`, `title`, `footer`, `wide`. Bottom sheet on mobile, centered on desktop. Put action buttons in `footer` (they stack full-width on mobile).
- `Field`, `Input`, `Select`, `Textarea` — form controls (16px text on mobile to prevent iOS zoom). `Field` wraps with `label`/`hint`/`error`/`required`.
- `PageHeader` — `title`, `subtitle`, `actions` (actions stack full-width on mobile).
- `StatCard`, `EmptyState`, `Spinner`/`LoadingState`, `FilterTabs` (scrollable status filter pills), `Icon` (`IconName`), `cn`.

## Layout & responsive rules

- Page container: `mx-auto max-w-6xl p-4 sm:p-8` (see `src/app/admin/page.tsx`).
- Mobile-first: everything must work at 375px wide with no horizontal scroll.
- Card grids: `grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4` (or 3).
- Two-column form rows: `grid grid-cols-1 gap-4 sm:grid-cols-2`.
- Table-like rows: flex rows that wrap (`flex-wrap gap-x-3 gap-y-1`) or stack on mobile — never force horizontal scroll.
- Touch targets ≥ 44px (`min-h-11`) for interactive elements.
- The shell already handles nav, sign-out, and bottom padding for the mobile tab bar.
