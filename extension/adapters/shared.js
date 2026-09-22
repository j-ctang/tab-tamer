import { GROUPS, categoryFor, sanitizeTabs } from '../core.js';

async function captureTabs(api, windowId) {
  return api.tabs.query({ windowId });
}

export function createTabOperations(api) {
  return {
    async captureActiveWindow() {
      const [currentTab] = await api.tabs.query({ active: true, currentWindow: true });
      const windowId = currentTab.windowId;
      return { windowId, tabs: await captureTabs(api, windowId) };
    },
    partitionByCategory(decisions, threshold, windowId) {
      return partitionByCategory(decisions, threshold, windowId, api);
    },
  };
}

async function partitionByCategory(decisions, threshold, windowId, api) {
  const current = await api.tabs.query({ windowId });
  const currentById = new Map(current.map(tab => [tab.id, tab]));
  const byCategory = Object.fromEntries(
    Object.keys(GROUPS).filter(category => category !== 'review').map(category => [category, []]),
  );
  let skipped = 0;
  for (const decision of decisions) {
    const category = categoryFor(decision, threshold);
    if (category === 'review') continue;
    const current = currentById.get(decision.id);
    const sanitizedUrl = current ? sanitizeTabs([current])[0]?.url : undefined;
    const stale = !current || sanitizedUrl === undefined || sanitizedUrl !== decision.url;
    if (stale) { skipped++; continue; }
    byCategory[category].push(decision.id);
  }
  return { byCategory, skipped };
}
