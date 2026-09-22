import test from 'node:test';
import assert from 'node:assert/strict';
import * as safariAdapter from '../extension/adapters/safari.js';

const { createSafariTabAdapter } = safariAdapter;

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
        move: async (tabIds, { windowId, index }) => {
          assert.equal(typeof index, 'number');
          moves.push({ tabIds, windowId, index });
        },
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

test('reports Safari apply as unsupported instead of calling tabs.move', async () => {
  const { api, windows, moves } = fakeApi(decisions.map(({ id, url }) => ({ id, url })));
  const adapter = createSafariTabAdapter(api);

  assert.equal(adapter.supportsApply, false);
  assert.match(adapter.applyUnavailableReason, /Safari.*move or group tabs/i);
  await assert.rejects(adapter.applyResult(decisions, 0.8, 5), /Safari.*move or group tabs/i);
  assert.equal(windows.length, 0);
  assert.equal(moves.length, 0);
});
