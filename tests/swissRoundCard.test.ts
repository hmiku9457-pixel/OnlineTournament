import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { currentSwissRound, SwissRoundCard, type SwissRoundFixture, type SwissRoundMatch } from '@/components/SwissRoundCard';

const fixtures: SwissRoundFixture[] = [
  { id: 'r1-1', round: 'Runde 1', sideA: 'Alt A', sideB: 'Alt B' },
  { id: 'r2-1', round: 'Runde 2', sideA: 'Anna', sideB: 'Ben' },
  { id: 'r2-2', round: 'Runde 2', sideA: 'Clara', sideB: 'Dora' },
  { id: 'r2-bye', round: 'Runde 2', sideA: 'Emil', sideB: 'Freilos', autoWinner: 'Emil' },
];
const matches: SwissRoundMatch[] = [
  { id: 'r1-1', status: 'FINISHED', score: '1:0', sets: [{ number: 1, sideAScore: 11, sideBScore: 8 }] },
  { id: 'r2-1', status: 'LIVE', score: '1:0', table: 'Tisch 2', sets: [{ number: 1, sideAScore: 11, sideBScore: 7 }] },
  { id: 'r2-2', status: 'FINISHED', score: '0:1', sets: [{ number: 1, sideAScore: 7, sideBScore: 11 }] },
];

describe('Schweizer Spiele der aktuellen Runde', () => {
  it('zeigt nur die neueste angesetzte Runde einschließlich Freilos', () => {
    const selection = currentSwissRound(fixtures);
    expect(selection.round).toBe(2);
    expect(selection.matches.map((match) => match.id)).toEqual(['r2-1', 'r2-2', 'r2-bye']);
    const html = renderToStaticMarkup(createElement(SwissRoundCard, { fixtures, matches, sport: 'Tischtennis', editable: false }));
    expect(html).toContain('Runde 2 · Spiele');
    expect(html).toContain('2 von 3 abgeschlossen');
    expect(html).toContain('1 live');
    expect(html).toContain('swiss-round-match-status');
    expect((html.match(/swiss-round-live-indicator/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('group-match-live-dot');
    expect(html).toContain('Anna');
    expect(html).toContain('Ben');
    expect(html).toContain('Tisch 2');
    expect(html).toContain('Freilos');
    expect(html).not.toContain('Alt A');
  });

  it('zeigt vor dem Start die Vorschau und eine Speicherbestätigung', () => {
    const html = renderToStaticMarkup(createElement(SwissRoundCard, {
      fixtures: fixtures.slice(0, 1), matches: [], sport: 'Tischtennis', editable: true,
      notice: 'Neue Zufallsreihenfolge gespeichert.',
    }));
    expect(html).toContain('Runde 1 · Vorschau');
    expect(html).toContain('Neue Zufallsreihenfolge gespeichert.');
    expect(html).toContain('Vorschau');
  });

  it('verträgt noch nicht angesetzte Runden', () => {
    expect(currentSwissRound([])).toEqual({ round: 0, matches: [] });
    const html = renderToStaticMarkup(createElement(SwissRoundCard, { fixtures: [], matches: [], sport: 'Fußball', editable: false }));
    expect(html).toContain('noch keine Spiele angesetzt');
  });
});
