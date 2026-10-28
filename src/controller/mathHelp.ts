// ---------------------------------------------------------------------------
// The "Math & variables" help box next to the editor.
// The catalogue itself lives in src/i18n.ts (one copy per language); this
// module only renders it.
// ---------------------------------------------------------------------------

import { MATH_HELP } from '../i18n';
import type { Lang } from '../types';

export type { HelpEntry, HelpGroup } from '../i18n';

/** Render the help box into `container`, replacing previous content. */
export function renderMathHelp(container: HTMLElement, lang: Lang): void {
  container.textContent = '';
  for (const group of MATH_HELP[lang]) {
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
