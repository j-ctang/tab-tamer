import test from 'node:test';
import assert from 'node:assert/strict';
import * as sharedAdapter from '../extension/adapters/shared.js';

const { createTabOperations } = sharedAdapter;

const decisions = [
  { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
  { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'later', confidence: 0.7 },
  { id: 3, windowId: 5, url: 'https://c.com/', title: 'C', category: 'focus', confidence: 0.9 },
  { id: 4, windowId: 5, url: 'https://d.com/', title: 'D', category: 'distraction', confidence: 0.9 },
];

test('bound tab operations capture the active window and its tabs', async () => {
  const calls = [];
  const api = { tabs: { query: async options => {
    calls.push(options);
    return options.active ? [{ id: 99, windowId: 5 }] : [{ id: 1, windowId: 5 }];
  } } };
  const result = await createTabOperations(api).captureActiveWindow();
  assert.deepEqual(calls, [{ active: true, currentWindow: true }, { windowId: 5 }]);
  assert.deepEqual(result, { windowId: 5, tabs: [{ id: 1, windowId: 5 }] });
});

test('partition excludes below-threshold decisions from both buckets', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' },
    { id: 3, url: 'https://c.com/' },
  ] } };
  const { byCategory, skipped } = await createTabOperations(api).partitionByCategory(decisions.slice(0, 3), 0.8, 5);
  assert.deepEqual(byCategory.focus, [1, 3]);
  assert.deepEqual(byCategory.later, []);
  assert.equal(skipped, 0);
});

test('partition marks stale tabs (changed url or left window) as skipped, not grouped', async () => {
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/' },
    { id: 3, url: 'https://changed.com/' },
  ] } };
  const { byCategory, skipped } = await createTabOperations(api).partitionByCategory(decisions, 0.8, 5);
  assert.deepEqual(byCategory.focus, [1]);
  assert.deepEqual(byCategory.distraction, []);
  assert.equal(skipped, 2);
});

test('a current tab whose raw URL has a query string or fragment is not marked stale when the sanitized form matches', async () => {
  const withVolatileUrls = [
    { id: 1, windowId: 5, url: 'https://a.com/', title: 'A', category: 'focus', confidence: 0.95 },
    { id: 2, windowId: 5, url: 'https://b.com/', title: 'B', category: 'focus', confidence: 0.9 },
  ];
  const api = { tabs: { query: async () => [
    { id: 1, url: 'https://a.com/?utm_source=x' },
    { id: 2, url: 'https://b.com/#section' },
  ] } };
  const { byCategory, skipped } = await createTabOperations(api).partitionByCategory(withVolatileUrls, 0.8, 5);
  assert.deepEqual(byCategory.focus.sort(), [1, 2]);
  assert.equal(skipped, 0);
});
