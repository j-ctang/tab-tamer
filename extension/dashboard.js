import { api, createBrowserBindings } from './api.js';
import { mount } from './app.js';

mount(document, createBrowserBindings(api));
