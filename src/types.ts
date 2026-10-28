// ---------------------------------------------------------------------------
// Shared types for the PID Dojo.
// Kept in one module so plants, tasks, chart and UI all agree on the contract.
// ---------------------------------------------------------------------------

export type Phase = 1 | 2 | 3;

/** UI language. Only the learning content (help pages, math reference) is
 *  localised; the code editor and metrics stay in English. */
export type Lang = 'en' | 'de';

/** A string available in every supported language. */
export type Localized = Record<Lang, string>;

/** Flat, JSON-serialisable model parameters of a plant. */
export interface PlantParams {
  [key: string]: number;
}

/** A persistent workbook: one randomised plant + the user's work on it. */
export interface Workbook {
  id: string;
  taskId: string;
  phase: Phase;
  seed: number;
  plantParams: PlantParams;
  formula: string;
  notes: string;
  createdAt: number;
}

/** One recorded sample of the simulation (drives the chart). */
export interface Sample {
  t: number;
  sp: number;
  pv: number;
  u: number;
}

export type RunStatus = 'idle' | 'running' | 'settled' | 'failed' | 'error';

export interface RunState {
  status: RunStatus;
  time: number;
  history: Sample[];
  error: string | null;
}

export interface Metrics {
  /** Time after which |pv - sp| stays inside the band; null if never. */
  settleTime: number | null;
  /** 100 * (max(pv) - sp) / sp, null when not applicable. */
  overshootPct: number | null;
  /** Mean |e| over the last 5 s of the run. */
  steadyStateError: number;
  /** Integral of |e| dt over the whole run. */
  iae: number;
}

export interface AcceptanceCriteria {
  maxSettleTime: number;
  /** null = overshoot is not scored for this task (offset allowed). */
  maxOvershootPct: number | null;
  maxSteadyStateError: number;
  maxRunTime: number;
}

export interface TaskDef {
  id: string;
  title: string;
  phase: Phase;
  /** Factory for a fresh, un-configured plant instance. */
  plantFactory: () => Plant;
  /** Markdown help page, one document per language. */
  help: Localized;
  acceptance: AcceptanceCriteria;
  /** Finite step setpoint (the workbook may randomise a different one). */
  setpoint: number;
  uMin: number;
  uMax: number;
  /** Unit of the process value (used by the UI and the chart). */
  unit: string;
  /** Starter code placed in the editor for a new workbook. */
  starterFormula: string;
}

/** Seeded pseudo random number generator. Never use Math.random() in plants. */
export interface RNG {
  next(): number;
  nextRange(min: number, max: number): number;
}

export interface Plant {
  /** Apply params + setpoint and reset to the initial conditions. */
  configure(params: PlantParams, setpoint: number): void;
  /** Reset the state, keeping the current params. */
  reset(): void;
  /** Advance the physics by dt seconds with the (already clamped) control u. */
  step(u: number, dt: number): void;
  /** Current sensor output (the process value). */
  measurement(): number;
  /** Draw the animated scene. w/h are CSS pixels. */
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** Produce randomised, but always solvable, params. */
  randomize(rng: RNG): PlantParams;
  /** Human readable "param: value" lines for the UI. */
  describe(params: PlantParams): string[];
}

export type ColormapKey =
  | 'viridis'
  | 'inferno'
  | 'magma'
  | 'plasma'
  | 'cividis'
  | 'coolwarm'
  | 'gray'
  | 'heat';
