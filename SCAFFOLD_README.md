# Tripdar Technical Scaffold

This document explains the minimal technical scaffold created to support the first-time user flow described in `TRIPDAR_FIRST_TIME_USER_FLOW.md`.

## Files Created

### Project Configuration
- **package.json** - Project dependencies and scripts (React, React Router, TypeScript, Vite)
- **tsconfig.json** - TypeScript configuration
- **tsconfig.node.json** - TypeScript configuration for Node tooling
- **vite.config.ts** - Vite build configuration
- **index.html** - Application entry point
- **.gitignore** - Git ignore patterns

### Application Structure
- **src/main.tsx** - React application entry point
- **src/App.tsx** - Main routing configuration
- **src/routes/** - Route component placeholders

### Route Components

#### Entry Points (First-Time User Flow)
1. **FirstTimeEntry.tsx** (`/`)
   - Handles first-time user WITHOUT QR code
   - Placeholder for Moments 1-10 orientation flow
   - Read-only state tracking only

2. **SignalEntry.tsx** (`/signal/:id`)
   - Handles first-time user WITH QR code pointing to a signal
   - Placeholder for Moments 1-10 orientation flow (with context)
   - Read-only access to signal data

3. **StoryEntry.tsx** (`/story/:id`)
   - Handles first-time user WITH QR code pointing to a story
   - Placeholder for Moments 1-10 orientation flow (with context)
   - Read-only access to story data

#### Layer Routes (Signals vs Stories)
4. **SignalsView.tsx** (`/signals/:scale`)
   - Displays signals (Tripdar layer) at specified scale
   - Scale: "macro" or "microdose"
   - Read-only, maintains separation from stories

5. **StoriesView.tsx** (`/stories/:scale`)
   - Displays stories (Triptales layer) at specified scale
   - Scale: "macro" or "microdose"
   - Read-only, maintains separation from signals
   - Stories never alter signal metrics (constitutional requirement)

## Architecture Mapping

This scaffold implements the routing and state differentiation layer that supports the conceptual architecture:

### Source Observation Layer
- Routes handle read-only access to `ops.originalpsilly.com` (not yet implemented)
- All data access is read-only (enforced in route component comments)

### Separate Presentation Layer
- **Signals** (`/signals/:scale`) and **Stories** (`/stories/:scale`) are separate routes
- No data flows between signal and story routes
- Separation is enforced by route structure

### Experience Orchestration Layer
- Routing structure enables navigation between:
  - Macro and microdose scales (via `:scale` parameter)
  - Signals and stories (via different route prefixes)
- Navigation is available but not required (user agency)

### Constitutional Compliance
- No gamification structures (no scores, streaks, badges)
- No retailer metrics
- No pay-to-visibility (not implemented)
- Signals and stories are clearly separated
- All operations are read-only (no data mutation)

## Route Structure

```
/                          → FirstTimeEntry (no QR)
/signal/:id                → SignalEntry (QR to signal)
/story/:id                 → StoryEntry (QR to story)
/signals/:scale            → SignalsView (macro|microdose)
/stories/:scale            → StoriesView (macro|microdose)
```

## State Differentiation

The scaffold supports state differentiation through:

1. **Route Parameters**
   - `:id` - Identifies specific signal/story entry point
   - `:scale` - Distinguishes macro vs microdose experiences

2. **Route Prefixes**
   - `/signals/*` - All signal (Tripdar) routes
   - `/stories/*` - All story (Triptales) routes

3. **Entry Point Types**
   - Root route (`/`) - First-time without context
   - ID routes (`/signal/:id`, `/story/:id`) - First-time with context

## What's Not Implemented (By Design)

Per the task requirements, the following are explicitly NOT included:

- UI design or styling (placeholder components only)
- Copywriting (no content)
- Components beyond placeholders
- Data fetching from ops.originalpsilly.com
- State management for orientation moments
- Navigation UI between routes
- Monetization logic
- Interpretation services
- Contribution/submission flows
- Analytics or engagement tracking

## Next Steps (Not in Scope)

This scaffold provides the foundation for:
1. Implementing orientation flow state management
2. Adding data fetching from ops.originalpsilly.com
3. Building UI components for each route
4. Implementing comparative views (read-only)
5. Adding navigation between routes

All future implementation must comply with `TRIPDAR_CONSTITUTION.md`.

