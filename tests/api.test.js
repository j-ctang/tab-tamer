import test from 'node:test';
import assert from 'node:assert/strict';
import * as apiModule from '../extension/api.js';

const { createBrowserBindings, createCredentialStore } = apiModule;

function storageArea(initial = {}) {
  const values = { ...initial };
  return {
    get: async key => ({ [key]: values[key] }),
    set: async entries => Object.assign(values, entries),
    values,
  };
}

test('credential store loads and saves the API key in session storage', async () => {
  const session = storageArea({ tabTamerApiKey: 'session-key' });
  const local = storageArea({ tabTamerApiKey: 'local-key' });
  const credentials = createCredentialStore({ storage: { session, local } });

  assert.equal(await credentials.load(), 'session-key');
  await credentials.save('new-key');
  assert.equal(session.values.tabTamerApiKey, 'new-key');
  assert.equal(local.values.tabTamerApiKey, 'local-key');
});

test('credential store falls back to local storage when session storage is absent', async () => {
  const local = storageArea({ tabTamerApiKey: 'local-key' });
  const credentials = createCredentialStore({ storage: { local } });

  assert.equal(await credentials.load(), 'local-key');
  await credentials.save('new-key');
  assert.equal(local.values.tabTamerApiKey, 'new-key');
});

test('browser bindings select tab behavior by grouping capability', () => {
  const storage = { session: storageArea() };
  const tabs = { query: async () => [] };
  const chromeBindings = createBrowserBindings({ storage, tabs, tabGroups: {} });
  const safariBindings = createBrowserBindings({ storage, tabs });

  assert.equal(chromeBindings.tabs.supportsApply, true);
  assert.equal(safariBindings.tabs.supportsApply, false);
  assert.equal(typeof chromeBindings.credentials.load, 'function');
  assert.equal(typeof safariBindings.tabs.captureActiveWindow, 'function');
});
