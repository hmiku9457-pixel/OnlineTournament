import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import type { MockRuntimeMatch } from '@/services/mockRuntime';

const walkover: MockRuntimeMatch = {
  id: 'demo-stage-sw-r1-m1', stageId: 'demo-stage',
  sideA: 'Anna', sideB: 'Bernd', score: 'W.O.', status: 'FINISHED',
  phase: 'Schweizer System', round: 'Runde 1', table: 'Tisch 1',
  sport: 'table_tennis', bestOf: 3, sets: [],
  requiresWinner: true, pauseA: null, pauseB: null,
};

describe('Abschlusskontrolle: Ergebniskorrekturen', () => {
  it('bietet auch für ein kampfloses Ergebnis ohne Satzdaten die Neueingabe an', () => {
    const html = renderToStaticMarkup(<SetBySetEntry match={walkover} allowEditFinished directorEntry swissAdminEntry />);
    expect(html).toContain('W.O.');
    expect(html).toContain('Ergebnis neu eingeben');
  });

  it('respektiert die bestehende Sperre für nicht korrigierbare Ergebnisse', () => {
    const html = renderToStaticMarkup(<SetBySetEntry match={walkover} directorEntry swissAdminEntry />);
    expect(html).not.toContain('Ergebnis neu eingeben');
  });
});
