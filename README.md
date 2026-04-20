# NyviaNexus

A personal Chrome extension that turns Chrome into a first-class workspace manager — persistent windows, AI-categorized tabs, cross-device sync via Firestore, and an instant popup switcher bound to `Alt+S`.

Built as a single-developer production system. This README focuses on the engineering decisions behind it.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack & Rationale](#tech-stack--rationale)
- [Concurrency & State Consistency](#concurrency--state-consistency)
- [Persistence & Service Worker Lifecycle](#persistence--service-worker-lifecycle)
- [Security & Isolation](#security--isolation)
- [Type Safety](#type-safety)
- [AI Layer](#ai-layer)
- [Theming System](#theming-system)
- [Reactive Cross-Window State](#reactive-cross-window-state)
- [Stability Patterns](#stability-patterns)
- [Trade-offs & Known Constraints](#trade-offs--known-constraints)

---

## Architecture Overview

The extension runs in three independent contexts, each with distinct responsibilities and lifecycle concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension Runtime                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────┐  │
│  │    Popup     │    │   Dashboard   │    │  Service Worker  │  │
│  │  (Switcher)  │    │ (Options Page)│    │   (Background)   │  │
│  │   Alt+S      │    │  dashboard.html│   │    main.ts       │  │
│  └──────┬───────┘    └───────┬───────┘    └────────┬─────────┘  │
│         │                    │                     │            │
│         └────────────┬───────┴──────────┬──────────┘            │
│                     │                  │                        │
│              ┌──────▼──────┐     ┌─────▼──────┐                 │
│              │ chrome.     │     │ chrome.    │                 │
│              │ storage.    │     │ runtime.   │                 │
│              │ local       │     │ sendMessage│                 │
│              └──────┬──────┘     └─────┬──────┘                 │
│                     │                  │                        │
└─────────────────────┼──────────────────┼────────────────────────┘
                      │                  │
                      ▼                  ▼
             ┌─────────────────┐  ┌──────────────┐
             │  Firestore      │  │ Cerebras AI  │
             │  (user-owned    │  │ (LLaMA 3.1)  │
             │   project)      │  │              │
             └─────────────────┘  └──────────────┘
```

**Service Worker (`src/features/background/main.ts`, ~2500 LOC)** is the source of truth. It owns Chrome event listeners (`tabs.*`, `windows.*`, `runtime.*`), maintains an in-memory window/tab mapping, drives Firestore writes, runs the AI queue, cleans tracking parameters from URLs, and emits a typed message protocol for UI clients.

**Dashboard (`dashboard.html`)** is the extension's options page. It renders a React 19 app with Firestore `onSnapshot` subscriptions, drag-and-drop workspace management, and a resizable sidebar. It treats the service worker as a remote state machine — never mutating Chrome windows directly when the SW owns them.

**Popup (`index.html`)** is a lightweight keyboard-driven window switcher. It reads `chrome.storage.local` for active mappings, filters in real time, and uses arrow/Enter navigation with auto-focus on mount. Deliberately stateless — just a UI over data the SW already persists.

### Key Abstraction: Internal Window ID vs Chrome Window ID

Chrome window IDs are ephemeral integers that change every restart. Workspaces must survive restarts, syncs, and cross-device access. The solution:

- **`chromeWindowId: number`** — Chrome's native, session-scoped ID.
- **`internalWindowId: string`** — A stable UUID persisted to Firestore. Identifies a logical window within a workspace across time and devices.

These are bridged via `activeWindows: Map<number, WinMapping>` in-memory, persisted to `chrome.storage.local` as `nexus_active_windows`. Any UI code that needs "the real window" uses `internalWindowId`; anything that needs to call `chrome.windows.update` uses `chromeWindowId`.

---

## Tech Stack & Rationale

| Layer              | Choice                                 | Why                                                                                            |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Framework**      | React 19                               | Concurrent rendering + `useSyncExternalStore` for the storage-backed reactive layer            |
| **Build**          | Vite + `@crxjs/vite-plugin`            | MV3-aware HMR, correct manifest transformation, no webpack-config hell                         |
| **Language**       | TypeScript                             |
| **Styling**        | Tailwind v4                            | `@theme` directive + CSS custom properties = true theme swaps without remount                  |
| **Colors**         | OKLCH                                  | Perceptually uniform — themes interpolate correctly across hues without lightness drift        |
| **State (local)**  | `useSyncExternalStore`                 | External store primitive wrapping `chrome.storage.local` with synchronous snapshots            |
| **State (remote)** | Firestore `onSnapshot`                 | Real-time sync with built-in optimistic updates; no additional state lib needed                |
| **Auth**           | Firebase Auth (`/web-extension` entry) | Extension-compatible auth — no service worker / DOM mismatch                                   |
| **AI**             | Cerebras LLaMA 3.1 8B                  | Low-latency inference (~200ms); enough capacity for classification with structured JSON output |
| **Icons**          | lucide-react                           | Tree-shakeable, stroke-based, OKLCH-friendly                                                   |
| **Animation**      | `@formkit/auto-animate`                | Zero-config list transitions — no state choreography for reordering                            |

### What I Deliberately Avoided

- **Redux / Zustand / Jotai** — The reactive primitive (`useSyncExternalStore` + `chrome.storage.onChanged`) already gives me cross-tab sync for free. Adding a state lib on top would duplicate semantics.
- **React Router** — Two pages, no route collisions, no nested state. Native HTML entries in Vite are enough.
- **A CSS-in-JS lib** — Tailwind's semantic tokens (`bg-action`, `text-low`) compile to CSS variables, so runtime theme switching is free. No runtime cost.
- **Service worker keep-alive tricks** — MV3 service workers sleep. I treat sleep as normal and designed state hydration for it instead.

---

## Concurrency & State Consistency

The service worker receives events from Chrome at high frequency — multiple tab updates can fire within the same tick. Without coordination, this produces classic Firestore read-modify-write races.

### Mutex per Logical Resource

```ts
// src/features/background/main.ts
const syncLocks = new Map<string, Promise<void>>();

async function runWithLock(lockKey: string, task: () => Promise<void>) {
  await ensureInitialized();
  const prev = syncLocks.get(lockKey) || Promise.resolve();
  const next = prev.then(task).catch((err) => { /* isolated per chain */ });
  syncLocks.set(lockKey, next);
  return next;
}
```

Each logical resource (workspace, window document, inbox) gets its own lock key. Operations chain serially within a key but run in parallel across keys. This is dramatically simpler than Firestore transactions for the 95% case where I'm not reading before writing.

### Gatekeeper for Initialization

Chrome fires `onInstalled` and `onStartup` concurrently. Events can arrive before Firebase is configured. The gatekeeper pattern:

```ts
let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (isInitialized) return;
  if (initPromise) return initPromise;      // deduplicate concurrent callers
  initPromise = (async () => { /* ... */ })();
  return initPromise;
}
```

Every Chrome listener is wrapped in `createSafeListener` which awaits `ensureInitialized` before dispatching. This means I can register listeners at module top level without worrying about event arrival order during cold start.

### Anti-Spam Sets

Three in-memory Sets guard against duplicate work:

- `openingWorkspaces: Set<string>` — prevents double-clicking a workspace from spawning two windows.
- `recentQueueAdds: Set<string>` — deduplicates AI queue additions for the same tab within a window.
- `currentlyProcessing: Set<string>` — blocks concurrent analysis of the same URL.

Simple, effective, and cheaper than building a full job queue.

---

## Persistence & Service Worker Lifecycle

MV3 service workers sleep aggressively — typically after ~30 seconds of inactivity. Every in-memory structure must be recoverable from `chrome.storage.local` or Firestore.

### Hydration on Wake

`ensureStateHydrated` runs before any event handler touches state. It:

1. Reads `nexus_active_windows` from storage.
2. Validates each mapping against live Chrome windows (dead ones are silently skipped — cleaned up later by `validateAndCleanupState`).
3. Restores the tab tracker from its persisted serialization.

Crucially, hydration is a _best-effort_ operation. If a window ID in storage no longer exists, the event handler just proceeds without it. Nothing is thrown. Defer cleanup to the dedicated startup pass.

### Startup Reconciliation

`validateAndCleanupState` runs once per cold start and performs a full three-way reconciliation between:

1. **In-memory state** (just cleared)
2. **`chrome.storage.local`** (persisted mappings + tracker)
3. **Physical Chrome state** (`chrome.tabs.query({})`, `chrome.windows.getAll()`)

It detects:

- **Ghost mappings** — stored windows that no longer exist physically → mark as `isActive: false` in Firestore.
- **URL drift** — tracked tabs whose URLs changed while the SW slept → update tracker.
- **Dead tabs** — tracked tab IDs that no longer exist → remove from Firestore.
- **Untracked windows** — physical windows with no mapping → register as new Inbox windows.
- **Index gaps** — re-indexes workspace windows (1, 2, 3…) after any window closes, so UI labels stay consistent.

One cold-boot pass, three data sources, self-healing. No cron jobs required.

### Dashboard Recovery Across Extension Updates

Extensions reload on update, which closes all dashboard tabs. Before the reload, `APPLY_EXTENSION_UPDATE` snapshots every open dashboard tab (window ID, pinned state, index) to `nexus_pending_dashboards`. After reload, `validateAndCleanupState` re-opens them in their original positions. Users never lose their place.

---

## Security & Isolation

### Bring-Your-Own Firebase

The extension ships with no hardcoded Firebase credentials. On first run, the user pastes their own Firebase config snippet. The setup flow (`FirebaseGuard.tsx`) parses it with regex, validates it with a test `signInWithEmailAndPassword` call, and persists it to `chrome.storage.local` as `userFirebaseConfig`.

Why:

- **Data sovereignty** — every byte of user data lives in a Firebase project the user owns. I have no server, no access, no ability to leak anything.
- **Zero trust on my side** — the extension is just a client. Users control their Firestore security rules.
- **Quota isolation** — users can't impact each other. No noisy-neighbor problem.
- **Enterprise-ready** — companies can deploy this against an internal GCP project without auditing my backend (I don't have one).

### Incognito Isolation

Chrome's `incognito: "spanning"` mode is used — single extension instance, but with explicit handling:

- Incognito windows are never auto-assigned to workspaces (workspaces sync to Firestore; incognito shouldn't).
- The Inbox segregates incognito tabs via the `isIncognito` flag — they appear only in the "Incognito Inbox" view.
- Tab tracker entries for incognito tabs never round-trip through Firestore writes beyond their isolated incognito window document.

### URL Tracking Scrubbing

Every navigation pipes through `cleanUrlAndGetTracking` (`trackingUtils.ts`) which:

- Exact-matches against a curated Set of ~100 known tracking params (UTM, Google Ads, Meta, TikTok, Mailchimp, HubSpot, Amazon ref-path, Yandex, etc.).
- Prefix-matches `utm_*`, `_ga_*`, `gad_*` to catch custom variants and GA4 auto-generated params.
- Strips Amazon's path-embedded `/ref=…` tracking (not just query strings).
- Returns both the clean URL _and_ the removed parameter string — so "what was removed" is auditable in the UI, not silently discarded.

This runs before tabs are stored, so Firestore never sees the polluted URLs.

### Input Trust Boundaries

- User input (workspace names, notes) is treated as display text — never serialized into strings that could be misinterpreted as code (no `dangerouslySetInnerHTML`).
- Firebase snippet parsing uses explicit regex per required field rather than `eval` or dynamic code execution.

---

## Type Safety

The codebase has zero `any` in public APIs. Critical patterns:

### Discriminated Union for IPC

```ts
type BackgroundMessage =
  | { type: "REINITIALIZE_FIREBASE"; payload?: null }
  | { type: "OPEN_WORKSPACE"; payload: { workspaceId: string; windows: FirestoreWindowData[]; name: string } }
  | { type: "CLAIM_WINDOW"; payload: { windowId: number; workspaceId: string; internalWindowId: string; name: string } }
  | { type: "MOVE_INCOGNITO_TAB"; payload: { tabId: number; targetWorkspaceId: string; targetInternalWindowId: string } }
  // … ~20 more variants
```

TypeScript narrows the `payload` shape inside each `case` branch. Refactoring a message adds a compile error everywhere the old signature was consumed. No runtime validation library needed for internal messaging.

### Type-Safe Storage

```ts
// src/hooks/useChromeStorage.ts
export const useChromeStorage = <T>(
  key: string,
  defaultValue: T,
): [T, (action: SetValueAction<T>) => void]
```

The hook returns a `useState`-compatible tuple with full type inference based on the default value. Callers get compile-time guarantees about the shape of data in `chrome.storage.local` — a layer that is otherwise `Record<string, unknown>` at the API level.

### Firestore Wrapper Types

`src/lib/firebase.ts` re-exports retry-wrapped versions of `getDoc`, `setDoc`, `updateDoc`, etc., preserving their original generic signatures. Callers get exponential backoff on network failures without losing `DocumentReference<T>` type information.

---

## AI Layer

Tabs are categorized by a small language model (LLaMA 3.1 8B via Cerebras) behind a queue.

### Queue with Anti-Spam

Tabs enter `nexus_ai_queue` (persisted to storage). A single worker loop drains it, rate-limited by `nexus_ai_last_call` (minimum 200ms between API calls). A lock (`nexus_ai_lock`) prevents concurrent workers across SW wakeups.

### Prompt Engineering

Two distinct modes:

1. **Dynamic** — Model is told _"Prefer the user's category list, but invent a new category if nothing fits."_ — useful for general browsing.
2. **Strict** — Model must choose from an explicit whitelist. Used when the user wants deterministic buckets.

Workspace name is injected as prompt context: _"This tab is in a workspace named 'Exam Prep' — interpret the tab's purpose through that lens."_ This dramatically improves classification accuracy on ambiguous content.

### Response Robustness

I explicitly avoid OpenAI's `response_format: { type: "json_object" }`:

> Small LLaMA variants corrupt UTF-8 tokens when forced into strict JSON mode — Danish characters (æ, ø, å) get mangled.

Instead, the response is parsed with:

1. Markdown code-fence stripping (`\`\`\`json` blocks).
2. Direct `JSON.parse`.
3. Regex fallback (`/\{[\s\S]*\}/`) if the model's JSON is wrapped in prose.
4. Safe default if everything fails — never throws.

Temperature is set to `0.1` — enough variance for correct tokenization, low enough for classification stability.

### Health Monitoring

API failures (503, network errors) flip `nexus_ai_health` to `"down"`. The dashboard renders a warning banner. When a successful call lands, it flips back to `"up"` — zero UI reload required because the state is reactive via `useChromeStorage`.

---

## Theming System

Four themes (Architect, Pastel, Serene, Zen) share a single set of semantic CSS custom properties:

```css
:root {
  --nexus-action: oklch(60% 0.18 257);
  --color-action: var(--nexus-action); /* Tailwind sees this via @theme */
}
.theme-pastel {
  --nexus-action: oklch(60% 0.14 195); /* Same token, different value */
}
```

Tailwind's `@theme` directive maps semantic classes (`bg-action`, `text-low`) to these CSS vars. Switching themes is a single class toggle on `<html>` — no component re-renders, no CSS rebuild. All opacity modifiers (`bg-action/15`) interpolate correctly in OKLCH space.

### Cross-Window Theme Sync

Previously, theme changes only applied to the window that made the change — others needed a reload. Fixed by registering a `chrome.storage.onChanged` listener in each entry point (`main.tsx`, `dashboard/main.tsx`):

```ts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.nexus_theme?.newValue) {
    applyThemeToDOM(changes.nexus_theme.newValue as string);
  }
});
```

One line per entry, fully reactive, no React state involved.

---

## Reactive Cross-Window State

The custom `useChromeStorage` hook is the most-reused primitive in the app. It wraps `useSyncExternalStore` with:

- A per-key external store cached in a module-level `Map` — subscriptions deduplicate naturally across components.
- Synchronous `getSnapshot()` returning an in-memory cache (required by `useSyncExternalStore`).
- Async hydration on first subscribe — no I/O during render.
- A single `chrome.storage.onChanged` listener shared across all components subscribed to the same key.
- Optimistic UI — `set()` updates the cache and notifies local subscribers _before_ the async storage write resolves. Other windows receive the change via `onChanged` as normal.

This is the mechanism that makes "rename a window in Dashboard → popup switcher updates instantly" work with no additional code.

---

## Stability Patterns

### Idempotent Firebase Init

Calling `initializeFirestore(app, options)` twice throws. The service worker can be reinitialized mid-session (config reset, update reload), so the init is wrapped:

```ts
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  db = getFirestore(app);  // already initialized — reuse
}
```

`experimentalAutoDetectLongPolling` was chosen over `experimentalForceLongPolling` so the SDK picks WebSockets in the dashboard context (faster) and long polling in the SW context (works around service worker WebSocket limitations).

### Exponential Backoff on Writes

Every Firestore operation is wrapped in `withRetry` — 5 attempts, starting at 200ms, doubling on each failure. Only retries on `"unavailable"` / `"offline"` errors — not on permission or validation errors. Users on flaky Wi-Fi never see transient failures; real errors surface immediately.

### Graceful Degradation

- **No AI API key?** Tabs sync without categorization.
- **AI service down?** Tabs queue up; processed when it comes back.
- **Firebase project misconfigured?** `FirebaseGuard` intercepts before any write and prompts for re-setup.
- **No Internet at all?** Firestore offline persistence keeps the dashboard usable; writes queue locally.

No screen in the app is a hard dead-end.

---

## Trade-offs & Known Constraints

### `main.ts` is 2500 LOC

Splitting the service worker file would require carving out a shared state module — doable, but the coherence of keeping all Chrome event handlers alongside the state they mutate has been more valuable than the theoretical readability win from splitting. This is a conscious trade, not neglect.

### No Automated Tests

This is a single-user extension with short feedback loops (reload, click, observe). I've prioritized shipping features over a test harness. When/if the Chrome API surface stabilizes further, I'll revisit.

### Service Worker Message Protocol is 1:1

Every new feature that needs SW coordination adds a new variant to `BackgroundMessage`. This scales linearly but keeps types tight. A more generic RPC-style messaging layer would reduce boilerplate at the cost of type precision — I chose precision.

### Firestore Writes Are Chatty

Every tab update, URL change, and window focus triggers a write. At my usage volume this is fine, but a read-mostly optimization (debounce writes per window, coalesce batches) would be the next scaling lever if billing became a concern.

---

## Build & Run

```bash
npm install
npm run dev         # Vite dev server with HMR through CRX
npm run build       # Production bundle + manifest + zip
```

Load `dist/` as an unpacked extension in `chrome://extensions`. The options page (dashboard) opens automatically on first install; Firebase config is prompted in-app.

Keyboard shortcut `Alt+S` opens the popup switcher. Customize or disable via `chrome://extensions/shortcuts`.

---

Built for my own use. Shared because senior engineers occasionally enjoy reading honest architecture docs.
