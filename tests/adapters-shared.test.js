import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTabs, partitionByCategory } from '../extension/adapters/shared.js';

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.7 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

test('captureTabs queries tabs scoped to the given window', async () => {
  const calls = [];
  const api = { tabs: { query: async (opts) => { calls.push(opts); return [{ id: 1 }]; } } };
  const result = await captureTabs(api, 5);
  assert.deepEqual(calls, [{ windowId: 5 }]);
  assert.deepEqual(result, [{ id: 1 }]);
});

test('partition excludes below-threshold decisions from both buckets', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
    { id: 3, url: 'https://c.com/' },
  ] } };
  const { byCategory, skipped } = await partitionByCategory(decisions.slice(0, 3), 0.8, 5, api);
  assert.deepEqual(byCategory.focus, [1, 3]);
  assert.deepEqual(byCategory.later, []);
  assert.equal(skipped, 0);
});

test('partition marks stale tabs (changed url or left window) as skipped, not grouped', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' },
    { id: 3, url: 'https://changed.com/' },
  ] } };
  const { byCategory, skipped } = await partitionByCategory(decisions, 0.8, 5, api);
  assert.deepEqual(byCategory.focus, [1]);
  assert.deepEqual(byCategory.distraction, []);
  assert.equal(skipped, 2);
});
