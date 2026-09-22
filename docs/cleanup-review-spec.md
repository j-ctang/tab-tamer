# Cleanup Review design

## Purpose

Cleanup Review helps a user identify tabs that are probably finished,
redundant, stale, or no longer useful for a stated prompt. It is a second Jev
workflow alongside the existing goal organizer. The first release is
preview-only: it classifies and displays candidates but never moves, groups, or
closes tabs.

Chrome is the primary validation target. Because classification and rendering
are browser-independent, Safari exposes the same preview when its existing
capture permissions allow it. Browser mutation remains outside this feature.

## User experience

The dashboard gains a workflow selector with two values:

- **Organize by goal** — the existing four-column experience.
- **Cleanup review** — the new five-column cleanup experience.

Sample/live mode remains a separate choice. Cleanup Review reuses the prompt
field, API-key field, and confidence slider. In cleanup mode the prompt asks
what the current tabs are meant to support, so usefulness and staleness are
evaluated relative to the user's intent rather than guessed from age.

Selecting **Analyze tabs** produces these columns:

| Key | Label | Meaning |
| --- | --- | --- |
| `keep` | Keep | Still useful for the prompt. |
| `finished` | Likely finished | Appears to represent work or a decision that is already complete. |
| `redundant` | Redundant | Substantially overlaps another open tab that is at least as useful. |
| `stale` | Stale / irrelevant | Appears outdated, superseded, or no longer useful for the prompt based on its title and sanitized URL. |
| `review` | Your call | Evidence or confidence is insufficient. |

Each card shows the existing title and confidence percentage. Cleanup Review
does not generate explanations because Jev returns typed decisions rather than
prose. The existing Apply button is hidden while Cleanup Review is selected,
and the page states that the result is a preview only.

Changing workflows clears the previous preview and any pending browser action,
preventing an organization result from being applied after switching modes.

## Decision model

The decision layer becomes workflow-configurable instead of treating the
existing `GROUPS` object as the only valid output schema. Each workflow defines:

- its category keys and presentation metadata;
- the typed choice criteria sent to Jev;
- its sample decisions;
- whether a browser action is available.

For Cleanup Review, every per-tab question can see the complete sanitized tab
list in request state. This lets Jev judge redundancy relative to neighboring
tabs while still returning exactly one typed category for each tab. Phase one
does not attempt to name the better duplicate or create duplicate clusters.

Response validation uses only the categories allowed by the selected workflow.
Missing, malformed, out-of-range, or unknown answers become `review` with zero
confidence. The confidence threshold remains inclusive: a result is shown in
its predicted category when `confidence >= threshold`; otherwise it moves to
`review`.

## Data flow

1. The user selects Cleanup Review, enters a prompt, and chooses sample or live
   mode.
2. Live mode captures the active window and runs the existing sanitization:
   exclude pinned/private/internal/malformed tabs and strip credentials,
   queries, and fragments.
3. The request includes the prompt, the full sanitized tab list, and one cleanup
   choice question per tab.
4. Jev returns typed choices and confidence values.
5. The extension validates all answers, applies the confidence threshold, and
   renders the five cleanup columns.
6. No adapter mutation method is called.

The existing limits remain unchanged: 40 eligible tabs, 500 prompt characters,
300 title characters, and a 30-second live-request timeout.

## Sample mode

Cleanup Review includes a dedicated fixture set covering all five outcomes and
at least one borderline confidence. Sample mode performs no browser capture and
no network request, making the complete cleanup UI testable without a Jev API
key.

## Error handling and safety

- Empty and over-length prompts use the existing inline validation.
- Authentication, rate-limit, timeout, malformed-response, and network errors
  remain user-visible without replacing the last result with partial data.
- Cleanup mode never invokes `applyResult`, `tabs.group`, `tabGroups.move`, or
  `tabs.remove`.
- Titles and sanitized paths can still be sensitive; live analysis remains an
  explicit user action.
- Pinned and private tabs remain outside the request and result set.

## Implementation boundaries

Expected changes are limited to the existing decision, fixture, dashboard, and
test layers:

- `extension/core.js` — workflow-aware request and response validation.
- `extension/fixtures.js` — cleanup sample tabs and decisions.
- `extension/app.js` — workflow selection, dynamic columns, cleanup sample/live
  execution, and action gating.
- `extension/dashboard.html` and `extension/dashboard.css` — workflow control
  and preview-only state.
- Tests for workflow schemas, cleanup request criteria, response validation,
  threshold behavior, fixtures, and proof that cleanup does not expose Apply.

The browser adapters, manifests, background script, API endpoint, storage
policy, and preview server do not need architectural changes.

## Verification and acceptance

Automated acceptance requires:

- existing organization tests remain green;
- cleanup sample data covers all five categories;
- the live cleanup request contains only sanitized eligible tabs and cleanup
  criteria;
- cleanup answers accept only cleanup categories;
- low-confidence cleanup decisions move to `review`;
- switching workflows clears prior decisions;
- cleanup mode cannot enable or call a browser mutation;
- all scripts pass the existing syntax gate.

Manual Chrome verification requires loading the extension, previewing the
cleanup sample, changing the threshold, and confirming that no tab changes
occur. A live smoke test additionally requires a Jev API key. Safari preview is
a compatibility check, not a release blocker for this Chrome-first phase.

## Explicitly deferred

- Applying cleanup groups in Chrome.
- Moving cleanup groups to the right or collapsing them.
- Closing tabs, bookmarking, archiving, or restoring tabs.
- Explaining decisions in generated prose.
- Identifying the canonical tab behind a redundant result.
- Notion, calendar, task-manager, history, or synchronization integrations.
- Firefox-specific packaging or validation.
