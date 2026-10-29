// ---------------------------------------------------------------------------
// User formula -> runnable controller function.
//
// The user writes a plain JavaScript function named `control`. We wrap the
// source in a factory so syntax errors surface at compile time and the result
// can be cached for the whole run.
// ---------------------------------------------------------------------------

/** Persistent per-run scratch object handed to the user's function. */
export type Mem = Record<string, number>;

export type CompiledController = (e: number, dt: number, mem: Mem) => number;

/** Sink for `debug(...)` / `log(...)` calls coming out of user code. */
export type LogFn = (...args: unknown[]) => void;

/**
 * Read-only model values of the current worksheet, injected as `plant`.
 * Flat numbers: raw plant parameters plus `sp`, `uMin` and `uMax`.
 */
export type PlantInfo = Readonly<Record<string, number>>;

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Compile `source` and return the user's `control(e, dt, mem)` function.
 * `debug`, `log` and `plant` are injected as parameters of the factory, so the
 * user's code can use them without touching a global. Because the source is
 * the factory body, top-level `const` declarations run once per run — that is
 * the natural place for tuning constants.
 * Throws an Error with a human readable message on syntax errors or when the
 * function is missing.
 */
export function compileController(
  source: string,
  log: LogFn = () => {},
  plant: PlantInfo = {},
): CompiledController {
  let factory: (debug: LogFn, log: LogFn, plant: PlantInfo) => unknown;
  try {
    // The trailing statement makes the factory return the declared function.
    factory = new Function(
      'debug',
      'log',
      'plant',
      `${source}\n;return typeof control === 'function' ? control : undefined;`,
    ) as (debug: LogFn, log: LogFn, plant: PlantInfo) => unknown;
  } catch (err) {
    throw new Error(`Syntax error: ${message(err)}`);
  }

  let candidate: unknown;
  try {
    candidate = factory(log, log, plant);
  } catch (err) {
    throw new Error(`Error while defining control(): ${message(err)}`);
  }

  if (typeof candidate !== 'function') {
    throw new Error('Code must define a function named `control(e, dt, mem)`.');
  }

  return candidate as CompiledController;
}

/**
 * Call the compiled controller, turning thrown errors and non-finite results
 * into readable Error objects so the run can be aborted cleanly.
 */
export function invokeController(
  control: CompiledController,
  e: number,
  dt: number,
  mem: Mem,
): number {
  let out: number;
  try {
    out = control(e, dt, mem);
  } catch (err) {
    throw new Error(`control() threw: ${message(err)}`);
  }
  if (typeof out !== 'number') {
    throw new Error(`control() must return a number (got ${typeof out}).`);
  }
  if (!Number.isFinite(out)) {
    throw new Error('control() returned a non-finite value (NaN / Infinity).');
  }
  return out;
}
