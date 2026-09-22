import { createTabOperations } from './shared.js';

const supportsApply = false;
const applyUnavailableReason = 'Safari WebExtensions cannot move or group tabs. Preview is available, but apply is Chrome-only.';

export function createSafariTabAdapter(api) {
  return {
    supportsApply,
    applyUnavailableReason,
    captureActiveWindow: createTabOperations(api).captureActiveWindow,
    applyResult: unsupportedApply,
  };
}

async function unsupportedApply() {
  throw new Error(applyUnavailableReason);
}
