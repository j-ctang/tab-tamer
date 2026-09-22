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
