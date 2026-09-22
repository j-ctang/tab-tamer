import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResult } from '../extension/adapters/chrome.js';

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.7 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

test('groups eligible fresh tabs by category and labels the group', async () => {
  const groupCalls = [];
  const updateCalls = [];
  const api = {
    tabs: {
      query: async () => [
        { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
        { id: 3, url: 'https://changed.com/' },
      ],
      group: async ({ tabIds }) => { groupCalls.push(tabIds); return 20; },
    },
    tabGroups: { update: async (groupId, props) => { updateCalls.push([groupId, props]); } },
  };
  const result = await applyResult(decisions, 0.8, 5, api);
  assert.deepEqual(groupCalls, [[1]]);
  assert.deepEqual(updateCalls, [[20, { title: 'Focus now', color: 'green' }]]);
  assert.equal(result.grouped, 1);
  assert.equal(result.skipped, 2);
});

test('an all-review result never calls tabs.group', async () => {
  let called = false;
  const api = {
    tabs: { query: async () => decisions.map(({ id, url }) => ({ id, url })), group: async () => { called = true; } },
    tabGroups: { update: async () => {} },
  };
  const result = await applyResult(decisions, 1, 5, api);
  assert.equal(called, false);
  assert.equal(result.grouped, 0);
});
