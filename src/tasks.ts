// ---------------------------------------------------------------------------
// Task registry, worksheet creation and acceptance evaluation.
// ---------------------------------------------------------------------------

import type { Metrics, Sample, TaskDef, Worksheet } from './types';
import { TankPlant } from './simulation/tank';
import { BalloonPlant } from './simulation/balloon';
import { CruisePlant } from './simulation/cruise';
import { ServoPlant } from './simulation/servo';
import { LevelPlant } from './simulation/level';
import { createRng } from './simulation/rng';
import { newId } from './state';
import {
  BALLOON_HELP,
  BALLOON_RAMP_HELP,
  CRUISE_HELP,
  LEVEL_HELP,
  SERVO_HELP,
  TANK_HELP,
} from './i18n';

const TANK_STARTER = `// Heated tank — Phase 1: P controller
// e = setpoint - T   (temperature error, °C)
// dt = 0.01 s        mem = persistent object
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 4;          // try 1 … 20
  return Kp * e;
}
`;

const BALLOON_STARTER = `// Hot-air balloon — Phase 1: P controller
// e = setpoint - h   (altitude error, m)
// u_hold is small, so Kp has to be small too.
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 0.05;       // try 0.01 … 0.2
  return Kp * e;
}
`;

const RAMP_STARTER = `// Balloon climb — Phase 1: P controller
// The target climbs at 2 m/s, so a larger Kp means a smaller lag.
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 0.06;       // try 0.03 … 0.15
  return Kp * e;
}
`;

const CRUISE_STARTER = `// Cruise control — Phase 1: P controller
// e = target - actual speed   (km/h)
// u = throttle 0..1; a hill arrives at t = 15 s.
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 0.3;        // throttle per km/h
  return Kp * e;
}
`;

const SERVO_STARTER = `// Antenna servo — Phase 1: P controller
// e = target - angle   (degrees)
// u = motor torque in [-1, 1]; negative torque turns the other way.
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 0.015;      // try 0.005 … 0.04
  return Kp * e;
}
`;

const LEVEL_STARTER = `// Level tank — Phase 1: P controller
// e = target - level   (m)
// u = inlet valve 0..1
// debug(e) writes to the "Debug log" tab
function control(e, dt, mem) {
  const Kp = 10;         // try 2 … 30
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

function balloonRampTask(): TaskDef {
  return {
    id: 'balloon-ramp',
    title: 'Balloon climb',
    phase: 1,
    plantFactory: () => new BalloonPlant(),
    help: BALLOON_RAMP_HELP,
    acceptance: {
      // The target never stops moving, so only the lag is scored.
      maxSettleTime: null,
      maxOvershootPct: null,
      maxSteadyStateError: 6,
      maxRunTime: 40,
      minRunTime: 40,
    },
    setpoint: 200,
    uMin: 0,
    uMax: 1,
    unit: 'm',
    starterFormula: RAMP_STARTER,
    // Climb at 2 m/s and reach the base setpoint exactly at the end of the run.
    profile: (t, base) => Math.max(0, base - 80 + 2 * t),
  };
}

function cruiseTask(): TaskDef {
  return {
    id: 'cruise',
    title: 'Cruise control',
    phase: 1,
    plantFactory: () => new CruisePlant(),
    help: CRUISE_HELP,
    acceptance: {
      maxSettleTime: 30,
      maxOvershootPct: 15,
      maxSteadyStateError: 1.5,
      maxRunTime: 60,
      // The hill arrives at 15 s: keep going so it is part of the run.
      minRunTime: 25,
    },
    setpoint: 80,
    uMin: 0,
    uMax: 1,
    unit: 'km/h',
    starterFormula: CRUISE_STARTER,
  };
}

function servoTask(): TaskDef {
  return {
    id: 'servo',
    title: 'Antenna servo',
    phase: 1,
    plantFactory: () => new ServoPlant(),
    help: SERVO_HELP,
    acceptance: {
      maxSettleTime: 6,
      maxOvershootPct: 15,
      maxSteadyStateError: 1,
      maxRunTime: 30,
    },
    setpoint: 90,
    // A bidirectional motor: negative torque turns the other way.
    uMin: -1,
    uMax: 1,
    unit: '°',
    starterFormula: SERVO_STARTER,
  };
}

function levelTask(): TaskDef {
  return {
    id: 'level',
    title: 'Level tank',
    phase: 1,
    plantFactory: () => new LevelPlant(),
    help: LEVEL_HELP,
    acceptance: {
      maxSettleTime: 25,
      maxOvershootPct: 10,
      maxSteadyStateError: 0.1,
      maxRunTime: 60,
    },
    setpoint: 2,
    uMin: 0,
    uMax: 1,
    unit: 'm',
    starterFormula: LEVEL_STARTER,
  };
}

export const TASKS: TaskDef[] = [
  tankTask(),
  balloonTask(),
  balloonRampTask(),
  cruiseTask(),
  servoTask(),
  levelTask(),
];

export function findTask(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}
/** Create a worksheet with a freshly randomised (but solvable) plant. */
export function createWorksheet(task: TaskDef, seed: number): Worksheet {
  const rng = createRng(seed);
  const params = task.plantFactory().randomize(rng);
  return {
    id: newId(),
    name: '',
    taskId: task.id,
    phase: task.phase,
    seed,
    plantParams: params,
    formula: task.starterFormula,
    notes: '',
    createdAt: Date.now(),
  };
}

/** The randomised setpoint of a worksheet (falls back to the task default). */
export function worksheetSetpoint(task: TaskDef, wb: Worksheet): number {
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

  const sp = history[history.length - 1].sp;
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
  if (a.maxSettleTime !== null && (m.settleTime === null || m.settleTime > a.maxSettleTime)) {
    return false;
  }
  if (m.steadyStateError > a.maxSteadyStateError) return false;
  if (a.maxOvershootPct !== null && (m.overshootPct ?? 0) > a.maxOvershootPct) return false;
  return true;
}
