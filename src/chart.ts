// ---------------------------------------------------------------------------
// Chart: a thin uPlot wrapper streaming setpoint / process value / effort.
// ---------------------------------------------------------------------------

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

const MAX_POINTS = 4000;

const COLORS = {
  dark: { sp: '#8b96ad', pv: '#5cc8ff', u: '#ffb454', grid: 'rgba(255,255,255,0.10)', axis: '#8b96ad' },
  light: { sp: '#5b667c', pv: '#1f6fd0', u: '#c46d00', grid: 'rgba(20,30,60,0.12)', axis: '#5b667c' },
};

/** Series colours, exported so the panel-head legend can match the plot. */
export function seriesColors(light: boolean): { sp: string; pv: string; u: string } {
  const c = light ? COLORS.light : COLORS.dark;
  return { sp: c.sp, pv: c.pv, u: c.u };
}

export class Chart {
  private plot: uPlot | null = null;
  private xs: number[] = [];
  private sp: number[] = [];
  private pv: number[] = [];
  private u: number[] = [];
  private observer: ResizeObserver | null = null;
  private light = false;
  private unit: string;

  constructor(
    private readonly host: HTMLElement,
    unit = '',
    light = false,
  ) {
    this.unit = unit;
    this.light = light;
    this.build();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }

  /** Recreate the plot (theme / unit changes) while keeping the data. */
  private build(): void {
    this.plot?.destroy();
    const colors = this.light ? COLORS.light : COLORS.dark;
    const yLabel = this.unit ? `pv [${this.unit}]` : 'pv';

    const options: uPlot.Options = {
      width: Math.max(120, this.host.clientWidth),
      height: Math.max(120, this.host.clientHeight),
      legend: { show: false },
      cursor: { drag: { x: true, y: false, setScale: true } },
      scales: {
        x: { time: false },
        y: { auto: true },
        u: { range: [0, 1] },
      },
      axes: [
        { stroke: colors.axis, grid: { stroke: colors.grid }, size: 32 },
        {
          stroke: colors.axis,
          grid: { stroke: colors.grid },
          label: yLabel,
          labelSize: 18,
          size: 66,
        },
        {
          stroke: colors.axis,
          grid: { show: false },
          scale: 'u',
          label: 'u',
          labelSize: 16,
          size: 40,
        },
      ],
      series: [
        { label: 't [s]' },
        { label: 'setpoint', stroke: colors.sp, dash: [6, 5], width: 1.5, points: { show: false } },
        { label: 'pv', stroke: colors.pv, width: 2, points: { show: false } },
        { label: 'u', stroke: colors.u, width: 1.5, scale: 'u', points: { show: false } },
      ],
    };

    this.plot = new uPlot(options, [this.xs, this.sp, this.pv, this.u], this.host);
  }

  reset(): void {
    this.xs.length = 0;
    this.sp.length = 0;
    this.pv.length = 0;
    this.u.length = 0;
    this.plot?.setData([this.xs, this.sp, this.pv, this.u]);
  }

  append(t: number, sp: number, pv: number, u: number): void {
    this.xs.push(t);
    this.sp.push(sp);
    this.pv.push(pv);
    this.u.push(u);
    if (this.xs.length > MAX_POINTS) {
      const drop = this.xs.length - MAX_POINTS;
      this.xs.splice(0, drop);
      this.sp.splice(0, drop);
      this.pv.splice(0, drop);
      this.u.splice(0, drop);
    }
  }

  /** Push the accumulated samples into the plot (call once per frame). */
  flush(): void {
    if (!this.plot) return;
    this.plot.setData([this.xs, this.sp, this.pv, this.u]);
  }

  setUnit(unit: string): void {
    if (unit === this.unit) return;
    this.unit = unit;
    this.build();
  }

  setTheme(light: boolean): void {
    if (light === this.light) return;
    this.light = light;
    this.build();
  }

  private resize(): void {
    if (!this.plot) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.plot.setSize({ width, height });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.plot?.destroy();
    this.plot = null;
  }
}
