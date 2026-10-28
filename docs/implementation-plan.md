# PID Dojo — Phase 1 Implementation Plan

This document is a **detailed implementation plan** for another agent to
build **Phase 1** of the PID Controller Dojo.

Phase 1 scope:

- **P controllers only** (proportional gain, steady-state error is allowed).
- Two tasks: **heating a tank** and **flying a balloon**.
- Full infrastructure: animation, chart, formula editor with syntax
  highlighting + math help box, notes, help page, worksheet persistence.

Read `plan.md` first for the overall vision; this document adds the concrete
technical decisions and a file-by-file breakdown.

> **Status: implemented (Phase 1 complete).**
> Everything in §13 and §14 is done. §16 lists the few places where the build
> deliberately deviates from this plan, and why.

---

## 1. Technology decisions (locked in)

| Concern | Decision |
|---|---|
| Language | TypeScript, strict mode |
| Bundler / dev server | Vite (standard `index.html` entry, not the static Apache build of `field-map`) |
| UI framework | None — vanilla TS + DOM, matching `field-map` |
| Chart | **uPlot** (tiny, fast, built for streaming time series) |
| Formula editor + syntax highlighting | **CodeMirror 6** (`@codemirror/lang-javascript`) |
| Markdown (help page) | **marked** (already used in `field-map`) |
| Persistence | **File System Access API** (primary) + **IndexedDB** (cache/fallback) |
| RNG | **mulberry32** (seeded, deterministic) |
| Simulation | Fixed timestep `dt = 0.01 s` (100 Hz), decoupled from rendering |

Base setup (package manager, tsconfig strictness, state/controller patterns,
colormaps, theming, `marked`) is copied from `../../field-map/`.

---

## 2. Project scaffold

Create the folder structure below under `pid-dojo/` (sibling of `docs/`):

```
pid-dojo/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.ts            # DOM wiring, app bootstrap
    app.ts             # DojoController: canvas, rAF loop, orchestration
    state.ts           # app + worksheet + run state (pure functions)
    types.ts           # shared types
    i18n.ts            # EN/DE catalogue: task help pages + math reference
    styles.css         # layout + theme (extend field-map styles)
    simulation/
      plant.ts         # Plant + RNG interfaces, PlantParams type
      rng.ts           # mulberry32 seeded RNG
      tank.ts          # heated tank plant
      balloon.ts       # balloon plant
    controller/
      compile.ts       # user code -> control(e, dt, mem) function
      editor.ts        # CodeMirror 6 setup + highlighting
      mathHelp.ts      # list of available math functions + descriptions
    chart.ts           # uPlot wrapper (setpoint / PV / control effort)
    persistence.ts     # IndexedDB + File System Access API
    tasks.ts           # task registry + acceptance evaluation
  docs/
    plan.md
    implementation-plan.md   # this file
```

### Copy from `field-map`

- `tsconfig.json` verbatim (then add the files below under `include`).
- `vite.config.ts` — but switch to a **standard** config (see §3).
- `src/styles.css` as a base; extend with the dojo layout classes.
- The pure-state style of `src/state.ts` and the `Controller` class style of
  `src/app.ts` (reimplemented for the dojo, not copied verbatim).

### Do NOT copy

`parser.ts`, `dataset.ts`, `demo.ts` (field-map-specific).

---

## 3. Build configuration

### `package.json`

```json
{
  "name": "pid-dojo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  },
  "dependencies": {
    "marked": "^18.0.11",
    "uplot": "^1.6.31",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.26.0",
    "@codemirror/language": "^6.10.0",
    "@codemirror/commands": "^6.5.0",
    "@codemirror/lang-javascript": "^6.2.0",
    "@codemirror/theme-one-dark": "^6.1.0"
  }
}
```

### `vite.config.ts` (standard)

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
});
```

### `tsconfig.json`

Keep the strict options from `field-map`; set `"include": ["src"]`.

### Run

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + production build
```

---

## 4. Data model (`types.ts`)

Define all shared types here:

```ts
export type Phase = 1 | 2 | 3;

/** Persistent worksheet, stored to disk. */
export interface Worksheet {
  id: string;              // uuid
  taskId: string;          // 'tank' | 'balloon'
  phase: Phase;
  seed: number;            // reproducible randomization
  plantParams: PlantParams; // task-specific randomized model
  formula: string;         // user's control() code
  notes: string;
  createdAt: number;       // Date.now()
}

export interface PlantParams {
  [key: string]: number;   // flat, JSON-serializable
}

/** One sample of the simulation history (for the chart). */
export interface Sample {
  t: number;     // seconds
  sp: number;    // setpoint
  pv: number;    // process value
  u: number;     // control effort
}

export type RunStatus = 'idle' | 'running' | 'settled' | 'failed' | 'error';

export interface RunState {
  status: RunStatus;
  time: number;            // current simulation time (s)
  history: Sample[];       // ring buffer, cap at N samples
  error: string | null;    // compile/runtime error message
}

export interface Metrics {
  settleTime: number | null;   // s (null if never settled)
  overshootPct: number | null; // % (null if not applicable)
  steadyStateError: number;    // mean |e| over last 5 s
  iae: number;                 // integral of |e| dt
}

export interface AcceptanceCriteria {
  maxSettleTime: number;       // s
  maxOvershootPct: number | null; // null = not applicable
  maxSteadyStateError: number;
  maxRunTime: number;          // stop evaluation after this many seconds
}

export interface TaskDef {
  id: string;
  title: string;
  phase: Phase;
  /** Factory that returns a fresh plant (un-randomized). */
  plantFactory: () => Plant;
  /** Markdown help page, one document per language (§17). */
  help: Localized;             // Record<Lang, string>
  acceptance: AcceptanceCriteria;
  setpoint: number;            // target value (step response)
  uMin: number;                // control limits
  uMax: number;
  unit: string;                // °C / m — chart axis + metric labels
  starterFormula: string;      // template placed in the editor
}

export interface RNG {
  next(): number;              // [0,1)
  nextRange(min: number, max: number): number;
}

export interface Plant {
  /** Set params from a worksheet and reset to initial conditions. */
  configure(params: PlantParams, setpoint: number): void;
  reset(): void;
  /** Advance physics by dt seconds with control signal u (already clamped). */
  step(u: number, dt: number): void;
  /** Sensor output = process value. */
  measurement(): number;
  /** Draw the animated scene onto ctx (canvas already sized w x h). */
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** Produce randomized (but useful) params; rng is the seeded RNG. */
  randomize(rng: RNG): PlantParams;
  /** Human-readable param labels for the UI (optional). */
  describe(params: PlantParams): string[];
}
```

---

## 5. Seeded RNG (`simulation/rng.ts`)

Implement **mulberry32**:

```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Wrap it in a class or factory that implements the `RNG` interface
(`next()` + `nextRange(min, max)`). **All plant randomization must use this
RNG**, never `Math.random()`, so worksheets are reproducible.

---

## 6. Plants

Both plants implement the `Plant` interface. Use `dt`-invariant physics
(no dependence on frame rate).

### 6.1 Heated tank (`simulation/tank.ts`)

First-order thermal model with heater and heat loss to ambient.

```
dT/dt = ( P * u - kLoss * (T - T_amb) ) / C
```

- `T` = tank temperature (°C), the process value.
- `u` = heater duty cycle, clamped to `[0, 1]`.
- `P` = heater power (W).
- `kLoss` = heat-loss coefficient (W/°C).
- `C` = thermal capacity (J/°C).
- `T_amb` = ambient temperature (°C).

Randomized params **as built** (the ranges below were tuned with
`tools/tune.mjs` so that the task stays solvable inside the 30 s budget —
the original `C = 2000..6000 J/°C` made heating take minutes):

| param | range | note |
|---|---|---|
| `T_amb` | 15 .. 25 | ambient temperature |
| `kLoss` | 10 .. 35 | heat-loss coefficient [W/°C] |
| `C` | `kLoss × tau`, `tau ∈ 10..16 s` | thermal capacity, derived |
| `uHold` | 0.4 .. 0.65 | duty cycle at the setpoint, derived |
| `P` | `kLoss × (sp − T_amb) / uHold` | heater power, derived |
| `T0` (initial temp) | = `T_amb` | |

Setpoint: `55 .. 80` °C (also randomized, stored in params).

> Dynamics note: the plant is integrated **exactly** (`T ← T_ss + (T − T_ss)·e^{−dt/τ}`)
> so the result does not depend on the timestep.

`render(ctx, w, h)`: draw a tank whose fill color maps temperature to a
heat colormap (reuse `colormaps.ts` from `field-map`), plus a thermometer /
numeric readout.

### 6.2 Flying balloon (`simulation/balloon.ts`)

Vertical 1-D motion with buoyancy, gravity, drag and a burner.

```
F = B0 * (1 + B_gain * u) - m * g - kDrag * v
a = F / m
v += a * dt
h += v * dt
```

- `h` = altitude (m), the process value.
- `v` = vertical velocity (m/s).
- `u` = burner intensity, clamped to `[0, 1]`.
- `B0` = base buoyancy force at zero burner (N).
- `B_gain` = extra buoyancy per unit burner (N).
- `m` = total mass (kg).
- `g` = 9.81 m/s².
- `kDrag` = drag coefficient (N·s/m) — large enough to make altitude
  stable under P control with an offset (see below).

Randomized params **as built** (derived from the mass so the closed loop is
always well damped under P control):

| param | range | note |
|---|---|---|
| `m` | 180 .. 320 | total mass [kg] |
| `B0` | `m·g × 0.90..0.97` | buoyancy with the burner off (sinks slowly) |
| `B_gain` | `m·g × 0.80..1.20` | burner authority |
| `kDrag` | `(B0 + B_gain − m·g) / v_climb`, `v_climb ∈ 8..14 m/s` | sized for the terminal climb speed |
| `h0` (initial) | 0 | |

Setpoint: `100 .. 300` m (randomized).

> Dynamics note for the implementing agent: altitude is an **integrating
> process** (velocity → altitude). With sufficient drag it is stable under P
> control but settles at a non-zero offset from the setpoint. Phase 1
> acceptance criteria must therefore allow a steady-state error (offset), not
> require exact altitude.

`render(ctx, w, h)`: draw sky, a balloon (altitude mapped to canvas y), and a
ground/altitude scale. Use smooth vertical movement.

---

## 7. Controller compilation (`controller/compile.ts`)

The user writes a **complete JavaScript function named `control`** with this
signature:

```js
function control(e, dt, mem) {
  // e  = error = setpoint - process value
  // dt = simulation timestep (s)
  // mem = persistent object, survives across timesteps, reset each run
  const Kp = 2;
  return Kp * e;
}
```

Contract:

- Signature: `control(e, dt, mem)`.
- Return value: a finite number → control effort (clamped by the runner).
- `mem` is created fresh as `{}` at run start; the user can store integral
  (`mem.i`), previous error (`mem.prevE`), etc.
- The runner additionally sets, before each call: `mem.sp` (setpoint),
  `mem.pv` (current measurement), `mem.prevE` (previous error), `mem.t`
  (current time) — document these in the help box.
- `Math` and standard JS globals are available. `Math.random` should be
  discouraged in the help text (non-reproducible).

Implementation:

```ts
export interface CompiledController {
  (e: number, dt: number, mem: Record<string, number>): number;
}

export function compileController(source: string): CompiledController {
  // Wrap: append `; return control;` so the factory returns the user's fn.
  const factory = new Function(source + '\n; return control;');
  const control = factory();
  if (typeof control !== 'function') {
    throw new Error('Code must define a function named `control(e, dt, mem)`.');
  }
  return control;
}
```

Catch compile errors (`new Function` throws a `SyntaxError`) and show them in
the UI. At run time, wrap each `control(...)` call in `try/catch` and stop the
run with the error message on failure.

### Editor + syntax highlighting (`controller/editor.ts`)

Use CodeMirror 6:

- Extensions: `basicSetup` (from `codemirror` meta package or assemble from
  `@codemirror/commands` + `@codemirror/language`), `javascript()`,
  `oneDark` (theme).
- Set the initial document to the P-controller template (§7 example).
- Expose `getValue()` / `setValue()`.

### Math help box (`controller/mathHelp.ts`)

Export a data array of `{ name: string; description: string }` and render it
as a collapsible list next to the editor. Include:

- Injected variables: `e`, `dt`, `mem`, `mem.sp`, `mem.pv`, `mem.prevE`,
  `mem.t`, `mem.i`.
- `Math` functions: `abs`, `min`, `max`, `sign`, `pow`, `sqrt`, `exp`,
  `log`, `log10`, `sin`, `cos`, `tan`, `atan`, `atan2`, `round`, `floor`,
  `ceil`, `trunc`.
- Constants: `Math.PI`, `Math.E`.
- A note that `u` is clamped to `[0,1]` and `Math.random` breaks
  reproducibility.

---

## 8. Chart (`chart.ts`)

Wrap uPlot to stream three series over time `t`:

1. `sp` (setpoint) — dashed reference line
2. `pv` (process value) — solid line
3. `u` (control effort) — secondary line (optionally on a right axis, or
   scaled; for Phase 1 use one axis, `u ∈ [0,1]` drawn with a different color)

> **As built:** `u` gets its own right-hand axis (`scales.u = [0,1]`). On a
> shared axis `u` would be a flat line at the bottom and unreadable. uPlot's
> built-in legend is disabled; the panel head carries a static legend instead
> (uPlot's legend would be clipped by the fixed-height host).

Requirements:

- Real-time append of samples (call `uPlot.addData` / set data arrays).
- Legend showing the three series.
- Cap history at e.g. 60 s (ring buffer; drop oldest samples) so the chart
  scrolls.
- Resize with the container (use `ResizeObserver`).

Keep the wrapper minimal:

```ts
export class Chart {
  constructor(container: HTMLElement);
  reset(): void;
  append(t: number, sp: number, pv: number, u: number): void;
}
```

---

## 9. Simulation loop (`app.ts` — `DojoController`)

Fixed-timestep physics, rAF rendering.

```
rAF(frame):
  realElapsed = now - lastFrame
  lastFrame = now
  if status == 'running':
    accumulator += realElapsed
    while accumulator >= dt and stepsThisFrame < MAX_STEPS:
      plant.step(clamp(control(e, dt, mem)), dt)
      record sample (every sampleStep, e.g. every 5 steps)
      accumulator -= dt
      stepsThisFrame++
    if t >= acceptance.maxRunTime: finalize()
  plant.render(ctx, w, h)
  chart.update()
```

- `dt = 0.01`, `MAX_STEPS = 500` per frame (avoid spiral of death).
- Record a `Sample` every `0.05 s` (i.e. every 5 physics steps) to bound
  memory.
- After each step, check settle condition (§11) to stop early.

Run lifecycle:

- **Start**: compile the formula; reset plant + `mem` + history; set status
  `running`.
- **Reset**: re-run from initial conditions with the same worksheet (keep
  formula/params).
- **New variant**: generate new seed + params → new `Worksheet`.
- **Stop**: freeze, keep history.
- On error (compile/runtime): status `error`, show message.

---

## 10. Persistence (`persistence.ts`)

Two layers:

1. **IndexedDB** — database `pid-dojo`, object store `worksheets` (keyPath
   `id`; renamed from `workbooks` in v2, which copies the old rows once).
   Always used; caches the worksheet list and autosaves notes/formula.
2. **File System Access API** — primary "disk" storage:
   - `pickDirectory()` → `showDirectoryPicker()` (persist the handle in
     IndexedDB so it can be re-used silently).
   - Save worksheet as `<id>.json` in the picked directory
     (`getFileHandle(id + '.json', { create: true })` + `createWritable`).
   - Load: list `*.json` in the directory, or open a single file with
     `showOpenFilePicker`.
   - Detect availability (`'showDirectoryPicker' in window`); if unavailable,
     fall back to IndexedDB only + a manual **Export / Import JSON** button.

Also add a **Export JSON** button always available (downloads a worksheet
file), for browsers without the File System Access API.

API surface:

```ts
export async function listWorksheets(): Promise<Worksheet[]>;
export async function saveWorksheet(wb: Worksheet): Promise<void>;
export async function deleteWorksheet(id: string): Promise<void>;
export async function pickStorageDirectory(): Promise<void>;
export function exportWorksheet(wb: Worksheet): void;
```

---

## 11. Task registry & acceptance (`tasks.ts`)

Export:

```ts
export const TASKS: TaskDef[] = [tankTask(), balloonTask()];
export function createWorksheet(task: TaskDef, seed: number): Worksheet;
export function evaluateRun(
  task: TaskDef,
  history: Sample[],
  time: number,
): Metrics;
export function passed(task: TaskDef, m: Metrics): boolean;
```

### Metrics computation (`evaluateRun`)

- `settleTime`: first time after which `|pv - sp| <= band` and stays within
  `band` for the remainder (band = `2 * maxSteadyStateError`). `null` if never.
- `overshootPct`: `100 * (max(pv) - sp) / sp` if `sp > 0`, else `null`.
  Only meaningful when `pv` starts below `sp` (both Phase 1 tasks do).
- `steadyStateError`: mean `|e|` over the **last 5 s** of the run.
- `iae`: `Σ |e| · dt` over the whole run.

### Pass condition

`passed` = `settleTime != null && settleTime <= maxSettleTime &&
steadyStateError <= maxSteadyStateError` and (`maxOvershootPct == null ||
overshootPct <= maxOvershootPct`).

### Phase 1 criteria (validated with `tools/tune.mjs`)

| Task | maxSettleTime | maxOvershootPct | maxSteadyStateError | maxRunTime |
|---|---|---|---|---|
| Tank | 30 s | 20 % | 1.5 °C | 60 s |
| Balloon | 40 s | null (offset allowed) | 15 m (offset band) | 90 s |

`node tools/tune.mjs 500` sweeps 500 seeds per task with the starter formulas
(tank `Kp = 4`, balloon `Kp = 0.05`); all 1000 runs pass. Worst cases:
tank 14.2 s / 0 % / 0.28 °C, balloon 33.0 s / 9.7 % / 7.65 m.

> **As built:** the run also stops early once `|e| ≤ maxSteadyStateError`
> has held for 5 s (see `SETTLE_HOLD` in `app.ts`), so a settled run does not
> sit at the `maxRunTime` wall. Metrics are then computed over the history
> collected up to that point.

> The tank is first-order (overshoot only from large Kp), the balloon is
> integrating with drag (offset expected). Both criteria intentionally allow
> steady-state error, as required for Phase 1 P control.

---

## 12. UI layout (`index.html` + `styles.css` + `main.ts`)

Single-page layout, CSS grid:

```
+-----------------------------------------------------------+
| Header: PID Dojo | Task | Worksheet | Lang | New variant  |
+----------------+------------------+-----------------------+
| Task canvas    | Chart (uPlot)    | Help panel (marked)   |
| (animation)    | sp/pv/u          | (toggleable, EN/DE)   |
+----------------+------------------+-----------------------+
| Formula editor (CodeMirror)         | Math help box        |
| Run | Reset | Stop                  | Notes textarea        |
| Metrics: settle / overshoot / error | PASS / FAIL badge    |
+-----------------------------------------------------------+
```

`main.ts` responsibilities:

- Render the task list (from `TASKS`), phase filter.
- On "start task": create/load worksheet, build the plant, start the run.
- Wire buttons (Run / Reset / Stop / New variant / Save / Export / Import).
- Render the help panel with `marked.parse(help)`.
- Show metrics + pass/fail badge after a run finishes.
- Autosave notes + formula to IndexedDB on input (debounced).
- Re-render the help panel + math box when the language changes (§17).

Theme: reuse the dark/light theming from `field-map` (`styles.css`), persist
theme choice in `localStorage`.

---

## 13. Implementation order (for the implementing agent)

- [x] 1. **Scaffold** — `package.json`, `tsconfig.json`, `vite.config.ts`,
      `index.html`, `npm install` (31 packages).
- [x] 2. **Types & RNG** — `types.ts`, `simulation/rng.ts`.
- [x] 3. **Plants** — `simulation/plant.ts`, `tank.ts`, `balloon.ts`, validated
      over 500 seeds with `tools/tune.mjs`.
- [x] 4. **Compile** — `controller/compile.ts` + `mathHelp.ts`.
- [x] 5. **Simulation loop + canvas** — `app.ts`, `state.ts`.
- [x] 6. **Chart** — `chart.ts` (uPlot, dual axis, theme aware).
- [x] 7. **Editor UI** — `controller/editor.ts` (CodeMirror 6) wired in.
- [x] 8. **Task registry + acceptance** — `tasks.ts`; metrics + PASS/FAIL.
- [x] 9. **Persistence** — `persistence.ts` (IndexedDB + File System Access
      API + export/import).
- [x] 10. **Polish** — help panel (marked), math help box, theming, error
      display, static chart legend, responsive layout.

---

## 14. Validation checklist (Definition of Done for Phase 1)

- [x] `npm run typecheck` passes with no errors.
- [x] `npm run build` succeeds (app chunk ~34 kB; CodeMirror/uPlot/marked
      are split into their own vendor chunks).
- [x] Tank task: a `Kp` in the suggested range drives temperature to the
      setpoint with an allowed offset; metrics and PASS/FAIL compute.
- [x] Balloon task: P control stabilizes altitude (with offset) inside the
      allowed band; no runaway/NaN values.
- [x] Chart streams sp/pv/u in real time and scrolls.
- [x] Formula editor has JS syntax highlighting; a syntax error is shown
      in the UI, not the console only.
- [x] Math help box lists functions and injected variables.
- [x] Notes and formula autosave and survive a reload (IndexedDB), and the
      last opened worksheet is restored.
- [x] A worksheet can be saved to disk (File System Access API) and reopened;
      re-running with the same seed reproduces the same plant.
      *The folder picker is a native dialog and cannot be automated — the
      write path is exercised best-effort on every save and needs one manual
      click on "Folder…" in a Chromium window.*
- [x] Help page renders Markdown.
- [x] Help page and math/variable reference switch between **English and
      German** via the header dropdown, and the choice survives a reload (§17).
- [x] New variant creates a different but solvable plant (same seed ⇒ same
      result; verified in the 500-seed sweep).

---

## 15. Open decisions (resolved during Phase 1)

- **Acceptance thresholds** — unchanged. `tools/tune.mjs` sweeps 500 seeds per
  task with the starter formulas and everything passes; the *plant ranges*
  were adjusted instead (§16, rows 1–2).
- **Balloon "u bias" in the template** — not needed. `u_hold` is small but
  non-zero for every seed, so a plain `Kp·e` reaches the band with an offset.
- **uPlot axis for `u ∈ [0,1]`** — done in Phase 1 rather than Phase 2; `u`
  has its own right-hand axis (§8).

---

## 16. Deviations from this plan (as built)

Everything above is implemented; these are the deliberate differences.

| # | Plan said | Built | Why |
|---|---|---|---|
| 1 | Tank `C = 2000..6000 J/°C`, `P = 800..2000 W`, `kLoss = 8..30` | `kLoss = 10..35`, `C = kLoss × (10..16 s)`, `P` derived from a target holding duty | The original ranges need minutes to heat up — the 30 s settle budget was unreachable |
| 2 | Balloon `B0 = 1800..2800`, `B_gain = 600..1200`, `kDrag = 40..120` | all three derived from `m·g` and a target climb speed | Keeps the closed loop damped (`ζ ≈ 0.4…0.6`) for every seed, and makes `u_hold` small but non-zero in every variant |
| 3 | Tank integrated with explicit Euler | exact exponential update for constant `u` | dt-invariant, no numerical blow-up for large `Kp` |
| 4 | Chart on a single y-axis | `u` on a secondary right axis (0…1) | on one axis `u` is an unreadable flat line; plan §15 already flagged this |
| 5 | uPlot's own legend | static legend in the panel head, uPlot legend disabled | uPlot's legend is clipped by the fixed-height chart host |
| 6 | `basicSetup` from the `codemirror` meta package | assembled from the individual `@codemirror/*` packages | avoids an extra dependency; only the extensions we need are included |
| 7 | `Worksheet`/`TaskDef` per §4 | added `TaskDef.unit` and `TaskDef.starterFormula` | the chart axis, metric labels and editor template all need them |
| 8 | Run for `maxRunTime`, then evaluate | stop early after `\|e\| ≤ maxSteadyStateError` holds for 5 s | a settled run should report immediately instead of idling at the wall |
| 9 | §15: "tune thresholds after manual testing" | thresholds unchanged, validated by `tools/tune.mjs` (500 seeds/task, all pass) | the starter `Kp` values now pass on every seed, so the ranges — not the thresholds — were adjusted |
| 10 | `overshootPct = 100·(max(pv) − sp)/sp` | clamped at 0 for values below the setpoint | avoids "-0.1 %" noise in the UI |
| 11 | "workbook" as the unit of work | renamed to **worksheet** everywhere: UI label, `Worksheet` type, `saveWorksheet()`/`listWorksheets()`/…, IndexedDB store `worksheets`, `pid-dojo-worksheet` key | consistent naming; DB v2 copies rows from the old `workbooks` store once, so existing local data survives |

Known limitation: `File System Access API` writes only run when a folder has
been picked and permission is still granted; silently skipped otherwise
(IndexedDB always has the copy).

---

## 17. Localization (EN / DE)

The learning content ships in **English and German**. A small **Lang**
dropdown in the header switches it; the choice is stored in `localStorage`
(`pid-dojo-lang`) and re-applied on the next start.

### Scope

Translated:

- the per-task help page — `TaskDef.help` is a `Record<Lang, string>` of
  markdown documents,
- the math / variable reference — group titles **and** every entry,
- the help chrome: both panel headings and the show/hide button.

Deliberately **not** translated: the formula editor and its starter code,
the metric names (settle / overshoot / steady-state error / IAE), the
PASS/FAIL verdict, and the task / worksheet controls. Keeping the tuning
vocabulary in one language means `Kp` and "settle time" always mean the same
thing, and switching the reader language never touches a worksheet.

### Implementation

| File | Change |
|---|---|
| `types.ts` | `Lang = 'en' \| 'de'`, `Localized = Record<Lang, string>`, `TaskDef.help: Localized` |
| `i18n.ts` *(new)* | `LANGS`, `UI_TEXT`, `MATH_HELP: Record<Lang, HelpGroup[]>`, `TANK_HELP` + `BALLOON_HELP`, `detectLang()` / `saveLang()` |
| `controller/mathHelp.ts` | reduced to a renderer: `renderMathHelp(container, lang)` |
| `tasks.ts` | imports the help documents instead of owning them |
| `main.ts` | fills `#lang-select`, `applyLang()` re-renders help + math box, `<html lang>` follows |
| `index.html` | `#lang-select` in the header, ids on the two help headings |

Language resolution order: stored choice → `navigator.language(s)` → English.
Changing the language re-renders only the two help surfaces; the simulation,
the editor content and the worksheet are untouched.

### Adding a language

1. Extend `Lang` in `types.ts` (e.g. `'fr'`).
2. Add an entry to `LANGS` and translate `UI_TEXT`, `MATH_HELP`,
   `TANK_HELP`, `BALLOON_HELP` in `i18n.ts`.
3. Nothing else — because `TaskDef.help` is a `Record`, the compiler points
   at every missing translation.

Checklist:

- [x] `#lang-select` switches help page + math box without touching the
      worksheet or the running simulation.
- [x] Choice survives a reload (`localStorage`), `<html lang>` follows.
- [x] Both tasks and all four math groups have German text.
- [x] German help keeps the formulas, tables and acceptance numbers intact
      (translation only, no content drift).


