import type { Plant, PlantParams, RNG } from '../types';
import { clamp, fmt, round, roundRect } from './plant';
import { isLightTheme } from '../colormaps';

// ---------------------------------------------------------------------------
// Level tank — nonlinear first-order plant with a gravity drain.
//
//   A·dh/dt = q_in·u − k_out·√h
//
// The valve position u ∈ [0, 1] is the inflow. Because the outflow grows with
// √h, the process gain changes with the operating point: the same Kp behaves
// differently at 20 % and 80 % fill. A P controller settles below the setpoint
// by u_hold / Kp.
// ---------------------------------------------------------------------------

export const LEVEL_DEFAULTS: PlantParams = {
  A: 1.2,
  qIn: 0.36,
  kOut: 0.07,
  hMax: 3,
  h0: 0,
  setpoint: 2,
};

export class LevelPlant implements Plant {
  private params: PlantParams = { ...LEVEL_DEFAULTS };
  private h = 0;
  private sp = 3;
  private u = 0;
  private t = 0;

  configure(params: PlantParams, setpoint: number): void {
    this.params = { ...LEVEL_DEFAULTS, ...params };
    this.sp = Number.isFinite(setpoint) ? setpoint : this.params.setpoint;
    this.reset();
  }

  setSetpoint(setpoint: number): void {
    if (Number.isFinite(setpoint)) this.sp = setpoint;
  }

  reset(): void {
    this.h = this.params.h0 ?? 0;
    this.u = 0;
    this.t = 0;
  }

  step(u: number, dt: number): void {
    const { A, qIn, kOut, hMax } = this.params;
    const outflow = kOut * Math.sqrt(Math.max(0, this.h));
    const dh = (qIn * u - outflow) / Math.max(1e-6, A);
    this.h = clamp(this.h + dh * dt, 0, hMax);
    this.u = u;
    this.t += dt;
  }

  measurement(): number {
    return this.h;
  }

  /**
   * Randomise a solvable tank: pick the level, the inlet flow and the duty
   * cycle at the setpoint, then derive the drain coefficient from them.
   */
  randomize(rng: RNG): PlantParams {
    const setpoint = round(rng.nextRange(1, 2.5), 2);
    const A = round(rng.nextRange(0.8, 1.6), 2);
    // The fill rate at a fully open valve drives how fast the task is.
    const qIn = round(rng.nextRange(0.2, 0.4) * A, 3);
    const uHold = rng.nextRange(0.45, 0.7);
    const kOut = round((uHold * qIn) / Math.sqrt(setpoint), 4);
    const hMax = round(setpoint * 1.5, 1);
    return { A, qIn, kOut, hMax, h0: 0, setpoint };
  }

  describe(params: PlantParams): string[] {
    const p = { ...LEVEL_DEFAULTS, ...params };
    return [
      `area     ${fmt(p.A, 2)} m²`,
      `inflow   ${fmt(p.qIn, 2)} m³/s`,
      `drain    ${fmt(p.kOut, 3)}`,
      `height   ${fmt(p.hMax, 1)} m`,
      `setpoint ${fmt(p.setpoint, 2)} m`,
    ];
  }

  // -- rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const light = isLightTheme();
    const text = light ? '#1c2333' : '#e6ebf5';
    const muted = light ? '#5b667c' : '#8b96ad';
    const stroke = light ? 'rgba(20,30,60,0.35)' : 'rgba(255,255,255,0.28)';
    const surface = light ? '#f4f6fb' : '#0f1420';

    ctx.clearRect(0, 0, w, h);

    const pad = 16;
    const tankX = pad + 34;
    const tankY = pad + 28;
    const tankW = Math.max(110, Math.min(w * 0.5, w - 200));
    const tankH = Math.max(100, h - tankY - pad - 34);
    const inset = 8;
    const lx = tankX + inset;
    const ly = tankY + inset;
    const lw = tankW - inset * 2;
    const lh = tankH - inset * 2;

    const hMax = Math.max(0.001, this.params.hMax);
    const level = clamp(this.h / hMax, 0, 1);

    // tank shell ------------------------------------------------------------
    roundRect(ctx, tankX, tankY, tankW, tankH, 12);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // water -----------------------------------------------------------------
    const waterH = lh * level;
    const top = light ? '#8ecbf5' : '#2b6f9e';
    const bottom = light ? '#4297d4' : '#14425f';
    const grad = ctx.createLinearGradient(0, ly + lh - waterH, 0, ly + lh);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    roundRect(ctx, lx, ly + lh - waterH, lw, Math.max(waterH, 0.001), 6);
    ctx.fillStyle = grad;
    ctx.fill();

    if (waterH > 4) {
      ctx.beginPath();
      ctx.moveTo(lx + 2, ly + lh - waterH + 1);
      ctx.lineTo(lx + lw - 2, ly + lh - waterH + 1);
      ctx.strokeStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // setpoint line ---------------------------------------------------------
    const spY = ly + lh - lh * clamp(this.sp / hMax, 0, 1);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = light ? 'rgba(47,111,224,0.9)' : 'rgba(76,141,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx - 4, spY);
    ctx.lineTo(lx + lw + 4, spY);
    ctx.stroke();
    ctx.restore();

    // inlet pipe + valve ----------------------------------------------------
    const pipeY = tankY - 14;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tankX + tankW * 0.25, pipeY - 12);
    ctx.lineTo(tankX + tankW * 0.25, tankY + 2);
    ctx.stroke();

    const valveW = 16;
    const valveH = 10;
    const vx = tankX + tankW * 0.25 - valveW / 2;
    const vy = pipeY - 6;
    roundRect(ctx, vx, vy, valveW, valveH, 3);
    ctx.fillStyle = light ? '#dbe3f2' : '#22304a';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    // valve opening as a moving shutter
    ctx.fillStyle = '#5cc8ff';
    roundRect(ctx, vx, vy, valveW * clamp(this.u, 0, 1), valveH, 3);
    ctx.fill();

    // outlet stream ---------------------------------------------------------
    const outX = tankX + tankW - 22;
    const outW = 4 + 8 * Math.sqrt(Math.max(0, this.h) / hMax);
    ctx.fillStyle = light ? 'rgba(66,151,212,0.75)' : 'rgba(43,111,158,0.85)';
    ctx.fillRect(outX - outW / 2, tankY + tankH, outW, pad + 18);

    // level scale -----------------------------------------------------------
    const scaleX = tankX + tankW + 26;
    ctx.strokeStyle = light ? 'rgba(20,30,60,0.25)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleX, tankY);
    ctx.lineTo(scaleX, tankY + tankH);
    ctx.stroke();

    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const value = (hMax * i) / ticks;
      const y = tankY + tankH - (tankH * i) / ticks;
      ctx.beginPath();
      ctx.moveTo(scaleX - 4, y);
      ctx.lineTo(scaleX + 4, y);
      ctx.stroke();
      ctx.fillText(`${fmt(value, 1)}`, scaleX + 8, y + 4);
    }

    // readouts --------------------------------------------------------------
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('Level tank', pad + 2, pad + 12);

    const footerY = tankY + tankH + 24;
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmt(this.h, 2)}`, tankX, footerY);
    const hw = ctx.measureText(`${fmt(this.h, 2)}`).width;
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('m', tankX + hw + 4, footerY);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`target ${fmt(this.sp, 2)} m`, tankX + hw + 24, footerY);
    ctx.fillText(`valve ${Math.round(this.u * 100)} %`, scaleX + 8, tankY - 10);
    ctx.fillText(`t ${fmt(this.t, 1)} s`, scaleX + 8, tankY - 26);
  }
}
