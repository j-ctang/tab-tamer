# Tab Tamer architecture

Tab Tamer is a dependency-free Manifest V3 extension that turns sanitized tab
metadata into confidence-aware decisions. Jev supplies typed classifications;
ordinary extension code validates the response, applies confidence thresholds,
renders previews, and controls every browser mutation.

## Browser support

| Capability | Chrome | Safari |
| --- | --- | --- |
| Capture eligible tabs | Yes | Yes, with website permission |
| Sample and live classification preview | Yes | Yes |
| Native tab grouping | Yes | No |
| Move or group tabs | Yes | No (`tabs.move` and tab groups are unsupported) |

Shared classification features should remain browser-independent. Actions that
rearrange tabs are Chrome-first and must be capability-gated; Safari remains a
preview experience unless a future native bridge supplies the missing APIs.

## Data flow

1. Capture tabs from the active window through the selected adapter.
2. Exclude pinned, private, internal, and malformed tabs.
3. Strip URL credentials, query strings, and fragments; cap titles and batch
   size before any live request.
4. Send the user goal, sanitized tab metadata, and typed questions to Jev.
5. Validate every answer. Missing or invalid answers become manual review.
6. Apply the confidence threshold and render all decisions before offering any
   supported browser action.
7. Re-query tabs immediately before an action and skip tabs that moved, closed,
   or changed URL.

## Components

- `extension/core.js` owns sanitization, request construction, response
  validation, confidence handling, and the Jev request.
- `extension/app.js` owns dashboard state and rendering.
- `extension/dashboard.js` selects the browser adapter by capability.
- `extension/adapters/shared.js` owns capture and stale-tab partitioning.
- `extension/adapters/chrome.js` applies native Chrome tab groups.
- `extension/adapters/safari.js` exposes capture and explicitly reports that
  apply is unsupported.
- `extension/background.js` opens the dashboard. It remains import-free so it
  works as both a Chrome module service worker and a classic Safari background
  script.

## Safety and privacy

- No page bodies are read or transmitted.
- Live requests are explicit and limited to 40 eligible tabs.
- API keys prefer `storage.session`, with a Safari-compatible local fallback.
- Sample mode performs no network request.
- Low-confidence results are review items, never silent omissions.
- No destructive action is automatic.

## Verification boundaries

Node tests cover the decision layer, adapters, pipeline, manifests, fixtures,
and background behavior. Syntax checks cover every shipped script. Real-browser
loading, Chrome grouping, Safari permission behavior, and live Jev accuracy
remain manual integration checks.
