# Apple System Fonts Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Scope:** Typography only (no layout, color, or component structure changes)

## Problem

CloudCLI currently loads Google Fonts for UI and chat:

- **UI:** Encode Sans
- **Chat / selected headings:** Merriweather (serif via `font-serif`)

The desired look is closer to [apple.com.cn](https://www.apple.com.cn/), which uses SF Pro SC / SF Pro Text with PingFang SC fallbacks. SF Pro webfonts are Apple-proprietary and must not be hotlinked or redistributed; the legal equivalent is a system font stack.

## Goals

1. Replace Encode Sans and Merriweather with an Apple-aligned system sans stack for **UI and chat**.
2. Keep monospace fonts for code blocks and the integrated terminal.
3. Remove Google Fonts network requests from the app shell.
4. Minimize churn: central Tailwind / CSS config first; update explicit `font-serif` call sites for clarity.

## Non-Goals

- Changing colors, spacing, radius, or layout.
- Embedding or hosting SF Pro / SF Pro SC files.
- Adding a cross-platform webfont (e.g. Inter) for non-Apple OS consistency.
- Changing the CloudCLI wordmark font (already system-ui based).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | UI + chat both sans (option B) | Matches Apple site; avoids UI/chat typography split |
| Delivery | Pure system stack (option A) | Closest to apple.com.cn on Apple devices; zero font CDN |
| Implementation | Direct Tailwind / global swap (Approach 1) | Smallest, clearest change for a one-time font swap |
| `font-serif` token | Map `serif` to the same stack as `sans`, and change call sites to `font-sans` | Prevents leftover Merriweather; keeps intent explicit in components |

## Font Stack

```text
-apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text",
"PingFang SC", "Helvetica Neue", "Helvetica", "Microsoft YaHei",
"Segoe UI", Arial, sans-serif
```

Platform behavior (approximate):

- **macOS / iOS:** Resolves to SF / PingFang — closest to apple.com.cn
- **Windows:** Segoe UI + Microsoft YaHei for CJK
- **Other:** Generic sans fallbacks

Monospace (unchanged examples):

- Terminal: existing Menlo / Monaco / Courier stack
- Markdown code blocks: existing `ui-monospace` / SFMono / Menlo stack

## File Changes

| File | Change |
|------|--------|
| `index.html` | Remove Google Fonts `preconnect` and stylesheet links; update comment |
| `tailwind.config.js` | Set `theme.extend.fontFamily.sans` to the stack; set `serif` to the same stack (safety net) |
| `src/index.css` | Update `body { font-family: ... }` to the same stack |
| `src/components/chat/view/subcomponents/MessageComponent.tsx` | Replace `font-serif` with `font-sans` |
| `src/components/auth/view/AuthScreenLayout.tsx` | Replace `font-serif` with `font-sans` |
| `src/components/onboarding/view/subcomponents/AgentConnectionsStep.tsx` | Replace `font-serif` with `font-sans` |
| `src/components/onboarding/view/subcomponents/GitConfigurationStep.tsx` | Replace `font-serif` with `font-sans` |

## Out of Scope Files

- `src/constants/branding.ts` — wordmark already uses system UI stack
- Shell / SyntaxHighlighter monospace styles — keep as-is
- Theme color tokens in `src/index.css` — unchanged

## Acceptance Criteria

1. No request to `fonts.googleapis.com` or `fonts.gstatic.com` when loading the app.
2. UI chrome and chat message text render in system sans (SF/PingFang on Apple hardware).
3. Code fences and terminal still use monospace.
4. `npm run build:client` (or project equivalent) succeeds with no font-related errors.
5. Grep shows no remaining `Encode Sans`, `Merriweather`, or Google Fonts links in app entry paths.

## Risks & Notes

- **Cross-OS variance is intentional.** System fonts differ by OS; that is accepted under Decision A.
- **Do not load Apple’s `/wss/fonts` URLs.** They are not licensed for third-party use and often block hotlinking (403).
- **`font-serif` alias:** Mapping `serif` → sans is temporary safety; call sites should use `font-sans` so future serif use remains possible if needed.
