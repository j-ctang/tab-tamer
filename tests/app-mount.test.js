import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../extension/app.js';

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
    this._innerHTML = '';
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') this.children = [];
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  appendChild(child) { this.children.push(child); }
  async dispatch(type) {
    const listener = this.listeners.get(type);
    if (listener) await listener({ preventDefault() {} });
  }
}

function dashboardFixture() {
  const ids = [
    'controls', 'workflow', 'goal-label', 'goal', 'threshold',
    'threshold-value', 'mode', 'api-key', 'organize', 'apply',
    'workflow-note', 'status', 'board',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  elements.workflow.value = 'organize';
  elements.mode.value = 'sample';
  elements.threshold.value = '0.7';
  return {
    document: {
      getElementById: id => elements[id],
      createElement: () => new FakeElement(),
    },
    elements,
  };
}

test('cleanup workflow renders five preview columns and cannot mutate tabs', async () => {
  const { document, elements } = dashboardFixture();
  let applyCalls = 0;
  const api = { storage: { session: { get: async () => ({}), set: async () => {} } } };
  const adapter = {
    supportsApply: true,
    captureTabs: async () => [],
    applyResult: async () => { applyCalls += 1; return { grouped: 0, skipped: 0 }; },
  };

  mount(document, api, adapter);
  elements.workflow.value = 'cleanup';
  await elements.workflow.dispatch('change');
  assert.equal(elements.apply.hidden, true);
  assert.equal(elements['workflow-note'].hidden, false);
  assert.equal(elements.board.children.length, 0);

  await elements.organize.dispatch('click');
  assert.equal(elements.board.children.length, 5);
  assert.match(elements['workflow-note'].textContent, /preview only/i);

  await elements.apply.dispatch('click');
  assert.equal(applyCalls, 0);
});

test('switching workflows clears preview state and restores organizer controls', async () => {
  const { document, elements } = dashboardFixture();
  const api = { storage: { session: { get: async () => ({}), set: async () => {} } } };
  const adapter = { supportsApply: true, captureTabs: async () => [], applyResult: async () => ({ grouped: 0, skipped: 0 }) };
  mount(document, api, adapter);

  elements.workflow.value = 'cleanup';
  await elements.workflow.dispatch('change');
  await elements.organize.dispatch('click');
  assert.equal(elements.board.children.length, 5);

  elements.workflow.value = 'organize';
  await elements.workflow.dispatch('change');
  assert.equal(elements.board.children.length, 0);
  assert.equal(elements.apply.hidden, false);
  assert.equal(elements['workflow-note'].hidden, true);
});
