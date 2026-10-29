// ---------------------------------------------------------------------------
// Headless run: the same physics / acceptance loop as DojoController, but
// without canvas or chart, so it can also run inside a Web Worker.
//
// Keep DT / SAMPLE_EVERY / SETTLE_HOLD and the settle rule in sync with
// app.ts — the sandbox must report exactly the numbers the dojo would.
// ---------------------------------------------------------------------------

import { compileController, invokeController, type CompiledController, type Mem, type PlantInfo } from '../controller/compile';
import { evaluateRun, passed, worksheetSetpoint } from '../tasks';
import type { Metrics, Sample, TaskDef, Worksheet } from '../types';
import { clamp } from './plant';

export const DT = 0.01;
export const SAMPLE_EVERY = 5;
export const SETTLE_HOLD = 5;

export interface HeadlessResult {
  status: 'settled' | 'failed' | 'error';
  /** Final simulation time [s]. */
  time: number;
  metrics: Metrics | null;
  pass: boolean;
  samples: Sample[];
  error: string | null;
  /** Lines the user's code passed to debug() / log(). */
  logs: string[];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  }
  if (typeof value === 'boolean' || value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Run `formula` against `worksheet` as fast as possible (no animation). */
export function runHeadless(
  task: TaskDef,
  worksheet: Worksheet,
  formula: string,
  maxLogs = 200,
): HeadlessResult {
  const logs: string[] = [];
  const log = (...args: unknown[]): void => {
    if (logs.length < maxLogs) logs.push(args.map(formatArg).join(' '));
  };

  const baseSp = worksheetSetpoint(task, worksheet);
  const plant = task.plantFactory();
  plant.configure(worksheet.plantParams, baseSp);
  plant.reset();

  const plantInfo: PlantInfo = Object.freeze({
    ...worksheet.plantParams,
    sp: baseSp,
    uMin: task.uMin,
    uMax: task.uMax,
  });

  let control: CompiledController;
  try {
    control = compileController(formula, log, plantInfo);
  } catch (err) {
    return {
      status: 'error',
      time: 0,
      metrics: null,
      pass: false,
      samples: [],
      error: message(err),
      logs,
    };
  }

  const setpointAt = (t: number): number => (task.profile ? task.profile(t, baseSp) : baseSp);
  const band = task.acceptance.maxSteadyStateError;
  const minRunTime = task.acceptance.minRunTime ?? 0;

  const mem: Mem = {};
  const samples: Sample[] = [];
  let prevE = 0;
  let t = 0;
  let steps = 0;
  let inBandSince: number | null = null;

  while (t < task.acceptance.maxRunTime) {
    const sp = setpointAt(t);
    plant.setSetpoint(sp);
    const pv = plant.measurement();
    const e = sp - pv;

    mem.sp = sp;
    mem.pv = pv;
    mem.prevE = prevE;
    mem.t = t;

    let u: number;
    try {
      u = invokeController(control, e, DT, mem);
    } catch (err) {
      return { status: 'error', time: t, metrics: null, pass: false, samples, error: message(err), logs };
    }

    prevE = e;
    const uc = clamp(u, task.uMin, task.uMax);
    plant.step(uc, DT);
    steps++;
    t += DT;

    if (!Number.isFinite(plant.measurement())) {
      return {
        status: 'error',
        time: t,
        metrics: null,
        pass: false,
        samples,
        error: 'The plant produced a non-finite measurement — the run diverged.',
        logs,
      };
    }

    if (steps % SAMPLE_EVERY !== 0) continue;

    const sample: Sample = { t, sp, pv: plant.measurement(), u: uc };
    samples.push(sample);

    if (Math.abs(sp - sample.pv) <= band) {
      if (inBandSince === null) inBandSince = t;
    } else {
      inBandSince = null;
    }

    if (t >= minRunTime && inBandSince !== null && t - inBandSince >= SETTLE_HOLD) break;
  }

  const metrics = evaluateRun(task, samples, t);
  const ok = passed(task, metrics);
  return {
    status: ok ? 'settled' : 'failed',
    time: t,
    metrics,
    pass: ok,
    samples,
    error: null,
    logs,
  };
}
