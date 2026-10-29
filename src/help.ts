// ---------------------------------------------------------------------------
// Standalone help window: renders the current task's Markdown help page at a
// comfortable reading size.
//
// Opened from main.ts via ./helpWindow.ts. Task, language and theme come from
// the query string, so the window also works standalone (reload / bookmark);
// afterwards it follows the dojo through { type: 'pid-dojo-help' } messages.
// ---------------------------------------------------------------------------

import './styles.css';
import { marked } from 'marked';
import type { HelpWindowState } from './helpWindow';
import { detectLang, isLang, UI_TEXT } from './i18n';
import { findTask, TASKS } from './tasks';
import type { Lang, TaskDef } from './types';

const THEME_KEY = 'pid-dojo-theme';
const SCALE_KEY = 'pid-dojo-help-scale';
const SCALE_MIN = 0.7;
const SCALE_MAX = 2;
const SCALE_STEP = 0.1;

type Theme = 'light' | 'dark';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const ui = {
  heading: el('help-heading'),
  subtitle: el('help-subtitle'),
  body: el('help-body'),
  scaleLabel: el<HTMLButtonElement>('help-scale-label'),
  smaller: el<HTMLButtonElement>('btn-help-smaller'),
  larger: el<HTMLButtonElement>('btn-help-larger'),
};

const params = new URLSearchParams(window.location.search);
const taskParam = findTask(params.get('task') ?? '');
const langParam = params.get('lang');
const themeParam = params.get('theme');

let task: TaskDef = taskParam ?? TASKS[0];
let lang: Lang = isLang(langParam) ? langParam : detectLang();
let theme: Theme =
  themeParam === 'light' || themeParam === 'dark'
    ? themeParam
    : localStorage.getItem(THEME_KEY) === 'light'
      ? 'light'
      : 'dark';

// ---------------------------------------------------------------------------
// Text size
//
// Browser zoom is per origin, so Ctrl+scroll here would also resize the dojo
// window. This scale only touches this document (CSS var --help-scale) and is
// remembered across sessions.
// ---------------------------------------------------------------------------

function readScale(): number {
  try {
    const raw = Number(localStorage.getItem(SCALE_KEY));
    if (Number.isFinite(raw) && raw >= SCALE_MIN && raw <= SCALE_MAX) return raw;
  } catch {
    // storage may be unavailable (private mode)
  }
  return 1;
}

let scale = readScale();

function applyScale(next: number): void {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(next * 10) / 10));
  scale = clamped;
  document.documentElement.style.setProperty('--help-scale', String(clamped));
  ui.scaleLabel.textContent = `${Math.round(clamped * 100)} %`;
  try {
    localStorage.setItem(SCALE_KEY, String(clamped));
  } catch {
    // ignore: the setting just will not survive a reload
  }
}

function render(): void {
  const text = UI_TEXT[lang];
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.lang = lang;
  document.title = `${text.helpTitle} — ${task.title} · PID Dojo`;

  ui.heading.textContent = text.helpTitle;
  ui.subtitle.textContent = `${task.title} · Phase ${task.phase} · ${task.unit}`;

  const html = marked.parse(task.help[lang]);
  ui.body.innerHTML = typeof html === 'string' ? html : '';

  // Keep the state in the URL so a reload shows the same page.
  try {
    history.replaceState(null, '', `?task=${task.id}&lang=${lang}&theme=${theme}`);
  } catch {
    // Opaque origins (file://) may refuse this; the page still renders.
  }
}

function apply(state: HelpWindowState): void {
  const next = findTask(state.task);
  if (next) task = next;
  if (isLang(state.lang)) lang = state.lang;
  if (state.theme === 'light' || state.theme === 'dark') theme = state.theme;
  render();
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as Partial<HelpWindowState> | null;
  if (!data || data.type !== 'pid-dojo-help') return;
  apply(data as HelpWindowState);
});

render();

// Text size: buttons, plus + / - / 0 (Ctrl+scroll stays browser zoom).
ui.smaller.addEventListener('click', () => applyScale(scale - SCALE_STEP));
ui.larger.addEventListener('click', () => applyScale(scale + SCALE_STEP));
ui.scaleLabel.addEventListener('click', () => applyScale(1));

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    applyScale(scale + SCALE_STEP);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    applyScale(scale - SCALE_STEP);
  } else if (event.key === '0') {
    event.preventDefault();
    applyScale(1);
  }
});

applyScale(scale);

// Ask the dojo for the current state, so a reloaded window catches up.
window.opener?.postMessage({ type: 'pid-dojo-help-ready' }, '*');
