// Acceptance sweep: mirrors src/simulation/*.ts + src/tasks.ts so the Phase 1
// thresholds can be validated over many seeds without opening a browser.
//
//   node tools/tune.mjs [seeds]
//
// Every task must pass on every seed with its starter Kp; if not, either the
// randomisation ranges or the acceptance thresholds need adjusting.

const G = 9.81;
const KMH = 3.6;
const DT = 0.01;
const SAMPLE_EVERY = 5;
const SETTLE_HOLD = 5;

const rr = (rng, lo, hi) => lo + (hi - lo) * rng();
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------------
// Tasks (keep in sync with src/simulation/*.ts and src/tasks.ts)
// ---------------------------------------------------------------------------

const TASKS = {
  tank: {
    unit: '°C',
    Kp: 4,
    uMin: 0,
    uMax: 1,
    accept: { maxSettleTime: 30, maxOvershootPct: 20, maxSteadyStateError: 1.5, maxRunTime: 60 },
    base: (rng) => {
      const T_amb = round(rr(rng, 15, 25), 1);
      const setpoint = round(rr(rng, 55, 80), 1);
      const kLoss = round(rr(rng, 10, 35), 1);
      const C = round(kLoss * rr(rng, 10, 16), 0);
      const uHold = rr(rng, 0.4, 0.65);
      const P = round((kLoss * (setpoint - T_amb)) / uHold, 0);
      return { T_amb, C, P, kLoss, T0: T_amb, setpoint };
    },
    init: (p) => ({ pv: p.T0 }),
    step: (st, p, u) => {
      const tau = p.C / p.kLoss;
      const tss = p.T_amb + (p.P * u) / p.kLoss;
      st.pv = tss + (st.pv - tss) * Math.exp(-DT / tau);
    },
    pv: (st) => st.pv,
  },

  balloon: {
    unit: 'm',
    Kp: 0.05,
    uMin: 0,
    uMax: 1,
    accept: { maxSettleTime: 40, maxOvershootPct: null, maxSteadyStateError: 15, maxRunTime: 90 },
    base: (rng) => {
      const m = round(rr(rng, 180, 320), 0);
      const weight = m * G;
      const B0 = round(weight * rr(rng, 0.9, 0.97), 0);
      const B_gain = round(weight * rr(rng, 0.8, 1.2), 0);
      const kDrag = round((B0 + B_gain - weight) / rr(rng, 8, 14), 0);
      return { m, B0, B_gain, kDrag, h0: 0, setpoint: round(rr(rng, 100, 300), 0) };
    },
    init: (p) => ({ h: p.h0, v: 0, t: 0 }),
    step: (st, p, u) => {
      const F = p.B0 + p.B_gain * u - p.m * G - p.kDrag * st.v;
      st.v += (F / p.m) * DT;
      st.h += st.v * DT;
      if (st.h < 0) {
        st.h = 0;
        if (st.v < 0) st.v = 0;
      }
      st.t += DT;
    },
    pv: (st) => st.h,
  },

  'balloon-ramp': {
    unit: 'm',
    Kp: 0.06,
    uMin: 0,
    uMax: 1,
    // Continuous 2 m/s climb: the scored number is the tracking lag.
    accept: {
      maxSettleTime: null,
      maxOvershootPct: null,
      maxSteadyStateError: 6,
      maxRunTime: 40,
      minRunTime: 40,
    },
    profile: (t, base) => Math.max(0, base - 80 + 2 * t),
    base: (rng) => {
      const m = round(rr(rng, 180, 320), 0);
      const weight = m * G;
      const B0 = round(weight * rr(rng, 0.9, 0.97), 0);
      const B_gain = round(weight * rr(rng, 0.8, 1.2), 0);
      const kDrag = round((B0 + B_gain - weight) / rr(rng, 8, 14), 0);
      return { m, B0, B_gain, kDrag, h0: 0, setpoint: round(rr(rng, 100, 300), 0) };
    },
    init: (p) => ({ h: p.h0, v: 0, t: 0 }),
    step: (st, p, u) => TASKS.balloon.step(st, p, u),
    pv: (st) => st.h,
  },

  cruise: {
    unit: 'km/h',
    Kp: 0.3,
    uMin: 0,
    uMax: 1,
    accept: {
      maxSettleTime: 30,
      maxOvershootPct: 15,
      maxSteadyStateError: 1.5,
      maxRunTime: 60,
      minRunTime: 25,
    },
    base: (rng) => ({
      m: round(rr(rng, 1200, 1800), 0),
      F: round(rr(rng, 5000, 7500), 0),
      cd: round(rr(rng, 0.28, 0.42), 2),
      kRoll: round(rr(rng, 0.012, 0.018), 3),
      slope: round(rr(rng, 3, 5), 1),
      hillAt: 15,
      setpoint: round(rr(rng, 60, 100), 0),
    }),
    init: () => ({ v: 0, t: 0 }),
    step: (st, p, u) => {
      const theta = st.t >= p.hillAt ? (p.slope * Math.PI) / 180 : 0;
      const a =
        (p.F * u - p.cd * st.v * st.v - p.kRoll * p.m * G - p.m * G * Math.sin(theta)) / p.m;
      st.v = Math.max(0, st.v + a * DT);
      st.t += DT;
    },
    pv: (st) => st.v * KMH,
  },

  servo: {
    unit: '°',
    Kp: 0.015,
    uMin: -1,
    uMax: 1,
    accept: { maxSettleTime: 6, maxOvershootPct: 15, maxSteadyStateError: 1, maxRunTime: 30 },
    base: (rng) => {
      // Torque is tied to damping so full torque always slews the dial at
      // >= 1 rad/s; otherwise heavily damped variants could never reach the
      // target inside the time budget.
      const b = round(rr(rng, 4, 7), 2);
      const K = round(b * rr(rng, 1, 1.8), 1);
      return {
        J: round(rr(rng, 0.8, 2), 2),
        K,
        b,
        setpoint: round(rr(rng, 30, 150), 0),
      };
    },
    init: () => ({ th: 0, om: 0 }),
    step: (st, p, u) => {
      st.om += ((p.K * u - p.b * st.om) / p.J) * DT;
      st.th += st.om * DT;
    },
    pv: (st) => (st.th * 180) / Math.PI,
  },

  level: {
    unit: 'm',
    Kp: 10,
    uMin: 0,
    uMax: 1,
    accept: { maxSettleTime: 25, maxOvershootPct: 10, maxSteadyStateError: 0.1, maxRunTime: 60 },
    base: (rng) => {
      const setpoint = round(rr(rng, 1, 2.5), 2);
      const A = round(rr(rng, 0.8, 1.6), 2);
      const fillRate = rr(rng, 0.2, 0.4);
      const qIn = round(fillRate * A, 3);
      const uHold = rr(rng, 0.45, 0.7);
      const kOut = round((uHold * qIn) / Math.sqrt(setpoint), 4);
      return { A, qIn, kOut, hMax: round(setpoint * 1.5, 1), h0: 0, setpoint };
    },
    init: (p) => ({ h: p.h0 }),
    step: (st, p, u) => {
      const out = p.kOut * Math.sqrt(Math.max(0, st.h));
      st.h = clamp(st.h + ((p.qIn * u - out) / p.A) * DT, 0, p.hMax);
    },
    pv: (st) => st.h,
  },
};

// ---------------------------------------------------------------------------
// Simulation loop (keep in sync with src/app.ts)
// ---------------------------------------------------------------------------

function simulate(task, params, Kp) {
  const accept = task.accept;
  const base = params.setpoint;
  const minRun = accept.minRunTime ?? 0;

  const st = task.init(params);
  let time = 0;
  let steps = 0;
  let inBandSince = null;
  const hist = [];

  while (time < accept.maxRunTime) {
    const sp = task.profile ? task.profile(time, base) : base;
    const u = clamp(Kp * (sp - task.pv(st)), task.uMin, task.uMax);
    task.step(st, params, u);
    time += DT;
    steps++;

    if (steps % SAMPLE_EVERY === 0) {
      const pv = task.pv(st);
      hist.push({ t: time, sp, pv, u });

      if (Math.abs(sp - pv) <= accept.maxSteadyStateError) {
        if (inBandSince === null) inBandSince = time;
      } else {
        inBandSince = null;
      }

      if (time >= minRun) {
        const held = inBandSince !== null && time - inBandSince >= SETTLE_HOLD;
        if (held || time >= accept.maxRunTime) break;
      }
    }
  }

  return { hist, time };
}

// -- metrics (keep in sync with evaluateRun / passed in src/tasks.ts) --------

function evaluate(task, hist, time) {
  const sp = hist[hist.length - 1].sp;
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
  if (a.maxSettleTime !== null && (m.settleTime === null || m.settleTime > a.maxSettleTime)) {
    return false;
  }
  if (m.steadyStateError > a.maxSteadyStateError) return false;
  if (a.maxOvershootPct !== null && (m.overshootPct ?? 0) > a.maxOvershootPct) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

const N = Number(process.argv[2] ?? 300);
const only = process.argv[3];
let allOk = true;

for (const [kind, task] of Object.entries(TASKS)) {
  if (only && kind !== only) continue;

  let fails = 0;
  let worstSettle = 0;
  let worstOver = 0;
  let worstSse = 0;
  let worstTime = 0;

  for (let seed = 1; seed <= N; seed++) {
    const rng = rngFrom((seed * 2654435761) >>> 0);
    const params = task.base(rng);
    const { hist, time } = simulate(task, params, task.Kp);
    const m = evaluate(task, hist, time);

    worstSettle = Math.max(worstSettle, m.settleTime ?? 0);
    worstOver = Math.max(worstOver, m.overshootPct ?? 0);
    worstSse = Math.max(worstSse, m.steadyStateError);
    worstTime = Math.max(worstTime, time);

    if (!pass(task, m)) {
      fails++;
      if (fails <= 3) {
        console.log(`  FAIL ${kind} seed=${seed}`, {
          settle: m.settleTime === null ? null : m.settleTime.toFixed(1),
          over: (m.overshootPct ?? 0).toFixed(1),
          sse: m.steadyStateError.toFixed(2),
        });
      }
    }
  }

  const ok = fails === 0;
  allOk = allOk && ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${kind.padEnd(13)} Kp=${task.Kp}  ${N - fails}/${N}  ` +
      `worst settle ${worstSettle.toFixed(1)} s, overshoot ${worstOver.toFixed(1)} %, ` +
      `sse ${worstSse.toFixed(2)} ${task.unit}, run ${worstTime.toFixed(1)} s`,
  );
}

process.exit(allOk ? 0 : 1);
