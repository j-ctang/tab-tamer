import { captureTabs, partitionByCategory } from './shared.js';
import { GROUPS } from '../core.js';

export { captureTabs };

export async function applyResult(decisions, threshold, windowId, api) {
  const { byCategory, skipped } = await partitionByCategory(decisions, threshold, windowId, api);
  let grouped = 0;
  for (const [category, tabIds] of Object.entries(byCategory)) {
    if (!tabIds.length) continue;
    const groupId = await api.tabs.group({ tabIds });
    await api.tabGroups.update(groupId, { title: GROUPS[category].label, color: GROUPS[category].color });
    grouped += tabIds.length;
  }
  return { grouped, skipped };
}
