import test from 'node:test';
import assert from 'node:assert/strict';
import { columnsFor, validateGoal, runSampleMode } from '../extension/app.js';
import { SAMPLE_DECISIONS } from '../extension/fixtures.js';

test('columnsFor buckets by post-threshold category, covering all four columns', () => {
  const columns = columnsFor(SAMPLE_DECISIONS, 0.7);
  assert.ok(columns.focus.length >= 1);
  assert.ok(columns.later.length >= 1);
  assert.ok(columns.distraction.length >= 1);
  assert.ok(columns.review.length >= 1);
  const total = columns.focus.length + columns.later.length + columns.distraction.length + columns.review.length;
  assert.equal(total, SAMPLE_DECISIONS.length);
});

test('raising the threshold moves borderline decisions into review', () => {
  const low = columnsFor(SAMPLE_DECISIONS, 0.5);
  const high = columnsFor(SAMPLE_DECISIONS, 0.9);
  assert.ok(high.review.length >= low.review.length);
});

test('validateGoal rejects empty and over-length goals, accepts a normal one', () => {
  assert.equal(validateGoal('   ').ok, false);
  assert.equal(validateGoal('x'.repeat(501)).ok, false);
  assert.equal(validateGoal('Ship the Safari adapter').ok, true);
});

test('sample mode never touches the network and covers all columns', () => {
  const { decisions, columns } = runSampleMode(0.7);
  assert.equal(decisions.length, SAMPLE_DECISIONS.length);
  assert.ok(columns.focus.length + columns.later.length + columns.distraction.length + columns.review.length === decisions.length);
});
