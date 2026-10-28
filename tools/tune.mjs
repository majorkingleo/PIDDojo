// Acceptance sweep: mirrors src/simulation/*.ts + src/tasks.ts so the Phase 1
// thresholds can be validated over many seeds without opening a browser.
//
//   node tools/tune.mjs [seeds]
//
// With the starter formulas (tank Kp = 4, balloon Kp = 0.05) every seed must
// pass, otherwise the ranges in randomize() need to be adjusted.

const G = 9.81;
const DT = 0.01;
const SAMPLE_EVERY = 5;
const SETTLE_HOLD = 5;

const TASKS = {
  tank: {
    unit: '°C',
    Kp: 4,
    accept: { maxSettleTime: 30, maxOvershootPct: 20, maxSteadyStateError: 1.5, maxRunTime: 60 },
  },
  balloon: {
    unit: 'm',
    Kp: 0.05,
    accept: { maxSettleTime: 40, maxOvershootPct: null, maxSteadyStateError: 15, maxRunTime: 90 },
  },
};

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rr = (rng, lo, hi) => lo + (hi - lo) * rng();
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// -- plants (keep in sync with randomize() in src/simulation/) ---------------

function tankParams(rng) {
  const T_amb = round(rr(rng, 15, 25), 1);
  const sp = round(rr(rng, 55, 80), 1);
  const kLoss = round(rr(rng, 10, 35), 1);
  const tauOpen = rr(rng, 10, 16);
  const C = round(kLoss * tauOpen, 0);
  const uHold = rr(rng, 0.4, 0.65);
  const P = round((kLoss * (sp - T_amb)) / uHold, 0);
  return { T_amb, C, P, kLoss, T0: T_amb, setpoint: sp };
}

function balloonParams(rng) {
  const m = round(rr(rng, 180, 320), 0);
  const weight = m * G;
  const r0 = rr(rng, 0.9, 0.97);
  const rb = rr(rng, 0.8, 1.2);
  const B0 = round(weight * r0, 0);
  const B_gain = round(weight * rb, 0);
  const vClimb = rr(rng, 8, 14);
  const kDrag = round((B0 + B_gain - weight) / vClimb, 0);
  const sp = round(rr(rng, 100, 300), 0);
  return { m, B0, B_gain, kDrag, h0: 0, setpoint: sp };
}

// -- simulation loop (keep in sync with src/app.ts) --------------------------

function simulate(kind, p, Kp) {
  const task = TASKS[kind];
  const sp = p.setpoint;
  const band = task.accept.maxSteadyStateError;

  let pv = kind === 'tank' ? p.T0 : p.h0;
  let v = 0;
  let time = 0;
  let steps = 0;
  let inBandSince = null;
  const hist = [];

  while (time < task.accept.maxRunTime) {
    const e = sp - pv;
    const u = clamp(Kp * e, 0, 1);

    if (kind === 'tank') {
      const tau = p.C / p.kLoss;
      const tss = p.T_amb + (p.P * u) / p.kLoss;
      pv = tss + (pv - tss) * Math.exp(-DT / tau);
    } else {
      const F = p.B0 + p.B_gain * u - p.m * G - p.kDrag * v;
      v += (F / p.m) * DT;
      pv += v * DT;
      if (pv < 0) {
        pv = 0;
        if (v < 0) v = 0;
      }
    }

    time += DT;
    steps++;

    if (steps % SAMPLE_EVERY === 0) {
      hist.push({ t: time, sp, pv, u });

      if (Math.abs(sp - pv) <= band) {
        if (inBandSince === null) inBandSince = time;
      } else {
        inBandSince = null;
      }

      if (inBandSince !== null && time - inBandSince >= SETTLE_HOLD) break;
    }
  }

  return { hist, time };
}

// -- metrics (keep in sync with evaluateRun / passed in src/tasks.ts) --------

function evaluate(task, hist, time) {
  const sp = hist[0].sp;
  const band = 2 * task.accept.maxSteadyStateError;

  let i = hist.length - 1;
  while (i >= 0 && Math.abs(hist[i].pv - sp) <= band) i--;
  const settleTime = i === hist.length - 1 ? null : hist[i + 1].t;

  let maxPv = -Infinity;
  for (const s of hist) maxPv = Math.max(maxPv, s.pv);
  const overshootPct = sp > 0 ? Math.max(0, (100 * (maxPv - sp)) / sp) : null;

  let sseSum = 0;
  let sseCount = 0;
  for (const s of hist) {
    if (s.t >= time - 5) {
      sseSum += Math.abs(s.sp - s.pv);
      sseCount++;
    }
  }
  const steadyStateError = sseCount > 0 ? sseSum / sseCount : 0;

  let iae = 0;
  for (let k = 1; k < hist.length; k++) {
    iae += Math.abs(hist[k].sp - hist[k].pv) * (hist[k].t - hist[k - 1].t);
  }
  return { settleTime, overshootPct, steadyStateError, iae };
}

function pass(task, m) {
  const a = task.accept;
  if (m.settleTime === null || m.settleTime > a.maxSettleTime) return false;
  if (m.steadyStateError > a.maxSteadyStateError) return false;
  if (a.maxOvershootPct !== null && (m.overshootPct ?? 0) > a.maxOvershootPct) return false;
  return true;
}

// -- sweep ------------------------------------------------------------------

const N = Number(process.argv[2] ?? 500);
let allOk = true;

for (const kind of Object.keys(TASKS)) {
  const task = TASKS[kind];
  let fails = 0;
  let noSettle = 0;
  let worstSettle = 0;
  let worstOver = 0;
  let worstSse = 0;
  let worstTime = 0;

  for (let seed = 1; seed <= N; seed++) {
    const rng = rngFrom((seed * 2654435761) >>> 0);
    const params = kind === 'tank' ? tankParams(rng) : balloonParams(rng);
    const { hist, time } = simulate(kind, params, task.Kp);
    const m = evaluate(task, hist, time);

    worstSettle = Math.max(worstSettle, m.settleTime ?? Infinity);
    worstOver = Math.max(worstOver, m.overshootPct ?? 0);
    worstSse = Math.max(worstSse, m.steadyStateError);
    worstTime = Math.max(worstTime, time);

    if (!pass(task, m)) {
      fails++;
      if (m.settleTime === null) noSettle++;
      if (fails <= 5) {
        console.log(`  FAIL ${kind} seed=${seed}`, {
          settle: m.settleTime === null ? null : m.settleTime.toFixed(1),
          over: (m.overshootPct ?? 0).toFixed(1),
          sse: m.steadyStateError.toFixed(2),
          params,
        });
      }
    }
  }

  const ok = fails === 0;
  allOk = allOk && ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${kind.padEnd(7)} Kp=${task.Kp}  ${N - fails}/${N}  ` +
      `worst settle ${Number.isFinite(worstSettle) ? worstSettle.toFixed(1) : 'inf'} s, ` +
      `overshoot ${worstOver.toFixed(1)} %, sse ${worstSse.toFixed(2)} ${task.unit}, ` +
      `run ${worstTime.toFixed(1)} s` +
      (noSettle ? `  (${noSettle} never settled)` : ''),
  );
}

process.exit(allOk ? 0 : 1);
