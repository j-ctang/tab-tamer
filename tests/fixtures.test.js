import test from 'node:test';
import assert from 'node:assert/strict';
import * as fixtures from '../extension/fixtures.js';
import { GROUPS, WORKFLOWS } from '../extension/core.js';

const {
  SAMPLE_TABS, SAMPLE_DECISIONS, CLEANUP_SAMPLE_TABS,
  CLEANUP_SAMPLE_DECISIONS, SAMPLE_WORKFLOWS,
} = fixtures;

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

test('cleanup samples cover every cleanup category with matching tabs', () => {
  assert.equal(CLEANUP_SAMPLE_DECISIONS.length, CLEANUP_SAMPLE_TABS.length);
  assert.deepEqual(
    [...new Set(CLEANUP_SAMPLE_DECISIONS.map(decision => decision.category))].sort(),
    ['finished', 'keep', 'redundant', 'review', 'stale'],
  );
  for (const decision of CLEANUP_SAMPLE_DECISIONS) {
    assert.ok(CLEANUP_SAMPLE_TABS.some(tab => tab.id === decision.id));
    assert.ok(Object.hasOwn(WORKFLOWS.cleanup.categories, decision.category));
  }
});

test('workflow fixtures expose organizer and cleanup datasets', () => {
  assert.equal(SAMPLE_WORKFLOWS.organize.decisions, SAMPLE_DECISIONS);
  assert.equal(SAMPLE_WORKFLOWS.cleanup.decisions, CLEANUP_SAMPLE_DECISIONS);
});
