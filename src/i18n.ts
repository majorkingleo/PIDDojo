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
  hide: string;
  show: string;
}

export const UI_TEXT: Record<Lang, UiText> = {
  en: {
    helpTitle: 'Help',
    mathTitle: 'Math & variables',
    hide: 'hide',
    show: 'show',
  },
  de: {
    helpTitle: 'Hilfe',
    mathTitle: 'Mathe & Variablen',
    hide: 'ausblenden',
    show: 'einblenden',
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
    title: 'Rules of the sandbox',
    entries: [
      {
        name: 'return value',
        description:
          'clamped to the actuator range (tank: 0…1 heater duty, balloon: 0…1 burner)',
      },
      { name: 'non-finite return', description: 'NaN / Infinity aborts the run' },
      {
        name: 'Math.random()',
        description: 'works, but breaks reproducibility of a workbook',
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
    title: 'Regeln der Sandbox',
    entries: [
      {
        name: 'Rückgabewert',
        description:
          'wird auf den Stellbereich begrenzt (Tank: 0…1 Tastgrad, Ballon: 0…1 Brenner)',
      },
      { name: 'kein endlicher Wert', description: 'NaN / Infinity bricht den Lauf ab' },
      {
        name: 'Math.random()',
        description: 'funktioniert, macht das Workbook aber nicht reproduzierbar',
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
