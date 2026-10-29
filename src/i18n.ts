// ---------------------------------------------------------------------------
// Localisation catalogue (EN / DE).
//
// Only user-facing *learning* content is translated: the per-task help page
// and the math / variable reference. The code editor, metrics and buttons stay
// in English so that the same Kp / settle-time vocabulary is used everywhere.
// ---------------------------------------------------------------------------

import type { Lang, Localized } from './types';

export interface LangOption {
  id: Lang;
  label: string;
  /** Value for the <html lang> attribute. */
  htmlLang: string;
}

export const LANGS: LangOption[] = [
  { id: 'en', label: 'EN', htmlLang: 'en' },
  { id: 'de', label: 'DE', htmlLang: 'de' },
];

export const LANG_KEY = 'pid-dojo-lang';

export function isLang(value: unknown): value is Lang {
  return LANGS.some((entry) => entry.id === value);
}

/** Stored choice, else the browser language, else English. */
export function detectLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  if (isLang(stored)) return stored;

  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of candidates) {
    if (typeof tag !== 'string') continue;
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
}

// ---------------------------------------------------------------------------
// Chrome strings that belong to the help surfaces
// ---------------------------------------------------------------------------

export interface UiText {
  helpTitle: string;
  mathTitle: string;
}

export const UI_TEXT: Record<Lang, UiText> = {
  en: {
    helpTitle: 'Help',
    mathTitle: 'Math & variables',
  },
  de: {
    helpTitle: 'Hilfe',
    mathTitle: 'Mathe & Variablen',
  },
};

// ---------------------------------------------------------------------------
// Math / variable reference
// ---------------------------------------------------------------------------

export interface HelpEntry {
  name: string;
  description: string;
}

export interface HelpGroup {
  title: string;
  entries: HelpEntry[];
}

const MATH_HELP_EN: HelpGroup[] = [
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
    title: 'Debug output',
    entries: [
      {
        name: 'debug(value, …)',
        description: 'prints its arguments to the Debug log tab (max 500 lines per run)',
      },
      { name: 'log(value, …)', description: 'alias of debug()' },
    ],
  },
  {
    title: 'Rules of the sandbox',
    entries: [
      {
        name: 'return value',
        description:
          'clamped to the task\u2019s actuator range — 0…1 for heaters, valves and burners, −1…1 for the servo',
      },
      { name: 'non-finite return', description: 'NaN / Infinity aborts the run' },
      {
        name: 'Math.random()',
        description: 'works, but breaks reproducibility of a worksheet',
      },
    ],
  },
];

const MATH_HELP_DE: HelpGroup[] = [
  {
    title: 'Injizierte Variablen',
    entries: [
      { name: 'e', description: 'Fehler = Sollwert − Messwert' },
      { name: 'dt', description: 'Simulationszeitschritt in Sekunden (0,01)' },
      { name: 'mem', description: 'persistentes Objekt, bei jedem Lauf neu' },
      { name: 'mem.sp', description: 'aktueller Sollwert' },
      { name: 'mem.pv', description: 'aktuelle Messung (Regelgröße)' },
      { name: 'mem.prevE', description: 'Fehler des vorherigen Schritts' },
      { name: 'mem.t', description: 'Simulationszeit in Sekunden' },
      { name: 'mem.i', description: 'freier Platz — üblicher Integralspeicher' },
    ],
  },
  {
    title: 'Mathefunktionen',
    entries: [
      { name: 'abs(x)', description: 'Betrag' },
      { name: 'min(a, b)', description: 'kleinerer der beiden Werte' },
      { name: 'max(a, b)', description: 'größerer der beiden Werte' },
      { name: 'sign(x)', description: '−1, 0 oder 1' },
      { name: 'pow(x, y)', description: 'x hoch y' },
      { name: 'sqrt(x)', description: 'Quadratwurzel' },
      { name: 'exp(x)', description: 'e hoch x' },
      { name: 'log(x)', description: 'natürlicher Logarithmus' },
      { name: 'log10(x)', description: 'Zehnerlogarithmus' },
      { name: 'sin(x)', description: 'Sinus (Bogenmaß)' },
      { name: 'cos(x)', description: 'Kosinus (Bogenmaß)' },
      { name: 'tan(x)', description: 'Tangens (Bogenmaß)' },
      { name: 'atan(x)', description: 'Arkustangens (Bogenmaß)' },
      { name: 'atan2(y, x)', description: 'Winkel des Punktes (x, y)' },
      { name: 'round(x)', description: 'nächste ganze Zahl' },
      { name: 'floor(x)', description: 'abrunden' },
      { name: 'ceil(x)', description: 'aufrunden' },
      { name: 'trunc(x)', description: 'Nachkommastellen abschneiden' },
    ],
  },
  {
    title: 'Konstanten',
    entries: [
      { name: 'Math.PI', description: '3,14159…' },
      { name: 'Math.E', description: '2,71828…' },
    ],
  },
  {
    title: 'Debug-Ausgabe',
    entries: [
      {
        name: 'debug(value, …)',
        description: 'schreibt seine Argumente in den Tab „Debug log“ (max. 500 Zeilen pro Lauf)',
      },
      { name: 'log(value, …)', description: 'Alias für debug()' },
    ],
  },
  {
    title: 'Regeln der Sandbox',
    entries: [
      {
        name: 'Rückgabewert',
        description:
          'wird auf den Stellbereich der Aufgabe begrenzt — 0…1 für Heizung, Ventil und Brenner, −1…1 für das Servo',
      },
      { name: 'kein endlicher Wert', description: 'NaN / Infinity bricht den Lauf ab' },
      {
        name: 'Math.random()',
        description: 'funktioniert, macht das Worksheet aber nicht reproduzierbar',
      },
    ],
  },
];

export const MATH_HELP: Record<Lang, HelpGroup[]> = {
  en: MATH_HELP_EN,
  de: MATH_HELP_DE,
};

// ---------------------------------------------------------------------------
// Task help pages (markdown)
// ---------------------------------------------------------------------------

export const TANK_HELP: Localized = {
  en: `
## Heated tank

A tank is heated by an electric heater and loses heat to the room.
Your job: hold the water temperature at the setpoint with a
**P controller**.

### Model

\`\`\`
dT/dt = ( P·u − k_loss·(T − T_amb) ) / C
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | heater duty cycle, 0…1 (your return value, clamped) |
| \`P\` | heater power [W] |
| \`k_loss\` | heat-loss coefficient [W/°C] |
| \`C\` | thermal capacity [J/°C] |
| \`T_amb\` | ambient temperature [°C] |

### What you control

Your function receives \`e = setpoint − T\` and returns \`u\`.
Start with \`u = Kp·e\`.

- Too small **Kp** → slow approach.
- Too large **Kp** → the heater saturates at 100 % and overshoots.

### Phase 1: proportional only

A P controller can never reach the setpoint exactly: at equilibrium the
heater must supply the standing loss, so

\`\`\`
offset = u_hold / Kp
\`\`\`

That offset is **allowed** — keep it below the tolerance shown in the
acceptance criteria. The integral term that removes it comes in Phase 2.

### Acceptance

- settle time ≤ **30 s**
- overshoot ≤ **20 %**
- steady-state |error| ≤ **1.5 °C**
`,
  de: `
## Beheizter Tank

Ein Tank wird von einer elektrischen Heizung erwärmt und gibt Wärme an den
Raum ab. Deine Aufgabe: die Wassertemperatur mit einem **P-Regler** auf dem
Sollwert halten.

### Modell

\`\`\`
dT/dt = ( P·u − k_loss·(T − T_amb) ) / C
\`\`\`

| Symbol | Bedeutung |
| --- | --- |
| \`u\` | Tastgrad der Heizung, 0…1 (dein Rückgabewert, begrenzt) |
| \`P\` | Heizleistung [W] |
| \`k_loss\` | Wärmeverlustkoeffizient [W/°C] |
| \`C\` | Wärmekapazität [J/°C] |
| \`T_amb\` | Umgebungstemperatur [°C] |

### Was du steuerst

Deine Funktion bekommt \`e = Sollwert − T\` und gibt \`u\` zurück.
Fang mit \`u = Kp·e\` an.

- Zu kleines **Kp** → langsames Annähern.
- Zu großes **Kp** → die Heizung läuft auf 100 % und es kommt zum
  Überschwingen.

### Phase 1: nur proportional

Ein P-Regler erreicht den Sollwert nie exakt: im Gleichgewicht muss die
Heizung die Verluste decken, also gilt

\`\`\`
offset = u_hold / Kp
\`\`\`

Dieser Offset ist **erlaubt** — halte ihn unter der Toleranz aus den
Abnahmekriterien. Der I-Anteil, der ihn beseitigt, kommt in Phase 2.

### Abnahmekriterien

- Einschwingzeit ≤ **30 s**
- Überschwingen ≤ **20 %**
- bleibende |Regelabweichung| ≤ **1,5 °C**
`,
};

export const BALLOON_HELP: Localized = {
  en: `
## Hot-air balloon

A balloon has to hold an altitude. The burner adds buoyancy, drag damps
the motion, and gravity pulls the whole thing down.

### Model

\`\`\`
F = B0 + B_gain·u − m·g − k_drag·v
a = F / m          v += a·dt          h += v·dt
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | burner intensity, 0…1 (your return value, clamped) |
| \`B0\` | buoyancy with the burner off [N] |
| \`B_gain\` | extra buoyancy at full burner [N] |
| \`m\` | total mass [kg] |
| \`k_drag\` | drag [N·s/m] |

### What you control

Your function receives \`e = setpoint − h\` and returns \`u\`.

This is an **integrating** plant: the burner sets the *climb rate*, and the
climb rate sets the altitude. Under P control it behaves like a damped
second-order system — stable, but with a real offset:

\`\`\`
offset = u_hold / Kp        u_hold ≈ (m·g − B0) / B_gain
\`\`\`

\`u\` is usually tiny (a few percent), so **Kp must be much smaller than for
the tank** — start around \`0.05\`.

### Phase 1: proportional only

Offset is allowed and expected. Get the balloon into the altitude band and
keep it there; damping comes with the D term in Phase 3.

### Acceptance

- settle time ≤ **40 s**
- steady-state |error| ≤ **15 m** (the offset band)
- overshoot is not scored here
`,
  de: `
## Heißluftballon

Ein Ballon soll eine Höhe halten. Der Brenner liefert Auftrieb, der
Luftwiderstand dämpft die Bewegung und die Gravitation zieht alles nach unten.

### Modell

\`\`\`
F = B0 + B_gain·u − m·g − k_drag·v
a = F / m          v += a·dt          h += v·dt
\`\`\`

| Symbol | Bedeutung |
| --- | --- |
| \`u\` | Brennerintensität, 0…1 (dein Rückgabewert, begrenzt) |
| \`B0\` | Auftrieb ohne Brenner [N] |
| \`B_gain\` | zusätzlicher Auftrieb bei Vollast [N] |
| \`m\` | Gesamtmasse [kg] |
| \`k_drag\` | Luftwiderstand [N·s/m] |

### Was du steuerst

Deine Funktion bekommt \`e = Sollwert − h\` und gibt \`u\` zurück.

Das ist eine **integrierende** Strecke: der Brenner bestimmt die
*Steiggeschwindigkeit*, und die bestimmt die Höhe. Mit P-Regelung verhält sie
sich wie ein gedämpftes System zweiter Ordnung — stabil, aber mit echtem
Offset:

\`\`\`
offset = u_hold / Kp        u_hold ≈ (m·g − B0) / B_gain
\`\`\`

\`u\` ist meist winzig (wenige Prozent), deshalb muss **Kp viel kleiner sein
als beim Tank** — starte bei etwa \`0.05\`.

### Phase 1: nur proportional

Der Offset ist erlaubt und zu erwarten. Bring den Ballon ins Höhenband und
halte ihn dort; die Dämpfung kommt mit dem D-Anteil in Phase 3.

### Abnahmekriterien

- Einschwingzeit ≤ **40 s**
- bleibende |Regelabweichung| ≤ **15 m** (Offset-Band)
- Überschwingen wird hier nicht bewertet
`,
};

export const CRUISE_HELP: Localized = {
  en: `
## Cruise control

The car has to hold a target speed. The throttle \`u\` (0…1) pushes it
forward, air drag grows with the square of the speed, and at **t = 15 s** the
road starts to climb at 3…5°.

### Model

\`\`\`
m·dv/dt = F·u − c_d·v² − k_roll·m·g − m·g·sin(θ)
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | throttle, 0…1 (clamped) |
| \`F\` | maximum thrust [N] |
| \`c_d\` | aerodynamic drag [N·s²/m²] |
| \`k_roll\` | rolling-resistance coefficient |
| \`θ\` | road slope: 0 before the hill, constant afterwards |

The process value is in **km/h**, so \`e\` and \`Kp\` are in km/h as well.

### What you control

\`u = Kp·e\`. On the flat the engine only has to beat drag and rolling
resistance; on the hill it must also lift the car:

\`\`\`
offset = u_hold / Kp
\`\`\`

That is the point of this task: **P cannot remove the offset**, and the
harder the plant has to work, the bigger it gets. Phase 2 adds the integral
term that fixes it.

### Acceptance

- settle time ≤ **30 s** (the run always continues to t = 25 s, so the hill is included)
- overshoot ≤ **15 %**
- steady-state |error| ≤ **1.5 km/h**
`,
  de: `
## Tempomat

Das Auto soll eine Zielgeschwindigkeit halten. Das Gaspedal \`u\` (0…1)
beschleunigt, der Luftwiderstand wächst mit dem Quadrat der Geschwindigkeit,
und ab **t = 15 s** steigt die Straße mit 3…5° an.

### Modell

\`\`\`
m·dv/dt = F·u − c_d·v² − k_roll·m·g − m·g·sin(θ)
\`\`\`

| Symbol | Bedeutung |
| --- | --- |
| \`u\` | Gaspedal, 0…1 (begrenzt) |
| \`F\` | maximale Antriebskraft [N] |
| \`c_d\` | Luftwiderstand [N·s²/m²] |
| \`k_roll\` | Rollwiderstandsbeiwert |
| \`θ\` | Steigung: 0 vor dem Berg, danach konstant |

Die Regelgröße ist in **km/h**, also sind \`e\` und \`Kp\` ebenfalls in km/h.

### Was du steuerst

\`u = Kp·e\`. In der Ebene muss der Motor nur Luft- und Rollwiderstand
überwinden, am Berg zusätzlich das Gewicht heben:

\`\`\`
offset = u_hold / Kp
\`\`\`

Genau darum geht es hier: **P kann diesen Offset nicht beseitigen**, und je
mehr die Strecke arbeiten muss, desto größer wird er. Phase 2 ergänzt den
I-Anteil, der das behebt.

### Abnahmekriterien

- Einschwingzeit ≤ **30 s** (der Lauf geht immer bis t = 25 s, damit der Berg enthalten ist)
- Überschwingen ≤ **15 %**
- bleibende |Regelabweichung| ≤ **1,5 km/h**
`,
};

export const SERVO_HELP: Localized = {
  en: `
## Antenna servo

A dish has to point at a target angle. The motor torque works in both
directions: \`u ∈ [−1, 1]\` (negative torque turns the other way).

### Model

\`\`\`
J·θ̈ = K·u − b·θ̇
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | motor torque, −1…1 (clamped) |
| \`J\` | inertia [kg·m²] |
| \`K\` | torque constant [N·m] |
| \`b\` | viscous damping [N·m·s/rad] |

The process value is the angle in **degrees**.

### What you control

\`u = Kp·e\`, with \`e\` in degrees.

This is a **second-order** plant, so the closed loop behaves like a damped
oscillator:

- large \`Kp\` → fast, but it rings and overshoots
- small \`Kp\` → smooth, but sluggish

Nothing pushes the antenna back at rest, so there is **no offset** here — the
angle really does reach the target. What P costs you is overshoot and
ringing; the D term of Phase 3 is what damps that.

### Acceptance

- settle time ≤ **6 s**
- overshoot ≤ **15 %**
- steady-state |error| ≤ **1°**
`,
  de: `
## Antennen-Servo

Eine Antenne soll auf einen Zielwinkel zeigen. Das Motormoment wirkt in beide
Richtungen: \`u ∈ [−1, 1]\` (negatives Moment dreht zurück).

### Modell

\`\`\`
J·θ̈ = K·u − b·θ̇
\`\`\`

| Symbol | Bedeutung |
| --- | --- |
| \`u\` | Motormoment, −1…1 (begrenzt) |
| \`J\` | Trägheitsmoment [kg·m²] |
| \`K\` | Momentenkonstante [N·m] |
| \`b\` | viskose Dämpfung [N·m·s/rad] |

Die Regelgröße ist der Winkel in **Grad**.

### Was du steuerst

\`u = Kp·e\`, mit \`e\` in Grad.

Das ist eine **Strecke zweiter Ordnung**, der geschlossene Kreis verhält sich
wie ein gedämpfter Oszillator:

- großes \`Kp\` → schnell, aber es schwingt und überschwingt
- kleines \`Kp\` → ruhig, aber träge

Im Stillstand wirkt nichts gegen die Antenne, deshalb gibt es hier **keinen
Offset** — der Winkel erreicht den Sollwert wirklich. Was P kostet, sind
Überschwingen und Nachschwingen; der D-Anteil aus Phase 3 dämpft das.

### Abnahmekriterien

- Einschwingzeit ≤ **6 s**
- Überschwingen ≤ **15 %**
- bleibende |Regelabweichung| ≤ **1°**
`,
};

export const LEVEL_HELP: Localized = {
  en: `
## Level tank

Water flows in through a valve and drains out of the bottom under gravity.

### Model

\`\`\`
A·dh/dt = q_in·u − k_out·√h
\`\`\`

| symbol | meaning |
| --- | --- |
| \`u\` | inlet valve, 0…1 (clamped) |
| \`A\` | tank area [m²] |
| \`q_in\` | inlet flow at a fully open valve [m³/s] |
| \`k_out\` | drain coefficient |

The process value is the level in **metres**.

### What you control

\`u = Kp·e\` with \`e\` in metres.

The drain grows with **√h**, so the plant is nonlinear: the same \`Kp\` reacts
quite differently at a low and at a high level. At the setpoint the valve
has to stay partly open, so P leaves the usual offset:

\`\`\`
offset = u_hold / Kp
\`\`\`

### Acceptance

- settle time ≤ **25 s**
- overshoot ≤ **10 %**
- steady-state |error| ≤ **0.1 m**
`,
  de: `
## Füllstandstank

Wasser läuft über ein Ventil hinein und unten unter Schwerkraft wieder heraus.

### Modell

\`\`\`
A·dh/dt = q_in·u − k_out·√h
\`\`\`

| Symbol | Bedeutung |
| --- | --- |
| \`u\` | Zulaufventil, 0…1 (begrenzt) |
| \`A\` | Tankfläche [m²] |
| \`q_in\` | Zulauf bei ganz offenem Ventil [m³/s] |
| \`k_out\` | Ablaufkoeffizient |

Die Regelgröße ist der Füllstand in **Metern**.

### Was du steuerst

\`u = Kp·e\` mit \`e\` in Metern.

Der Ablauf wächst mit **√h**, die Strecke ist also nichtlinear: dasselbe \`Kp\`
wirkt bei niedrigem und bei hohem Füllstand unterschiedlich. Am Sollwert muss
das Ventil teilweise offen bleiben, deshalb bleibt der übliche Offset:

\`\`\`
offset = u_hold / Kp
\`\`\`

### Abnahmekriterien

- Einschwingzeit ≤ **25 s**
- Überschwingen ≤ **10 %**
- bleibende |Regelabweichung| ≤ **0,1 m**
`,
};

export const BALLOON_RAMP_HELP: Localized = {
  en: `
## Balloon climb

The same balloon as in *Hot-air balloon*, but now the target **moves**: it
climbs at a constant **2 m/s** for the whole run.

### Model

\`\`\`
F = B0 + B_gain·u − m·g − k_drag·v
\`\`\`

\`u\` is the burner (0…1), \`v\` the climb rate and \`h\` the altitude — see the
other balloon task for the parameter table.

### What you control

\`u = Kp·e\`, \`e = sp(t) − h\`.

Following a moving target is different from reaching a fixed one. To keep up
with a ramp the burner must hold a standing climb rate, and that needs a
standing control effort. With P control the result is a **constant lag**:

\`\`\`
lag ≈ u_hold(climb rate) / Kp
\`\`\`

That lag is what gets scored here: the run continues to the end and the error
is averaged over the last 5 s, while the target is still climbing.

### Acceptance

- no settle time is scored (the target never stops)
- steady-state |error| (the lag) ≤ **6 m**
`,
  de: `
## Ballon-Steigflug

Derselbe Ballon wie bei *Heißluftballon*, aber der Sollwert **bewegt sich**:
er steigt während des ganzen Laufs mit konstant **2 m/s**.

### Modell

\`\`\`
F = B0 + B_gain·u − m·g − k_drag·v
\`\`\`

\`u\` ist der Brenner (0…1), \`v\` die Steiggeschwindigkeit und \`h\` die Höhe —
die Parametertabelle steht in der anderen Ballon-Aufgabe.

### Was du steuerst

\`u = Kp·e\`, \`e = sp(t) − h\`.

Einem bewegten Sollwert zu folgen ist etwas anderes, als einen festen zu
erreichen. Für eine Rampe muss der Brenner eine bleibende Steigrate halten,
und dafür braucht es einen bleibenden Stellgrad. Mit P-Regelung ergibt das
einen **konstanten Rückstand**:

\`\`\`
lag ≈ u_hold(Steigrate) / Kp
\`\`\`

Dieser Rückstand wird hier bewertet: der Lauf geht bis zum Ende und der
Fehler wird über die letzten 5 s gemittelt, während der Sollwert weiter
steigt.

### Abnahmekriterien

- keine Einschwingzeit (der Sollwert hört nie auf zu steigen)
- bleibende |Regelabweichung| (der Rückstand) ≤ **6 m**
`,
};
