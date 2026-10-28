// ---------------------------------------------------------------------------
// Run state + worksheet helpers.
//
// The state is intentionally tiny and *pure where it matters*: every transition
// is a small named function so the UI never pokes at fields directly. The one
// concession to performance is the sample history, which is appended to in
// place (its owner is the run, nobody else reads it).
// ---------------------------------------------------------------------------

import type { RunState, RunStatus, Sample, Worksheet } from './types';

/** Cap for the chart history (~200 s at one sample every 50 ms). */
export const HISTORY_CAP = 4000;

export function createRunState(): RunState {
  return { status: 'idle', time: 0, history: [], error: null };
}

/** Clear the history and put the run into the running state. */
export function beginRun(state: RunState): RunState {
  state.status = 'running';
  state.time = 0;
  state.history.length = 0;
  state.error = null;
  return state;
}

/** Append one sample, keeping the ring buffer bounded. */
export function recordSample(state: RunState, sample: Sample): void {
  const history = state.history;
  history.push(sample);
  if (history.length > HISTORY_CAP) {
    history.splice(0, history.length - HISTORY_CAP);
  }
  state.time = sample.t;
}

/** Finish a run (settled / failed / error) while keeping its history. */
export function endRun(state: RunState, status: RunStatus, error: string | null = null): RunState {
  state.status = status;
  state.error = error;
  return state;
}

/** Stop the run, but keep what has been recorded so far. */
export function stopRun(state: RunState): RunState {
  if (state.status === 'running') state.status = 'idle';
  return state;
}

export function isActive(state: RunState): boolean {
  return state.status === 'running';
}

// ---------------------------------------------------------------------------
// Worksheet helpers
// ---------------------------------------------------------------------------

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `wb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function worksheetLabel(wb: Worksheet): string {
  const d = new Date(wb.createdAt);
  const stamp = Number.isNaN(d.getTime()) ? '' : ` · ${d.toLocaleString()}`;
  return `${wb.taskId} · seed ${wb.seed}${stamp}`;
}

/** Structural clone with an overlap guard, used before persisting snapshots. */
export function cloneWorksheet(wb: Worksheet): Worksheet {
  return {
    ...wb,
    plantParams: { ...wb.plantParams },
  };
}

export function sameWorksheet(a: Worksheet | null, b: Worksheet | null): boolean {
  return !!a && !!b && a.id === b.id;
}
