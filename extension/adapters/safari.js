import { captureTabs } from './shared.js';

export { captureTabs };
export const supportsApply = false;

export async function applyResult() {
  throw new Error('Safari WebExtensions cannot move or group tabs. Preview is available, but apply is Chrome-only.');
}
