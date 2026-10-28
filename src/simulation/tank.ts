import type { Plant, PlantParams, RNG } from '../types';
import { clamp, fmt, round, roundRect } from './plant';
import { colorForTheme, cssColor, isLightTheme } from '../colormaps';

// ---------------------------------------------------------------------------
// Heated tank — first-order thermal plant.
//
//   dT/dt = ( P * u - kLoss * (T - T_amb) ) / C
//
// u is the heater duty cycle in [0, 1]. Under pure P control the tank settles
// with a steady-state error of u_hold / Kp (all Phase 1 plants allow offset).
// ---------------------------------------------------------------------------

export const TANK_DEFAULTS: PlantParams = {
  T_amb: 20,
  C: 3000,
  P: 1200,
  kLoss: 15,
  T0: 20,
  setpoint: 65,
};

export class TankPlant implements Plant {
  private params: PlantParams = { ...TANK_DEFAULTS };
  private T = 20;
  private sp = 65;
  private u = 0;
  private t = 0;

  configure(params: PlantParams, setpoint: number): void {
    this.params = { ...TANK_DEFAULTS, ...params };
    this.sp = Number.isFinite(setpoint) ? setpoint : this.params.setpoint;
    this.reset();
  }

  reset(): void {
    this.T = this.params.T0 ?? this.params.T_amb;
    this.u = 0;
    this.t = 0;
  }

  step(u: number, dt: number): void {
    const { P, kLoss, C, T_amb } = this.params;
    // Exact solution of the first-order ODE for a constant input over dt, so
    // the plant behaves identically for any timestep (dt-invariant physics).
    const loss = Math.max(1e-6, kLoss);
    const tau = Math.max(1e-6, C / loss);
    const tss = T_amb + (P * u) / loss;
    this.T = tss + (this.T - tss) * Math.exp(-dt / tau);
    this.u = u;
    this.t += dt;
  }

  measurement(): number {
    return this.T;
  }

  /**
   * Randomise a *solvable* tank: the thermal time constant and the duty cycle
   * needed at the setpoint are drawn first, and the heater power is derived
   * from them. That keeps the plant reachable within the acceptance window
   * (a P controller can always hold the temperature).
   */
  randomize(rng: RNG): PlantParams {
    const T_amb = round(rng.nextRange(15, 25), 1);
    const sp = round(rng.nextRange(55, 80), 1);
    const kLoss = round(rng.nextRange(10, 35), 1);
    const tauOpen = rng.nextRange(10, 16);
    const C = round(kLoss * tauOpen, 0);
    // Duty cycle that holds the setpoint at equilibrium (well inside [0,1]).
    const uHold = rng.nextRange(0.4, 0.65);
    const P = round((kLoss * (sp - T_amb)) / uHold, 0);
    return { T_amb, C, P, kLoss, T0: T_amb, setpoint: sp };
  }

  describe(params: PlantParams): string[] {
    const p = { ...TANK_DEFAULTS, ...params };
    return [
      `ambient  ${fmt(p.T_amb, 1)} °C`,
      `capacity ${fmt(p.C, 0)} J/°C`,
      `heater   ${fmt(p.P, 0)} W`,
      `loss     ${fmt(p.kLoss, 1)} W/°C`,
      `setpoint ${fmt(p.setpoint, 1)} °C`,
    ];
  }

  // -- rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const light = isLightTheme();
    const text = light ? '#1c2333' : '#e6ebf5';
    const muted = light ? '#5b667c' : '#8b96ad';
    const stroke = light ? 'rgba(20,30,60,0.35)' : 'rgba(255,255,255,0.28)';
    const surface = light ? '#f4f6fb' : '#0f1420';

    const ambient = this.params.T_amb;
    const hot = Math.max(this.sp * 1.2, ambient + 20);
    const t01 = clamp((this.T - ambient) / (hot - ambient), 0, 1);

    ctx.clearRect(0, 0, w, h);

    const pad = 16;
    const tankX = pad + 6;
    const tankY = pad + 26;
    const tankW = Math.max(120, Math.min(w * 0.56, w - 190));
    const tankH = Math.max(110, h - tankY - pad - 30);

    // tank body -------------------------------------------------------------
    roundRect(ctx, tankX, tankY, tankW, tankH, 14);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // liquid ----------------------------------------------------------------
    const inset = 10;
    const lx = tankX + inset;
    const ly = tankY + inset;
    const lw = tankW - inset * 2;
    const lh = tankH - inset * 2 - 18; // leave room for the heater coil

    const [r, g, b] = colorForTheme('inferno', t01);
    const grad = ctx.createLinearGradient(0, ly, 0, ly + lh);
    grad.addColorStop(0, cssColor([r, g, b], 0.95));
    grad.addColorStop(1, cssColor([Math.round(r * 0.65), Math.round(g * 0.65), Math.round(b * 0.65)], 0.95));
    roundRect(ctx, lx, ly, lw, lh, 8);
    ctx.fillStyle = grad;
    ctx.fill();

    // surface highlight
    ctx.beginPath();
    ctx.moveTo(lx + 2, ly + 1.5);
    ctx.lineTo(lx + lw - 2, ly + 1.5);
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // bubbles (deterministic, driven by simulation time) --------------------
    if (this.u > 0.04) {
      const bubbles = 9;
      ctx.fillStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)';
      for (let i = 0; i < bubbles; i++) {
        const phase = (this.t * (0.35 + i * 0.05) + i * 0.137) % 1;
        const bx = lx + 12 + ((i * 37) % Math.max(1, lw - 24));
        const by = ly + lh - phase * (lh - 10);
        const rad = 1.5 + (i % 3);
        ctx.globalAlpha = this.u * (1 - phase) * 0.9;
        ctx.beginPath();
        ctx.arc(bx + Math.sin(this.t * 2 + i) * 3, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // heater coil -----------------------------------------------------------
    const coilY = tankY + tankH - 14;
    ctx.beginPath();
    ctx.moveTo(lx - 4, coilY);
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const x = lx - 4 + ((lw + 8) * (i + 1)) / segments;
      ctx.lineTo(x, coilY + (i % 2 === 0 ? -6 : 6));
    }
    const heat = colorForTheme('coolwarm', clamp(this.u, 0, 1));
    ctx.strokeStyle = this.u > 0.02 ? cssColor(heat) : stroke;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (this.u > 0.02) {
      ctx.shadowColor = cssColor(heat, 0.9);
      ctx.shadowBlur = 12 * this.u;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // thermometer -----------------------------------------------------------
    const thX = tankX + tankW + 34;
    const thW = 20;
    const thY = tankY + 6;
    const thH = tankH - 12;
    roundRect(ctx, thX, thY, thW, thH, thW / 2);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const thMax = hot;
    const thMin = Math.min(ambient - 5, 0);
    const fillH = clamp((this.T - thMin) / (thMax - thMin), 0, 1) * (thH - 6);
    roundRect(ctx, thX + 3, thY + thH - 3 - fillH, thW - 6, fillH, (thW - 6) / 2);
    ctx.fillStyle = cssColor(colorForTheme('inferno', t01));
    ctx.fill();

    // setpoint tick
    const spY = thY + thH - 3 - clamp((this.sp - thMin) / (thMax - thMin), 0, 1) * (thH - 6);
    ctx.beginPath();
    ctx.moveTo(thX - 6, spY);
    ctx.lineTo(thX + thW + 6, spY);
    ctx.strokeStyle = light ? '#2f6fe0' : '#4c8dff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // readouts --------------------------------------------------------------
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('Heated tank', pad + 4, pad + 14);

    // Temperature readout sits below the tank so it never competes with the
    // liquid colour (which turns bright at high temperature).
    const footerY = tankY + tankH + 22;
    const temp = fmt(this.T, 1);
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(temp, tankX, footerY);
    const tempWidth = ctx.measureText(temp).width;

    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('°C', tankX + tempWidth + 4, footerY);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`setpoint ${fmt(this.sp, 1)} °C`, tankX + tempWidth + 28, footerY);
    ctx.fillText(`heater ${Math.round(this.u * 100)} %`, thX + thW + 14, thY + 12);
    ctx.fillText(`t ${fmt(this.t, 1)} s`, thX + thW + 14, thY + 28);
  }
}
