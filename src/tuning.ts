// ---------------------------------------------------------------------------
// Tuning calculator window (tuning.html).
//
// The dojo pushes the worksheets's model values + acceptance criteria in, this
// page solves for Kp and hands a ready-to-paste snippet back.
// ---------------------------------------------------------------------------

import './styles.css';
import {
  deriveTuningModel,
  solveTuning,
  tuningSnippet,
  type TuneMode,
  type TuningModel,
} from './controller/tuningModel';
import type { TuningCodeMessage, TuningWindowState } from './tuningWindow';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const ui = {
  subtitle: el('tune-subtitle'),
  empty: el('tune-empty'),
  content: el('tune-content'),
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
  insert: el<HTMLButtonElement>('btn-tune-insert'),
  hint: el('tune-hint'),
};

let state: TuningWindowState | null = null;
let model: TuningModel | null = null;
let mode: TuneMode = 'offset';
let target = 0;
let snippet = '';
let userEditedTarget = false;
let hintTimer: number | undefined;

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

ui.copy.addEventListener('click', () => {
  if (!snippet) return;
  navigator.clipboard.writeText(snippet).then(
    () => flash('copied to the clipboard'),
    () => flash('copy failed — select the code manually'),
  );
});

ui.insert.addEventListener('click', () => {
  const opener = window.opener as Window | null;
  if (!opener) {
    flash('open the calculator from the dojo to use this');
    return;
  }
  if (!snippet) return;
  const message: TuningCodeMessage = { type: 'pid-dojo-tuning-code', code: snippet };
  opener.postMessage(message, '*');
  opener.focus();
  flash('inserted into the editor');
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
