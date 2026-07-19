# Sidebar Project Title Long-Press → New Session

**Date:** 2026-07-19
**Status:** Approved for planning
**Scope:** Mobile sidebar only (`md:hidden` project card layout). Desktop project row is unchanged.

## Problem

On mobile, starting a new session inside a project requires: tap the project card to expand it, then tap the "New session" button that appears below. The user wants a shortcut: long-pressing the project title should jump straight to a new session for that project, without requiring the project to already be expanded.

## Goals

1. Long-pressing the project **title** (not the star/edit/delete icons, not the whole card) triggers the same effect as tapping the existing "New session" button for that project.
2. Short tap on the title still expands/collapses the project — unchanged.
3. Touch-only. Desktop mouse interaction is out of scope; desktop keeps hover-reveal icons + click-to-expand + explicit button.
4. Give the user feedback that a long press is being recognized (vibration + a brief visual cue), so the action doesn't feel silent or accidental.

## Non-Goals

- Desktop / mouse long-press support.
- Long-press on session rows, star/edit/delete buttons, or anywhere else in the sidebar.
- Any confirmation dialog before creating the session (matches existing button behavior, which has none).
- Changing what "new session" actually does downstream (`handleNewSession` in `useProjectsState.ts` is untouched).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Mobile touch only | Long-press is a touch gesture; desktop already has hover + explicit button |
| Hit target | Title row only (excludes star/edit/delete icons) | Explicit user requirement; avoids conflicting with icon buttons' own `onClick` |
| Coexistence with tap-to-expand | Both gestures on the same element | Short tap still bubbles a click to the card's `onClick={toggleProject}`; long-press suppresses that click via `preventDefault()` on `touchend` |
| Implementation shape | Reusable `useLongPress` hook | Matches existing long-press pattern already proven in `mobileTerminalSelection.ts`; keeps gesture logic testable and out of the render tree |
| Trigger threshold | 500ms | Matches typical iOS long-press/select timing; low false-positive rate |
| Move cancellation | >10px movement cancels pending long-press | Standard mobile pattern; prevents conflict with list scrolling |
| Feedback | `navigator.vibrate()` (if available) + a brief opacity/highlight change on the title row | Confirms recognition without adding a progress-ring UI |
| Action fired | `onProjectSelect(project)` then `onNewSession(project)` | Identical to the existing mobile "New session" button (`SidebarProjectSessions.tsx`) |

## Architecture

### New hook: `src/hooks/useLongPress.ts`

```ts
type UseLongPressOptions = {
  onLongPress: () => void;
  delay?: number;           // default 500
  moveTolerancePx?: number; // default 10
  disabled?: boolean;
};

function useLongPress(options: UseLongPressOptions): {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
  isPressing: boolean;
};
```

Behavior:

- `onTouchStart`: only for single-touch (`touches.length === 1`); records the start coordinate; starts a `setTimeout(delay)` that calls `onLongPress()` and marks the gesture as "fired".
- `onTouchMove`: if the touch moves past `moveTolerancePx` from the start point, clears the pending timeout (treated as a scroll/drag, not a long press).
- `onTouchEnd`: if the gesture had "fired", calls `event.preventDefault()` to suppress the browser's synthesized `click` (so the parent card's `onClick={toggleProject}` does not also run); otherwise does nothing, letting the click bubble normally for a plain short tap.
- `onTouchCancel`: clears the pending timeout.
- Cleans up the timeout on unmount / on a new `touchstart`.

This follows the same setTimeout + move-cancel + `preventDefault`-on-`touchend` pattern already used for long-press text selection in `src/components/shell/utils/mobileTerminalSelection.ts`.

### Component wiring: `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx`

Applied only inside the existing `md:hidden` mobile branch, on the title row container (the `<div>` wrapping the `<h3>{project.displayName}</h3>` and the task indicator), not the outer card:

```tsx
const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, isPressing } = useLongPress({
  onLongPress: () => {
    if (navigator.vibrate) navigator.vibrate(12);
    onProjectSelect(project);
    onNewSession(project);
  },
  disabled: isEditing,
});
```

```tsx
<div
  className={cn('flex min-w-0 flex-1 items-center justify-between', isPressing && 'opacity-70')}
  onTouchStart={onTouchStart}
  onTouchMove={onTouchMove}
  onTouchEnd={onTouchEnd}
  onTouchCancel={onTouchCancel}
>
  <h3 className="truncate text-sm font-normal text-foreground">{project.displayName}</h3>
  {tasksEnabled && (
    <TaskIndicator status={taskStatus} size="xs" className="ml-2 hidden flex-shrink-0 md:inline-flex" />
  )}
</div>
```

Everything else in the card (star icon, edit/delete icons, session count line, whitespace, chevron) is untouched and keeps its existing `onClick={toggleProject}` (via the card-level handler) behavior.

## Edge Cases

- **Scrolling the list while starting a touch on a title**: movement past 10px cancels the pending long-press; native scroll is unaffected since nothing calls `preventDefault()` on `touchmove`.
- **Editing project name** (`isEditing === true`, title replaced by an `<input>`): long-press is disabled so it doesn't fight text-cursor placement/selection in the input.
- **Multi-touch** (e.g., pinch): `touches.length !== 1` at `touchstart` means the gesture never starts.
- **`navigator.vibrate` unavailable** (e.g., some iOS Safari versions): silently skipped; no error, visual feedback still applies.
- **Visual feedback duration**: since `onNewSession` triggers an immediate navigation (and closes the sidebar on mobile), the `opacity-70` flash will often be visible only briefly before the view changes — this is expected; vibration is the primary confirmation signal.
- **Unmount / re-render mid-press**: hook clears its timeout on unmount and when a new `touchstart` begins, preventing stale timers from firing after the component is gone.

## File Changes

| File | Change |
|------|--------|
| `src/hooks/useLongPress.ts` | New. Generic touch-only long-press hook. |
| `src/hooks/useLongPress.test.ts` | New. Unit tests using fake timers over touchstart/move/end sequences. |
| `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx` | Wire `useLongPress` onto the mobile title row; add `isPressing`-driven highlight class. |

## Acceptance Criteria

1. On a mobile viewport, a short tap on the project title still expands/collapses the project (unchanged).
2. A ~500ms press-and-hold on the project title (without moving >10px) selects the project and opens a new session — same end state as tapping the existing "New session" button.
3. The same long press does **not** also toggle the project's expanded/collapsed state.
4. Moving the finger more than 10px before 500ms elapses cancels the long-press; the touch is treated as a scroll/drag.
5. Long-press on the star, edit, or delete icons is unaffected — those keep their existing tap behavior only.
6. Long-pressing while the project name is being edited does nothing extra.
7. Desktop (`md:` breakpoint) project row behavior is unchanged.

## Risks & Notes

- `event.preventDefault()` inside `touchend` to suppress the synthesized click is a pattern already relied upon elsewhere in this codebase (`mobileTerminalSelection.ts`), so it's a proven approach for this browser/WebView target rather than a novel risk.
- Because `onNewSession` has no confirmation step (matching the existing button), an accidental long-press has low cost: it only switches the UI to a "new session draft" state for that project, it does not delete or create anything on the backend immediately.
