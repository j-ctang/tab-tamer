import { createTabOperations } from './shared.js';
import { GROUPS } from '../core.js';

const supportsApply = true;

export function createChromeTabAdapter(api) {
  const operations = createTabOperations(api);
  return {
    supportsApply,
    captureActiveWindow: operations.captureActiveWindow,
    async applyResult(decisions, threshold, windowId) {
      const { byCategory, skipped } = await operations.partitionByCategory(decisions, threshold, windowId);
      let grouped = 0;
      for (const [category, tabIds] of Object.entries(byCategory)) {
        if (!tabIds.length) continue;
        const groupId = await api.tabs.group({ tabIds });
        await api.tabGroups.update(groupId, { title: GROUPS[category].label, color: GROUPS[category].color });
        grouped += tabIds.length;
      }
      return { grouped, skipped };
    },
  };
}
