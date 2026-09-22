import { classify, categoryFor, sanitizeTabs, validatePrompt, workflowFor } from './core.js';
import { SAMPLE_WORKFLOWS } from './fixtures.js';

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
    workflowFor(workflowKey);
    validatePrompt(goal);
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

export function mount(document, { credentials, tabs: tabAdapter }) {
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
  let previewGeneration = 0;

  form.addEventListener('submit', (event) => event.preventDefault());

  credentials.load().then(saved => {
    if (saved) apiKeyInput.value = saved;
  });
  apiKeyInput.addEventListener('change', () => {
    credentials.save(apiKeyInput.value);
  });

  function clearPreview() {
    previewGeneration += 1;
    lastDecisions = [];
    lastWindowId = null;
    board.innerHTML = '';
    status.textContent = '';
    organizeButton.disabled = false;
    applyButton.disabled = true;
  }

  function syncWorkflowUi() {
    const workflow = workflowFor(workflowInput.value);
    goalLabel.textContent = workflow.promptLabel;
    goalInput.placeholder = workflow.promptPlaceholder;
    organizeButton.textContent = workflow.previewLabel;
    applyButton.hidden = !workflow.supportsApply;
    workflowNote.hidden = !workflow.note;
    workflowNote.textContent = workflow.note;
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
    applyButton.disabled = !canApply(columns, modeInput.value, tabAdapter.supportsApply, workflowKey);
    if (workflow.supportsApply && modeInput.value === 'live' && tabAdapter.supportsApply === false) {
      status.textContent = tabAdapter.applyUnavailableReason;
    }
  }

  async function organize() {
    const generation = ++previewGeneration;
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
      const { windowId, tabs: rawTabs } = await tabAdapter.captureActiveWindow();
      lastWindowId = windowId;
      const tabs = sanitizeTabs(rawTabs);
      const { decisions, columns } = await runLiveMode({
        tabs, goal: goalInput.value, apiKey: apiKeyInput.value, threshold, workflowKey,
      });
      if (generation !== previewGeneration) return;
      lastDecisions = decisions;
      render(columns);
    } catch (error) {
      if (generation === previewGeneration) status.textContent = error.message;
    } finally {
      if (generation === previewGeneration) organizeButton.disabled = false;
    }
  }

  async function apply() {
    const workflow = workflowFor(workflowInput.value);
    if (!workflow.supportsApply) {
      status.textContent = workflow.note;
      applyButton.disabled = true;
      return;
    }
    if (modeInput.value !== 'live' || tabAdapter.supportsApply === false) {
      status.textContent = modeInput.value === 'sample'
        ? 'Sample mode: nothing to apply.'
        : tabAdapter.applyUnavailableReason;
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
      const { grouped, skipped } = await tabAdapter.applyResult(lastDecisions, threshold, lastWindowId);
      lastDecisions = [];
      lastWindowId = null;
      status.textContent = `Grouped ${grouped} tab(s), skipped ${skipped} that moved or fell out of range.`;
    } catch (error) {
      status.textContent = error.message;
      applyButton.disabled = false;
    } finally {
      organizeButton.disabled = false;
    }
  }

  organizeButton.addEventListener('click', organize);
  applyButton.addEventListener('click', apply);
  modeInput.addEventListener('change', clearPreview);
  goalInput.addEventListener('input', clearPreview);
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
