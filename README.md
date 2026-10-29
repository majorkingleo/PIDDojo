# PID Dojo

A browser dojo for **learning to tune PID controllers** by handing you a plant
to control, a chart to watch, and acceptance criteria to beat.

Phase 1 ships two proportional-control tasks:

| Task | Plant | You control |
| --- | --- | --- |
| **Heated tank** | first-order thermal model | heater duty cycle, 0…1 |
| **Hot-air balloon** | integrating vertical motion with drag | burner intensity, 0…1 |
| **Balloon climb** | same balloon, setpoint ramps at 2 m/s | burner intensity, 0…1 |
| **Cruise control** | car speed with quadratic drag and a hill | throttle, 0…1 |
| **Antenna servo** | second-order rotational plant | motor torque, −1…1 |
| **Level tank** | nonlinear fill/drain (`√h` outflow) | inlet valve, 0…1 |

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
- **Tuning** — opens a dimensioning calculator in its own window, so the help
  page can stay open next to it. Two tabs:
  - *Design* reads the worksheet's model values and acceptance criteria, solves
    for `Kp` for a chosen target offset (or a chosen closed-loop time constant),
    shows the predicted offset / `τ_cl` / full-power phase / settle time, and
    offers the generated code as a **template** — `Insert into editor` puts the
    tuning lines at the cursor.
  - *Sandbox* is an editable copy of that template, starting with an
    auto-updated comment block that lists the worksheet's parameters and the
    derived `K`, `tau`, `dT`. `Test` (or `Ctrl`+`Enter`)
    runs **your** code on the current worksheet with the same loop as the dojo
    (dt = 0.01 s, 5 s inside the band, same `plant`/`debug`), inside a worker
    that is killed after 2 s — so a `while (true)` cannot freeze the window.
    It reports settle / overshoot / steady error / IAE / PASS-FAIL, the
    predicted values next to them, a small sp-pv-u plot and the `debug()`
    output.

  Currently implemented for the heated tank.
- **Help** — opens the task's help page in its own, resizable window with large
  type, so the dojo stays visible next to it. The window follows task, language
  and theme changes and keeps its state across a reload. It has its own `EN/DE`
  picker (which switches the dojo too) and its own text size (`A− / A+`, keys
  `-` `+` `0`, remembered) because the browser zooms both windows together on
  `Ctrl` + scroll.
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
- **`plant`** — a frozen, read-only map of the worksheet's model values:
  the raw plant parameters (`plant.P`, `plant.kLoss`, `plant.C`,
  `plant.T_amb`, …) plus `plant.sp`, `plant.uMin` and `plant.uMax`. A
  controller can therefore dimension itself from the model instead of copying
  numbers out of the scene header:

  ```js
  function control(e, dt, mem) {
    const { P, kLoss, C, T_amb, sp } = plant;
    const Kp = ((sp - T_amb) / 0.2 - 1) / (P / kLoss);  // 0.2 °C offset
    return Kp * e;
  }
  ```

  Code above `control()` runs once per run, so it works as an init block. The
  **⧉ plant** button in the scene header inserts that destructuring line at the
  cursor.
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
help.html              standalone help window (opened by the Help button)
tuning.html            tuning calculator window (opened by the Tuning button)
src/
  main.ts              UI wiring (selects, buttons, editor, chart, save)
  help.ts              entry for help.html: renders the task help page
  helpWindow.ts        opens / syncs that window (task, language, theme)
  tuning.ts            entry for tuning.html: the calculator UI
  tuningWindow.ts      opens / syncs it and receives the generated code
  auxWindow.ts         shared popup geometry for the auxiliary windows
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
    headless.ts        canvas-free run loop (identical numbers to the dojo)
    sandboxWorker.ts   runs the tuning sandbox off the UI thread
    rng.ts             mulberry32 seeded RNG
    tank.ts            heated tank
    balloon.ts         hot-air balloon
  controller/
    compile.ts         user code -> control(e, dt, mem)
    editor.ts          CodeMirror 6 setup
    mathHelp.ts        math/variable help box
    tuningModel.ts     per-task dimensioning math (gain, tau, Kp, settle)
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
node tools/tune.mjs 1200    # 1200 seeds per task with the starter gains
```

All six tasks pass on every seed (worst cases: tank settle 14.6 s of a 30 s
budget, cruise 9.5 s of 30 s with 1.33 km/h of offset on the hill, servo 4.8 s
with 10 % overshoot, level 20.5 s of 25 s, balloon climb 5.5 m of lag).

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
