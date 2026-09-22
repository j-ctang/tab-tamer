import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_TABS, SAMPLE_DECISIONS } from '../extension/fixtures.js';
import { GROUPS } from '../extension/core.js';

test('sample tabs and decisions share ids and stay within limits', () => {
  assert.ok(SAMPLE_TABS.length > 0 && SAMPLE_TABS.length <= 40);
  assert.equal(SAMPLE_DECISIONS.length, SAMPLE_TABS.length);
  const tabIds = new Set(SAMPLE_TABS.map(t => t.id));
  for (const decision of SAMPLE_DECISIONS) {
    assert.ok(tabIds.has(decision.id));
    assert.ok(Object.hasOwn(GROUPS, decision.category));
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
  }
});

test('sample decisions cover all four categories', () => {
  const categories = new Set(SAMPLE_DECISIONS.map(d => d.category));
  assert.deepEqual([...categories].sort(), ['distraction', 'focus', 'later', 'review']);
});
