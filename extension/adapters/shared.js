import { categoryFor } from '../core.js';

export async function captureTabs(api, windowId) {
  return api.tabs.query({ windowId });
}

export async function partitionByCategory(decisions, threshold, windowId, api) {
  const current = await api.tabs.query({ windowId });
  const currentById = new Map(current.map(tab => [tab.id, tab]));
  const byCategory = { focus: [], later: [], distraction: [] };
  let skipped = 0;
  for (const decision of decisions) {
    const category = categoryFor(decision, threshold);
    if (category === 'review') continue;
    const current = currentById.get(decision.id);
    const stale = !current || current.url !== decision.url;
    if (stale) { skipped++; continue; }
    byCategory[category].push(decision.id);
  }
  return { byCategory, skipped };
}
