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
    npm run preview # serve the dashboard statically for layout/styling iteration only

The preview server is for iterating on layout and styling only. Outside
a real extension context `api` (from `api.js`) is `undefined`, so
nothing functional works there — not even sample mode. Functional
testing, including sample mode, requires loading the actual extension
in a browser (see below).

## Loading in Chrome

1. Chrome uses `manifest.chrome.json`; rename or symlink it to
   `manifest.json` before loading (Chrome expects that exact filename).
2. Open `chrome://extensions`, enable Developer mode.
3. "Load unpacked" → select the `extension/` folder.

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

- Safari has no API to create native colored tab groups, so applying
  a result opens one new window per category instead.
- No CI coverage for actually loading the extension in either browser;
  that step is manual (see above).
- Live mode is implemented but unverified end-to-end — no API key has
  been tested against it yet.
- Live mode is capped at 40 tabs per request; if you have more open,
  close some or wait for a future update.
