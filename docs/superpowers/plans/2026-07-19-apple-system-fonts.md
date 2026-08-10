# Apple System Fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Encode Sans and Merriweather with an Apple-aligned system sans font stack for UI and chat, while keeping monospace for code and terminal.

**Architecture:** Centralize the new stack in `tailwind.config.js` (`sans` and `serif`) and `src/index.css` (`body`), remove Google Fonts from `index.html`, then flip remaining `font-serif` classNames to `font-sans`. No new dependencies; no SF Pro webfont hosting.

**Tech Stack:** Vite, Tailwind CSS v3, React (existing CloudCLI client)

**Spec:** `docs/superpowers/specs/2026-07-19-apple-system-fonts-design.md`

## Global Constraints

- Typography only — do not change colors, spacing, radius, or layout
- Do not hotlink or embed Apple `/wss/fonts` or SF Pro files
- Keep terminal and markdown code-block monospace stacks unchanged
- Do not modify `src/constants/branding.ts` (wordmark already system-ui)
- Exact font stack (copy verbatim):

```text
-apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text", "PingFang SC", "Helvetica Neue", "Helvetica", "Microsoft YaHei", "Segoe UI", Arial, sans-serif
```

---

## File Map

| File | Responsibility |
|------|----------------|
| `index.html` | Stop loading Google Fonts |
| `tailwind.config.js` | Define `font-sans` / `font-serif` theme families |
| `src/index.css` | Default `body` font-family |
| `MessageComponent.tsx` | Chat message typography classes |
| `AuthScreenLayout.tsx` | Auth title typography |
| `AgentConnectionsStep.tsx` | Onboarding heading typography |
| `GitConfigurationStep.tsx` | Onboarding heading typography |

---

### Task 1: Remove Google Fonts and set Tailwind + body stack

**Files:**
- Modify: `index.html:10-16`
- Modify: `tailwind.config.js:17-20`
- Modify: `src/index.css:129-137`

**Interfaces:**
- Consumes: none
- Produces: Tailwind tokens `font-sans` and `font-serif` both resolve to the Apple system stack; `body` uses the same stack; no Google Fonts `<link>` tags

- [ ] **Step 1: Update `index.html` font section**

Replace lines 10–16 with:

```html
    <!-- Fonts: Apple-aligned system stack (see tailwind.config.js / src/index.css) -->
```

Delete the three Google Fonts `<link>` tags (`preconnect` ×2 and the stylesheet).

- [ ] **Step 2: Update `tailwind.config.js` fontFamily**

Replace the `fontFamily` block with:

```js
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro SC"',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Helvetica Neue"',
          'Helvetica',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'Arial',
          'sans-serif',
        ],
        // Mapped to the same stack so any leftover font-serif still matches UI/chat.
        serif: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro SC"',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Helvetica Neue"',
          'Helvetica',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'Arial',
          'sans-serif',
        ],
      },
```

- [ ] **Step 3: Update `src/index.css` body font-family**

Replace the `body` rule’s `font-family` line with:

```css
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text",
      "PingFang SC", "Helvetica Neue", "Helvetica", "Microsoft YaHei",
      "Segoe UI", Arial, sans-serif;
```

Keep the surrounding `@apply`, smoothing, margin, and padding lines unchanged.

- [ ] **Step 4: Verify Google Fonts and old family names are gone from entry paths**

Run:

```bash
rg -n 'fonts\.googleapis|fonts\.gstatic|Encode Sans|Merriweather' index.html tailwind.config.js src/index.css
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add index.html tailwind.config.js src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): switch app fonts to Apple system stack

Drop Google Fonts and point Tailwind/body at an SF/PingFang-aligned
system sans stack for UI and chat.
EOF
)"
```

---

### Task 2: Replace `font-serif` call sites with `font-sans`

**Files:**
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx` (all `font-serif` occurrences)
- Modify: `src/components/auth/view/AuthScreenLayout.tsx:40`
- Modify: `src/components/onboarding/view/subcomponents/AgentConnectionsStep.tsx:49`
- Modify: `src/components/onboarding/view/subcomponents/GitConfigurationStep.tsx:24`

**Interfaces:**
- Consumes: `font-sans` from Task 1 Tailwind config
- Produces: no remaining `font-serif` classNames under `src/`

- [ ] **Step 1: Update MessageComponent chat typography**

In `MessageComponent.tsx`, replace every `font-serif` with `font-sans` (5 occurrences). Exact class strings after edit:

```tsx
className="whitespace-pre-wrap break-words font-sans text-sm"
```

```tsx
className="prose prose-sm max-w-none font-sans dark:prose-invert"
```

```tsx
className="prose prose-sm prose-red max-w-none font-sans dark:prose-invert"
```

```tsx
className="prose prose-sm prose-gray max-w-none font-sans dark:prose-invert"
```

(the last gray markdown line appears twice — update both)

- [ ] **Step 2: Update Auth and Onboarding headings**

`AuthScreenLayout.tsx`:

```tsx
<h1 className="font-sans text-3xl font-bold tracking-tight text-foreground">{title}</h1>
```

`AgentConnectionsStep.tsx`:

```tsx
<h2 className="font-sans text-xl font-bold tracking-tight text-foreground">Connect Your AI Agents</h2>
```

`GitConfigurationStep.tsx`:

```tsx
<h2 className="font-sans text-xl font-bold tracking-tight text-foreground">Git Configuration</h2>
```

- [ ] **Step 3: Verify no `font-serif` left in source**

Run:

```bash
rg -n 'font-serif|Encode Sans|Merriweather|fonts\.googleapis' src/ index.html tailwind.config.js
```

Expected: no matches.

- [ ] **Step 4: Confirm monospace paths untouched**

Run:

```bash
rg -n 'Menlo|ui-monospace|SFMono|monospace' src/components/shell/constants/constants.ts src/components/chat/view/subcomponents/Markdown.tsx
```

Expected: existing monospace stacks still present (do not edit these files).

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/chat/view/subcomponents/MessageComponent.tsx \
  src/components/auth/view/AuthScreenLayout.tsx \
  src/components/onboarding/view/subcomponents/AgentConnectionsStep.tsx \
  src/components/onboarding/view/subcomponents/GitConfigurationStep.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): use font-sans for chat and headings

Align chat and auth/onboarding titles with the system sans stack
instead of leftover font-serif classes.
EOF
)"
```

---

### Task 3: Build verification

**Files:**
- Test: client build output only (no new test files)

**Interfaces:**
- Consumes: Tasks 1–2 font changes
- Produces: successful `build:client`; acceptance criteria from the design spec satisfied

- [ ] **Step 1: Run client build**

```bash
npm run build:client
```

Expected: exit code 0; Vite build completes without font-related errors.

- [ ] **Step 2: Grep built HTML for Google Fonts (if `dist/index.html` exists)**

```bash
rg -n 'fonts\.googleapis|fonts\.gstatic|Encode Sans|Merriweather' dist/index.html dist/assets 2>/dev/null || rg -n 'fonts\.googleapis|Encode Sans|Merriweather' dist/
```

Expected: no matches for those font CDN / family names.

- [ ] **Step 3: Manual smoke check (dev)**

```bash
npm run client
```

In the browser: confirm UI chrome and a chat message use system sans (on macOS: SF / PingFang); open a code fence and confirm monospace; DevTools Network shows no `fonts.googleapis.com` / `fonts.gstatic.com` requests.

- [ ] **Step 4: Commit plan checkbox updates only if the plan file was edited; otherwise skip**

If you marked checkboxes in this plan file during execution:

```bash
git add docs/superpowers/plans/2026-07-19-apple-system-fonts.md
git commit -m "$(cat <<'EOF'
docs: mark apple system fonts plan tasks complete
EOF
)"
```

If the plan file was not edited, skip this step.

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Remove Google Fonts | Task 1 |
| Tailwind `sans` / `serif` → system stack | Task 1 |
| `body` font-family update | Task 1 |
| Chat / auth / onboarding `font-serif` → `font-sans` | Task 2 |
| Keep monospace for code / terminal | Task 2 Step 4 + Global Constraints |
| No SF Pro webfont hosting | Global Constraints |
| Build / grep acceptance | Task 3 |
