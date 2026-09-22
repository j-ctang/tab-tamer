import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Safari requests access to the HTTP and HTTPS tabs it organizes', async () => {
  const source = await readFile(new URL('../extension/manifest.safari.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(source);

  assert.ok(manifest.host_permissions.includes('http://*/*'));
  assert.ok(manifest.host_permissions.includes('https://*/*'));
});
