import { api } from './api.js';

api.action.onClicked.addListener(() => {
  api.tabs.create({ url: api.runtime.getURL('dashboard.html') });
});
