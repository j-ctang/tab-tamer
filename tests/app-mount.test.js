import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../extension/app.js';
import { createBrowserBindings } from '../extension/api.js';

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

function browserBindings(tabs = {}) {
  return {
    credentials: { load: async () => '', save: async () => {} },
    tabs: {
      supportsApply: true,
      captureActiveWindow: async () => ({ windowId: 1, tabs: [] }),
      applyResult: async () => ({ grouped: 0, skipped: 0 }),
      ...tabs,
    },
  };
}

test('cleanup workflow renders five preview columns and cannot mutate tabs', async () => {
  const { document, elements } = dashboardFixture();
  let applyCalls = 0;
  const bindings = browserBindings({
    supportsApply: true,
    applyResult: async () => { applyCalls += 1; return { grouped: 0, skipped: 0 }; },
  });

  mount(document, bindings);
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
  assert.equal(elements.status.textContent, elements['workflow-note'].textContent);
});

test('switching workflows clears preview state and restores organizer controls', async () => {
  const { document, elements } = dashboardFixture();
  mount(document, browserBindings());

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

test('workflow changes invalidate a pending live preview', async () => {
  const { document, elements } = dashboardFixture();
  elements.mode.value = 'live';
  elements.goal.value = 'Ship Tab Tamer';
  elements['api-key'].value = 'test-key';
  const bindings = browserBindings({
    supportsApply: true,
    captureActiveWindow: async () => ({
      windowId: 5,
      tabs: [{ id: 1, windowId: 5, title: 'Current guide', url: 'https://example.com/current' }],
    }),
    applyResult: async () => ({ grouped: 1, skipped: 0 }),
  });
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });

  try {
    mount(document, bindings);
    const pendingPreview = elements.organize.dispatch('click');
    while (!resolveFetch) await Promise.resolve();

    elements.workflow.value = 'cleanup';
    await elements.workflow.dispatch('change');
    elements.workflow.value = 'organize';
    await elements.workflow.dispatch('change');

    resolveFetch(new Response(JSON.stringify({ answers: {
      tab_1: { type: 'choice', choice: 'focus', confidence: 0.95 },
    } }), { status: 200 }));
    await pendingPreview;

    assert.equal(elements.board.children.length, 0);
    assert.equal(elements.apply.disabled, true);
    assert.equal(elements.status.textContent, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Safari live classification renders while Apply remains unavailable', async () => {
  const { document, elements } = dashboardFixture();
  elements.mode.value = 'live';
  elements.goal.value = 'Ship Tab Tamer';
  elements['api-key'].value = 'test-key';
  const safariApi = {
    storage: { session: { get: async () => ({}), set: async () => {} } },
    tabs: { query: async options => options.active
      ? [{ id: 99, windowId: 7 }]
      : [{ id: 1, windowId: 7, title: 'Safari guide', url: 'https://example.com/safari' }] },
  };
  const bindings = createBrowserBindings(safariApi);
  const unavailableReason = 'This browser can classify tabs, but cannot group them.';
  bindings.tabs.applyUnavailableReason = unavailableReason;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: {
    tab_1: { type: 'choice', choice: 'focus', confidence: 0.94 },
  } }), { status: 200 });

  try {
    mount(document, bindings);
    await elements.organize.dispatch('click');

    assert.equal(elements.board.children.length, 4);
    assert.equal(elements.apply.disabled, true);
    assert.equal(elements.status.textContent, unavailableReason);
    await elements.apply.dispatch('click');
    assert.equal(elements.status.textContent, unavailableReason);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('editing the goal invalidates a preview before it can be applied', async () => {
  const { document, elements } = dashboardFixture();
  elements.mode.value = 'live';
  elements.goal.value = 'Ship Tab Tamer';
  elements['api-key'].value = 'test-key';
  const bindings = browserBindings({
    captureActiveWindow: async () => ({
      windowId: 5,
      tabs: [{ id: 1, windowId: 5, title: 'Current guide', url: 'https://example.com/current' }],
    }),
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: {
    tab_1: { type: 'choice', choice: 'focus', confidence: 0.95 },
  } }), { status: 200 });

  try {
    mount(document, bindings);
    await elements.organize.dispatch('click');
    assert.equal(elements.apply.disabled, false);

    elements.goal.value = 'Plan a different project';
    await elements.goal.dispatch('input');

    assert.equal(elements.board.children.length, 0);
    assert.equal(elements.apply.disabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a successful apply consumes the preview instead of enabling duplicate grouping', async () => {
  const { document, elements } = dashboardFixture();
  elements.mode.value = 'live';
  elements.goal.value = 'Ship Tab Tamer';
  elements['api-key'].value = 'test-key';
  let applyCalls = 0;
  const bindings = browserBindings({
    captureActiveWindow: async () => ({
      windowId: 5,
      tabs: [{ id: 1, windowId: 5, title: 'Current guide', url: 'https://example.com/current' }],
    }),
    applyResult: async () => { applyCalls += 1; return { grouped: 1, skipped: 0 }; },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: {
    tab_1: { type: 'choice', choice: 'focus', confidence: 0.95 },
  } }), { status: 200 });

  try {
    mount(document, bindings);
    await elements.organize.dispatch('click');
    await elements.apply.dispatch('click');

    assert.equal(applyCalls, 1);
    assert.equal(elements.apply.disabled, true);
    assert.match(elements.status.textContent, /Grouped 1 tab/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
