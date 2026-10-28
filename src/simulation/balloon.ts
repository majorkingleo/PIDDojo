import type { Plant, PlantParams, RNG } from '../types';
import { clamp, fmt, round, roundRect } from './plant';
import { colorAt, colorForTheme, cssColor, isLightTheme } from '../colormaps';

// ---------------------------------------------------------------------------
// Hot-air balloon — vertical 1-D motion with buoyancy, weight, drag, burner.
//
//   F = B0 + B_gain * u - m * g - kDrag * v
//   a = F / m        v += a dt        h += v dt
//
// This is an *integrating* plant (velocity → altitude): stable under P control
// because of drag, but it always settles with an offset from the setpoint.
// ---------------------------------------------------------------------------

export const G = 9.81;

export const BALLOON_DEFAULTS: PlantParams = {
  m: 250,
  B0: 2250,
  B_gain: 2200,
  kDrag: 200,
  h0: 0,
  setpoint: 150,
};

export class BalloonPlant implements Plant {
  private params: PlantParams = { ...BALLOON_DEFAULTS };
  private h = 0;
  private v = 0;
  private sp = 150;
  private u = 0;
  private t = 0;

  configure(params: PlantParams, setpoint: number): void {
    this.params = { ...BALLOON_DEFAULTS, ...params };
    this.sp = Number.isFinite(setpoint) ? setpoint : this.params.setpoint;
    this.reset();
  }

  reset(): void {
    this.h = this.params.h0 ?? 0;
    this.v = 0;
    this.u = 0;
    this.t = 0;
  }

  step(u: number, dt: number): void {
    const { m, B0, B_gain, kDrag } = this.params;
    const F = B0 + B_gain * u - m * G - kDrag * this.v;
    this.v += (F / m) * dt;
    this.h += this.v * dt;
    if (this.h < 0) {
      this.h = 0;
      if (this.v < 0) this.v = 0;
    }
    this.u = u;
    this.t += dt;
  }

  measurement(): number {
    return this.h;
  }

  /**
   * Randomise a solvable balloon: the envelope is a bit heavier than the
   * displaced air (so it sinks with the burner off) and drag is sized from a
   * target full-burner climb speed, which keeps P control well damped.
   */
  randomize(rng: RNG): PlantParams {
    const m = round(rng.nextRange(180, 320), 0);
    const weight = m * G;
    const r0 = rng.nextRange(0.9, 0.97); // lift at u = 0 (just below weight)
    const rb = rng.nextRange(0.8, 1.2);  // burner authority
    const B0 = round(weight * r0, 0);
    const B_gain = round(weight * rb, 0);
    const vClimb = rng.nextRange(8, 14); // terminal speed at full burner
    const kDrag = round((B0 + B_gain - weight) / vClimb, 0);
    const sp = round(rng.nextRange(100, 300), 0);
    return { m, B0, B_gain, kDrag, h0: 0, setpoint: sp };
  }

  describe(params: PlantParams): string[] {
    const p = { ...BALLOON_DEFAULTS, ...params };
    return [
      `mass     ${fmt(p.m, 0)} kg`,
      `lift     ${fmt(p.B0, 0)} N`,
      `burner   +${fmt(p.B_gain, 0)} N`,
      `drag     ${fmt(p.kDrag, 0)} N·s/m`,
      `setpoint ${fmt(p.setpoint, 0)} m`,
    ];
  }

  // -- rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, w: number, hgt: number): void {
    const light = isLightTheme();
    const text = light ? '#1c2333' : '#e6ebf5';
    const muted = light ? '#5b667c' : '#8b96ad';

    ctx.clearRect(0, 0, w, hgt);

    // sky -------------------------------------------------------------------
    const sky = ctx.createLinearGradient(0, 0, 0, hgt);
    if (light) {
      sky.addColorStop(0, '#cfe4ff');
      sky.addColorStop(1, '#eef5ff');
    } else {
      sky.addColorStop(0, '#0d1526');
      sky.addColorStop(1, '#1b2740');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hgt);

    const pad = 16;
    const groundY = hgt - 34;
    const topPad = pad + 30;
    const altMax = Math.max(this.sp * 1.3, this.h * 1.12, 60);

    const yFor = (alt: number): number =>
      groundY - clamp(alt / altMax, 0, 1) * (groundY - topPad);

    // ground ----------------------------------------------------------------
    ctx.fillStyle = light ? '#c8dfc0' : '#16241f';
    ctx.fillRect(0, groundY, w, hgt - groundY);
    ctx.strokeStyle = light ? 'rgba(30,60,40,0.45)' : 'rgba(120,200,160,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // altitude scale --------------------------------------------------------
    const scaleX = w - 34;
    ctx.strokeStyle = light ? 'rgba(20,30,60,0.25)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleX, topPad);
    ctx.lineTo(scaleX, groundY);
    ctx.stroke();
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const alt = (altMax * i) / ticks;
      const y = yFor(alt);
      ctx.beginPath();
      ctx.moveTo(scaleX - 4, y);
      ctx.lineTo(scaleX + 4, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(alt)}`, scaleX + 7, y + 4);
    }

    // setpoint line ---------------------------------------------------------
    const spY = yFor(this.sp);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = light ? 'rgba(47,111,224,0.85)' : 'rgba(76,141,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, spY);
    ctx.lineTo(scaleX - 10, spY);
    ctx.stroke();
    ctx.restore();

    // balloon ---------------------------------------------------------------
    const cx = w * 0.42 + Math.sin(this.t * 0.6) * 5;
    const by = yFor(this.h);
    drawBalloon(ctx, cx, by, this.u, light);

    // readouts --------------------------------------------------------------
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('Hot-air balloon', pad + 2, pad + 12);

    ctx.font = '700 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmt(this.h, 0)}`, pad + 2, pad + 40);
    const hw = ctx.measureText(`${fmt(this.h, 0)}`).width;
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('m', pad + 6 + hw, pad + 40);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`setpoint ${fmt(this.sp, 0)} m`, pad + 2, pad + 58);
    ctx.fillText(`burner ${Math.round(this.u * 100)} %`, pad + 2, pad + 74);
    ctx.fillText(`v ${fmt(this.v, 1)} m/s`, pad + 2, pad + 90);
  }
}

function drawBalloon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  u: number,
  light: boolean,
): void {
  const rw = 22;
  const rh = 28;

  // ropes + basket
  ctx.strokeStyle = light ? 'rgba(60,50,35,0.8)' : 'rgba(220,205,180,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, y + rh);
  ctx.lineTo(cx - 6, y + rh + 16);
  ctx.moveTo(cx + 10, y + rh);
  ctx.lineTo(cx + 6, y + rh + 16);
  ctx.stroke();

  ctx.fillStyle = light ? '#8a6a45' : '#5a4630';
  roundRect(ctx, cx - 8, y + rh + 14, 16, 11, 2);
  ctx.fill();

  // envelope
  const env = ctx.createLinearGradient(cx - rw, y - rh, cx + rw, y + rh);
  const warm = colorAt('coolwarm', clamp(0.62 + u * 0.3, 0, 1));
  env.addColorStop(0, warm);
  env.addColorStop(1, light ? '#f6f1e6' : '#d9d2c4');
  ctx.beginPath();
  ctx.moveTo(cx, y - rh);
  ctx.bezierCurveTo(cx + rw * 1.15, y - rh * 0.85, cx + rw * 0.95, y + rh * 0.75, cx, y + rh);
  ctx.bezierCurveTo(cx - rw * 0.95, y + rh * 0.75, cx - rw * 1.15, y - rh * 0.85, cx, y - rh);
  ctx.closePath();
  ctx.fillStyle = env;
  ctx.fill();
  ctx.strokeStyle = light ? 'rgba(60,50,35,0.55)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // seam
  ctx.beginPath();
  ctx.moveTo(cx, y - rh + 3);
  ctx.lineTo(cx, y + rh - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();

  // flame
  if (u > 0.03) {
    const flame = colorForTheme('heat', clamp(0.35 + u * 0.65, 0, 1));
    const fh = 8 + u * 14;
    ctx.beginPath();
    ctx.moveTo(cx, y + rh + 12);
    ctx.lineTo(cx - 4, y + rh + 12 - fh);
    ctx.lineTo(cx, y + rh + 12 - fh * 0.55);
    ctx.lineTo(cx + 4, y + rh + 12 - fh);
    ctx.closePath();
    ctx.fillStyle = cssColor(flame, 0.9);
    ctx.fill();
  }
}
