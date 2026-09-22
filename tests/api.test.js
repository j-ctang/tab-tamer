import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStore } from '../extension/api.js';

test('prefers storage.session when present', () => {
  const session = {};
  const local = {};
  assert.equal(sessionStore({ storage: { session, local } }), session);
});

test('falls back to storage.local when storage.session is absent', () => {
  const local = {};
  assert.equal(sessionStore({ storage: { local } }), local);
});
