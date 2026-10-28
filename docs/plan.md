# PID Controller Dojo — Plan

A training dojo for creating and tuning PID controllers, built as a
**TypeScript-based simulation** in the browser.

> **Phase 1 is implemented.** See
> [implementation-plan.md](./implementation-plan.md) for the technical plan,
> the completion checklist and the as-built deviations.

Reuse the build setup, architecture patterns and UI modules from the
`../../field-map/` project (see "What to copy").

The goal of the dojo is **finding the right controller parameters for each
task**.

---

## What to copy from `field-map`

**Reuse (build & architecture):**

- `package.json`, `tsconfig.json`, `vite.config.ts` — strict TypeScript + Vite,
  no framework.
- The pure-state pattern in `state.ts` (`createState` + pure update
  functions) — the "worksheet" model maps naturally onto a state object.
- The `Controller` class pattern in `app.ts` (owns canvases, pointer input,
  rAF scheduling) — reused for the animated task canvas.
- `colormaps.ts` and the dark/light theming in `styles.css` — for heat
  visuals and a consistent look.
- `marked` dependency — already used for Markdown rendering; perfect for the
  per-task **help page**.

**Do NOT copy:** `parser.ts`, `dataset.ts`, `demo.ts` — these are
field-map-specific.

---

## Core concepts

### Task

A task is one simulation scenario with a visual part, e.g.:

- heating a tank
- flying a balloon

Each task has:

- a **visual part** (animated scene, e.g. a heated tank or a flying balloon)
- a **chart** showing what is happening
- a **help page** explaining the rules for determining controller parameters
  (available in English and German, switchable in the header)
- a **formula field** where controller code can be entered
- a **note field**

### Worksheet

When the user starts a task, a variant of the task is created — a
**Worksheet**. The underlying model is adapted with **random but useful**
values.

Each worksheet stores:

- the task id and the generated random start values (plant parameters)
- a **name** the user can give the worksheet
- the controller formula
- the user's notes
- metadata (id, seed, createdAt)

Worksheets are stored on disk so the user can reopen them later.

```ts
interface Worksheet {
  id: string;
  name: string;              // user-chosen label, may be empty
  taskId: string;
  seed: number;              // reproducible randomization
  plantParams: unknown;
  formula: string;
  notes: string;
  createdAt: number;
}
```

### Phases

Tasks are grouped into phases that gate which controller type is allowed:

- **Phase 1 — P controllers**
- **Phase 2 — PI controllers**
- *(Phase 3 — PID controllers, for later tasks such as the balloon which
  benefits from derivative damping.)*

> Note: a pure **P** controller has steady-state error, so Phase 1 tasks must
> have acceptance criteria that do not require zero error. **PI** removes the
> steady-state error. **PID** (derivative) helps damp oscillation.

---

## Architecture

### Simulation vs. rendering

Decouple the physics from the display:

- Physics runs at a **fixed timestep** (`dt`) for stable PID behaviour.
- Rendering runs via `requestAnimationFrame`.

### Plant interface

Tasks are pluggable through a common `Plant` interface:

```ts
interface Plant {
  reset(seed: number): void;
  step(u: number, dt: number): void;   // u = control signal
  measurement(): number;               // sensor output (PV)
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  randomize(rng: RNG): unknown;        // generate worksheet variant params
}
```

### Task registry

```ts
interface TaskDef {
  id: string;              // 'heat-tank', 'balloon'
  phase: 1 | 2 | 3;        // P, PI, PID
  plantFactory: () => Plant;
  help: string;            // markdown
  acceptance: AcceptanceCriteria;
}
```

---

## Controller formula field

- The controller code is **JavaScript** (not a MATLAB parser).
- It is evaluated via `new Function` with injected inputs:
  - `e` — error
  - `de` / `dt` — derivative / timestep
  - `sp` — setpoint
  - `pv` — process value (measurement)
  - `mem` — persistent state object for integral/derivative values
- **Syntax highlighting** is enabled in the formula editor.
- A **help box** lists the available math functions with short descriptions.

Example the user would write:

```js
function control(e, dt, mem) {
  mem.i = (mem.i || 0) + e * dt;
  return Kp * e + Ki * mem.i;
}
```

---

## Chart

- Use a chart **library** (e.g. **uPlot** or **Chart.js**) instead of
  hand-rolling axes/zoom/legends.
- Plot three series: **setpoint**, **process value**, **control effort**.

---

## Acceptance criteria & scoring

"Finding the right parameters" needs a measurable goal. Each task defines
acceptance criteria scored on:

- settle time
- overshoot (%)
- steady-state error
- IAE (integral absolute error)

The UI shows a pass/fail result; the user can retry with a new randomized
variant.

```ts
interface AcceptanceCriteria {
  maxSettleTime: number;
  maxOvershoot: number;      // percent, or null if not applicable
  maxSteadyStateError: number;
}
```

---

## Randomization

- Randomization must be **seeded** so a worksheet is reproducible.
- The seed is stored in the worksheet.
- "Random but useful" = randomizing plant parameters (tank volume, heat loss,
  balloon buoyancy, ...) within ranges that keep the problem solvable for the
  current phase.

```ts
interface RNG {
  next(): number;            // [0,1)
  nextRange(min: number, max: number): number;
}
```

---

## Persistence

Worksheets are stored on disk and can be reopened later.

- **File System Access API** (Chromium): real read/write to a user-chosen
  folder — primary storage.
- **IndexedDB** as an automatic cache/fallback so worksheets survive page
  reloads without re-picking the folder.

---

## Project structure

```
pid-dojo/
  src/
    main.ts            # UI wiring
    state.ts           # app + worksheet state (pure functions)
    app.ts             # controller / rAF loop
    i18n.ts            # EN/DE help texts + math reference
    simulation/
      plant.ts         # Plant interface
      tank.ts
      balloon.ts
      rng.ts           # seeded RNG
    controller/
      compile.ts       # user formula -> function
      highlight.ts     # syntax highlighting
      mathHelp.ts      # available math functions + descriptions
    chart.ts
    persistence.ts     # File System Access API + IndexedDB
    tasks.ts           # task registry
    styles.css
  docs/
    plan.md
```

---

## Ideas for tasks

- flying a balloon
- heating a tank

## Phases

- Phase 1 — P controllers
- Phase 2 — PI controllers
- Phase 3 — PID controllers (later)




