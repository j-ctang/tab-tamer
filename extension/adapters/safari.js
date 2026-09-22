import { createTabOperations } from './shared.js';

const supportsApply = false;

export function createSafariTabAdapter(api) {
  return {
    supportsApply,
    captureActiveWindow: createTabOperations(api).captureActiveWindow,
    applyResult: unsupportedApply,
  };
}

async function unsupportedApply() {
  throw new Error('Safari WebExtensions cannot move or group tabs. Preview is available, but apply is Chrome-only.');
}
