import { GROUPS, buildRequest, classify, categoryFor, sanitizeTabs } from './core.js';
import { SAMPLE_TABS, SAMPLE_DECISIONS } from './fixtures.js';
import { sessionStore } from './api.js';

const API_KEY_STORAGE_KEY = 'tabTamerApiKey';

export function columnsFor(decisions, threshold) {
  const columns = { focus: [], later: [], distraction: [], review: [] };
  for (const decision of decisions) {
    columns[categoryFor(decision, threshold)].push(decision);
  }
  return columns;
}

export function validateGoal(goal) {
  try {
    buildRequest(SAMPLE_TABS.slice(0, 1), goal);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function runSampleMode(threshold) {
  return { decisions: SAMPLE_DECISIONS, columns: columnsFor(SAMPLE_DECISIONS, threshold) };
}

export async function runLiveMode({ tabs, goal, apiKey, threshold, fetcher }) {
  const { decisions, model, elapsed } = await classify(tabs, goal, apiKey, fetcher);
  return { decisions, columns: columnsFor(decisions, threshold), model, elapsed };
}

export function mount(document, api, adapter) {
  const form = document.getElementById('controls');
  const goalInput = document.getElementById('goal');
  const thresholdInput = document.getElementById('threshold');
  const thresholdValue = document.getElementById('threshold-value');
  const modeInput = document.getElementById('mode');
  const apiKeyInput = document.getElementById('api-key');
  const organizeButton = document.getElementById('organize');
  const applyButton = document.getElementById('apply');
  const status = document.getElementById('status');
  const board = document.getElementById('board');
  let lastDecisions = [];
  let lastWindowId = null;
  const store = sessionStore(api);

  form.addEventListener('submit', (event) => event.preventDefault());

  store.get(API_KEY_STORAGE_KEY).then(saved => {
    if (saved[API_KEY_STORAGE_KEY]) apiKeyInput.value = saved[API_KEY_STORAGE_KEY];
  });
  apiKeyInput.addEventListener('change', () => {
    store.set({ [API_KEY_STORAGE_KEY]: apiKeyInput.value });
  });

  function render(columns) {
    board.innerHTML = '';
    for (const key of ['focus', 'later', 'distraction', 'review']) {
      const column = document.createElement('div');
      column.className = 'column';
      column.innerHTML = `<h2>${GROUPS[key].label}</h2>`;
      for (const decision of columns[key]) {
        const item = document.createElement('div');
        item.className = 'tab-item';
        item.textContent = `${decision.title} (${Math.round(decision.confidence * 100)}%)`;
        column.appendChild(item);
      }
      board.appendChild(column);
    }
    const hasApplyable = columns.focus.length + columns.later.length + columns.distraction.length > 0;
    applyButton.disabled = !(modeInput.value === 'live' && hasApplyable);
  }

  async function organize() {
    status.textContent = '';
    organizeButton.disabled = true;
    applyButton.disabled = true;
    const threshold = Number(thresholdInput.value);
    try {
      if (modeInput.value === 'sample') {
        lastWindowId = null;
        const { decisions, columns } = runSampleMode(threshold);
        lastDecisions = decisions;
        render(columns);
        return;
      }
      const { ok, error } = validateGoal(goalInput.value);
      if (!ok) { status.textContent = error; return; }
      const [currentTab] = await api.tabs.query({ active: true, currentWindow: true });
      lastWindowId = currentTab.windowId;
      const rawTabs = await adapter.captureTabs(api, lastWindowId);
      const tabs = sanitizeTabs(rawTabs);
      const { columns } = await runLiveMode({
        tabs, goal: goalInput.value, apiKey: apiKeyInput.value, threshold,
      });
      lastDecisions = [].concat(...Object.values(columns));
      render(columns);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      organizeButton.disabled = false;
    }
  }

  async function apply() {
    if (lastWindowId === null) {
      status.textContent = 'Sample mode: nothing to apply.';
      return;
    }
    if (!lastDecisions.length) return;
    organizeButton.disabled = true;
    applyButton.disabled = true;
    try {
      const threshold = Number(thresholdInput.value);
      const { grouped, skipped } = await adapter.applyResult(lastDecisions, threshold, lastWindowId, api);
      status.textContent = `Grouped ${grouped} tab(s), skipped ${skipped} that moved or fell out of range.`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      organizeButton.disabled = false;
      applyButton.disabled = false;
    }
  }

  organizeButton.addEventListener('click', organize);
  applyButton.addEventListener('click', apply);
  thresholdInput.addEventListener('input', () => {
    thresholdValue.textContent = thresholdInput.value;
    if (lastDecisions.length) render(columnsFor(lastDecisions, Number(thresholdInput.value)));
  });
}
