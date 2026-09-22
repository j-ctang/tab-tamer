# Tab Tamer implementation plan

Approved: Chrome-first organizer, four-column board, confidence slider, sample mode, repo under j-ctang in ~/dev. User confirmed no API access; sample mode is the initial experience.

Architecture: dependency-free Manifest V3 extension, full-tab dashboard, pure decision functions, isolated Chrome adapter, native fetch to TypeSafe. API key lives only in session storage. Static preview supports the same sample UI.

- [ ] Decision layer: sanitize tabs, create Choice questions, validate answers, route uncertainty to review. Test invalid responses, confidence boundaries, API errors.
- [ ] Chrome adapter: capture one window; skip pinned/private/internal tabs; apply groups only to unchanged tabs still in that window. Test stale/closed tabs and review exclusion.
- [ ] Dashboard: goal presets, explicit demo/live modes, four columns, confidence slider, latency, accessible states, key settings, preview before grouping.
- [ ] Verify: Node tests, syntax checks, browser sample interactions, actual extension load/grouping where possible.
- [ ] Deliver: README, CI, commit, private GitHub repo and push.

Limits: 40 tabs per request, 500-character goal, 300-character titles, 30-second timeout. Strip URL credentials/query/fragment. No page bodies or tab closing. Titles and paths can still be sensitive, so each live request is explicit. Confidence is the API confidence field, not winning-choice probability. Sample decisions are labeled fixtures; live Jev accuracy cannot be verified without a key.
