// ---------------------------------------------------------------------------
// The "Math & variables" help box next to the editor.
// Keep the descriptions short: they are read at a glance while tuning.
// ---------------------------------------------------------------------------

export interface HelpEntry {
  name: string;
  description: string;
}

export interface HelpGroup {
  title: string;
  entries: HelpEntry[];
}

export const MATH_HELP: HelpGroup[] = [
  {
    title: 'Injected variables',
    entries: [
      { name: 'e', description: 'error = sp − pv (setpoint minus measurement)' },
      { name: 'dt', description: 'simulation timestep in seconds (0.01)' },
      { name: 'mem', description: 'persistent object, fresh for every run' },
      { name: 'mem.sp', description: 'current setpoint' },
      { name: 'mem.pv', description: 'current measurement (process value)' },
      { name: 'mem.prevE', description: 'error of the previous step' },
      { name: 'mem.t', description: 'simulation time in seconds' },
      { name: 'mem.i', description: 'free slot — typical integral accumulator' },
    ],
  },
  {
    title: 'Math functions',
    entries: [
      { name: 'abs(x)', description: 'absolute value' },
      { name: 'min(a, b)', description: 'smaller of two values' },
      { name: 'max(a, b)', description: 'larger of two values' },
      { name: 'sign(x)', description: '−1, 0 or 1' },
      { name: 'pow(x, y)', description: 'x to the power y' },
      { name: 'sqrt(x)', description: 'square root' },
      { name: 'exp(x)', description: 'e raised to x' },
      { name: 'log(x)', description: 'natural logarithm' },
      { name: 'log10(x)', description: 'base-10 logarithm' },
      { name: 'sin(x)', description: 'sine (radians)' },
      { name: 'cos(x)', description: 'cosine (radians)' },
      { name: 'tan(x)', description: 'tangent (radians)' },
      { name: 'atan(x)', description: 'arctangent (radians)' },
      { name: 'atan2(y, x)', description: 'angle of the point (x, y)' },
      { name: 'round(x)', description: 'nearest integer' },
      { name: 'floor(x)', description: 'round down' },
      { name: 'ceil(x)', description: 'round up' },
      { name: 'trunc(x)', description: 'drop the fractional part' },
    ],
  },
  {
    title: 'Constants',
    entries: [
      { name: 'Math.PI', description: '3.14159…' },
      { name: 'Math.E', description: '2.71828…' },
    ],
  },
  {
    title: 'Rules of the sandbox',
    entries: [
      { name: 'return value', description: 'clamped to the actuator range (tank: 0…1 heater duty, balloon: 0…1 burner)' },
      { name: 'non-finite return', description: 'NaN / Infinity aborts the run' },
      { name: 'Math.random()', description: 'works, but breaks reproducibility of a workbook' },
    ],
  },
];

/** Render the help box into `container` (replaces previous content). */
export function renderMathHelp(container: HTMLElement): void {
  container.textContent = '';
  for (const group of MATH_HELP) {
    const section = document.createElement('section');
    section.className = 'math-group';

    const heading = document.createElement('h3');
    heading.textContent = group.title;
    section.append(heading);

    const list = document.createElement('dl');
    for (const entry of group.entries) {
      const dt = document.createElement('dt');
      dt.textContent = entry.name;
      const dd = document.createElement('dd');
      dd.textContent = entry.description;
      list.append(dt, dd);
    }
    section.append(list);
    container.append(section);
  }
}
