import type { Plant, PlantParams, RNG } from '../types';
import { clamp, fmt, round, roundRect } from './plant';
import { isLightTheme } from '../colormaps';

// ---------------------------------------------------------------------------
// Cruise control — car speed with quadratic drag, rolling resistance and a
// hill that arrives part-way through the run.
//
//   m·dv/dt = F·u − c_d·v² − k_roll·m·g − m·g·sin(θ(t))
//
// Physics runs in SI (m/s); the sensor reports km/h, which is also the unit of
// the setpoint and therefore the controller error.
// ---------------------------------------------------------------------------

const G = 9.81;
const KMH = 3.6;

export const CRUISE_DEFAULTS: PlantParams = {
  m: 1500,
  F: 6000,
  cd: 0.35,
  kRoll: 0.015,
  slope: 4,
  hillAt: 15,
  setpoint: 80,
};

export class CruisePlant implements Plant {
  private params: PlantParams = { ...CRUISE_DEFAULTS };
  private v = 0; // m/s
  private dist = 0; // m travelled (drives the road animation)
  private sp = 80; // km/h
  private u = 0;
  private t = 0;

  configure(params: PlantParams, setpoint: number): void {
    this.params = { ...CRUISE_DEFAULTS, ...params };
    this.sp = Number.isFinite(setpoint) ? setpoint : this.params.setpoint;
    this.reset();
  }

  setSetpoint(setpoint: number): void {
    if (Number.isFinite(setpoint)) this.sp = setpoint;
  }

  reset(): void {
    this.v = 0;
    this.dist = 0;
    this.u = 0;
    this.t = 0;
  }

  step(u: number, dt: number): void {
    const { m, F, cd, kRoll, slope, hillAt } = this.params;
    const theta = this.t >= hillAt ? (slope * Math.PI) / 180 : 0;

    const drive = F * u;
    const drag = cd * this.v * this.v;
    const roll = kRoll * m * G;
    const gravity = m * G * Math.sin(theta);

    const a = (drive - drag - roll - gravity) / m;
    this.v = Math.max(0, this.v + a * dt);
    this.dist += this.v * dt;
    this.u = u;
    this.t += dt;
  }

  /** Process value in km/h. */
  measurement(): number {
    return this.v * KMH;
  }

  randomize(rng: RNG): PlantParams {
    const m = round(rng.nextRange(1200, 1800), 0);
    const F = round(rng.nextRange(5000, 7500), 0);
    const cd = round(rng.nextRange(0.28, 0.42), 2);
    const kRoll = round(rng.nextRange(0.012, 0.018), 3);
    const slope = round(rng.nextRange(3, 5), 1);
    const setpoint = round(rng.nextRange(60, 100), 0);
    return { m, F, cd, kRoll, slope, hillAt: 15, setpoint };
  }

  describe(params: PlantParams): string[] {
    const p = { ...CRUISE_DEFAULTS, ...params };
    return [
      `mass     ${fmt(p.m, 0)} kg`,
      `thrust   ${fmt(p.F, 0)} N`,
      `drag     ${fmt(p.cd, 2)} N·s²/m²`,
      `hill     ${fmt(p.slope, 1)}° at ${fmt(p.hillAt, 0)} s`,
      `setpoint ${fmt(p.setpoint, 0)} km/h`,
    ];
  }

  // -- rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const light = isLightTheme();
    const text = light ? '#1c2333' : '#e6ebf5';
    const muted = light ? '#5b667c' : '#8b96ad';

    ctx.clearRect(0, 0, w, h);

    // sky -------------------------------------------------------------------
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    if (light) {
      sky.addColorStop(0, '#cfe4ff');
      sky.addColorStop(1, '#eef5ff');
    } else {
      sky.addColorStop(0, '#0d1526');
      sky.addColorStop(1, '#1b2740');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const roadBaseY = h - 62;
    const angle = this.roadAngle();
    const slope = Math.tan(angle);
    const roadY = (x: number): number => roadBaseY - slope * (x - w * 0.35);

    // distant hills once the slope is there
    if (angle > 0.001) {
      ctx.beginPath();
      ctx.moveTo(0, roadBaseY);
      ctx.lineTo(w * 0.35, roadBaseY);
      ctx.lineTo(w, roadY(w));
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = light ? '#c8dfc0' : '#16241f';
      ctx.fill();
    }

    // road ------------------------------------------------------------------
    ctx.beginPath();
    ctx.moveTo(0, roadY(0));
    ctx.lineTo(w, roadY(w));
    ctx.lineWidth = 26;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = light ? '#4c5364' : '#2a3243';
    ctx.stroke();

    // centre dashes scroll with the distance travelled
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, roadY(0));
    ctx.lineTo(w, roadY(w));
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 14]);
    ctx.lineDashOffset = this.dist * 6;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)';
    ctx.stroke();
    ctx.restore();

    // car -------------------------------------------------------------------
    const carX = w * 0.32;
    const carY = roadY(carX) - 17;
    this.drawCar(ctx, carX, carY, light);

    // readouts --------------------------------------------------------------
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('Cruise control', pad + 2, pad + 12);

    const speed = this.v * KMH;
    ctx.font = '700 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmt(speed, 0)}`, pad + 2, pad + 48);
    const speedW = ctx.measureText(`${fmt(speed, 0)}`).width;
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('km/h', pad + 8 + speedW, pad + 48);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`target ${fmt(this.sp, 0)} km/h`, pad + 2, pad + 66);
    ctx.fillText(
      angle > 0.001 ? `hill ${fmt(this.params.slope, 1)}°` : 'flat road',
      pad + 2,
      pad + 82,
    );

    // throttle bar
    const barW = 90;
    const barX = w - pad - barW;
    const barY = pad + 8;
    ctx.fillStyle = light ? 'rgba(20,30,60,0.12)' : 'rgba(255,255,255,0.12)';
    roundRect(ctx, barX, barY, barW, 8, 4);
    ctx.fill();
    ctx.fillStyle = this.u > 0.02 ? '#5cc8ff' : 'rgba(140,150,170,0.6)';
    roundRect(ctx, barX, barY, barW * clamp(this.u, 0, 1), 8, 4);
    ctx.fill();
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(`throttle ${Math.round(this.u * 100)} %`, barX, barY + 22);
    ctx.fillText(`t ${fmt(this.t, 1)} s`, barX, barY + 37);
  }

  /** Smoothly introduces the hill at `hillAt`. */
  private roadAngle(): number {
    const { slope, hillAt } = this.params;
    const ramp = clamp((this.t - hillAt) / 1.5, 0, 1);
    return ((slope * Math.PI) / 180) * ramp * ramp * (3 - 2 * ramp);
  }

  private drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, light: boolean): void {
    const bodyW = 58;
    const bodyH = 16;

    // shadow
    ctx.fillStyle = light ? 'rgba(20,30,60,0.15)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + bodyW / 2, y + bodyH + 10, bodyW / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    roundRect(ctx, x, y, bodyW, bodyH, 5);
    ctx.fillStyle = light ? '#2f6fe0' : '#4c8dff';
    ctx.fill();

    // cabin
    roundRect(ctx, x + 14, y - 11, bodyW - 26, 13, 4);
    ctx.fillStyle = light ? '#9dc0f5' : '#9cc4ff';
    ctx.fill();

    // wheels
    ctx.fillStyle = light ? '#20242e' : '#0c1018';
    for (const wx of [x + 12, x + bodyW - 12]) {
      ctx.beginPath();
      ctx.arc(wx, y + bodyH + 3, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
