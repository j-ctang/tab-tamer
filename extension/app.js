import { buildRequest, classify, categoryFor, sanitizeTabs, workflowFor } from './core.js';
import { SAMPLE_WORKFLOWS } from './fixtures.js';
import { sessionStore } from './api.js';

const API_KEY_STORAGE_KEY = 'tabTamerApiKey';

export function columnsFor(decisions, threshold, workflowKey = 'organize') {
  const workflow = workflowFor(workflowKey);
  const columns = Object.fromEntries(Object.keys(workflow.categories).map(key => [key, []]));
  for (const decision of decisions) {
    columns[categoryFor(decision, threshold)].push(decision);
  }
  return columns;
}

export function validateGoal(goal, workflowKey = 'organize') {
  try {
    const { tabs } = SAMPLE_WORKFLOWS[workflowKey];
    buildRequest(tabs.slice(0, 1), goal, workflowKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function runSampleMode(threshold, workflowKey = 'organize') {
  const { decisions } = SAMPLE_WORKFLOWS[workflowKey];
  return { decisions, columns: columnsFor(decisions, threshold, workflowKey) };
}

export function canApply(columns, mode, adapterSupportsApply, workflowKey = 'organize') {
  const workflow = workflowFor(workflowKey);
  const actionable = Object.entries(columns)
    .filter(([key]) => key !== 'review')
    .reduce((count, [, decisions]) => count + decisions.length, 0);
  return workflow.supportsApply && mode === 'live' && adapterSupportsApply && actionable > 0;
}

export async function runLiveMode({
  tabs, goal, apiKey, threshold, fetcher, workflowKey = 'organize',
}) {
  const { decisions, model, elapsed } = await classify(tabs, goal, apiKey, fetcher, workflowKey);
  return { decisions, columns: columnsFor(decisions, threshold, workflowKey), model, elapsed };
}

export function mount(document, api, adapter) {
  const form = document.getElementById('controls');
  const workflowInput = document.getElementById('workflow');
  const goalLabel = document.getElementById('goal-label');
  const goalInput = document.getElementById('goal');
  const thresholdInput = document.getElementById('threshold');
  const thresholdValue = document.getElementById('threshold-value');
  const modeInput = document.getElementById('mode');
  const apiKeyInput = document.getElementById('api-key');
  const organizeButton = document.getElementById('organize');
  const applyButton = document.getElementById('apply');
  const workflowNote = document.getElementById('workflow-note');
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

  function clearPreview() {
    lastDecisions = [];
    lastWindowId = null;
    board.innerHTML = '';
    status.textContent = '';
    applyButton.disabled = true;
  }

  function syncWorkflowUi() {
    const cleanup = workflowInput.value === 'cleanup';
    goalLabel.textContent = cleanup ? 'Cleanup prompt' : 'Goal';
    goalInput.placeholder = cleanup
      ? 'What are these tabs meant to support?'
      : 'What are you trying to get done?';
    organizeButton.textContent = cleanup ? 'Analyze tabs' : 'Preview';
    applyButton.hidden = cleanup;
    workflowNote.hidden = !cleanup;
    workflowNote.textContent = cleanup
      ? 'Cleanup Review is preview only. No tabs will be moved, grouped, or closed.'
      : '';
  }

  function render(columns) {
    const workflowKey = workflowInput.value;
    const workflow = workflowFor(workflowKey);
    board.innerHTML = '';
    for (const [key, category] of Object.entries(workflow.categories)) {
      const column = document.createElement('div');
      column.className = 'column';
      column.innerHTML = `<h2>${category.label}</h2>`;
      for (const decision of columns[key]) {
        const item = document.createElement('div');
        item.className = 'tab-item';
        item.textContent = `${decision.title} (${Math.round(decision.confidence * 100)}%)`;
        column.appendChild(item);
      }
      board.appendChild(column);
    }
    applyButton.disabled = !canApply(columns, modeInput.value, adapter.supportsApply, workflowKey);
    if (workflowKey === 'organize' && modeInput.value === 'live' && adapter.supportsApply === false) {
      status.textContent = 'Safari can preview categories, but its WebExtension API cannot move or group tabs.';
    }
  }

  async function organize() {
    status.textContent = '';
    organizeButton.disabled = true;
    applyButton.disabled = true;
    const threshold = Number(thresholdInput.value);
    const workflowKey = workflowInput.value;
    try {
      if (modeInput.value === 'sample') {
        lastWindowId = null;
        const { decisions, columns } = runSampleMode(threshold, workflowKey);
        lastDecisions = decisions;
        render(columns);
        return;
      }
      const { ok, error } = validateGoal(goalInput.value, workflowKey);
      if (!ok) { status.textContent = error; return; }
      const [currentTab] = await api.tabs.query({ active: true, currentWindow: true });
      lastWindowId = currentTab.windowId;
      const rawTabs = await adapter.captureTabs(api, lastWindowId);
      const tabs = sanitizeTabs(rawTabs);
      const { decisions, columns } = await runLiveMode({
        tabs, goal: goalInput.value, apiKey: apiKeyInput.value, threshold, workflowKey,
      });
      lastDecisions = decisions;
      render(columns);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      organizeButton.disabled = false;
    }
  }

  async function apply() {
    if (workflowInput.value !== 'organize') {
      status.textContent = 'Cleanup Review is preview only. No tabs were changed.';
      applyButton.disabled = true;
      return;
    }
    if (modeInput.value !== 'live' || adapter.supportsApply === false) {
      status.textContent = modeInput.value === 'sample'
        ? 'Sample mode: nothing to apply.'
        : 'Safari can preview categories, but its WebExtension API cannot move or group tabs.';
      applyButton.disabled = true;
      return;
    }
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
  modeInput.addEventListener('change', clearPreview);
  workflowInput.addEventListener('change', () => {
    clearPreview();
    syncWorkflowUi();
  });
  thresholdInput.addEventListener('input', () => {
    thresholdValue.textContent = thresholdInput.value;
    if (lastDecisions.length) {
      render(columnsFor(lastDecisions, Number(thresholdInput.value), workflowInput.value));
    }
  });
  syncWorkflowUi();
}
