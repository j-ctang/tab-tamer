export const api = globalThis.browser ?? globalThis.chrome;

export function sessionStore(browserApi = api) {
  return browserApi.storage.session ?? browserApi.storage.local;
}
