// ---------------------------------------------------------------------------
// The standalone help window (help.html).
//
// The task help page is a document of its own so it can be read large, on a
// second monitor, side by side with the dojo. This module opens that window
// once and then keeps it in sync by posting state messages.
// ---------------------------------------------------------------------------

import { popupFeatures } from './auxWindow';
import type { Lang } from './types';

export const HELP_WINDOW_NAME = 'pid-dojo-help';

/** Message sent to the help window after a task / language / theme change. */
export interface HelpWindowState {
  type: 'pid-dojo-help';
  task: string;
  lang: Lang;
  theme: 'light' | 'dark';
}

/** Message sent back by the help window when its language picker changes. */
export interface HelpWindowLangMessage {
  type: 'pid-dojo-lang';
  lang: Lang;
}

let handle: Window | null = null;

/** `help.html` sits next to the page that is currently running (dev or dist). */
export function helpWindowUrl(state: HelpWindowState): string {
  const params = new URLSearchParams({
    task: state.task,
    lang: state.lang,
    theme: state.theme,
  });
  return new URL(`help.html?${params.toString()}`, window.location.href).href;
}

function windowFeatures(): string {
  return popupFeatures(1100, 950);
}

/**
 * Open the help window, or focus the existing one.
 * Returns false when the browser blocked the popup.
 */
export function showHelp(state: HelpWindowState): boolean {
  if (handle && !handle.closed) {
    // Same document is still loaded: update it in place instead of reloading.
    handle.postMessage(state, '*');
    handle.focus();
    return true;
  }

  handle = window.open(helpWindowUrl(state), HELP_WINDOW_NAME, windowFeatures());
  if (!handle) return false;
  handle.focus();
  return true;
}

/** Push a state change into the help window, if it is open. */
export function syncHelp(state: HelpWindowState): void {
  if (handle && !handle.closed) handle.postMessage(state, '*');
}
