// ---------------------------------------------------------------------------
// DojoController: owns the canvas, the plants and the fixed-timestep loop.
// Physics runs at 100 Hz; drawing follows requestAnimationFrame.
// ---------------------------------------------------------------------------

import type { Metrics, Plant, RunState, RunStatus, TaskDef, Workbook } from './types';
import { beginRun, createRunState, endRun, recordSample, stopRun } from './state';
import {
  compileController,
  invokeController,
  type CompiledController,
  type Mem,
} from './controller/compile';
import { evaluateRun, passed, workbookSetpoint } from './tasks';
import { clamp } from './simulation/plant';
import type { Chart } from './chart';

export const DT = 0.01;
const MAX_STEPS = 500;
const SAMPLE_EVERY = 5; // one chart sample every 0.05 s
const SETTLE_HOLD = 5; // |e| must stay inside the band this long

export interface RunInfo {
  status: RunStatus;
  time: number;
  metrics: Metrics | null;
  error: string | null;
  pass: boolean;
}

export interface DojoOptions {
  canvas: HTMLCanvasElement;
  chart: Chart;
  getFormula: () => string;
  onUpdate: (info: RunInfo) => void;
}

export class DojoController {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly chart: Chart;
  private readonly getFormula: () => string;
  private readonly onUpdate: (info: RunInfo) => void;

  private task: TaskDef | null = null;
  private plant: Plant | null = null;
  private control: CompiledController | null = null;

  private state: RunState = createRunState();
  private metrics: Metrics | null = null;
  private mem: Mem = {};
  private prevE = 0;
  private setpoint = 0;

  private acc = 0;
  private lastFrame = 0;
  private stepCount = 0;
  private inBandSince: number | null = null;
  private raf = 0;
  private lastEmit = 0;

  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  constructor(options: DojoOptions) {
    this.canvas = options.canvas;
    this.chart = options.chart;
    this.getFormula = options.getFormula;
    this.onUpdate = options.onUpdate;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    this.ctx = ctx;

    this.raf = requestAnimationFrame(this.loop);
  }

  // -- lifecycle ------------------------------------------------------------

  /** Point the dojo at a task + workbook (does not start the run). */
  load(task: TaskDef, workbook: Workbook): void {
    this.task = task;
    this.setpoint = workbookSetpoint(task, workbook);

    this.plant = task.plantFactory();
    this.plant.configure(workbook.plantParams, this.setpoint);

    this.state = createRunState();
    this.metrics = null;
    this.control = null;
    this.mem = {};
    this.prevE = 0;
    this.acc = 0;
    this.stepCount = 0;
    this.inBandSince = null;
    this.chart.reset();
    this.emit(true);
  }

  /** Compile the formula and run from the initial conditions. */
  start(): void {
    if (!this.task || !this.plant) return;

    let control: CompiledController;
    try {
      control = compileController(this.getFormula());
    } catch (err) {
      this.metrics = null;
      endRun(this.state, 'error', err instanceof Error ? err.message : String(err));
      this.emit(true);
      return;
    }

    this.control = control;
    this.plant.reset();
    this.mem = {};
    this.prevE = 0;
    this.acc = 0;
    this.stepCount = 0;
    this.inBandSince = null;
    this.metrics = null;
    beginRun(this.state);
    this.chart.reset();
    this.emit(true);
  }

  /** Re-run from the initial conditions with the same plant + formula. */
  reset(): void {
    this.start();
  }

  stop(): void {
    stopRun(this.state);
    this.emit(true);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  getInfo(): RunInfo {
    return {
      status: this.state.status,
      time: this.state.time,
      metrics: this.metrics,
      error: this.state.error,
      pass: this.task && this.metrics ? passed(this.task, this.metrics) : false,
    };
  }

  // -- loop -----------------------------------------------------------------

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);

    const elapsed = this.lastFrame === 0 ? 0 : Math.min(now - this.lastFrame, 250);
    this.lastFrame = now;

    this.advance(elapsed / 1000);
    this.draw();
    this.chart.flush();
    this.emit(false);
  };

  private advance(realSeconds: number): void {
    if (this.state.status !== 'running') return;
    const task = this.task;
    const plant = this.plant;
    const control = this.control;
    if (!task || !plant || !control) return;

    this.acc += realSeconds;
    let steps = 0;

    while (this.acc >= DT && steps < MAX_STEPS && this.state.status === 'running') {
      this.acc -= DT;
      steps++;

      const pv = plant.measurement();
      const e = this.setpoint - pv;

      // Values the runner injects before every call.
      this.mem.sp = this.setpoint;
      this.mem.pv = pv;
      this.mem.prevE = this.prevE;
      this.mem.t = this.state.time;

      let u: number;
      try {
        u = invokeController(control, e, DT, this.mem);
      } catch (err) {
        this.fail(err instanceof Error ? err.message : String(err));
        return;
      }

      this.prevE = e;
      const uc = clamp(u, task.uMin, task.uMax);
      plant.step(uc, DT);
      this.stepCount++;
      this.state.time = this.state.time + DT;

      if (!Number.isFinite(plant.measurement())) {
        this.fail('The plant produced a non-finite measurement — the run diverged.');
        return;
      }

      if (this.stepCount % SAMPLE_EVERY === 0) {
        const sample = {
          t: this.state.time,
          sp: this.setpoint,
          pv: plant.measurement(),
          u: uc,
        };
        recordSample(this.state, sample);
        this.chart.append(sample.t, sample.sp, sample.pv, sample.u);
        if (this.checkSettled(sample.t, sample.sp, sample.pv, task)) return;
      }
    }
  }

  /** Returns true when the run was finalised. */
  private checkSettled(t: number, sp: number, pv: number, task: TaskDef): boolean {
    const band = task.acceptance.maxSteadyStateError;

    if (Math.abs(sp - pv) <= band) {
      if (this.inBandSince === null) this.inBandSince = t;
    } else {
      this.inBandSince = null;
    }

    const held = this.inBandSince !== null && t - this.inBandSince >= SETTLE_HOLD;
    const timedOut = t >= task.acceptance.maxRunTime;
    if (!held && !timedOut) return false;

    this.finish();
    return true;
  }

  private finish(): void {
    const task = this.task;
    if (!task) return;
    this.metrics = evaluateRun(task, this.state.history, this.state.time);
    const ok = passed(task, this.metrics);
    endRun(this.state, ok ? 'settled' : 'failed');
    this.emit(true);
  }

  private fail(message: string): void {
    endRun(this.state, 'error', message);
    this.emit(true);
  }

  // -- drawing --------------------------------------------------------------

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    if (cssW !== this.cssW || cssH !== this.cssH || dpr !== this.dpr) {
      this.cssW = cssW;
      this.cssH = cssH;
      this.dpr = dpr;
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.plant) {
      this.plant.render(this.ctx, cssW, cssH);
    } else {
      this.ctx.clearRect(0, 0, cssW, cssH);
    }
  }

  private emit(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.onUpdate(this.getInfo());
  }
}
