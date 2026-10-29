// ---------------------------------------------------------------------------
// Controller dimensioning for plants with a known first-order model.
//
// The formulas are the ones from the task help page:
//
//   K      = P / k_loss     steady-state gain [pv per unit of control]
//   tau    = C / k_loss     open-loop time constant [s]
//   e_ss   = dT / (1+Kp·K)  steady-state offset of a P controller
//   tau_cl = tau / (1+Kp·K) closed-loop time constant
//   t_sat                                    full-power phase (saturation)
//
// Only tasks that actually expose such a model get a calculator; everything
// else returns null and the window explains why.
// ---------------------------------------------------------------------------

export interface AcceptanceLike {
  maxSettleTime: number | null;
  maxSteadyStateError: number;
}

export interface TuningModel {
  /** Steady-state gain: process value per unit of control. */
  K: number;
  /** Open-loop time constant [s]. */
  tau: number;
  /** Step from the initial value to the setpoint. */
  dT: number;
  /** Control value that holds the setpoint at equilibrium. */
  uHold: number;
  /** JS expression for K, e.g. `P / kLoss`. */
  kExpr: string;
  /** JS expression for tau, e.g. `C / kLoss`. */
  tauExpr: string;
  /** JS expression for dT, e.g. `sp - T_amb`. */
  stepExpr: string;
  /** Names to destructure from `plant` in the generated snippet. */
  binds: string[];
}

/** JS expression for the steady-state gain, per task. */
export function deriveTuningModel(
  taskId: string,
  params: Record<string, number>,
  sp: number,
): TuningModel | null {
  if (taskId !== 'tank') return null;

  const { P, kLoss, C, T_amb } = params;
  if (![P, kLoss, C, T_amb].every((value) => Number.isFinite(value))) return null;
  if (P <= 0 || kLoss <= 0 || C <= 0) return null;

  const dT = sp - T_amb;
  if (!(dT > 0)) return null;

  return {
    K: P / kLoss,
    tau: C / kLoss,
    dT,
    uHold: (kLoss * dT) / P,
    kExpr: 'P / kLoss',
    tauExpr: 'C / kLoss',
    stepExpr: 'sp - T_amb',
    binds: ['P', 'kLoss', 'C', 'T_amb', 'sp'],
  };
}

export type TuneMode = 'offset' | 'tau';

export interface TuningResult {
  kp: number;
  /** Predicted steady-state offset of the closed loop. */
  offset: number;
  /** Predicted closed-loop time constant [s]. */
  tauCl: number;
  /** Time until the controller stops saturating [s]. */
  tSat: number;
  /** Rough settle time (2× tolerance band); Infinity when unreachable. */
  settle: number;
  okOffset: boolean;
  okSettle: boolean;
  warnings: string[];
}

/**
 * Solve for Kp.
 *
 * `offset` mode holds the steady-state error at `target` (°C / pv units);
 * `tau` mode targets a closed-loop time constant in seconds.
 */
export function solveTuning(
  model: TuningModel,
  mode: TuneMode,
  target: number,
  acceptance: AcceptanceLike,
  unit = '',
): TuningResult | null {
  if (!Number.isFinite(target) || target <= 0) return null;

  const { K, tau, dT } = model;
  const kp = mode === 'offset' ? (dT / target - 1) / K : (tau / target - 1) / K;
  const warnings: string[] = [];

  if (!(kp > 0)) {
    return {
      kp,
      offset: dT,
      tauCl: tau,
      tSat: 0,
      settle: Infinity,
      okOffset: false,
      okSettle: false,
      warnings: ['Target is slower than the open loop — P control can only make it faster.'],
    };
  }

  const loopGain = 1 + kp * K;
  const offset = dT / loopGain;
  const tauCl = tau / loopGain;

  // The heater stays at 100 % while |e| > 1/Kp.
  const tSat = 1 / kp >= dT ? 0 : tau * Math.log(K / (K - dT + 1 / kp));

  // The runner counts a run as settled inside ±2·maxSteadyStateError.
  const band = 2 * acceptance.maxSteadyStateError;
  let settle = Infinity;
  if (band > offset && 1 / kp > offset) {
    settle = tSat + tauCl * Math.log((1 / kp - offset) / (band - offset));
  }

  const okOffset = offset <= acceptance.maxSteadyStateError;
  const okSettle = acceptance.maxSettleTime === null || settle <= acceptance.maxSettleTime;

  const u = unit ? ` ${unit}` : '';
  if (!okOffset) {
    warnings.push(
      `Offset ${offset.toFixed(2)}${u} is above the tolerance of ${acceptance.maxSteadyStateError}${u}.`,
    );
  }
  if (!okSettle) {
    warnings.push('Estimated settle time exceeds the acceptance window.');
  }
  if (model.uHold > 0.9) {
    warnings.push('The heater is close to saturation at the setpoint.');
  }

  return { kp, offset, tauCl, tSat, settle, okOffset, okSettle, warnings };
}

function num(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(digits)));
}

/** Ready-to-paste code that reproduces `Kp` from the live `plant` values. */
export function tuningSnippet(
  model: TuningModel,
  mode: TuneMode,
  target: number,
  kp: number,
): string {
  const formula =
    mode === 'offset'
      ? `((${model.stepExpr}) / ${num(target)} - 1) / (${model.kExpr})`
      : `((${model.tauExpr}) / ${num(target)} - 1) / (${model.kExpr})`;
  const label =
    mode === 'offset'
      ? `target offset ${num(target)} → Kp ≈ ${num(kp)}`
      : `target tau_cl ${num(target)} s → Kp ≈ ${num(kp)}`;
  return [
    `// tuning: ${label}`,
    `const { ${model.binds.join(', ')} } = plant;`,
    `const Kp = ${formula};`,
  ].join('\n');
}

/** Complete, runnable controller for the sandbox: tuning constants + control(). */
export function sandboxTemplate(
  model: TuningModel,
  mode: TuneMode,
  target: number,
  kp: number,
): string {
  return [
    tuningSnippet(model, mode, target, kp),
    '',
    'function control(e, dt, mem) {',
    '  return Kp * e;',
    '}',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sandbox header: the worksheet's model values as comments, refreshed in place
// whenever the worksheet changes (new variant, other task).
// ---------------------------------------------------------------------------

export const SANDBOX_HEADER_START = '// ---- model (auto-updated) ----';
export const SANDBOX_HEADER_END = '// ---- end model ----';

export interface SandboxHeaderInput {
  title: string;
  unit: string;
  params: Record<string, number>;
  sp: number;
  model: TuningModel | null;
}

/** Comment block with the raw parameters and the derived values. */
export function sandboxHeader(input: SandboxHeaderInput): string {
  const lines = [
    SANDBOX_HEADER_START,
    `// ${input.title} — worksheet model (read-only as plant.*)`,
  ];

  const cells = Object.keys(input.params).map((key) => `${key} = ${num(input.params[key], 4)}`);
  for (let i = 0; i < cells.length; i += 2) {
    const left = cells[i].padEnd(30);
    lines.push(`// ${(left + (cells[i + 1] ?? '')).trimEnd()}`);
  }

  if (input.model) {
    const m = input.model;
    const unit = input.unit ? ` ${input.unit}` : '';
    lines.push(
      `// K = ${num(m.K, 4)}${unit}/u   tau = ${num(m.tau, 4)} s   dT = ${num(m.dT, 4)}${unit}`,
    );
  }

  lines.push(SANDBOX_HEADER_END);
  return lines.join('\n');
}

/**
 * Replace the auto block in `code` with `header`; when the markers are missing
 * the block is put in front (so older sandbox code gets one too). Repeated
 * calls are idempotent because the markers are then found.
 */
export function withSandboxHeader(code: string, header: string): string {
  const start = code.indexOf(SANDBOX_HEADER_START);
  const end = code.indexOf(SANDBOX_HEADER_END);
  if (start === -1 || end < start) {
    if (!code.trim()) return `${header}\n`;
    return `${header}\n\n${code}`;
  }
  return code.slice(0, start) + header + code.slice(end + SANDBOX_HEADER_END.length);
}
