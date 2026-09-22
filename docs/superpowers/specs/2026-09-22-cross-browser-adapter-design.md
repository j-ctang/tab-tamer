# Tab Tamer: cross-browser adapter design (Chrome + Safari)

Supersedes the Chrome-only sections of `docs/plan.md`. Decision layer,
goal, confidence slider, sample-mode-first stance are unchanged and
carry forward as-is.

## Why

Original plan was Chrome-first with `chrome.tabGroups`. User's actual daily
browser is Safari, and the eventual target is multiple browsers. Safari can
capture tabs and run the shared classification UI, but its WebExtension API
supports neither tab groups nor `tabs.move`. Therefore Chrome supports preview
and apply, while Safari is preview-only. The UI must say so and must never
offer an apply action that depends on unsupported APIs.

## Architecture

```
extension/
  core.js                 # unchanged: pure decision logic, browser-agnostic
  adapters/
    chrome.js              # captureTabs(), applyResult() via chrome.tabGroups
    safari.js               # captureTabs(); apply explicitly unsupported
  api.js                    # globalThis.browser ?? globalThis.chrome, thin shim only (no dependency)
  background.js             # self-contained classic script; opens dashboard only
  app.js                     # dashboard UI logic, unchanged concept
  dashboard.js               # picks adapter by runtime feature detection, mounts app.js
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

Both adapters export the same functions plus a capability flag, so
`dashboard.js` and tests do not branch on browser identity directly:

```js
// captureTabs(api, windowId) -> Promise<RawTab[]>
// applyResult(decisions, threshold, windowId, api) -> Promise<{ grouped: number, skipped: number }>
// supportsApply -> boolean
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

Safari exports `captureTabs` and `supportsApply = false`. `applyResult()`
throws a clear compatibility error as a defense in depth; the dashboard uses
the capability flag to disable Apply before it can be called. Classification,
the confidence slider, and the four-column preview remain functional.

Do not attempt the earlier per-category-window design. Apple documents
`tabs.move` as unsupported in Safari, and Safari has no tab-group API. Opening
duplicate URLs and closing the originals would violate the no-tab-closing
constraint and would lose tab history/state, so it is not an acceptable
fallback. A native-app bridge is a possible future design, outside this spec.

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

Feature-detected at the point of use in `app.js`.
`storage.session` is preferred (cleared when the browser closes);
falls back to `storage.local` on older Safari where `storage.session`
is absent. No version-sniffing — pure capability check.

### Manifest split

Two manifest files, `manifest.chrome.json` and `manifest.safari.json`,
both Manifest V3. They differ only in:
- `background` key shape (Chrome: module `service_worker`; Safari: classic
  `scripts` background page). `background.js` has no imports so the same file
  works in both forms; this avoids Safari converter/runtime dependence on the
  optional background `type: "module"` key.
- `browser_specific_settings.safari` block present only in the Safari
  manifest.
- `permissions`: Chrome manifest includes `tabGroups`; Safari manifest
  omits it (unused, and Safari would reject an unknown permission).
- `host_permissions`: Chrome explicitly lists `https://api.typesafe.ai/*` for
  the live-mode fetch. Safari lists HTTP and HTTPS match patterns because
  Safari also requires host permission for `tabs` to expose arbitrary tab
  titles and URLs; those patterns include the Jev endpoint.

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

- No Safari extension automation for CI — end-to-end capture and preview stay
  a manual, real-Safari verification step. Safari apply is intentionally
  unavailable.
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
- `adapters-shared.test.js`, `adapters-chrome.test.js`, and
  `adapters-safari.test.js` replace `browser.test.js`: they cover Chrome
  grouping/staleness and verify that Safari reports apply as unsupported
  without calling `tabs.move`.
- `background.test.js` executes `background.js` as a classic script and proves
  the toolbar action opens the dashboard, protecting Safari compatibility.
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
`scripts/preview.js`, the adapter/background tests, `README.md`.

Removed: `extension/browser.js` (stub, replaced by adapters),
`tests/browser.test.js` (replaced by the adapter test files).

Unchanged: `extension/core.js`, `tests/core.test.js`.
