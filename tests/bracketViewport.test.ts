import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BracketRoundViewport } from '@/components/BracketRoundViewport';

function round(label: string, count: number, live = false) {
  return { label, matches: Array.from({ length: count }, (_, index) => ({ id: `${label}-${index}`, live: live && index === 0 })) };
}

function renderRounds(rounds: ReturnType<typeof round>[]) {
  return renderToStaticMarkup(createElement(BracketRoundViewport, {
    rounds,
    renderRound: (value) => createElement('section', { key: value.label }, value.label),
    editable: true,
  }));
}

describe('Vollständige Ansicht von K.-o.-Brackets', () => {
  it('zeigt bei kleinen K.-o.-Feldern alle Runden', () => {
    const html = renderRounds([round('Viertelfinale', 4), round('Halbfinale', 2), round('Finale', 1)]);
    expect(html).toContain('<section>Viertelfinale</section>');
    expect(html).toContain('<section>Halbfinale</section>');
    expect(html).toContain('<section>Finale</section>');
    expect(html).not.toContain('Frühere Runden');
  });

  it('zeigt auch bei großen K.-o.-Feldern alle Runden in der richtigen Reihenfolge, ohne Einblendebutton', () => {
    const labels = ['Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale'];
    const rounds = [round(labels[0], 16), round(labels[1], 8, true), round(labels[2], 4), round(labels[3], 2), round(labels[4], 1)];
    const html = renderRounds(rounds);
    const positions = labels.map((label) => html.indexOf(`<section>${label}</section>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect((html.match(/<section>/g) ?? [])).toHaveLength(labels.length);
    expect(html).not.toContain('Frühere Runden');
    expect(html).not.toContain('aria-expanded');
  });
});
