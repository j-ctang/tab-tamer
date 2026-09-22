# Cross-Browser Adapter (Chrome + Safari) Implementation Plan

> **Final-verification amendment:** Task 3's per-category-window design is
> superseded. Apple documents `tabs.move` as unsupported in Safari and Safari
> has no tab-group API. The delivered Safari adapter is preview-only,
> advertises `supportsApply = false`, and the dashboard disables Apply. Chrome
> preview/apply behavior is unchanged. The detailed Task 3 steps below are
> retained as implementation history, not current requirements.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chrome-only `browser.js` stub with a shared adapter interface for Chrome and Safari, with Chrome apply support and Safari capture/preview support, plus the dashboard UI and packaging needed to run Tab Tamer on both browsers.

**Architecture:** `core.js` (pure decision logic) stays unchanged and browser-agnostic. A new `adapters/shared.js` holds browser-agnostic tab capture and staleness/threshold partitioning; `adapters/chrome.js` applies native groups, while `adapters/safari.js` declares apply unsupported. `background.js` only opens the dashboard page; `dashboard.js` picks an adapter by feature detection and mounts `app.js`. `app.js` drives sample and live classification and enables Apply only when the selected adapter supports it.

**Tech Stack:** Vanilla JS (ESM), no bundler, no external dependencies. Node built-in test runner (`node --test`) for unit tests. Two static Manifest V3 JSON files, one per browser.

**Spec:** `docs/superpowers/specs/2026-09-22-cross-browser-adapter-design.md`

## Global Constraints

- No external npm dependencies — hand-rolled `globalThis.browser ?? globalThis.chrome` shim, not `webextension-polyfill`.
- `background.js` must remain import-free so Safari can load it as a classic
  `background.scripts` entry; Chrome may still load the same file as a module
  service worker.
- `core.js` and `tests/core.test.js` are unchanged by this plan.
- Confidence threshold comparison is inclusive (`confidence >= threshold` counts as the category; below it is `review`) — already implemented in `core.js:categoryFor`, adapters must reuse it, not reimplement it.
- `storage.session` preferred for the API key, falling back to `storage.local` only when `storage.session` is undefined (no version-sniffing).
- Safari is preview-only because its WebExtension API supports neither
  `tabs.move` nor tab groups. The dashboard disables Apply for that adapter.
- `manifest.chrome.json` includes the `tabGroups` permission and grants the Jev
  endpoint. `manifest.safari.json` omits `tabGroups` and grants HTTP/HTTPS host
  access because Safari requires host permission for `tabs` to expose the tab
  titles and URLs being organized.
- No Xcode project is committed; Safari packaging is a documented manual step in `README.md`.

---

## Task 1: Shared adapter helpers

**Files:**
- Create: `extension/adapters/shared.js`
- Test: `tests/adapters-shared.test.js`

**Interfaces:**
- Consumes: `categoryFor(decision, threshold)` from `extension/core.js` (existing, unchanged).
- Produces:
  - `captureTabs(api, windowId) -> Promise<RawTab[]>` — used by both adapters and the dashboard.
  - `partitionByCategory(decisions, threshold, windowId, api) -> Promise<{ byCategory: { focus: number[], later: number[], distraction: number[] }, skipped: number }>` — used by both adapters. A decision counts toward `skipped` only if its post-threshold category is not `review` AND the tab is stale (missing from a fresh `api.tabs.query({ windowId })`, or its `url` no longer matches). Decisions whose post-threshold category is `review` are neither grouped nor skipped.

- [ ] **Step 1: Write the failing test**

```js
// tests/adapters-shared.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTabs, partitionByCategory } from '../extension/adapters/shared.js';

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.7 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

test('captureTabs queries tabs scoped to the given window', async () => {
  const calls = [];
  const api = { tabs: { query: async (opts) => { calls.push(opts); return [{ id: 1 }]; } } };
  const result = await captureTabs(api, 5);
  assert.deepEqual(calls, [{ windowId: 5 }]);
  assert.deepEqual(result, [{ id: 1 }]);
});

test('partition excludes below-threshold decisions from both buckets', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
    { id: 3, url: 'https://c.com/' },
  ] } };
  const { byCategory, skipped } = await partitionByCategory(decisions.slice(0, 3), 0.8, 5, api);
  assert.deepEqual(byCategory.focus, [1, 3]);
  assert.deepEqual(byCategory.later, []);
  assert.equal(skipped, 0);
});

test('partition marks stale tabs (changed url or left window) as skipped, not grouped', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' },
    { id: 3, url: 'https://changed.com/' },
  ] } };
  const { byCategory, skipped } = await partitionByCategory(decisions, 0.8, 5, api);
  assert.deepEqual(byCategory.focus, [1]);
  assert.deepEqual(byCategory.distraction, []);
  assert.equal(skipped, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/adapters-shared.test.js`
Expected: FAIL — `Cannot find module '../extension/adapters/shared.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// extension/adapters/shared.js
import { categoryFor } from '../core.js';

export async function captureTabs(api, windowId) {
  return api.tabs.query({ windowId });
}

export async function partitionByCategory(decisions, threshold, windowId, api) {
  const current = await api.tabs.query({ windowId });
  const currentById = new Map(current.map(tab => [tab.id, tab]));
  const byCategory = { focus: [], later: [], distraction: [] };
  let skipped = 0;
  for (const decision of decisions) {
    const category = categoryFor(decision, threshold);
    if (category === 'review') continue;
    const current = currentById.get(decision.id);
    const stale = !current || current.url !== decision.url;
    if (stale) { skipped++; continue; }
    byCategory[category].push(decision.id);
  }
  return { byCategory, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/adapters-shared.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/adapters/shared.js tests/adapters-shared.test.js
git commit -m "Add shared adapter capture/partition helpers"
```

---

## Task 2: Chrome adapter

**Files:**
- Create: `extension/adapters/chrome.js`
- Delete: `extension/browser.js`, `tests/browser.test.js`
- Test: `tests/adapters-chrome.test.js`

**Interfaces:**
- Consumes: `captureTabs`, `partitionByCategory` from `extension/adapters/shared.js` (Task 1); `GROUPS` from `extension/core.js` (existing: `{ focus: { label, color, description }, later: {...}, distraction: {...}, review: {...} }`).
- Produces: `captureTabs` (re-exported), `applyResult(decisions, threshold, windowId, api) -> Promise<{ grouped: number, skipped: number }>` — consumed by the dashboard (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// tests/adapters-chrome.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResult } from '../extension/adapters/chrome.js';

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.7 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

test('groups eligible fresh tabs by category and labels the group', async () => {
  const groupCalls = [];
  const updateCalls = [];
  const api = {
    tabs: {
      query: async () => [
        { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
        { id: 3, url: 'https://changed.com/' },
      ],
      group: async ({ tabIds }) => { groupCalls.push(tabIds); return 20; },
    },
    tabGroups: { update: async (groupId, props) => { updateCalls.push([groupId, props]); } },
  };
  const result = await applyResult(decisions, 0.8, 5, api);
  assert.deepEqual(groupCalls, [[1]]);
  assert.deepEqual(updateCalls, [[20, { title: 'Focus now', color: 'green' }]]);
  assert.equal(result.grouped, 1);
  assert.equal(result.skipped, 2);
});

test('an all-review result never calls tabs.group', async () => {
  let called = false;
  const api = {
    tabs: { query: async () => decisions.map(({ id, url }) => ({ id, url })), group: async () => { called = true; } },
    tabGroups: { update: async () => {} },
  };
  const result = await applyResult(decisions, 1, 5, api);
  assert.equal(called, false);
  assert.equal(result.grouped, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/adapters-chrome.test.js`
Expected: FAIL — `Cannot find module '../extension/adapters/chrome.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// extension/adapters/chrome.js
import { captureTabs, partitionByCategory } from './shared.js';
import { GROUPS } from '../core.js';

export { captureTabs };

export async function applyResult(decisions, threshold, windowId, api) {
  const { byCategory, skipped } = await partitionByCategory(decisions, threshold, windowId, api);
  let grouped = 0;
  for (const [category, tabIds] of Object.entries(byCategory)) {
    if (!tabIds.length) continue;
    const groupId = await api.tabs.group({ tabIds });
    await api.tabGroups.update(groupId, { title: GROUPS[category].label, color: GROUPS[category].color });
    grouped += tabIds.length;
  }
  return { grouped, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/adapters-chrome.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Remove the superseded stub and its test, update the check script**

```bash
git rm extension/browser.js tests/browser.test.js
```

Edit `package.json` `check` script: replace `extension/browser.js` with `extension/adapters/shared.js extension/adapters/chrome.js` (full final form assembled in Task 4 once all files exist — for now just drop the removed file from the list).

- [ ] **Step 6: Run full test suite and syntax check**

Run: `npm test && npm run check`
Expected: PASS (browser.test.js gone, adapters-shared + adapters-chrome pass; check script no longer references browser.js)

- [ ] **Step 7: Commit**

```bash
git add extension/adapters/chrome.js tests/adapters-chrome.test.js package.json
git commit -m "Add Chrome adapter, remove browser.js stub"
```

---

## Task 3: Safari adapter — original window-moving design (superseded)

**Files:**
- Create: `extension/adapters/safari.js`
- Test: `tests/adapters-safari.test.js`

**Interfaces:**
- Consumes: `captureTabs`, `partitionByCategory` from `extension/adapters/shared.js` (Task 1).
- Produces: `captureTabs` (re-exported), `applyResult(decisions, threshold, windowId, api) -> Promise<{ grouped: number, skipped: number }>` — same signature as the Chrome adapter, consumed by the dashboard (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// tests/adapters-safari.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResult } from '../extension/adapters/safari.js';

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.9 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

function fakeApi(queryResult) {
  const windows = [];
  const moves = [];
  const removed = [];
  let nextWindowId = 100;
  return {
    api: {
      tabs: {
        query: async () => queryResult,
        move: async (tabIds, { windowId }) => { moves.push({ tabIds, windowId }); },
        remove: async (tabId) => { removed.push(tabId); },
      },
      windows: {
        create: async () => {
          const id = nextWindowId++;
          const win = { id, tabs: [{ id: id * 1000 }] };
          windows.push(win);
          return win;
        },
      },
    },
    windows, moves, removed,
  };
}

test('opens one window per non-empty category, moves tabs in, closes the placeholder', async () => {
  const { api, windows, moves, removed } = fakeApi([
    { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
    { id: 3, url: 'https://c.com/' }, { id: 4, url: 'https://d.com/' },
  ]);
  const result = await applyResult(decisions, 0.8, 5, api);
  assert.equal(windows.length, 3); // focus, later, distraction
  assert.deepEqual(moves.map(m => m.tabIds).sort(), [[1, 3], [2], [4]]);
  assert.equal(removed.length, 3); // one placeholder closed per window
  assert.equal(result.grouped, 4);
  assert.equal(result.skipped, 0);
});

test('stale and below-threshold tabs open no window for their category', async () => {
  const { api, windows } = fakeApi([{ id: 1, url: 'https://a.com/' }]);
  const result = await applyResult(decisions, 1, 5, api);
  assert.equal(windows.length, 0);
  assert.equal(result.grouped, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/adapters-safari.test.js`
Expected: FAIL — `Cannot find module '../extension/adapters/safari.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// extension/adapters/safari.js
import { captureTabs, partitionByCategory } from './shared.js';

export { captureTabs };

export async function applyResult(decisions, threshold, windowId, api) {
  const { byCategory, skipped } = await partitionByCategory(decisions, threshold, windowId, api);
  let grouped = 0;
  for (const tabIds of Object.values(byCategory)) {
    if (!tabIds.length) continue;
    const win = await api.windows.create();
    const placeholderId = win.tabs?.[0]?.id;
    await api.tabs.move(tabIds, { windowId: win.id });
    if (placeholderId !== undefined) await api.tabs.remove(placeholderId);
    grouped += tabIds.length;
  }
  return { grouped, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/adapters-safari.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS (all prior tests plus these still pass)

- [ ] **Step 6: Commit**

```bash
git add extension/adapters/safari.js tests/adapters-safari.test.js
git commit -m "Add Safari adapter using per-category windows"
```

---

## Task 4: Cross-browser shim, background script, manifests, package.json check

**Files:**
- Create: `extension/api.js`, `extension/background.js`, `extension/manifest.chrome.json`, `extension/manifest.safari.json`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Produces: `api` (default browser namespace, from `extension/api.js`) — consumed by `dashboard.js` and `app.js` (Tasks 6–7). `sessionStore(browserApi) -> StorageArea` helper — consumed by `app.js` (Task 6) for API key persistence. `background.js` repeats the one-line namespace pick so Safari can load it without module support.

`api` itself (the `globalThis.browser ?? globalThis.chrome` pick) has no unit test: it reads `globalThis` at import time, and there's nothing meaningful to assert in Node without a real browser global. `sessionStore` is a pure function taking an injected `browserApi`, so it is tested below. `background.js` is exercised as a classic script in `tests/background.test.js`, matching Safari's manifest entry.

- [ ] **Step 1: Write the failing test for `sessionStore`**

```js
// tests/api.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStore } from '../extension/api.js';

test('prefers storage.session when present', () => {
  const session = {};
  const local = {};
  assert.equal(sessionStore({ storage: { session, local } }), session);
});

test('falls back to storage.local when storage.session is absent', () => {
  const local = {};
  assert.equal(sessionStore({ storage: { local } }), local);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/api.test.js`
Expected: FAIL — `Cannot find module '../extension/api.js'`

- [ ] **Step 3: Write the shim**

```js
// extension/api.js
export const api = globalThis.browser ?? globalThis.chrome;

export function sessionStore(browserApi = api) {
  return browserApi.storage.session ?? browserApi.storage.local;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/api.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the background script**

```js
// extension/background.js
const api = globalThis.browser ?? globalThis.chrome;

api.action.onClicked.addListener(() => {
  api.tabs.create({ url: api.runtime.getURL('dashboard.html') });
});
```

- [ ] **Step 6: Write the Chrome manifest**

```json
{
  "manifest_version": 3,
  "name": "Tab Tamer",
  "version": "0.1.0",
  "description": "A confidence-aware tab organizer powered by Jev.",
  "permissions": ["tabs", "tabGroups", "storage"],
  "host_permissions": ["https://api.typesafe.ai/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_title": "Tab Tamer" },
  "icons": {}
}
```

- [ ] **Step 7: Write the Safari manifest**

```json
{
  "manifest_version": 3,
  "name": "Tab Tamer",
  "version": "0.1.0",
  "description": "A confidence-aware tab organizer powered by Jev.",
  "permissions": ["tabs", "storage"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": { "scripts": ["background.js"] },
  "action": { "default_title": "Tab Tamer" },
  "browser_specific_settings": { "safari": { "strict_min_version": "17.0" } },
  "icons": {}
}
```

- [ ] **Step 8: Update `package.json` check script**

Replace the `check` script value with:

```
node --check extension/app.js && node --check extension/core.js && node --check extension/api.js && node --check extension/background.js && node --check extension/adapters/shared.js && node --check extension/adapters/chrome.js && node --check extension/adapters/safari.js
```

(`extension/app.js` is created in Task 6 — this script will fail until that file exists; that's expected and resolved by Task 6's own check run.)

- [ ] **Step 9: Syntax-check the files that exist so far**

Run: `node --check extension/api.js && node --check extension/background.js && node --check extension/adapters/shared.js && node --check extension/adapters/chrome.js && node --check extension/adapters/safari.js`
Expected: no output, exit code 0

- [ ] **Step 10: Run the api.js test and commit**

Run: `node --test tests/api.test.js`
Expected: PASS (2 tests)

```bash
git add extension/api.js tests/api.test.js extension/background.js extension/manifest.chrome.json extension/manifest.safari.json package.json
git commit -m "Add browser shim, background script, per-browser manifests"
```

---

## Task 5: Sample fixtures

**Files:**
- Create: `extension/fixtures.js`
- Test: `tests/fixtures.test.js`

**Interfaces:**
- Produces: `SAMPLE_TABS` (array of 8 `RawTab`-shaped objects: `{ id, windowId, title, url }`), `SAMPLE_DECISIONS` (array of 8 objects matching `core.js` decision shape: `{ id, windowId, title, url, category, confidence }`, covering all four categories with a spread of confidence values including at least one just below and one just at a plausible 0.7 threshold) — consumed by `app.js` (Task 6) for sample mode.

- [ ] **Step 1: Write the failing test**

```js
// tests/fixtures.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_TABS, SAMPLE_DECISIONS } from '../extension/fixtures.js';
import { GROUPS } from '../extension/core.js';

test('sample tabs and decisions share ids and stay within limits', () => {
  assert.ok(SAMPLE_TABS.length > 0 && SAMPLE_TABS.length <= 40);
  assert.equal(SAMPLE_DECISIONS.length, SAMPLE_TABS.length);
  const tabIds = new Set(SAMPLE_TABS.map(t => t.id));
  for (const decision of SAMPLE_DECISIONS) {
    assert.ok(tabIds.has(decision.id));
    assert.ok(Object.hasOwn(GROUPS, decision.category));
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
  }
});

test('sample decisions cover all four categories', () => {
  const categories = new Set(SAMPLE_DECISIONS.map(d => d.category));
  assert.deepEqual([...categories].sort(), ['distraction', 'focus', 'later', 'review']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fixtures.test.js`
Expected: FAIL — `Cannot find module '../extension/fixtures.js'`

- [ ] **Step 3: Write the fixtures**

```js
// extension/fixtures.js
export const SAMPLE_TABS = [
  { id: 1, windowId: 1, title: 'React docs: useEffect', url: 'https://react.dev/reference/react/useEffect' },
  { id: 2, windowId: 1, title: 'Tab Tamer — GitHub issue #12', url: 'https://github.com/example/tab-tamer/issues/12' },
  { id: 3, windowId: 1, title: 'MDN: Array.prototype.flatMap', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap' },
  { id: 4, windowId: 1, title: 'Best noise-cancelling headphones 2026', url: 'https://example.com/reviews/headphones' },
  { id: 5, windowId: 1, title: 'A History of Ancient Rome (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Ancient_Rome' },
  { id: 6, windowId: 1, title: 'Team standup notes — Sept 22', url: 'https://notes.example.com/standup-0922' },
  { id: 7, windowId: 1, title: 'r/webdev: anyone else fighting Safari extensions', url: 'https://reddit.com/r/webdev/comments/example' },
  { id: 8, windowId: 1, title: 'localhost:3000', url: 'http://localhost:3000/' },
];

export const SAMPLE_DECISIONS = [
  { ...SAMPLE_TABS[0], category: 'focus', confidence: 0.95 },
  { ...SAMPLE_TABS[1], category: 'focus', confidence: 0.88 },
  { ...SAMPLE_TABS[2], category: 'later', confidence: 0.8 },
  { ...SAMPLE_TABS[3], category: 'distraction', confidence: 0.92 },
  { ...SAMPLE_TABS[4], category: 'distraction', confidence: 0.7 },
  { ...SAMPLE_TABS[5], category: 'later', confidence: 0.6 },
  { ...SAMPLE_TABS[6], category: 'review', confidence: 0.4 },
  { ...SAMPLE_TABS[7], category: 'review', confidence: 0.3 },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fixtures.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/fixtures.js tests/fixtures.test.js
git commit -m "Add sample tab/decision fixtures for demo mode"
```

---

## Task 6: Dashboard logic (`app.js`)

**Files:**
- Create: `extension/app.js`
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `GROUPS`, `sanitizeTabs`, `classify`, `categoryFor` from `extension/core.js`; `SAMPLE_TABS`, `SAMPLE_DECISIONS` from `extension/fixtures.js` (Task 5); `sessionStore` from `extension/api.js` (Task 4).
- Produces (pure functions, DOM-free, unit-testable):
  - `columnsFor(decisions, threshold) -> { focus: Decision[], later: Decision[], distraction: Decision[], review: Decision[] }` — buckets decisions by `categoryFor(decision, threshold)`.
  - `validateGoal(goal) -> { ok: boolean, error?: string }` — thin wrapper surfacing the same rule `buildRequest` enforces (1–500 chars), so the UI can show an inline error before attempting a live call.
  - `runSampleMode(threshold) -> { decisions: Decision[], columns: ReturnType<typeof columnsFor> }` — always available, no network.
  - `runLiveMode({ tabs, goal, apiKey, threshold, fetcher }) -> Promise<{ decisions: Decision[], columns: ReturnType<typeof columnsFor>, model: string, elapsed: number }>` — thin wrapper around `classify` + `columnsFor`; rethrows `classify`'s errors unchanged for the caller to display.
  - `mount(document, api, adapter)` — the one DOM-wiring function, not unit-tested (see Step 5); reads `document`, wires inputs/buttons, calls the pure functions above, calls `adapter.captureTabs`/`adapter.applyResult`.

- [ ] **Step 1: Write the failing test for the pure functions**

```js
// tests/app.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { columnsFor, validateGoal, runSampleMode } from '../extension/app.js';
import { SAMPLE_DECISIONS } from '../extension/fixtures.js';

test('columnsFor buckets by post-threshold category, covering all four columns', () => {
  const columns = columnsFor(SAMPLE_DECISIONS, 0.7);
  assert.ok(columns.focus.length >= 1);
  assert.ok(columns.later.length >= 1);
  assert.ok(columns.distraction.length >= 1);
  assert.ok(columns.review.length >= 1);
  const total = columns.focus.length + columns.later.length + columns.distraction.length + columns.review.length;
  assert.equal(total, SAMPLE_DECISIONS.length);
});

test('raising the threshold moves borderline decisions into review', () => {
  const low = columnsFor(SAMPLE_DECISIONS, 0.5);
  const high = columnsFor(SAMPLE_DECISIONS, 0.9);
  assert.ok(high.review.length >= low.review.length);
});

test('validateGoal rejects empty and over-length goals, accepts a normal one', () => {
  assert.equal(validateGoal('   ').ok, false);
  assert.equal(validateGoal('x'.repeat(501)).ok, false);
  assert.equal(validateGoal('Ship the Safari adapter').ok, true);
});

test('sample mode never touches the network and covers all columns', () => {
  const { decisions, columns } = runSampleMode(0.7);
  assert.equal(decisions.length, SAMPLE_DECISIONS.length);
  assert.ok(columns.focus.length + columns.later.length + columns.distraction.length + columns.review.length === decisions.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app.test.js`
Expected: FAIL — `Cannot find module '../extension/app.js'`

- [ ] **Step 3: Write the pure functions and DOM wiring**

```js
// extension/app.js
import { GROUPS, buildRequest, classify, categoryFor } from './core.js';
import { SAMPLE_TABS, SAMPLE_DECISIONS } from './fixtures.js';
import { sessionStore } from './api.js';

const API_KEY_STORAGE_KEY = 'tabTamerApiKey';

export function columnsFor(decisions, threshold) {
  const columns = { focus: [], later: [], distraction: [], review: [] };
  for (const decision of decisions) {
    columns[categoryFor(decision, threshold)].push(decision);
  }
  return columns;
}

export function validateGoal(goal) {
  try {
    buildRequest(SAMPLE_TABS.slice(0, 1), goal);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function runSampleMode(threshold) {
  return { decisions: SAMPLE_DECISIONS, columns: columnsFor(SAMPLE_DECISIONS, threshold) };
}

export async function runLiveMode({ tabs, goal, apiKey, threshold, fetcher }) {
  const { decisions, model, elapsed } = await classify(tabs, goal, apiKey, fetcher);
  return { decisions, columns: columnsFor(decisions, threshold), model, elapsed };
}

export function mount(document, api, adapter) {
  const goalInput = document.getElementById('goal');
  const thresholdInput = document.getElementById('threshold');
  const modeInput = document.getElementById('mode');
  const apiKeyInput = document.getElementById('api-key');
  const organizeButton = document.getElementById('organize');
  const applyButton = document.getElementById('apply');
  const status = document.getElementById('status');
  const board = document.getElementById('board');
  let lastDecisions = [];
  let lastWindowId = null;
  const store = sessionStore(api);

  store.get(API_KEY_STORAGE_KEY).then(saved => {
    if (saved[API_KEY_STORAGE_KEY]) apiKeyInput.value = saved[API_KEY_STORAGE_KEY];
  });
  apiKeyInput.addEventListener('change', () => {
    store.set({ [API_KEY_STORAGE_KEY]: apiKeyInput.value });
  });

  function render(columns) {
    board.innerHTML = '';
    for (const key of ['focus', 'later', 'distraction', 'review']) {
      const column = document.createElement('div');
      column.className = 'column';
      column.innerHTML = `<h2>${GROUPS[key].label}</h2>`;
      for (const decision of columns[key]) {
        const item = document.createElement('div');
        item.className = 'tab-item';
        item.textContent = `${decision.title} (${Math.round(decision.confidence * 100)}%)`;
        column.appendChild(item);
      }
      board.appendChild(column);
    }
    applyButton.disabled = columns.focus.length + columns.later.length + columns.distraction.length === 0;
  }

  async function organize() {
    status.textContent = '';
    const threshold = Number(thresholdInput.value);
    if (modeInput.value === 'sample') {
      const { decisions, columns } = runSampleMode(threshold);
      lastDecisions = decisions;
      render(columns);
      return;
    }
    const { ok, error } = validateGoal(goalInput.value);
    if (!ok) { status.textContent = error; return; }
    try {
      const [currentTab] = await api.tabs.query({ active: true, currentWindow: true });
      lastWindowId = currentTab.windowId;
      const rawTabs = await adapter.captureTabs(api, lastWindowId);
      const { columns } = await runLiveMode({
        tabs: rawTabs, goal: goalInput.value, apiKey: apiKeyInput.value, threshold,
      });
      lastDecisions = [].concat(...Object.values(columns));
      render(columns);
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function apply() {
    if (!lastDecisions.length || lastWindowId === null) return;
    const threshold = Number(thresholdInput.value);
    const { grouped, skipped } = await adapter.applyResult(lastDecisions, threshold, lastWindowId, api);
    status.textContent = `Grouped ${grouped} tab(s), skipped ${skipped} that moved or fell out of range.`;
  }

  organizeButton.addEventListener('click', organize);
  applyButton.addEventListener('click', apply);
  thresholdInput.addEventListener('input', () => {
    if (lastDecisions.length) render(columnsFor(lastDecisions, Number(thresholdInput.value)));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/app.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Note on `mount()` — not unit-tested**

`mount()` is DOM-wiring glue (event listeners, `document.getElementById`, real extension `api` calls) with no logic of its own — every decision it makes delegates to the pure functions already tested above. Building a DOM (`jsdom` or similar) to test it would add a dependency this project deliberately avoids (see Global Constraints). It's verified by manual load in each browser (Task 9), consistent with the spec's "Known gaps" section on manual UI verification.

- [ ] **Step 6: Commit**

```bash
git add extension/app.js tests/app.test.js
git commit -m "Add dashboard logic: sample/live mode, columns, apply"
```

---

## Task 7: Dashboard markup, styling, and static preview server

**Files:**
- Create: `extension/dashboard.html`, `extension/dashboard.css`, `scripts/preview.js`

**Interfaces:**
- Consumes: `mount` from `extension/app.js` (Task 6); `api` from `extension/api.js` (Task 4); an adapter module chosen by feature-detecting `api.tabGroups` (present → `chrome.js`, absent → `safari.js`).
- Produces: nothing consumed by later tasks — this is the outermost layer. `scripts/preview.js` is a standalone dev tool (`npm run preview`), not part of the extension bundle.

- [ ] **Step 1: Write the dashboard markup**

```html
<!-- extension/dashboard.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tab Tamer</title>
  <link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <main>
    <h1>Tab Tamer</h1>
    <form id="controls" onsubmit="return false">
      <label for="mode">Mode</label>
      <select id="mode">
        <option value="sample">Sample (no network)</option>
        <option value="live">Live (uses Jev)</option>
      </select>

      <label for="goal">Goal</label>
      <textarea id="goal" maxlength="500" placeholder="What are you trying to get done?"></textarea>

      <label for="api-key">TypeSafe API key</label>
      <input id="api-key" type="password" autocomplete="off">

      <label for="threshold">Confidence threshold: <output id="threshold-value">0.7</output></label>
      <input id="threshold" type="range" min="0" max="1" step="0.05" value="0.7">

      <button id="organize" type="button">Preview</button>
      <button id="apply" type="button" disabled>Apply grouping</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
    <div id="board" aria-live="polite"></div>
  </main>
  <script type="module" src="dashboard.js"></script>
</body>
</html>
```

`dashboard.js` imports the API shim, both adapters, and `mount()`, then chooses
the adapter by feature detection. Keeping this in an external file satisfies
Manifest V3's extension-page Content Security Policy, which blocks inline
scripts.

- [ ] **Step 2: Write the stylesheet**

```css
/* extension/dashboard.css */
body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; color: #1a1a1a; }
h1 { font-size: 1.25rem; margin: 0 0 1rem; }
#controls { display: grid; gap: 0.5rem; max-width: 32rem; margin-bottom: 1.5rem; }
#controls label { font-weight: 600; font-size: 0.85rem; }
#controls textarea, #controls input, #controls select { font: inherit; padding: 0.4rem; }
#controls button { margin-top: 0.5rem; padding: 0.5rem 1rem; }
#board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.column { border: 1px solid #ddd; border-radius: 0.5rem; padding: 0.75rem; min-height: 4rem; }
.column h2 { font-size: 0.9rem; margin: 0 0 0.5rem; }
.tab-item { font-size: 0.85rem; padding: 0.25rem 0; border-bottom: 1px solid #eee; }
#status { min-height: 1.2rem; color: #a33; }
```

- [ ] **Step 3: Write the static preview server**

```js
// scripts/preview.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = join(import.meta.dirname, '..', 'extension');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/dashboard.html' : req.url;
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 4173;
server.listen(port, () => console.log(`Tab Tamer preview: http://localhost:${port}`));
```

- [ ] **Step 4: Run the preview server and confirm sample mode renders**

Run: `npm run preview` (in one terminal), then in another: `curl -s http://localhost:4173/dashboard.html | head -5`
Expected: HTML output starting with `<!DOCTYPE html>`. Stop the server (Ctrl-C) once confirmed. Note: `api.js`'s `globalThis.browser ?? globalThis.chrome` is `undefined` outside a real browser extension context, so the module script in a plain browser tab will throw on `api.tabGroups` — this preview only confirms the static file serves correctly and the sample-mode DOM/CSS render; full mount() behavior needs an actual extension load (Task 9).

- [ ] **Step 5: Commit**

```bash
git add extension/dashboard.html extension/dashboard.css scripts/preview.js
git commit -m "Add dashboard markup, styling, static preview server"
```

---

## Task 8: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# Tab Tamer

A confidence-aware tab organizer powered by Jev. Sorts open tabs into
Focus now / Read later / Off track / Your call based on a stated goal,
with a confidence slider controlling how much goes to manual review.

## Modes

- **Sample** — canned fixture data, no network call. Default and only
  verified path until a TypeSafe API key is available.
- **Live** — calls the Jev API (`https://api.typesafe.ai/v1/systemone`)
  with your open tabs and goal. Requires an API key, entered in the
  dashboard and stored in `storage.session` (falls back to
  `storage.local` on Safari versions that lack `storage.session`).

## Development

    npm test      # run unit tests (node --test)
    npm run check # syntax-check all extension source files
    npm run preview # serve the dashboard statically for UI iteration (sample mode only)

## Loading in Chrome

1. Open `chrome://extensions`, enable Developer mode.
2. "Load unpacked" → select the `extension/` folder.
3. Chrome uses `manifest.chrome.json`; rename or symlink it to
   `manifest.json` before loading (Chrome expects that exact filename).

## Loading in Safari (macOS)

Safari Web Extensions need an Xcode app wrapper — this repo does not
commit one; generate it locally:

1. Rename or symlink `extension/manifest.safari.json` to
   `extension/manifest.json` (Safari also expects that exact filename).
2. `xcrun safari-web-extension-converter extension/ --project-location /tmp/tab-tamer-safari`
3. Open the generated Xcode project, build and run the app target once
   to register the extension with Safari.
4. In Safari: Settings → Extensions, enable Tab Tamer.
5. In Safari: Develop menu → Allow Unsigned Extensions (required every
   Safari restart unless the app is signed with a paid Apple Developer
   ID).

## Known limitations

- Safari can capture and preview classifications, but Safari WebExtensions do
  not support `tabs.move` or tab-group APIs, so applying results is Chrome-only.
- No CI coverage for actually loading the extension in either browser;
  that step is manual (see above).
- Live mode is implemented but unverified end-to-end — no API key has
  been tested against it yet.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with Chrome/Safari load instructions"
```

---

## Task 9: Full verification pass

**Files:** none created or modified — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including core, adapter, pipeline, API,
background, manifest, fixtures, and app coverage.

- [ ] **Step 2: Run the syntax check**

Run: `npm run check`
Expected: no output, exit code 0, covering every `extension/*.js` and `extension/adapters/*.js` file.

- [ ] **Step 3: Manual sample-mode smoke test**

Run: `npm run preview`, open `http://localhost:4173` in a regular browser tab (not as an extension — `api` will be `undefined` here so only the static markup/CSS render is being checked, not `mount()`'s behavior). Confirm the page loads without a fetch/network 404 for `dashboard.css`.
Expected: page renders with visible Mode/Goal/API key/Threshold controls.

- [ ] **Step 4: Document remaining manual verification as a follow-up, not a plan gap**

Loading the unpacked extension in real Chrome to confirm apply and in real
Safari (via the Xcode wrapper) to confirm capture/preview is out of scope for
this automated pass — flag both as manual follow-ups. Safari apply is
intentionally unavailable.

- [ ] **Step 5: Final commit if any fixups were needed during verification**

```bash
git add -A
git commit -m "Fix issues found during verification pass"
```

(Skip this step entirely if verification found nothing to fix.)
