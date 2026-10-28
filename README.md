# PID Dojo

A browser dojo for **learning to tune PID controllers** by handing you a plant
to control, a chart to watch, and acceptance criteria to beat.

Phase 1 ships two proportional-control tasks:

| Task | Plant | You control |
| --- | --- | --- |
| **Heated tank** | first-order thermal model | heater duty cycle, 0…1 |
| **Hot-air balloon** | integrating vertical motion with drag | burner intensity, 0…1 |

Each task is randomised — but reproducibly, from a stored seed — into a
**worksheet**: plant parameters, the setpoint, your formula and your notes.

## Quick start

```sh
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```sh
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production bundle in dist/
npm run preview     # serve the production build
```

## Using the dojo

- **Task / Worksheet** — pick a scenario, or reopen one of your saved worksheets.
- **Worksheet name** — the text field next to the worksheet selector gives the
  current worksheet a custom name (saved automatically, shown in the dropdown
  as `name · seed`, and used for exported file names).
- **Lang** — switches the help page and the math/variable reference between
  English and German (stored, so it survives a reload). Code, metrics and
  verdict intentionally stay in English.
- **New variant** — a fresh randomised (but always solvable) plant.
- **Run / Reset / Stop** — *Reset* re-runs the same plant from its initial
  state; `Ctrl`/`Cmd` + `Enter` also starts a run.
- **Controller** — JavaScript, evaluated with `new Function`. Write a function
  named `control`:

  ```js
  function control(e, dt, mem) {
    // e = setpoint - pv, dt = 0.01 s, mem = persistent object
    const Kp = 4;
    return Kp * e;
  }
  ```

  The runner injects `mem.sp`, `mem.pv`, `mem.prevE`, `mem.t` before every
  call and clamps your return value to the actuator range. `mem` is fresh for
  every run, so `mem.i` (integral) and friends are safe to use in later phases.
- **Debug log** — call `debug(value…)` or `log(value…)` inside `control()`;
  the lines appear in the *Debug log* tab next to the editor, stamped with the
  simulation time. Output is capped at 500 lines per run.
- **Metrics** — settle time, overshoot, steady-state |error| and IAE, plus a
  PASS / FAIL verdict against the task's acceptance criteria. A run stops
  early once the error has stayed inside the tolerance band for 5 s.
- **Notes / formula** autosave to IndexedDB; **Export / Import** move a
  worksheet as JSON; **Folder…** picks a directory (File System Access API) and
  writes every worksheet there as `<id>.json`.

## Project layout

```
index.html
src/
  main.ts              UI wiring (selects, buttons, editor, chart, save)
  app.ts               DojoController: 100 Hz physics loop + rAF rendering
  state.ts             run state + worksheet helpers
  types.ts             shared contracts (Worksheet, Plant, TaskDef, Metrics…)
  i18n.ts              EN/DE catalogues: task help pages + math reference
  tasks.ts             task registry, worksheet factory, metrics, acceptance
  chart.ts             uPlot wrapper (setpoint / pv / u on a second axis)
  persistence.ts       IndexedDB + File System Access API + export/import
  colormaps.ts         colour maps for the scenes
  styles.css           layout + dark/light theme
  simulation/
    plant.ts           shared types + numeric helpers
    rng.ts             mulberry32 seeded RNG
    tank.ts            heated tank
    balloon.ts         hot-air balloon
  controller/
    compile.ts         user code -> control(e, dt, mem)
    editor.ts          CodeMirror 6 setup
    mathHelp.ts        math/variable help box
tools/
  tune.mjs             headless acceptance sweep over random seeds
docs/
  plan.md              vision
  implementation-plan.md  Phase 1 technical plan (with build status)
```

## Validating the tasks

`tools/tune.mjs` mirrors the shipped physics and acceptance logic, so the
thresholds can be checked without a browser:

```sh
node tools/tune.mjs 500    # 500 seeds per task with the starter formulas
```

Both tasks currently pass on all seeds (worst tank settle 14.2 s of a 30 s
budget; worst balloon settle 33.0 s of 40 s).

## Phase plan

- **Phase 1 — P controllers** (this release): offset is expected and allowed.
- **Phase 2 — PI controllers**: the integral term removes the offset.
- **Phase 3 — PID controllers**: derivative damping, e.g. for the balloon.

## Vibecoded

This project was written with AI assistance.

- **Model:** DeepSeek V4.1 Flash
- **Tool:** GitHub Copilot Chat in Visual Studio Code 1.143.1
- **Model provider extension:** DeepSeek V4 for Copilot 0.9.4
  (`vizards.deepseek-v4-for-copilot`)

Libraries: TypeScript 5.5, Vite 5.4, uPlot 1.6, CodeMirror 6, marked 18.
