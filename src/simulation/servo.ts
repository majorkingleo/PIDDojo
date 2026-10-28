import type { Plant, PlantParams, RNG } from '../types';
import { clamp, fmt, round } from './plant';
import { colorForTheme, cssColor, isLightTheme } from '../colormaps';

// ---------------------------------------------------------------------------
// Servo / antenna heading — second-order rotational plant.
//
//   J·θ̈ = K·u − b·θ̇          u ∈ [−1, 1]  (motor torque, both directions)
//
// Under P control the closed loop is a damped second-order system: stable,
// reaches the target exactly (nothing opposes it at rest) but rings when the
// gain is high. This is the task where the D term of Phase 3 starts to matter.
// ---------------------------------------------------------------------------

const DEG = 180 / Math.PI;

export const SERVO_DEFAULTS: PlantParams = {
  J: 1.2,
  K: 6,
  b: 4,
  setpoint: 90,
};

export class ServoPlant implements Plant {
  private params: PlantParams = { ...SERVO_DEFAULTS };
  private th = 0; // rad
  private om = 0; // rad/s
  private sp = 90; // degrees
  private u = 0;
  private t = 0;

  configure(params: PlantParams, setpoint: number): void {
    this.params = { ...SERVO_DEFAULTS, ...params };
    this.sp = Number.isFinite(setpoint) ? setpoint : this.params.setpoint;
    this.reset();
  }

  setSetpoint(setpoint: number): void {
    if (Number.isFinite(setpoint)) this.sp = setpoint;
  }

  reset(): void {
    this.th = 0;
    this.om = 0;
    this.u = 0;
    this.t = 0;
  }

  step(u: number, dt: number): void {
    const { J, K, b } = this.params;
    const torque = K * u - b * this.om;
    this.om += (torque / Math.max(1e-6, J)) * dt;
    this.th += this.om * dt;
    this.u = u;
    this.t += dt;
  }

  /** Process value in degrees. */
  measurement(): number {
    return this.th * DEG;
  }

  randomize(rng: RNG): PlantParams {
    // Torque is tied to damping (K/b between 1 and 1.8 rad/s) so a fully
    // saturated motor can always slew the dial across its range quickly.
    const b = round(rng.nextRange(4, 7), 2);
    const K = round(b * rng.nextRange(1, 1.8), 1);
    return {
      J: round(rng.nextRange(0.8, 2), 2),
      K,
      b,
      setpoint: round(rng.nextRange(30, 150), 0),
    };
  }

  describe(params: PlantParams): string[] {
    const p = { ...SERVO_DEFAULTS, ...params };
    return [
      `inertia  ${fmt(p.J, 2)} kg·m²`,
      `torque   ${fmt(p.K, 1)} N·m`,
      `damping  ${fmt(p.b, 2)} N·m·s/rad`,
      `setpoint ${fmt(p.setpoint, 0)}°`,
    ];
  }

  // -- rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const light = isLightTheme();
    const text = light ? '#1c2333' : '#e6ebf5';
    const muted = light ? '#5b667c' : '#8b96ad';
    const line = light ? 'rgba(20,30,60,0.28)' : 'rgba(255,255,255,0.22)';
    const accent = light ? '#1f6fd0' : '#4c8dff';

    ctx.clearRect(0, 0, w, h);

    const pad = 16;
    const cx = w * 0.5;
    const cy = h - 34;
    const r = Math.min(w * 0.4, h * 0.72);

    // dial arc --------------------------------------------------------------
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.stroke();

    // ticks
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let deg = 0; deg <= 180; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const inner = deg % 45 === 0 ? r - 12 : r - 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy - Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r);
      ctx.strokeStyle = line;
      ctx.lineWidth = deg % 45 === 0 ? 1.6 : 1;
      ctx.stroke();
      if (deg % 45 === 0) {
        ctx.fillStyle = muted;
        ctx.fillText(`${deg}`, cx + Math.cos(a) * (r + 14), cy - Math.sin(a) * (r + 14) + 4);
      }
    }

    // target marker
    const spAngle = clamp(this.sp, -40, 220) * (Math.PI / 180);
    ctx.save();
    ctx.translate(cx + Math.cos(spAngle) * (r - 4), cy - Math.sin(spAngle) * (r - 4));
    ctx.rotate(-spAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -11);
    ctx.lineTo(6, -11);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    // needle ----------------------------------------------------------------
    const angle = this.th;
    const needle = colorForTheme('coolwarm', clamp(0.5 + this.u * 0.5, 0, 1));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (r - 8), cy - Math.sin(angle) * (r - 8));
    ctx.strokeStyle = cssColor(needle);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = light ? '#2a3243' : '#dbe3f2';
    ctx.fill();

    // readouts --------------------------------------------------------------
    ctx.textAlign = 'left';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('Antenna servo', pad + 2, pad + 12);

    const angleDeg = this.measurement();
    ctx.font = '700 28px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmt(angleDeg, 1)}`, pad + 2, pad + 45);
    const aw = ctx.measureText(`${fmt(angleDeg, 1)}`).width;
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('°', pad + 6 + aw, pad + 45);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`target ${fmt(this.sp, 0)}°`, pad + 2, pad + 63);
    ctx.fillText(`torque ${fmt(this.u, 2)}`, pad + 2, pad + 79);
    ctx.fillText(`t ${fmt(this.t, 1)} s`, pad + 2, pad + 95);
  }
}
