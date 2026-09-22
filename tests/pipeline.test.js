import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTabs, classify } from '../extension/core.js';
import { columnsFor } from '../extension/app.js';
import { applyResult as chromeApplyResult } from '../extension/adapters/chrome.js';

// Full pipeline: raw (unsanitized) tabs -> sanitizeTabs -> classify (fake fetcher)
// -> adapter.applyResult (fake browser api). A tab whose raw URL carries a
// query string or fragment, but is otherwise unchanged, must NOT be treated
// as stale by Chrome's applyResult. Safari is preview-only because its
// WebExtension API does not support moving or grouping tabs.

const rawTabs = [
  { id: 1, windowId: 5, title: 'Search results', url: 'https://search.example.com/?q=tab+tamer', pinned: false, incognito: false },
  { id: 2, windowId: 5, title: 'Inbox', url: 'https://mail.example.com/#inbox', pinned: false, incognito: false },
];

function fakeFetcher(answers) {
  return async () => ({
    ok: true,
    json: async () => ({ model: 'test-model', answers }),
  });
}

async function classifyFixture() {
  const tabs = sanitizeTabs(rawTabs);
  const fetcher = fakeFetcher({
    tab_1: { type: 'choice', choice: 'focus', confidence: 0.95 },
    tab_2: { type: 'choice', choice: 'later', confidence: 0.9 },
  });
  const { decisions } = await classify(tabs, 'find the docs', 'fake-key', fetcher);
  return decisions;
}

test('chrome adapter: query-string/fragment tabs that did not actually change are not marked stale', async () => {
  const decisions = await classifyFixture();
  const groupCalls = [];
  const updateCalls = [];
  const api = {
    tabs: {
      // Simulates a fresh browser query: raw URLs still carry query/hash.
      query: async () => rawTabs.map(({ id, url }) => ({ id, url })),
      group: async ({ tabIds }) => { groupCalls.push(tabIds); return 42; },
    },
    tabGroups: { update: async (groupId, props) => { updateCalls.push([groupId, props]); } },
  };
  const result = await chromeApplyResult(decisions, 0.8, 5, api);
  assert.equal(result.skipped, 0);
  assert.equal(result.grouped, 2);
  assert.deepEqual(groupCalls.flat().sort(), [1, 2]);
});

test('cleanup pipeline sends sanitized tabs and returns preview columns without an adapter', async () => {
  const cleanupRawTabs = [
    { id: 20, windowId: 5, title: 'Current guide', url: 'https://user:secret@example.com/current?token=private#part' },
    { id: 21, windowId: 5, title: 'Old guide', url: 'https://example.com/old?secret=yes' },
    { id: 22, windowId: 5, title: 'Pinned', url: 'https://example.com/pinned', pinned: true },
  ];
  const tabs = sanitizeTabs(cleanupRawTabs);
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ answers: {
      tab_20: { type: 'choice', choice: 'keep', confidence: 0.91 },
      tab_21: { type: 'choice', choice: 'stale', confidence: 0.84 },
    } }), { status: 200 });
  };

  const { decisions } = await classify(tabs, 'Use current documentation', 'fake-key', fetcher, 'cleanup');
  const columns = columnsFor(decisions, 0.7, 'cleanup');

  assert.deepEqual(requestBody.state.tabs, [
    { id: 20, title: 'Current guide', url: 'https://example.com/current' },
    { id: 21, title: 'Old guide', url: 'https://example.com/old' },
  ]);
  assert.equal(columns.keep.length, 1);
  assert.equal(columns.stale.length, 1);
  assert.equal(Object.values(columns).flat().length, 2);
});
