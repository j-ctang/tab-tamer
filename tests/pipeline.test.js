import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTabs, classify } from '../extension/core.js';
import { applyResult as chromeApplyResult } from '../extension/adapters/chrome.js';
import { applyResult as safariApplyResult } from '../extension/adapters/safari.js';

// Full pipeline: raw (unsanitized) tabs -> sanitizeTabs -> classify (fake fetcher)
// -> adapter.applyResult (fake browser api). A tab whose raw URL carries a
// query string or fragment, but is otherwise unchanged, must NOT be treated
// as stale by either adapter's applyResult.

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

test('safari adapter: query-string/fragment tabs that did not actually change are not marked stale', async () => {
  const decisions = await classifyFixture();
  const moves = [];
  const removed = [];
  let nextWindowId = 200;
  const api = {
    tabs: {
      query: async () => rawTabs.map(({ id, url }) => ({ id, url })),
      move: async (tabIds, { windowId, index }) => {
        assert.equal(typeof index, 'number');
        moves.push({ tabIds, windowId });
      },
      remove: async (tabId) => { removed.push(tabId); },
    },
    windows: {
      create: async () => {
        const id = nextWindowId++;
        return { id, tabs: [{ id: id * 1000 }] };
      },
    },
  };
  const result = await safariApplyResult(decisions, 0.8, 5, api);
  assert.equal(result.skipped, 0);
  assert.equal(result.grouped, 2);
  assert.deepEqual(moves.map(m => m.tabIds).sort(), [[1], [2]]);
  assert.equal(removed.length, 2);
});
