import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwissRoundRobinHistory } from '@/components/SwissRoundRobinHistory';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import type { StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import type { MockStanding } from '@/services/mockCompetitionViews';

const decision: StoredSwissCutoffDecision = {
  signature: 'original-swiss-fingerprint', mode: 'ROUND_ROBIN', sets: [], eliminated: [],
  extraRounds: [{ kind: 'ROUND_ROBIN', matches: [
    { sideA: 'Anna', sideB: 'Ben', pointsA: 11, pointsB: 7 },
    { sideA: 'Anna', sideB: 'Clara', pointsA: 11, pointsB: 9 },
    { sideA: 'Ben', sideB: 'Clara', pointsA: 11, pointsB: 6 },
  ] }],
  winners: ['Anna'],
};
const standing = (name: string, rank: number): MockStanding => ({
  name, rank, wins: 3, losses: 2, draws: 0, played: 5, points: 9,
  buchholz: 11.5, sets: '6:4', setDifference: 2, balls: '95:88', ballDifference: 7,
});

describe('Schweizer Entscheidung dokumentieren', () => {
  it('zeigt Runde Jeder-gegen-Jeden nachträglich als Phase 1.5 mit Ergebnissen und Platzierung', () => {
    const html = renderToStaticMarkup(createElement(SwissRoundRobinHistory, { phaseNumber: '1.5', decision }));
    expect(html).toContain('Phase 1.5');
    expect(html).toContain('Jeder gegen Jeden');
    expect(html).toContain('Anna');
    expect(html).toContain('Ben');
    expect(html).toContain('11 : 7');
    expect(html).toContain('Qualifiziert');
    expect(html).toContain('Buchholzzahl nicht');
  });

  it('kennzeichnet die Siegerin und die Verliererin eines physischen Losentscheids in der Schweizer Tabelle', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, {
      standings: [standing('Anna', 1), standing('Ben', 2)],
      scoreSport: false, scoreUnit: 'Bälle', unplayedWinners: new Set<string>(),
      previousFinishLabels: {}, withdrawalLabel: () => null,
      qualifyingPlaces: 1, cutoffIndex: 0, finalized: true,
      onSelectPlayer: () => {}, onShowBuchholz: () => {},
      lotParticipants: new Set(['Anna', 'Ben']), lotWinners: new Set(['Ben']),
    }));
    expect(html).toContain('Losentscheid · weiter');
    expect(html).toContain('Losentscheid · raus');
    expect(html).toContain('swiss-lot-tag is-qualified');
    expect(html).toContain('swiss-lot-tag is-eliminated');
  });
});
