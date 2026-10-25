import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSwissCutoffRowIndex, SwissQualificationCutoffRow } from '@/components/SwissQualificationCutoff';

const rankings = Array.from({ length: 19 }, (_, index) => ({ name: `Spieler ${index + 1}` }));

describe('Schweizer Cut-off zur folgenden Turnierphase', () => {
  it('setzt die Grenze nach Platz 8 bei 19 Teilnehmern und acht Qualifikationsplätzen', () => {
    expect(getSwissCutoffRowIndex(rankings, 8)).toBe(7);
  });

  it('überspringt zurückgezogene Spieler wie die tatsächliche Qualifikation', () => {
    expect(getSwissCutoffRowIndex(rankings, 8, new Set(['Spieler 3']))).toBe(8);
    expect(getSwissCutoffRowIndex(rankings, 8, new Set(['Spieler 10']))).toBe(7);
  });

  it('zeigt keine Grenze ohne Folgephase oder wenn alle verbliebenen Spieler weiterkommen', () => {
    expect(getSwissCutoffRowIndex(rankings, 0)).toBeNull();
    expect(getSwissCutoffRowIndex(rankings, 19)).toBeNull();
    expect(getSwissCutoffRowIndex(rankings, 8, new Set(rankings.slice(0, 11).map((row) => row.name)))).toBeNull();
    expect(getSwissCutoffRowIndex([], 8)).toBeNull();
  });

  it('kennzeichnet laufende Grenzen als vorläufig und abgeschlossene als endgültig', () => {
    const provisional = renderToStaticMarkup(createElement('table', null,
      createElement('tbody', null, createElement(SwissQualificationCutoffRow, { qualifyingPlaces: 8, finalized: false })),
    ));
    const completed = renderToStaticMarkup(createElement('table', null,
      createElement('tbody', null, createElement(SwissQualificationCutoffRow, { qualifyingPlaces: 8, finalized: true })),
    ));
    expect(provisional).toContain('Cut-off · 8 Qualifikationsplätze · vorläufig');
    expect(completed).toContain('Cut-off · 8 Qualifikationsplätze');
    expect(completed).not.toContain('vorläufig');
    expect(completed).toContain('colSpan="10"');
  });
});
