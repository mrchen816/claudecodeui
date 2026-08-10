# Sidebar Project Title Long-Press → New Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the mobile sidebar, long-pressing a project's title starts a new session for that project (same effect as the existing "New session" button), while a short tap on the same title still expands/collapses the project as before.

**Architecture:** A framework-free `LongPressGesture` class (start/move/end/cancel state machine, delay + move-tolerance) does the timing/cancellation logic and is unit-testable with Node's built-in test runner. A thin `useLongPress` React hook wraps one `LongPressGesture` instance per component and exposes `onTouchStart/onTouchMove/onTouchEnd/onTouchCancel` handlers plus an `isPressing` flag. `SidebarProjectItem.tsx` binds those handlers to the mobile title row only (not the star/edit/delete icons, not the whole card), and calls `onProjectSelect` + `onNewSession` — the exact same calls the existing "New session" button already makes — when the gesture fires.

**Tech Stack:** React 18, TypeScript, Vite (existing CloudCLI client). Tests run via Node's built-in test runner through `tsx` (`npx tsx --test <file>`), matching the existing `src/utils/wechat-paste.test.ts` convention. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-19-sidebar-project-longpress-design.md`

## Global Constraints

- Touch-only, mobile sidebar layout only (`md:hidden` branch of `SidebarProjectItem.tsx`). Desktop project row is untouched.
- Long-press hit target is the title row only — excludes the star/edit/delete icon buttons and the session-count line.
- Short tap on the title must keep bubbling a click to the card's existing `onClick={toggleProject}` — do not add `stopPropagation`.
- Long-press threshold: 500ms default. Move-cancel tolerance: 10px default.
- Long-press fires `onProjectSelect(project)` then `onNewSession(project)` — identical to `SidebarProjectSessions.tsx`'s mobile "New session" button. Do not modify `handleNewSession` in `useProjectsState.ts`.
- Disable the gesture while `isEditing` is true (title replaced by a rename `<input>`).
- Use `navigator.vibrate(12)` for haptic feedback, guarded by `if (navigator.vibrate)` — no error if unsupported.
- No new npm dependencies (no `@testing-library/react`, no `jsdom`, no `vitest`/`jest`).

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/hooks/useLongPress.ts` | `LongPressGesture` state machine class + `useLongPress` React hook wrapping it |
| `src/hooks/useLongPress.test.ts` | Node-test unit tests for `LongPressGesture` |
| `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx` | Wire `useLongPress` onto the mobile title row |

---

### Task 1: `LongPressGesture` class + `useLongPress` hook, with unit tests

**Files:**
- Create: `src/hooks/useLongPress.ts`
- Test: `src/hooks/useLongPress.test.ts`

**Interfaces:**
- Produces: `export class LongPressGesture` with `constructor(options: { delay: number; moveTolerancePx: number; onLongPress: () => void })`, methods `start(point: { x: number; y: number }): void`, `move(point: { x: number; y: number }): void`, `end(): boolean`, `cancel(): void`.
- Produces: `export function useLongPress(options: { onLongPress: () => void; delay?: number; moveTolerancePx?: number; disabled?: boolean }): { onTouchStart: (e: React.TouchEvent) => void; onTouchMove: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void; onTouchCancel: () => void; isPressing: boolean }`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing tests for `LongPressGesture`**

Create `src/hooks/useLongPress.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LongPressGesture } from './useLongPress.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('LongPressGesture fires onLongPress after the delay elapses', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  await wait(30);

  assert.equal(fired, true);
  assert.equal(gesture.end(), true);
});

test('LongPressGesture does not fire if end() is called before the delay elapses', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 30,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  const didFireBeforeEnd = gesture.end();
  await wait(45);

  assert.equal(didFireBeforeEnd, false);
  assert.equal(fired, false);
});

test('LongPressGesture cancels when movement exceeds the tolerance', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.move({ x: 0, y: 25 });
  await wait(30);

  assert.equal(fired, false);
  assert.equal(gesture.end(), false);
});

test('LongPressGesture keeps the timer when movement stays within the tolerance', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.move({ x: 3, y: 4 }); // distance = 5, within the 10px tolerance
  await wait(30);

  assert.equal(fired, true);
});

test('LongPressGesture.cancel() stops a pending timer', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.cancel();
  await wait(30);

  assert.equal(fired, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test src/hooks/useLongPress.test.ts`
Expected: FAIL — `useLongPress.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement `LongPressGesture` and `useLongPress`**

Create `src/hooks/useLongPress.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export type Point = { x: number; y: number };

export type LongPressGestureOptions = {
  delay: number;
  moveTolerancePx: number;
  onLongPress: () => void;
};

export class LongPressGesture {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private startPoint: Point | null = null;
  private fired = false;

  constructor(private readonly options: LongPressGestureOptions) {}

  start(point: Point): void {
    this.cancel();
    this.startPoint = point;
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.fired = true;
      this.options.onLongPress();
    }, this.options.delay);
  }

  move(point: Point): void {
    if (!this.startPoint || this.timeoutId === null) {
      return;
    }

    const dx = point.x - this.startPoint.x;
    const dy = point.y - this.startPoint.y;
    if (Math.hypot(dx, dy) > this.options.moveTolerancePx) {
      this.cancel();
    }
  }

  end(): boolean {
    const didFire = this.fired;
    this.cancel();
    return didFire;
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.startPoint = null;
    this.fired = false;
  }
}

type UseLongPressOptions = {
  onLongPress: () => void;
  delay?: number;
  moveTolerancePx?: number;
  disabled?: boolean;
};

export function useLongPress({
  onLongPress,
  delay = 500,
  moveTolerancePx = 10,
  disabled = false,
}: UseLongPressOptions) {
  const [isPressing, setIsPressing] = useState(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const [gesture] = useState(
    () =>
      new LongPressGesture({
        delay,
        moveTolerancePx,
        onLongPress: () => {
          setIsPressing(false);
          onLongPressRef.current();
        },
      }),
  );

  useEffect(() => () => gesture.cancel(), [gesture]);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      setIsPressing(true);
      gesture.start({ x: touch.clientX, y: touch.clientY });
    },
    [disabled, gesture],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      gesture.move({ x: touch.clientX, y: touch.clientY });
    },
    [gesture],
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const didFire = gesture.end();
      setIsPressing(false);
      if (didFire) {
        event.preventDefault();
      }
    },
    [gesture],
  );

  const onTouchCancel = useCallback(() => {
    gesture.cancel();
    setIsPressing(false);
  }, [gesture]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, isPressing };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test src/hooks/useLongPress.test.ts`
Expected: `# pass 5`, `# fail 0`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no new errors from `src/hooks/useLongPress.ts` or its test file.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useLongPress.ts src/hooks/useLongPress.test.ts
git commit -m "feat(sidebar): add useLongPress hook for touch long-press detection"
```

---

### Task 2: Wire long-press-to-new-session onto the sidebar project title

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx`

**Interfaces:**
- Consumes: `useLongPress` from `../../../../hooks/useLongPress` (signature from Task 1).
- Consumes existing props already on `SidebarProjectItem`: `project: Project`, `isEditing` (derived locally from `editingProject`/`project.projectId`), `onProjectSelect: (project: Project) => void`, `onNewSession: (project: Project) => void`.
- Produces: no new exports — this is a leaf UI wiring change.

- [ ] **Step 1: Import the hook and `cn` is already imported**

At the top of `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx`, add the import alongside the existing hook-style imports (after the `getTaskIndicatorStatus` import, before the local component imports):

```tsx
import { getTaskIndicatorStatus } from '../../utils/utils';
import { useLongPress } from '../../../../hooks/useLongPress';
```

- [ ] **Step 2: Instantiate the hook in the component body**

In `SidebarProjectItem.tsx`, right after the existing `selectAndToggleProject` function (the block ending just before the component's `return`), add:

```tsx
  const selectAndToggleProject = () => {
    if (selectedProject?.projectId !== project.projectId) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  const titleLongPress = useLongPress({
    disabled: isEditing,
    onLongPress: () => {
      if (navigator.vibrate) {
        navigator.vibrate(12);
      }
      onProjectSelect(project);
      onNewSession(project);
    },
  });
```

- [ ] **Step 3: Bind the handlers to the mobile title row only**

Find this block (the non-editing branch of the mobile card, currently rendering the title + task indicator):

```tsx
                    <>
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <h3 className="truncate text-sm font-normal text-foreground">{project.displayName}</h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
```

Replace it with:

```tsx
                    <>
                      <div
                        className={cn(
                          'flex min-w-0 flex-1 items-center justify-between',
                          titleLongPress.isPressing && 'opacity-70',
                        )}
                        onTouchStart={titleLongPress.onTouchStart}
                        onTouchMove={titleLongPress.onTouchMove}
                        onTouchEnd={titleLongPress.onTouchEnd}
                        onTouchCancel={titleLongPress.onTouchCancel}
                      >
                        <h3 className="truncate text-sm font-normal text-foreground">{project.displayName}</h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck`
Expected: exits 0, no new errors.

Run: `npm run lint`
Expected: exits 0, no new errors in `SidebarProjectItem.tsx`.

- [ ] **Step 5: Manual QA on a mobile viewport (real device or DevTools touch emulation)**

Verify each item from the spec's acceptance criteria:

1. Short tap on a project title still expands/collapses that project.
2. Press-and-hold a project title for ~500ms without moving: the title dims slightly, the device vibrates (if it supports `navigator.vibrate`), and the app navigates to a new-session draft for that project — same result as tapping the existing "New session" button.
3. That same long press does **not** also toggle the project's expanded/collapsed state.
4. Press-and-hold, then drag the finger more than ~10px before 500ms: no new session is started; the list scrolls/drags normally.
5. Long-pressing the star, edit, or delete icons still only does their existing tap action — no new-session side effect.
6. While renaming a project (tap the edit icon first), long-pressing the input does nothing extra.
7. On a desktop-width viewport, the project row is unchanged (hover icons, click-to-expand, explicit "New session" button).

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx
git commit -m "feat(sidebar): long-press a project title to start a new session"
```
