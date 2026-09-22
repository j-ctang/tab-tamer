import { api } from './api.js';
import { mount } from './app.js';
import * as chromeAdapter from './adapters/chrome.js';
import * as safariAdapter from './adapters/safari.js';

const adapter = api.tabGroups ? chromeAdapter : safariAdapter;
mount(document, api, adapter);
