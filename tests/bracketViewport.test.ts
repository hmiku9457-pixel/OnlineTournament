import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BracketRoundViewport } from '@/components/BracketRoundViewport';
import { getBracketCompactStartIndex } from '@/domain/bracketViewport';

function round(label: string, count: number, live = false) {
  return { label, matches: Array.from({ length: count }, (_, index) => ({ id: `${label}-${index}`, live: live && index === 0 })) };
}

describe('Kompakte Ansicht großer K.-o.-Brackets', () => {
  it('belässt kleine K.-o.-Felder vollständig sichtbar', () => {
    expect(getBracketCompactStartIndex([round('Viertelfinale', 4), round('Halbfinale', 2), round('Finale', 1)])).toBe(0);
    expect(getBracketCompactStartIndex([round('Halbfinale', 2), round('Finale', 1)])).toBe(0);
  });

  it('zeigt bei größeren Feldern standardmäßig Viertelfinale bis Finale', () => {
    const rounds = [round('Sechzehntelfinale', 16), round('Achtelfinale', 8, true), round('Viertelfinale', 4), round('Halbfinale', 2), round('Finale', 1)];
    expect(getBracketCompactStartIndex(rounds)).toBe(2);
    const html = renderToStaticMarkup(createElement(BracketRoundViewport, {
      rounds,
      renderRound: (value) => createElement('section', { key: value.label }, value.label),
      editable: true,
    }));
    expect(html).not.toContain('<section>Sechzehntelfinale</section>');
    expect(html).not.toContain('<section>Achtelfinale</section>');
    expect(html).toContain('<section>Viertelfinale</section>');
    expect(html).toContain('<section>Halbfinale</section>');
    expect(html).toContain('<section>Finale</section>');
    expect(html).toContain('Frühere Runden anzeigen');
    expect(html).toContain('24 Spiele');
    expect(html).toContain('1 live');
    expect(html).toContain('Zum Bearbeiten der ersten Runde');
    expect(html).toContain('aria-expanded="false"');
  });
});
