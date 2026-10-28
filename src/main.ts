// ---------------------------------------------------------------------------
// UI wiring: selects, buttons, editor, chart and the persistence round trip.
// ---------------------------------------------------------------------------

import './styles.css';
import { marked } from 'marked';
import { DojoController, type RunInfo } from './app';
import { Chart, seriesColors } from './chart';
import { CodeEditor } from './controller/editor';
import { renderMathHelp } from './controller/mathHelp';
import { LANGS, UI_TEXT, detectLang, isLang, saveLang } from './i18n';
import * as store from './persistence';
import { randomSeed } from './simulation/rng';
import { TASKS, createWorkbook, findTask } from './tasks';
import { cloneWorkbook } from './state';
import type { Lang, RunStatus, TaskDef, Workbook } from './types';

const THEME_KEY = 'pid-dojo-theme';
const TASK_KEY = 'pid-dojo-task';
const WORKBOOK_KEY = 'pid-dojo-workbook';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const ui = {
  taskSelect: el<HTMLSelectElement>('task-select'),
  workbookSelect: el<HTMLSelectElement>('workbook-select'),
  langSelect: el<HTMLSelectElement>('lang-select'),
  scene: el<HTMLCanvasElement>('scene'),
  sceneTitle: el<HTMLElement>('scene-title'),
  plantDesc: el<HTMLElement>('plant-desc'),
  chartHost: el<HTMLElement>('chart'),
  chartLegend: el<HTMLElement>('chart-legend'),
  helpPanel: el<HTMLElement>('help-panel'),
  helpTitle: el<HTMLElement>('help-title'),
  helpBody: el<HTMLElement>('help-body'),
  helpToggle: el<HTMLButtonElement>('btn-help-toggle'),
  editorHost: el<HTMLElement>('editor'),
  errorBox: el<HTMLElement>('error-box'),
  notes: el<HTMLTextAreaElement>('notes'),
  notesStatus: el<HTMLElement>('notes-status'),
  mathTitle: el<HTMLElement>('math-title'),
  mathHelp: el<HTMLElement>('math-help'),
  statusBadge: el<HTMLElement>('status-badge'),
  mSettle: el<HTMLElement>('m-settle'),
  mOvershoot: el<HTMLElement>('m-overshoot'),
  mSse: el<HTMLElement>('m-sse'),
  mIae: el<HTMLElement>('m-iae'),
  mVerdict: el<HTMLElement>('m-verdict'),
  btnRun: el<HTMLButtonElement>('btn-run'),
  btnReset: el<HTMLButtonElement>('btn-reset'),
  btnStop: el<HTMLButtonElement>('btn-stop'),
  btnNew: el<HTMLButtonElement>('btn-new-variant'),
  btnSave: el<HTMLButtonElement>('btn-save'),
  btnExport: el<HTMLButtonElement>('btn-export'),
  btnImport: el<HTMLButtonElement>('btn-import'),
  btnDir: el<HTMLButtonElement>('btn-dir'),
  btnTheme: el<HTMLButtonElement>('btn-theme'),
  fileInput: el<HTMLInputElement>('file-input'),
};

let currentTask: TaskDef = TASKS[0];
let workbook: Workbook | null = null;
let chart: Chart | null = null;
let editor: CodeEditor | null = null;
let dojo: DojoController | null = null;
let saveTimer: number | undefined;
let flashTimer: number | undefined;
let lang: Lang = 'en';
let helpCollapsed = false;

// ---------------------------------------------------------------------------
// Language (help pages + math reference only)
// ---------------------------------------------------------------------------

function renderTaskHelp(): void {
  const html = marked.parse(currentTask.help[lang]);
  ui.helpBody.innerHTML = typeof html === 'string' ? html : '';
}

function applyLang(next: Lang): void {
  lang = next;
  saveLang(next);
  document.documentElement.lang = next;
  ui.langSelect.value = next;

  const text = UI_TEXT[next];
  ui.helpTitle.textContent = text.helpTitle;
  ui.mathTitle.textContent = text.mathTitle;
  ui.helpToggle.textContent = helpCollapsed ? text.show : text.hide;

  renderMathHelp(ui.mathHelp, next);
  renderTaskHelp();
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function isLight(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function applyTheme(light: boolean): void {
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
  ui.btnTheme.textContent = light ? '☀' : '☾';
  chart?.setTheme(light);
  editor?.setTheme(light);
  renderLegend(currentTask.unit);
}

/** Series legend for the chart panel head (uPlot's own legend is disabled). */
function renderLegend(unit: string): void {
  const colors = seriesColors(isLight());
  ui.chartLegend.textContent = '';
  const items: Array<[string, string]> = [
    ['setpoint', colors.sp],
    [`pv [${unit}]`, colors.pv],
    ['u (right axis)', colors.u],
  ];
  for (const [label, color] of items) {
    const span = document.createElement('span');
    span.className = 'legend-item';
    const dot = document.createElement('i');
    dot.style.background = color;
    span.append(dot, document.createTextNode(label));
    ui.chartLegend.append(span);
  }
}

// ---------------------------------------------------------------------------
// Persistence of the user's typing
// ---------------------------------------------------------------------------

function flashStatus(text: string, ms = 1600): void {
  ui.notesStatus.textContent = text;
  if (flashTimer !== undefined) clearTimeout(flashTimer);
  if (text === 'saved') {
    flashTimer = window.setTimeout(() => {
      if (ui.notesStatus.textContent === 'saved') ui.notesStatus.textContent = '';
    }, ms);
  }
}

async function persistNow(): Promise<void> {
  if (!workbook) return;
  try {
    await store.saveWorkbook(cloneWorkbook(workbook));
    flashStatus('saved');
  } catch {
    flashStatus('save failed');
  }
}

function scheduleSave(): void {
  if (!workbook) return;
  flashStatus('saving…');
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void persistNow();
  }, 500);
}

// ---------------------------------------------------------------------------
// Run info -> DOM
// ---------------------------------------------------------------------------

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: 'idle',
  running: 'running',
  settled: 'settled',
  failed: 'not passed',
  error: 'error',
};

function renderRunInfo(info: RunInfo): void {
  const unit = currentTask.unit;
  const suffix = info.status === 'running' ? ` · ${info.time.toFixed(1)} s` : '';
  ui.statusBadge.textContent = `${STATUS_TEXT[info.status]}${suffix}`;
  ui.statusBadge.className = `badge ${info.status}`;

  const m = info.metrics;
  ui.mSettle.textContent = m && m.settleTime !== null ? `${m.settleTime.toFixed(1)} s` : '–';
  ui.mOvershoot.textContent = m && m.overshootPct !== null ? `${m.overshootPct.toFixed(0)} %` : 'n/a';
  ui.mSse.textContent = m ? `${m.steadyStateError.toFixed(2)} ${unit}` : '–';
  ui.mIae.textContent = m ? m.iae.toFixed(0) : '–';

  if (m) {
    ui.mVerdict.textContent = info.pass ? 'PASS' : 'FAIL';
    ui.mVerdict.className = info.pass ? 'ok' : 'bad';
  } else {
    ui.mVerdict.textContent = '–';
    ui.mVerdict.className = '';
  }

  ui.errorBox.textContent = info.error ?? '';
  ui.errorBox.classList.toggle('hidden', !info.error);
}

// ---------------------------------------------------------------------------
// Workbooks
// ---------------------------------------------------------------------------

async function refreshWorkbookList(): Promise<void> {
  const all = await store.listWorkbooks();
  ui.workbookSelect.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— none —';
  ui.workbookSelect.append(placeholder);

  let count = 0;
  for (const wb of all) {
    if (wb.taskId !== currentTask.id) continue;
    const option = document.createElement('option');
    option.value = wb.id;
    option.textContent = `seed ${wb.seed} · ${new Date(wb.createdAt).toLocaleString()}`;
    ui.workbookSelect.append(option);
    count++;
  }
  if (count === 0) placeholder.textContent = '— no workbooks yet —';
  ui.workbookSelect.value = workbook?.id ?? '';
}

async function loadWorkbook(wb: Workbook): Promise<void> {
  const task = findTask(wb.taskId);
  if (!task) throw new Error(`Unknown task "${wb.taskId}" in workbook.`);

  currentTask = task;
  workbook = wb;
  localStorage.setItem(TASK_KEY, task.id);
  localStorage.setItem(WORKBOOK_KEY, wb.id);

  ui.taskSelect.value = task.id;
  ui.sceneTitle.textContent = task.title;
  renderTaskHelp();

  const description = task.plantFactory().describe(wb.plantParams);
  ui.plantDesc.textContent = description.join(' · ');
  ui.plantDesc.title = description.join('\n');

  chart?.setUnit(task.unit);
  renderLegend(task.unit);
  editor?.setValue(wb.formula);
  ui.notes.value = wb.notes;
  flashStatus('');

  dojo?.load(task, wb);
  await refreshWorkbookList();
}

async function selectTask(taskId: string): Promise<void> {
  const task = findTask(taskId) ?? TASKS[0];
  currentTask = task;
  ui.taskSelect.value = task.id;

  const all = await store.listWorkbooks();
  const lastId = localStorage.getItem(WORKBOOK_KEY);
  const existing =
    all.find((wb) => wb.id === lastId && wb.taskId === task.id) ??
    all.find((wb) => wb.taskId === task.id);
  const wb = existing ?? createWorkbook(task, randomSeed());
  if (!existing) await store.saveWorkbook(wb);
  await loadWorkbook(wb);
}

async function newVariant(): Promise<void> {
  const wb = createWorkbook(currentTask, randomSeed());
  await store.saveWorkbook(wb);
  await loadWorkbook(wb);
  dojo?.start();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const stored = localStorage.getItem(THEME_KEY);
  const light = stored === 'light';
  applyTheme(light);

  for (const option of LANGS) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    ui.langSelect.append(item);
  }
  applyLang(detectLang());

  for (const task of TASKS) {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = `${task.title} (Phase ${task.phase})`;
    ui.taskSelect.append(option);
  }

  chart = new Chart(ui.chartHost, TASKS[0].unit, light);
  editor = new CodeEditor(ui.editorHost, TASKS[0].starterFormula, (value) => {
    if (!workbook) return;
    workbook.formula = value;
    scheduleSave();
  });

  dojo = new DojoController({
    canvas: ui.scene,
    chart,
    getFormula: () => (editor ? editor.getValue() : ''),
    onUpdate: renderRunInfo,
  });

  // -- buttons --------------------------------------------------------------
  ui.btnRun.addEventListener('click', () => dojo?.start());
  ui.btnReset.addEventListener('click', () => dojo?.reset());
  ui.btnStop.addEventListener('click', () => dojo?.stop());
  ui.btnNew.addEventListener('click', () => void newVariant());

  ui.btnSave.addEventListener('click', () => void persistNow());
  ui.btnExport.addEventListener('click', () => {
    if (workbook) store.exportWorkbook(cloneWorkbook(workbook));
  });
  ui.btnImport.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', () => {
    const file = ui.fileInput.files?.[0];
    ui.fileInput.value = '';
    if (!file) return;
    void (async () => {
      try {
        const wb = await store.importWorkbookFile(file);
        await loadWorkbook(wb);
        dojo?.start();
      } catch (err) {
        ui.errorBox.textContent = err instanceof Error ? err.message : String(err);
        ui.errorBox.classList.remove('hidden');
      }
    })();
  });

  ui.btnDir.addEventListener('click', () => {
    void (async () => {
      try {
        const name = await store.pickStorageDirectory();
        ui.btnDir.title = name ? `Saving to folder: ${name}` : 'Choose a folder on disk';
        flashStatus(name ? `folder: ${name}` : '');
      } catch (err) {
        ui.errorBox.textContent = err instanceof Error ? err.message : String(err);
        ui.errorBox.classList.remove('hidden');
      }
    })();
  });

  ui.btnTheme.addEventListener('click', () => applyTheme(!isLight()));

  ui.helpToggle.addEventListener('click', () => {
    helpCollapsed = ui.helpPanel.classList.toggle('collapsed');
    ui.helpToggle.textContent = helpCollapsed ? UI_TEXT[lang].show : UI_TEXT[lang].hide;
  });

  ui.langSelect.addEventListener('change', () => {
    const value = ui.langSelect.value;
    if (isLang(value)) applyLang(value);
  });

  ui.taskSelect.addEventListener('change', () => {
    void selectTask(ui.taskSelect.value);
  });

  ui.workbookSelect.addEventListener('change', () => {
    const id = ui.workbookSelect.value;
    if (!id) return;
    void (async () => {
      const wb = await store.getWorkbook(id);
      if (wb) await loadWorkbook(wb);
    })();
  });

  ui.notes.addEventListener('input', () => {
    if (!workbook) return;
    workbook.notes = ui.notes.value;
    scheduleSave();
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      dojo?.start();
    }
  });

  // -- first workbook -------------------------------------------------------
  if (!store.supportsFileSystemAccess()) {
    ui.btnDir.title = 'File System Access API not available in this browser';
  } else {
    const dirName = await store.getStoredDirectoryName();
    if (dirName) ui.btnDir.title = `Saving to folder: ${dirName}`;
  }

  await selectTask(localStorage.getItem(TASK_KEY) ?? TASKS[0].id);
}

void main();
