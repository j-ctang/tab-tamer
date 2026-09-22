import { createChromeTabAdapter } from './adapters/chrome.js';
import { createSafariTabAdapter } from './adapters/safari.js';

export const api = globalThis.browser ?? globalThis.chrome;
const API_KEY_STORAGE_KEY = 'tabTamerApiKey';

function sessionStore(browserApi = api) {
  return browserApi.storage.session ?? browserApi.storage.local;
}

export function createCredentialStore(browserApi = api) {
  const storage = sessionStore(browserApi);
  return {
    async load() {
      const saved = await storage.get(API_KEY_STORAGE_KEY);
      return saved[API_KEY_STORAGE_KEY] || '';
    },
    save(value) {
      return storage.set({ [API_KEY_STORAGE_KEY]: value });
    },
  };
}

export function createBrowserBindings(browserApi = api) {
  return {
    credentials: createCredentialStore(browserApi),
    tabs: browserApi.tabGroups
      ? createChromeTabAdapter(browserApi)
      : createSafariTabAdapter(browserApi),
  };
}
