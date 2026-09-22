# Tab Tamer: cross-browser adapter design (Chrome + Safari)

Supersedes the Chrome-only sections of `docs/plan.md`. Decision layer,
goal, confidence slider, sample-mode-first stance are unchanged and
carry forward as-is.

## Why

Original plan was Chrome-first with `chrome.tabGroups`. User's actual
daily browser is Safari, and the eventual target is multiple browsers
(Chrome + Safari now, more later). Safari Web Extensions have no
public API to create/color tab groups, so the "apply groups" step
needs a browser-specific implementation, not just a permissions tweak.

## Architecture

```
extension/
  core.js                 # unchanged: pure decision logic, browser-agnostic
  adapters/
    chrome.js              # captureTabs(), applyResult() via chrome.tabGroups
    safari.js               # captureTabs(), applyResult() via 4 new windows
  api.js                    # globalThis.browser ?? globalThis.chrome, thin shim only (no dependency)
  background.js             # picks adapter by runtime feature detection
  app.js                     # dashboard UI logic, unchanged concept
  dashboard.html/css
  manifest.chrome.json
  manifest.safari.json
scripts/
  preview.js                # static sample-mode server, browser-independent
tests/
  core.test.js               # unchanged
  adapters.test.js            # replaces browser.test.js, tests both adapters via fake api objects
```

### Adapter interface

Both adapters implement the same two functions, so `background.js` and
tests never branch on browser identity directly:

```js
// captureTabs(api, windowId) -> Promise<RawTab[]>
// applyResult(decisions, threshold, windowId, api) -> Promise<{ grouped: number, skipped: number }>
```

`core.js` stays the single source of truth for what counts as
eligible, what confidence means, and how decisions are computed. Only
*how the result gets applied to real browser tabs* differs per
adapter.

### Chrome adapter (`chrome.js`)

Same as original plan: `chrome.tabGroups.group` + `chrome.tabGroups.update`
to color/label groups in place. Skips tabs that changed URL or window
since capture, and tabs below confidence threshold (stay `review`,
untouched). Behavior identical to the original Chrome design.

### Safari adapter (`safari.js`)

No tab-group API available. Applies result by:
1. Re-querying the source window; skip any tab whose URL changed or
   that left the window since capture (same staleness rule as Chrome).
2. For each of the 3 non-review categories with at least one eligible
   tab, open one new window (`browser.windows.create`) titled by
   category, then move matching tabs into it (`browser.tabs.move`).
3. `review`-category tabs are left untouched in the original window,
   same as Chrome adapter's behavior for below-threshold tabs.

This is a real UX difference from Chrome (separate windows vs. inline
colored groups) — approved as the only option given Safari's API
surface.

### Cross-browser shim (`api.js`)

```js
export const api = globalThis.browser ?? globalThis.chrome;
```

No `webextension-polyfill` dependency. Both Safari and modern Chrome
(MV3, Chrome 99+) support promise-based calls on their respective
namespaces already, so a namespace pick is sufficient — no
callback-to-promise conversion needed.

### API key storage

```js
const sessionStore = api.storage.session ?? api.storage.local;
```

Feature-detected at the point of use in `app.js`/`background.js`.
`storage.session` is preferred (cleared when the browser closes);
falls back to `storage.local` on older Safari where `storage.session`
is absent. No version-sniffing — pure capability check.

### Manifest split

Two manifest files, `manifest.chrome.json` and `manifest.safari.json`,
both Manifest V3. They differ only in:
- `background` key shape (Chrome: `service_worker`; Safari: `scripts`
  background page — both supported per-browser, no shared field).
- `browser_specific_settings.safari` block present only in the Safari
  manifest.
- `permissions`: Chrome manifest includes `tabGroups`; Safari manifest
  omits it (unused, and Safari would reject an unknown permission).
- `host_permissions` explicitly lists `https://api.typesafe.ai/*` in
  both, required for the live-mode fetch to pass Safari's stricter
  host-permission enforcement.

No build step generates these — both files are committed directly,
hand-maintained, since the set of differences is small and static.

### Packaging (Safari only)

Repo ships extension source only. README documents running
`xcrun safari-web-extension-converter extension/ --project-location <path>`
locally to generate the Xcode wrapper app needed to run/sign the
extension on macOS. Generated Xcode project is not committed
(regenerable from source; keeps repo build-tool-free per original
dependency-free architecture decision).

## Known gaps (carried forward, not solved by this spec)

- No Safari extension automation for CI — end-to-end "load extension
  and verify grouping" stays a manual, real-Safari verification step.
  Chrome adapter *is* automatable later (Puppeteer + `--load-extension`)
  if desired, but that's out of scope for this spec.
- Safari requires enabling unsigned extensions (Develop menu) each
  session, or a paid Apple Developer ID for persistent signing/
  distribution. Out of scope to solve; documented in README as a
  precondition to local testing.
- No Jev API key available yet. Live-mode path (`classify()` in
  `core.js`) stays implemented but unverified end-to-end; sample mode
  is the only testable path until a key exists. Unchanged from
  original plan.
- Firefox/other browsers: adapter interface is designed to make adding
  a third adapter (e.g. `firefox.js`) straightforward later, but no
  Firefox manifest or adapter is built in this pass — Chrome + Safari
  only, per explicit scope.

## Testing

- `core.test.js`: unchanged, already covers decision layer.
- `adapters.test.js` (replaces `browser.test.js`): tests `chrome.js`
  and `safari.js` each against fake `api` objects (same pattern as the
  existing `browser.test.js` fakes) — staleness exclusion, threshold
  exclusion, and (Safari only) correct window-per-category grouping.
- `node --check` extended to all new files in `package.json`'s `check`
  script (`api.js`, `adapters/chrome.js`, `adapters/safari.js`,
  `background.js`, `app.js`).
- No automated Safari browser-load test (see Known gaps). Chrome
  load/grouping verification stays manual too, consistent with
  original plan's "where possible" caveat.

## Files touched

New: `extension/adapters/chrome.js`, `extension/adapters/safari.js`,
`extension/api.js`, `extension/background.js`, `extension/app.js`,
`extension/dashboard.html`, `extension/dashboard.css`,
`extension/manifest.chrome.json`, `extension/manifest.safari.json`,
`scripts/preview.js`, `tests/adapters.test.js`, `README.md`.

Removed: `extension/browser.js` (stub, replaced by adapters),
`tests/browser.test.js` (replaced by `adapters.test.js`).

Unchanged: `extension/core.js`, `tests/core.test.js`.
