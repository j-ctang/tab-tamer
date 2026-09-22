import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('background script runs as a classic Safari script and opens the dashboard', async () => {
  const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
  const created = [];
  let onClicked;
  const browser = {
    action: { onClicked: { addListener(listener) { onClicked = listener; } } },
    runtime: { getURL: path => `safari-extension://${path}` },
    tabs: { create: options => created.push(options) },
  };

  vm.runInNewContext(source, { browser });
  assert.equal(typeof onClicked, 'function');
  onClicked();
  assert.equal(created.length, 1);
  assert.equal(created[0].url, 'safari-extension://dashboard.html');
});
