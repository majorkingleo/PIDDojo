// ---------------------------------------------------------------------------
// Tuning calculator window (tuning.html).
//
// The dojo pushes the worksheets's model values + acceptance criteria in, this
// page solves for Kp and hands a ready-to-paste snippet back.
// ---------------------------------------------------------------------------

import './styles.css';
import { CodeEditor } from './controller/editor';
import {
  deriveTuningModel,
  sandboxHeader,
  sandboxTemplate,
  solveTuning,
  tuningSnippet,
  withSandboxHeader,
  type TuneMode,
  type TuningModel,
} from './controller/tuningModel';
import type { HeadlessResult } from './simulation/headless';
import type { TuningCodeMessage, TuningWindowState } from './tuningWindow';
import type { Sample, Worksheet } from './types';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const ui = {
  subtitle: el('tune-subtitle'),
  empty: el('tune-empty'),
  content: el('tune-content'),
  hint: el('tune-hint'),
  tabDesign: el<HTMLButtonElement>('tab-design'),
  tabSandbox: el<HTMLButtonElement>('tab-sandbox'),
  panelDesign: el('panel-design'),
  panelSandbox: el('panel-sandbox'),
  params: el<HTMLDListElement>('tune-params'),
  mode: el<HTMLSelectElement>('tune-mode'),
  target: el<HTMLInputElement>('tune-target'),
  targetUnit: el('tune-target-unit'),
  accSettle: el('tune-acc-settle'),
  accOffset: el('tune-acc-offset'),
  accOver: el('tune-acc-over'),
  kp: el('tune-kp'),
  ess: el('tune-ess'),
  tauCl: el('tune-taucl'),
  tSat: el('tune-tsat'),
  settle: el('tune-settle'),
  warnings: el<HTMLUListElement>('tune-warnings'),
  code: (el('tune-code').querySelector('code') as HTMLElement | null) ?? el('tune-code'),
  copy: el<HTMLButtonElement>('btn-tune-copy'),
  toSandbox: el<HTMLButtonElement>('btn-tune-to-sandbox'),
  insert: el<HTMLButtonElement>('btn-tune-insert'),
  sandboxHost: el('sandbox-editor'),
  sandboxBand: el('sandbox-band'),
  sandboxRun: el<HTMLButtonElement>('btn-sandbox-run'),
  sandboxReset: el<HTMLButtonElement>('btn-sandbox-reset'),
  sandboxCopy: el<HTMLButtonElement>('btn-sandbox-copy'),
  sandboxStatus: el('sandbox-status'),
  sandboxChart: el<HTMLCanvasElement>('sandbox-chart'),
  sandboxMetrics: el<HTMLDListElement>('sandbox-metrics'),
  sandboxLog: el<HTMLPreElement>('sandbox-log'),
};

let state: TuningWindowState | null = null;
let model: TuningModel | null = null;
let mode: TuneMode = 'offset';
let target = 0;
let snippet = '';
let userEditedTarget = false;
let hintTimer: number | undefined;

// Sandbox
let sandboxEditor: CodeEditor | null = null;
let sandboxTaskId = '';
let saveSandboxTimer: number | undefined;
/** Complete runnable code produced by the current design. */
let template = '';
/** Code we last wrote into the editor ourselves (unedited => safe to replace). */
let renderedTemplate = '';
let lastKp = 0;
let prediction: { settle: number; offset: number } | null = null;

const SANDBOX_KEY = (taskId: string): string => `pid-dojo-sandbox-${taskId}`;

function fmt(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return 'never';
  const text = Number(value.toPrecision(3)).toString();
  return unit ? `${text} ${unit}` : text;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function flash(text: string): void {
  ui.hint.textContent = text;
  if (hintTimer !== undefined) clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    ui.hint.textContent = '';
  }, 2200);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderModel(next: TuningWindowState, tune: TuningModel): void {
  ui.params.textContent = '';
  const add = (key: string, value: string): void => {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    ui.params.append(dt, dd);
  };

  for (const [key, value] of Object.entries(next.params)) add(key, fmt(value));
  add('K', `${fmt(tune.K)} ${next.unit}/u`);
  add('τ', fmt(tune.tau, 's'));
  add('ΔT', fmt(tune.dT, next.unit));
  add('u_hold', fmt(tune.uHold));
}

function renderAcceptance(next: TuningWindowState): void {
  const a = next.acceptance;
  ui.accSettle.textContent = a.maxSettleTime === null ? '–' : `${a.maxSettleTime} s`;
  ui.accOffset.textContent = `${a.maxSteadyStateError} ${next.unit}`;
  ui.accOver.textContent = a.maxOvershootPct === null ? 'n/a' : `${a.maxOvershootPct} %`;
  ui.sandboxBand.textContent = `${a.maxSteadyStateError} ${next.unit}`;
}

function mark(node: HTMLElement, text: string, ok: boolean): void {
  node.textContent = text;
  node.classList.toggle('ok', ok);
  node.classList.toggle('bad', !ok);
}

function clearResult(): void {
  for (const node of [ui.kp, ui.ess, ui.tauCl, ui.tSat, ui.settle]) {
    node.textContent = '–';
    node.classList.remove('ok', 'bad');
  }
  ui.warnings.textContent = '';
  ui.code.textContent = '';
  snippet = '';
  prediction = null;
}

function recompute(): void {
  if (!state || !model) return;
  ui.targetUnit.textContent = mode === 'offset' ? state.unit : 's';

  const result = solveTuning(model, mode, target, state.acceptance, state.unit);
  if (!result) {
    clearResult();
    return;
  }

  ui.kp.textContent = fmt(result.kp);
  mark(ui.ess, fmt(result.offset, state.unit), result.okOffset);
  ui.tauCl.textContent = fmt(result.tauCl, 's');
  ui.tSat.textContent = fmt(result.tSat, 's');
  mark(ui.settle, fmt(result.settle, 's'), result.okSettle);

  ui.warnings.textContent = '';
  for (const text of result.warnings) {
    const item = document.createElement('li');
    item.textContent = text;
    ui.warnings.append(item);
  }

  snippet = tuningSnippet(model, mode, target, result.kp);
  lastKp = result.kp;
  const header = sandboxHeader({
    title: state.title,
    unit: state.unit,
    params: state.params,
    sp: state.sp,
    model,
  });
  template = `${header}\n\n${sandboxTemplate(model, mode, target, lastKp)}\n`;
  prediction = { settle: result.settle, offset: result.offset };
  ui.code.textContent = snippet;
}

function defaultTarget(next: TuningWindowState, tune: TuningModel, nextMode: TuneMode): number {
  if (nextMode === 'offset') {
    const tolerance = next.acceptance.maxSteadyStateError || 1;
    return round(tolerance / 5, 2);
  }
  const budget = next.acceptance.maxSettleTime ?? tune.tau * 4;
  return round(budget / 4, 1);
}

// ---------------------------------------------------------------------------
// State from the dojo
// ---------------------------------------------------------------------------

function applyState(next: TuningWindowState): void {
  state = next;
  document.documentElement.setAttribute('data-theme', next.theme);
  document.title = `Tuning — ${next.title} · PID Dojo`;
  ui.subtitle.textContent = `${next.title} · setpoint ${fmt(next.sp)} ${next.unit}`;

  model = deriveTuningModel(next.task, next.params, next.sp);
  ui.empty.classList.toggle('hidden', model !== null);
  ui.content.classList.toggle('hidden', model === null);

  if (!model) {
    ui.subtitle.textContent = `${next.title} — no tuning model for this task yet`;
    return;
  }

  renderModel(next, model);
  renderAcceptance(next);

  if (!userEditedTarget) {
    target = defaultTarget(next, model, mode);
    ui.target.value = String(target);
  }
  recompute();
  ensureSandbox(next);
  syncSandboxBody();
  refreshSandboxHeader(next);

  // Keep the state in the URL so a reload shows the same worksheet.
  try {
    history.replaceState(null, '', `?state=${encodeURIComponent(JSON.stringify(next))}`);
  } catch {
    // opaque origins may refuse this
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as Partial<TuningWindowState> | null;
  if (!data || data.type !== 'pid-dojo-tuning') return;
  applyState(data as TuningWindowState);
});

// ---------------------------------------------------------------------------
// Sandbox: edit your own controller, run it headless on this worksheet
// ---------------------------------------------------------------------------

function currentTemplate(): string {
  if (template) return template;
  return ['function control(e, dt, mem) {', '  return 0;', '}'].join('\n');
}

function readStoredSandbox(taskId: string): string | null {
  try {
    return localStorage.getItem(SANDBOX_KEY(taskId));
  } catch {
    return null;
  }
}

function scheduleSandboxSave(code: string): void {
  if (saveSandboxTimer !== undefined) clearTimeout(saveSandboxTimer);
  saveSandboxTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(SANDBOX_KEY(sandboxTaskId), code);
    } catch {
      // storage may be unavailable
    }
  }, 400);
}

function ensureSandbox(next: TuningWindowState): void {
  if (!sandboxEditor) {
    const initial = readStoredSandbox(next.task) ?? currentTemplate();
    sandboxEditor = new CodeEditor(ui.sandboxHost, initial, (value) => scheduleSandboxSave(value));
    sandboxEditor.setTheme(next.theme === 'light');
    renderedTemplate = initial;
    sandboxTaskId = next.task;
    renderSandboxLogs([]);
    return;
  }

  sandboxEditor.setTheme(next.theme === 'light');
  if (sandboxTaskId !== next.task) {
    sandboxTaskId = next.task;
    const code = readStoredSandbox(next.task) ?? currentTemplate();
    sandboxEditor.setValue(code);
    renderedTemplate = code;
    clearSandboxResult();
    setSandboxStatus('');
  }
}

/**
 * Replace the code with the freshly generated template, but only while the
 * user has not edited it (otherwise their work would be lost).
 */
function syncSandboxBody(): void {
  if (!sandboxEditor || !template) return;
  if (sandboxEditor.getValue() !== renderedTemplate) return;
  sandboxEditor.setValue(template);
  renderedTemplate = template;
}

function loadTemplateIntoEditor(): void {
  if (!sandboxEditor) return;
  const code = currentTemplate();
  sandboxEditor.setValue(code);
  renderedTemplate = code;
}

/** Keep the parameter comment block in the sandbox code in step with the worksheet. */
function refreshSandboxHeader(next: TuningWindowState): void {
  if (!sandboxEditor || !model) return;
  const header = sandboxHeader({
    title: next.title,
    unit: next.unit,
    params: next.params,
    sp: next.sp,
    model,
  });
  const current = sandboxEditor.getValue();
  const updated = withSandboxHeader(current, header);
  if (updated !== current) sandboxEditor.setValue(updated);
}

function showTab(tab: 'design' | 'sandbox'): void {
  const sandbox = tab === 'sandbox';
  ui.tabDesign.classList.toggle('active', !sandbox);
  ui.tabSandbox.classList.toggle('active', sandbox);
  ui.tabDesign.setAttribute('aria-selected', String(!sandbox));
  ui.tabSandbox.setAttribute('aria-selected', String(sandbox));
  ui.panelDesign.classList.toggle('hidden', sandbox);
  ui.panelSandbox.classList.toggle('hidden', !sandbox);
}

function setSandboxStatus(text: string, bad = false): void {
  ui.sandboxStatus.textContent = text;
  ui.sandboxStatus.classList.toggle('bad', bad);
}

function clearSandboxResult(): void {
  ui.sandboxMetrics.textContent = '';
  renderSandboxLogs([]);
  drawSandboxChart([]);
}

function copyText(text: string): void {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => flash('copied to the clipboard'),
    () => flash('copy failed — select the code manually'),
  );
}

function sendToEditor(code: string): void {
  const opener = window.opener as Window | null;
  if (!opener) {
    flash('open the calculator from the dojo to use this');
    return;
  }
  if (!code) return;
  const message: TuningCodeMessage = { type: 'pid-dojo-tuning-code', code };
  opener.postMessage(message, '*');
  opener.focus();
  flash('inserted into the editor');
}

function useTemplate(): void {
  if (!sandboxEditor) return;
  loadTemplateIntoEditor();
  clearSandboxResult();
  setSandboxStatus('template loaded');
  showTab('sandbox');
  sandboxEditor.focus();
}

function runSandbox(): void {
  if (!state || !sandboxEditor) return;

  const code = sandboxEditor.getValue();
  const worksheet: Worksheet = {
    id: 'sandbox',
    name: 'sandbox',
    taskId: state.task,
    phase: 1,
    seed: 0,
    plantParams: { ...state.params },
    formula: code,
    notes: '',
    createdAt: 0,
  };

  clearSandboxResult();
  setSandboxStatus('running…');
  ui.sandboxRun.disabled = true;

  const worker = new Worker(new URL('./simulation/sandboxWorker.ts', import.meta.url), {
    type: 'module',
  });
  const finish = (): void => {
    ui.sandboxRun.disabled = false;
  };

  const timer = window.setTimeout(() => {
    worker.terminate();
    finish();
    setSandboxStatus('timeout after 2 s — is control() stuck in a loop?', true);
  }, 2000);

  worker.onmessage = (event: MessageEvent<HeadlessResult>) => {
    clearTimeout(timer);
    worker.terminate();
    finish();
    renderSandbox(event.data);
  };
  worker.onerror = () => {
    clearTimeout(timer);
    worker.terminate();
    finish();
    setSandboxStatus('sandbox worker failed to start', true);
  };

  worker.postMessage({ worksheet, formula: code });
}

function renderSandbox(result: HeadlessResult): void {
  drawSandboxChart(result.samples);
  renderSandboxLogs(result.logs);

  if (result.error) {
    setSandboxStatus(result.error, true);
    return;
  }
  const metrics = result.metrics;
  if (!state || !metrics) return;

  const a = state.acceptance;
  ui.sandboxMetrics.textContent = '';
  const row = (label: string, value: string, ok?: boolean): void => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (ok !== undefined) dd.classList.add(ok ? 'ok' : 'bad');
    ui.sandboxMetrics.append(dt, dd);
  };

  const settleOk =
    a.maxSettleTime === null ||
    (metrics.settleTime !== null && metrics.settleTime <= a.maxSettleTime);
  row('settle', metrics.settleTime === null ? 'never' : `${metrics.settleTime.toFixed(1)} s`, settleOk);
  row(
    'overshoot',
    metrics.overshootPct === null ? 'n/a' : `${metrics.overshootPct.toFixed(0)} %`,
    a.maxOvershootPct === null || (metrics.overshootPct ?? 0) <= a.maxOvershootPct,
  );
  row(
    'steady |e|',
    `${metrics.steadyStateError.toFixed(2)} ${state.unit}`,
    metrics.steadyStateError <= a.maxSteadyStateError,
  );
  row('IAE', metrics.iae.toFixed(0));
  row('verdict', result.pass ? 'PASS' : 'FAIL', result.pass);
  if (prediction) {
    row('design said', `${fmt(prediction.settle, 's')} · ${fmt(prediction.offset, state.unit)}`);
  }

  setSandboxStatus(`run finished after ${result.time.toFixed(1)} s`, !result.pass);
}

function renderSandboxLogs(logs: string[]): void {
  if (logs.length === 0) {
    ui.sandboxLog.textContent =
      'nothing yet — call debug(value, …) or log(value, …) in your controller';
    ui.sandboxLog.classList.add('empty');
    return;
  }
  ui.sandboxLog.classList.remove('empty');
  ui.sandboxLog.textContent = logs.join('\n');
}

function drawSandboxChart(samples: Sample[]): void {
  const canvas = ui.sandboxChart;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (samples.length < 2) return;

  const tEnd = samples[samples.length - 1].t || 1;
  const bandH = Math.round(h * 0.24);
  const top = 8;
  const plotH = Math.max(10, h - bandH - top - 6);

  let minV = Infinity;
  let maxV = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const s of samples) {
    minV = Math.min(minV, s.sp, s.pv);
    maxV = Math.max(maxV, s.sp, s.pv);
    minU = Math.min(minU, s.u);
    maxU = Math.max(maxU, s.u);
  }
  if (!Number.isFinite(minV) || maxV - minV < 1e-9) {
    minV -= 1;
    maxV += 1;
  }
  if (maxU - minU < 1e-9) {
    minU -= 1;
    maxU += 1;
  }
  const pad = (maxV - minV) * 0.08;
  minV -= pad;
  maxV += pad;

  const x = (t: number): number => (t / tEnd) * (w - 8) + 4;
  const y = (v: number): number => top + (1 - (v - minV) / (maxV - minV)) * plotH;
  const yu = (u: number): number => h - 6 - ((u - minU) / (maxU - minU)) * (bandH - 12);

  ctx.strokeStyle = 'rgba(128, 140, 170, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, h - bandH);
  ctx.lineTo(w - 4, h - bandH);
  ctx.stroke();

  const line = (
    project: (s: Sample) => number,
    color: string,
    width: number,
    dash: number[] = [],
  ): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    samples.forEach((s, index) => {
      const px = x(s.t);
      const py = project(s);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  line((s) => y(s.sp), '#5cc8ff', 1.5, [5, 4]);
  line((s) => y(s.pv), '#41d18b', 2);
  line((s) => yu(s.u), '#ffb454', 1.5);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

ui.mode.addEventListener('change', () => {
  mode = ui.mode.value === 'tau' ? 'tau' : 'offset';
  if (!userEditedTarget && state && model) {
    target = defaultTarget(state, model, mode);
    ui.target.value = String(target);
  }
  recompute();
});

ui.target.addEventListener('input', () => {
  const value = Number(ui.target.value);
  if (!Number.isFinite(value) || value <= 0) return;
  userEditedTarget = true;
  target = value;
  recompute();
});

ui.copy.addEventListener('click', () => copyText(snippet));
ui.insert.addEventListener('click', () => sendToEditor(snippet));
ui.toSandbox.addEventListener('click', () => useTemplate());

ui.tabDesign.addEventListener('click', () => showTab('design'));
ui.tabSandbox.addEventListener('click', () => showTab('sandbox'));

ui.sandboxReset.addEventListener('click', () => {
  if (!sandboxEditor) return;
  loadTemplateIntoEditor();
  clearSandboxResult();
  setSandboxStatus('template loaded');
});

ui.sandboxRun.addEventListener('click', () => runSandbox());
ui.sandboxCopy.addEventListener('click', () => copyText(sandboxEditor?.getValue() ?? ''));

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
  if (ui.panelSandbox.classList.contains('hidden')) return;
  event.preventDefault();
  runSandbox();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const raw = params.get('state');
let initial: TuningWindowState | null = null;
if (raw) {
  try {
    const parsed = JSON.parse(raw) as TuningWindowState;
    if (parsed && parsed.type === 'pid-dojo-tuning') initial = parsed;
  } catch {
    initial = null;
  }
}

if (initial) {
  applyState(initial);
} else {
  ui.content.classList.add('hidden');
  ui.empty.classList.remove('hidden');
}

// The dojo answers this with the current state, so a reloaded window catches up.
window.opener?.postMessage({ type: 'pid-dojo-tuning-ready' }, '*');
