import { captureTabs, partitionByCategory } from './shared.js';

export { captureTabs };

export async function applyResult(decisions, threshold, windowId, api) {
  const { byCategory, skipped } = await partitionByCategory(decisions, threshold, windowId, api);
  let grouped = 0;
  for (const tabIds of Object.values(byCategory)) {
    if (!tabIds.length) continue;
    const win = await api.windows.create();
    const placeholderId = win.tabs?.[0]?.id;
    await api.tabs.move(tabIds, { windowId: win.id, index: -1 });
    if (placeholderId !== undefined) await api.tabs.remove(placeholderId);
    grouped += tabIds.length;
  }
  return { grouped, skipped };
}
