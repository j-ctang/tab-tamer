import test from 'node:test';
import assert from 'node:assert/strict';
import { canApply, columnsFor, validateGoal, runSampleMode, runLiveMode } from '../extension/app.js';
import { SAMPLE_DECISIONS, CLEANUP_SAMPLE_DECISIONS } from '../extension/fixtures.js';

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

test('apply is available only for live results on a browser that supports it', () => {
  const columns = columnsFor(SAMPLE_DECISIONS, 0.7);
  assert.equal(canApply(columns, 'live', true), true);
  assert.equal(canApply(columns, 'sample', true), false);
  assert.equal(canApply(columns, 'live', false), false);
});

test('cleanup columns use all five categories and threshold borderline results', () => {
  const columns = columnsFor(CLEANUP_SAMPLE_DECISIONS, 0.7, 'cleanup');
  assert.deepEqual(Object.keys(columns), ['keep', 'finished', 'redundant', 'stale', 'review']);
  assert.equal(columns.stale.length, 1);
  assert.ok(columns.review.some(decision => decision.id === 107));
  assert.equal(Object.values(columns).flat().length, CLEANUP_SAMPLE_DECISIONS.length);
});

test('cleanup sample mode selects cleanup fixtures', () => {
  const result = runSampleMode(0.7, 'cleanup');
  assert.equal(result.decisions, CLEANUP_SAMPLE_DECISIONS);
  assert.equal(Object.keys(result.columns).length, 5);
});

test('cleanup workflow can never enable Apply', () => {
  const columns = columnsFor(CLEANUP_SAMPLE_DECISIONS, 0.7, 'cleanup');
  assert.equal(canApply(columns, 'live', true, 'cleanup'), false);
  assert.equal(canApply(columns, 'sample', true, 'cleanup'), false);
});

test('live cleanup forwards its workflow to Jev classification', async () => {
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ answers: {
      tab_101: { type: 'choice', choice: 'keep', confidence: 0.9 },
    } }), { status: 200 });
  };
  const result = await runLiveMode({
    tabs: [CLEANUP_SAMPLE_DECISIONS[0]],
    goal: 'Finish Tab Tamer',
    apiKey: 'test-key',
    threshold: 0.7,
    fetcher,
    workflowKey: 'cleanup',
  });
  assert.deepEqual(Object.keys(requestBody.questions.tab_101.criteria), ['keep', 'finished', 'redundant', 'stale', 'review']);
  assert.equal(result.columns.keep.length, 1);
});
