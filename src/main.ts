// ---------------------------------------------------------------------------
// UI wiring: selects, buttons, editor, chart and the persistence round trip.
// ---------------------------------------------------------------------------

import './styles.css';
import { DojoController, type LogEntry, type RunInfo } from './app';
import { Chart, seriesColors } from './chart';
import { CodeEditor } from './controller/editor';
import { renderMathHelp } from './controller/mathHelp';
import { showHelp, syncHelp, type HelpWindowState } from './helpWindow';
import { LANGS, UI_TEXT, detectLang, isLang, saveLang } from './i18n';
import * as store from './persistence';
import { randomSeed } from './simulation/rng';
import { TASKS, createWorksheet, findTask } from './tasks';
import { cloneWorksheet, cleanWorksheetName, worksheetLabel } from './state';
import type { Lang, RunStatus, TaskDef, Worksheet } from './types';

const THEME_KEY = 'pid-dojo-theme';
const TASK_KEY = 'pid-dojo-task';
const WORKSHEET_KEY = 'pid-dojo-worksheet';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const ui = {
  taskSelect: el<HTMLSelectElement>('task-select'),
  worksheetSelect: el<HTMLSelectElement>('worksheet-select'),
  worksheetName: el<HTMLInputElement>('worksheet-name'),
  langSelect: el<HTMLSelectElement>('lang-select'),
  scene: el<HTMLCanvasElement>('scene'),
  sceneTitle: el<HTMLElement>('scene-title'),
  plantDesc: el<HTMLElement>('plant-desc'),
  chartHost: el<HTMLElement>('chart'),
  chartLegend: el<HTMLElement>('chart-legend'),
  btnHelp: el<HTMLButtonElement>('btn-help'),
  editorHost: el<HTMLElement>('editor'),
  errorBox: el<HTMLElement>('error-box'),
  tabController: el<HTMLButtonElement>('tab-controller'),
  tabDebug: el<HTMLButtonElement>('tab-debug'),
  paneController: el<HTMLElement>('pane-controller'),
  paneDebug: el<HTMLElement>('pane-debug'),
  debugLog: el<HTMLOListElement>('debug-log'),
  debugCount: el<HTMLElement>('debug-count'),
  debugStatus: el<HTMLElement>('debug-status'),
  btnClearLog: el<HTMLButtonElement>('btn-clear-log'),
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
let worksheet: Worksheet | null = null;
let chart: Chart | null = null;
let editor: CodeEditor | null = null;
let dojo: DojoController | null = null;
let saveTimer: number | undefined;
let flashTimer: number | undefined;
let lang: Lang = 'en';

// ---------------------------------------------------------------------------
// Help window (help.html)
// ---------------------------------------------------------------------------

function helpState(): HelpWindowState {
  return {
    type: 'pid-dojo-help',
    task: currentTask.id,
    lang,
    theme: isLight() ? 'light' : 'dark',
  };
}

/** Keep an already open help window on the current task / language / theme. */
function syncHelpWindow(): void {
  syncHelp(helpState());
}

// ---------------------------------------------------------------------------
// Language (help pages + math reference only)
// ---------------------------------------------------------------------------

function applyLang(next: Lang): void {
  lang = next;
  saveLang(next);
  document.documentElement.lang = next;
  ui.langSelect.value = next;

  const text = UI_TEXT[next];
  ui.btnHelp.textContent = text.helpTitle;
  ui.mathTitle.textContent = text.mathTitle;

  renderMathHelp(ui.mathHelp, next);
  syncHelpWindow();
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
  syncHelpWindow();
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
  if (!worksheet) return;
  try {
    await store.saveWorksheet(cloneWorksheet(worksheet));
    flashStatus('saved');
  } catch {
    flashStatus('save failed');
  }
}

function scheduleSave(): void {
  if (!worksheet) return;
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
// Debug log
// ---------------------------------------------------------------------------

function setPane(pane: 'controller' | 'debug'): void {
  const showDebug = pane === 'debug';
  ui.paneController.classList.toggle('hidden', showDebug);
  ui.paneDebug.classList.toggle('hidden', !showDebug);
  ui.tabController.classList.toggle('active', !showDebug);
  ui.tabDebug.classList.toggle('active', showDebug);
  ui.tabController.setAttribute('aria-selected', String(!showDebug));
  ui.tabDebug.setAttribute('aria-selected', String(showDebug));
}

function updateDebugCount(): void {
  const count = ui.debugLog.childElementCount;
  ui.debugCount.textContent = String(count);
  ui.debugCount.classList.toggle('hidden', count === 0);
}

function clearLogView(): void {
  ui.debugLog.textContent = '';
  ui.debugStatus.textContent = '';
  updateDebugCount();
}

function appendLog(entry: LogEntry): void {
  // Jump to the log on the first line of a run so the output is not missed.
  if (ui.debugLog.childElementCount === 0) setPane('debug');

  const item = document.createElement('li');
  if (entry.suppressed) item.classList.add('suppressed');

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = `${entry.t.toFixed(2)} s`;

  const text = document.createElement('span');
  text.className = 'log-text';
  text.textContent = entry.text;

  item.append(time, text);
  ui.debugLog.append(item);
  ui.debugLog.scrollTop = ui.debugLog.scrollHeight;

  if (entry.suppressed) ui.debugStatus.textContent = 'limit reached';
  updateDebugCount();
}

// ---------------------------------------------------------------------------
// Worksheets
// ---------------------------------------------------------------------------

async function refreshWorksheetList(): Promise<void> {
  const all = await store.listWorksheets();
  ui.worksheetSelect.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— none —';
  ui.worksheetSelect.append(placeholder);

  let count = 0;
  for (const wb of all) {
    if (wb.taskId !== currentTask.id) continue;
    const option = document.createElement('option');
    option.value = wb.id;
    option.textContent = worksheetLabel(wb);
    ui.worksheetSelect.append(option);
    count++;
  }
  if (count === 0) placeholder.textContent = '— no worksheets yet —';
  ui.worksheetSelect.value = worksheet?.id ?? '';
}

/** Keep the selected dropdown entry in sync while the user types a name. */
function updateSelectedWorksheetLabel(): void {
  if (!worksheet) return;
  const id = worksheet.id;
  const option = Array.from(ui.worksheetSelect.options).find((o) => o.value === id);
  if (option) option.textContent = worksheetLabel(worksheet);
}

async function loadWorksheet(wb: Worksheet): Promise<void> {
  const task = findTask(wb.taskId);
  if (!task) throw new Error(`Unknown task "${wb.taskId}" in worksheet.`);

  currentTask = task;
  worksheet = wb;
  localStorage.setItem(TASK_KEY, task.id);
  localStorage.setItem(WORKSHEET_KEY, wb.id);

  ui.taskSelect.value = task.id;
  ui.sceneTitle.textContent = task.title;
  syncHelpWindow();

  ui.worksheetName.value = wb.name;

  const description = task.plantFactory().describe(wb.plantParams);
  ui.plantDesc.textContent = description.join(' · ');
  ui.plantDesc.title = description.join('\n');

  chart?.setUnit(task.unit);
  chart?.setURange(task.uMin, task.uMax);
  renderLegend(task.unit);
  editor?.setValue(wb.formula);
  ui.notes.value = wb.notes;
  flashStatus('');

  dojo?.load(task, wb);
  await refreshWorksheetList();
}

async function selectTask(taskId: string): Promise<void> {
  const task = findTask(taskId) ?? TASKS[0];
  currentTask = task;
  ui.taskSelect.value = task.id;

  const all = await store.listWorksheets();
  const lastId = localStorage.getItem(WORKSHEET_KEY);
  const existing =
    all.find((wb) => wb.id === lastId && wb.taskId === task.id) ??
    all.find((wb) => wb.taskId === task.id);
  const wb = existing ?? createWorksheet(task, randomSeed());
  if (!existing) await store.saveWorksheet(wb);
  await loadWorksheet(wb);
}

async function newVariant(): Promise<void> {
  const wb = createWorksheet(currentTask, randomSeed());
  await store.saveWorksheet(wb);
  await loadWorksheet(wb);
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
    if (!worksheet) return;
    worksheet.formula = value;
    scheduleSave();
  });

  dojo = new DojoController({
    canvas: ui.scene,
    chart,
    getFormula: () => (editor ? editor.getValue() : ''),
    onUpdate: renderRunInfo,
    onLog: appendLog,
    onLogClear: clearLogView,
  });

  // -- buttons --------------------------------------------------------------
  ui.btnRun.addEventListener('click', () => dojo?.start());
  ui.btnReset.addEventListener('click', () => dojo?.reset());
  ui.btnStop.addEventListener('click', () => dojo?.stop());
  ui.btnNew.addEventListener('click', () => void newVariant());

  ui.btnSave.addEventListener('click', () => void persistNow());
  ui.btnExport.addEventListener('click', () => {
    if (worksheet) store.exportWorksheet(cloneWorksheet(worksheet));
  });
  ui.btnImport.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', () => {
    const file = ui.fileInput.files?.[0];
    ui.fileInput.value = '';
    if (!file) return;
    void (async () => {
      try {
        const wb = await store.importWorksheetFile(file);
        await loadWorksheet(wb);
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

  ui.tabController.addEventListener('click', () => setPane('controller'));
  ui.tabDebug.addEventListener('click', () => setPane('debug'));
  ui.btnClearLog.addEventListener('click', () => clearLogView());

  ui.btnHelp.addEventListener('click', () => {
    if (!showHelp(helpState())) {
      flashStatus('help window blocked — allow pop-ups for this page');
    }
  });

  // A reloaded help window asks for the current task / language / theme, and
  // a language change made there is applied to the dojo as well.
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; lang?: unknown } | null;
    if (data?.type === 'pid-dojo-help-ready') {
      syncHelpWindow();
    } else if (data?.type === 'pid-dojo-lang' && isLang(data.lang) && data.lang !== lang) {
      applyLang(data.lang);
    }
  });

  ui.langSelect.addEventListener('change', () => {
    const value = ui.langSelect.value;
    if (isLang(value)) applyLang(value);
  });

  ui.taskSelect.addEventListener('change', () => {
    void selectTask(ui.taskSelect.value);
  });

  ui.worksheetSelect.addEventListener('change', () => {
    const id = ui.worksheetSelect.value;
    if (!id) return;
    void (async () => {
      const wb = await store.getWorksheet(id);
      if (wb) await loadWorksheet(wb);
    })();
  });

  ui.notes.addEventListener('input', () => {
    if (!worksheet) return;
    worksheet.notes = ui.notes.value;
    scheduleSave();
  });

  ui.worksheetName.addEventListener('input', () => {
    if (!worksheet) return;
    worksheet.name = ui.worksheetName.value;
    updateSelectedWorksheetLabel();
    scheduleSave();
  });

  // Tidy the name (single spaces, trimmed) once the user leaves the field.
  ui.worksheetName.addEventListener('change', () => {
    if (!worksheet) return;
    const clean = cleanWorksheetName(worksheet.name);
    worksheet.name = clean;
    ui.worksheetName.value = clean;
    updateSelectedWorksheetLabel();
    scheduleSave();
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      dojo?.start();
    }
  });

  // -- first worksheet ------------------------------------------------------
  if (!store.supportsFileSystemAccess()) {
    ui.btnDir.title = 'File System Access API not available in this browser';
  } else {
    const dirName = await store.getStoredDirectoryName();
    if (dirName) ui.btnDir.title = `Saving to folder: ${dirName}`;
  }

  await selectTask(localStorage.getItem(TASK_KEY) ?? TASKS[0].id);
}

void main();
