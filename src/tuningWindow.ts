// ---------------------------------------------------------------------------
// The tuning calculator window (tuning.html).
//
// It is a window of its own so the help page can stay open next to it. The
// dojo pushes the worksheet's model values + acceptance criteria in, and the
// calculator pushes the generated tuning code back.
// ---------------------------------------------------------------------------

import { popupFeatures } from './auxWindow';
import type { AcceptanceCriteria, Lang } from './types';

export const TUNING_WINDOW_NAME = 'pid-dojo-tuning';

/** Everything the calculator needs to know about the current worksheet. */
export interface TuningWindowState {
  type: 'pid-dojo-tuning';
  task: string;
  title: string;
  unit: string;
  lang: Lang;
  theme: 'light' | 'dark';
  params: Record<string, number>;
  sp: number;
  acceptance: AcceptanceCriteria;
}

/** Sent back by the calculator: put this snippet into the editor. */
export interface TuningCodeMessage {
  type: 'pid-dojo-tuning-code';
  code: string;
}

let handle: Window | null = null;

export function tuningWindowUrl(state: TuningWindowState): string {
  const params = new URLSearchParams({ state: JSON.stringify(state) });
  return new URL(`tuning.html?${params.toString()}`, window.location.href).href;
}

/** Open the calculator, or focus it and push the current state. */
export function showTuning(state: TuningWindowState): boolean {
  if (handle && !handle.closed) {
    handle.postMessage(state, '*');
    handle.focus();
    return true;
  }
  handle = window.open(tuningWindowUrl(state), TUNING_WINDOW_NAME, popupFeatures(560, 900));
  if (!handle) return false;
  handle.focus();
  return true;
}

/** Push a state change (task / language / theme) into an open calculator. */
export function syncTuning(state: TuningWindowState): void {
  if (handle && !handle.closed) handle.postMessage(state, '*');
}
