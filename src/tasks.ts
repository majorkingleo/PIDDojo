// ---------------------------------------------------------------------------
// Task registry, workbook creation and acceptance evaluation.
// ---------------------------------------------------------------------------

import type { Metrics, Sample, TaskDef, Workbook } from './types';
import { TankPlant } from './simulation/tank';
import { BalloonPlant } from './simulation/balloon';
import { createRng } from './simulation/rng';
import { newId } from './state';

const TANK_HELP = `
## Heated tank

A tank is heated by an electric heater and loses heat to the room.
Your job: hold the water temperature at the setpoint with a
**P controller**.

### Model

\`\`\`
dT/dt = ( P·u − k_loss·(T − T_amb) ) / C
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | heater duty cycle, 0…1 (your return value, clamped) |
| \`P\` | heater power [W] |
| \`k_loss\` | heat-loss coefficient [W/°C] |
| \`C\` | thermal capacity [J/°C] |
| \`T_amb\` | ambient temperature [°C] |

### What you control

Your function receives \`e = setpoint − T\` and returns \`u\`.
Start with \`u = Kp·e\`.

- Too small **Kp** → slow approach.
- Too large **Kp** → the heater saturates at 100 % and overshoots.

### Phase 1: proportional only

A P controller can never reach the setpoint exactly: at equilibrium the
heater must supply the standing loss, so

\`\`\`
offset = u_hold / Kp
\`\`\`

That offset is **allowed** — keep it below the tolerance shown in the
acceptance criteria. The integral term that removes it comes in Phase 2.

### Acceptance

- settle time ≤ **30 s**
- overshoot ≤ **20 %**
- steady-state |error| ≤ **1.5 °C**
`;

const BALLOON_HELP = `
## Hot-air balloon

A balloon has to hold an altitude. The burner adds buoyancy, drag damps
the motion, and gravity pulls the whole thing down.

### Model

\`\`\`
F = B0 + B_gain·u − m·g − k_drag·v
a = F / m          v += a·dt          h += v·dt
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | burner intensity, 0…1 (your return value, clamped) |
| \`B0\` | buoyancy with the burner off [N] |
| \`B_gain\` | extra buoyancy at full burner [N] |
| \`m\` | total mass [kg] |
| \`k_drag\` | drag [N·s/m] |

### What you control

Your function receives \`e = setpoint − h\` and returns \`u\`.

This is an **integrating** plant: the burner sets the *climb rate*, and the
climb rate sets the altitude. Under P control it behaves like a damped
second-order system — stable, but with a real offset:

\`\`\`
offset = u_hold / Kp        u_hold ≈ (m·g − B0) / B_gain
\`\`\`

\`u\` is usually tiny (a few percent), so **Kp must be much smaller than for
the tank** — start around \`0.05\`.

### Phase 1: proportional only

Offset is allowed and expected. Get the balloon into the altitude band and
keep it there; damping comes with the D term in Phase 3.

### Acceptance

- settle time ≤ **40 s**
- steady-state |error| ≤ **15 m** (the offset band)
- overshoot is not scored here
`;

const TANK_STARTER = `// Heated tank — Phase 1: P controller
// e = setpoint - T   (temperature error, °C)
// dt = 0.01 s        mem = persistent object
function control(e, dt, mem) {
  const Kp = 4;          // try 1 … 20
  return Kp * e;
}
`;

const BALLOON_STARTER = `// Hot-air balloon — Phase 1: P controller
// e = setpoint - h   (altitude error, m)
// u_hold is small, so Kp has to be small too.
function control(e, dt, mem) {
  const Kp = 0.05;       // try 0.01 … 0.2
  return Kp * e;
}
`;

function tankTask(): TaskDef {
  return {
    id: 'tank',
    title: 'Heated tank',
    phase: 1,
    plantFactory: () => new TankPlant(),
    help: TANK_HELP,
    acceptance: {
      maxSettleTime: 30,
      maxOvershootPct: 20,
      maxSteadyStateError: 1.5,
      maxRunTime: 60,
    },
    setpoint: 65,
    uMin: 0,
    uMax: 1,
    unit: '°C',
    starterFormula: TANK_STARTER,
  };
}

function balloonTask(): TaskDef {
  return {
    id: 'balloon',
    title: 'Hot-air balloon',
    phase: 1,
    plantFactory: () => new BalloonPlant(),
    help: BALLOON_HELP,
    acceptance: {
      maxSettleTime: 40,
      maxOvershootPct: null,
      maxSteadyStateError: 15,
      maxRunTime: 90,
    },
    setpoint: 150,
    uMin: 0,
    uMax: 1,
    unit: 'm',
    starterFormula: BALLOON_STARTER,
  };
}

export const TASKS: TaskDef[] = [tankTask(), balloonTask()];

export function findTask(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}

/** Create a workbook with a freshly randomised (but solvable) plant. */
export function createWorkbook(task: TaskDef, seed: number): Workbook {
  const rng = createRng(seed);
  const params = task.plantFactory().randomize(rng);
  return {
    id: newId(),
    taskId: task.id,
    phase: task.phase,
    seed,
    plantParams: params,
    formula: task.starterFormula,
    notes: '',
    createdAt: Date.now(),
  };
}

/** The randomised setpoint of a workbook (falls back to the task default). */
export function workbookSetpoint(task: TaskDef, wb: Workbook): number {
  const sp = wb.plantParams.setpoint;
  return Number.isFinite(sp) ? sp : task.setpoint;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Compute settle time, overshoot, steady-state error and IAE from a run's
 * samples. `time` is the final simulation time.
 */
export function evaluateRun(task: TaskDef, history: Sample[], time: number): Metrics {
  const empty: Metrics = {
    settleTime: null,
    overshootPct: null,
    steadyStateError: 0,
    iae: 0,
  };
  if (history.length === 0) return empty;

  const sp = history[0].sp;
  const band = 2 * task.acceptance.maxSteadyStateError;

  // Settle time: first sample of the last contiguous run inside the band.
  let i = history.length - 1;
  while (i >= 0 && Math.abs(history[i].pv - sp) <= band) i--;
  const settleTime = i === history.length - 1 ? null : history[i + 1].t;

  // Overshoot relative to the setpoint.
  let maxPv = -Infinity;
  for (const s of history) maxPv = Math.max(maxPv, s.pv);
  const overshootPct = sp > 0 ? Math.max(0, (100 * (maxPv - sp)) / sp) : null;

  // Steady-state error: mean |e| over the last 5 s.
  const tEnd = time > 0 ? time : history[history.length - 1].t;
  let sseSum = 0;
  let sseCount = 0;
  for (const s of history) {
    if (s.t >= tEnd - 5) {
      sseSum += Math.abs(s.sp - s.pv);
      sseCount++;
    }
  }
  const steadyStateError = sseCount > 0 ? sseSum / sseCount : 0;

  // Integral of absolute error (rectangle rule over the recorded samples).
  let iae = 0;
  for (let k = 1; k < history.length; k++) {
    const dt = history[k].t - history[k - 1].t;
    iae += Math.abs(history[k].sp - history[k].pv) * dt;
  }

  return { settleTime, overshootPct, steadyStateError, iae };
}

/** Does the run satisfy the task's acceptance criteria? */
export function passed(task: TaskDef, m: Metrics): boolean {
  const a = task.acceptance;
  if (m.settleTime === null || m.settleTime > a.maxSettleTime) return false;
  if (m.steadyStateError > a.maxSteadyStateError) return false;
  if (a.maxOvershootPct !== null && (m.overshootPct ?? 0) > a.maxOvershootPct) return false;
  return true;
}
