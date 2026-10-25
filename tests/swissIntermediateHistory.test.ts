import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwissRoundRobinHistory } from '@/components/SwissRoundRobinHistory';
import { SwissRoundRobinMatrix } from '@/components/SwissRoundRobinMatrix';
import { GroupMatchDayList } from '@/components/GroupMatchDayList';
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
    expect(html).toContain('11:7');
    expect(html).toContain('11:7');
    expect(html).not.toContain('Anna gegen Ben: 1:0');
    expect(html).toContain('standing-player-button');
    expect(html).toContain('Jeder gegen Jeden · weiter');
    expect(html).toContain('Kreuztabelle');
    expect(html).toContain('group-match-list');
    expect(html).toContain('group-match-row');
    expect(html).toContain('swiss-intermediate-schedule');
    expect(html.indexOf('swiss-intermediate-matrix')).toBeLessThan(html.indexOf('swiss-intermediate-schedule'));
    expect(html).toContain('Spieltag 1');
    expect(html).not.toContain('>BHZ<');
    expect(html).toContain('Buchholzzahl');
  });

  it('ordnet in der Kreuztabelle Ergebnisse je Blickrichtung zu und markiert offene und diagonale Zellen', () => {
    const round = { kind: 'ROUND_ROBIN' as const, matches: [
      { sideA: 'Anna', sideB: 'Ben', pointsA: 11, pointsB: 7, matchDay: 1 },
      { sideA: 'Anna', sideB: 'Clara', matchDay: 2 },
      { sideA: 'Ben', sideB: 'Clara', pointsA: 7, pointsB: 11, matchDay: 3 },
    ] };
    const html = renderToStaticMarkup(createElement(SwissRoundRobinMatrix, {
      players: ['Anna', 'Ben', 'Clara'], rounds: [round], sport: 'table_tennis',
    }));
    expect(html).toContain('Anna gegen Ben: 11:7');
    expect(html).toContain('Ben gegen Anna: 7:11');
    expect(html).toContain('Anna gegen Clara: noch offen');
    expect(html).toContain('Clara gegen Ben: 11:7');
    expect((html.match(/swiss-matrix-diagonal/g) ?? [])).toHaveLength(3);
    expect(html).toContain('swiss-matrix-result win');
    expect(html).toContain('swiss-matrix-result loss');
  });

  it('zeigt auch bei Ergebnissportarten die konkreten Werte aus Sicht des Zeilenspielers', () => {
    const round = { kind: 'ROUND_ROBIN' as const, matches: [
      { sideA: 'Adler', sideB: 'Bären', pointsA: 3, pointsB: 2, matchDay: 1 },
    ] };
    const html = renderToStaticMarkup(createElement(SwissRoundRobinMatrix, {
      players: ['Adler', 'Bären'], rounds: [round], sport: 'football',
    }));
    expect(html).toContain('Adler gegen Bären: 3:2');
    expect(html).toContain('Bären gegen Adler: 2:3');
  });

  it('verwendet dieselben Spieltagszeilen und die Live-Markierung wie die Gruppenphase', () => {
    const html = renderToStaticMarkup(createElement(GroupMatchDayList, {
      sport: 'table_tennis',
      matches: [
        { id: 'm1', sideA: 'Anna', sideB: 'Ben', matchDay: 1, status: 'live', score: '1:0',
          sets: [{ number: 1, sideAScore: 11, sideBScore: 7 }] },
        { id: 'm2', sideA: 'Ben', sideB: 'Clara', matchDay: 2, status: 'open', score: '–' },
      ],
    }));
    expect(html).toContain('group-match-list');
    expect(html).toContain('group-match-row live');
    expect(html).toContain('group-match-live-dot');
    expect(html).toContain('Spieltag 1');
    expect(html).toContain('Spieltag 2');
    expect(html).toContain('Satz 1: 11:7');
  });

  it('zeigt bei Ergebnissportarten Tore, Remis und Punkte statt Sätze oder BHZ', () => {
    const footballDecision: StoredSwissCutoffDecision = {
      signature: 'football', mode: 'ROUND_ROBIN', sets: [], eliminated: [],
      qualificationSlots: 1,
      extraRounds: [{ kind: 'ROUND_ROBIN', matches: [
        { sideA: 'FC A', sideB: 'FC B', pointsA: 1, pointsB: 1, matchDay: 1 },
        { sideA: 'FC B', sideB: 'FC C', pointsA: 1, pointsB: 1, matchDay: 2 },
        { sideA: 'FC A', sideB: 'FC C', pointsA: 1, pointsB: 1, matchDay: 3 },
      ] }],
    };
    const html = renderToStaticMarkup(createElement(SwissRoundRobinHistory, {
      phaseNumber: '1.5', decision: footballDecision, sport: 'football',
    }));
    expect(html).toContain('>Tore</th>');
    expect(html).toContain('>Pkt.</th>');
    expect(html).toContain('title="Unentschieden">U</th>');
    expect(html).not.toContain('>BHZ</span>');
    expect(html).not.toContain('>Sätze</th>');
    expect(html).toContain('Spieltag 1');
    expect(html).toContain('Spieltag 2');
    expect(html).toContain('Spieltag 3');
    expect(html).toContain('physischer Losentscheid');
  });

  it('zeigt nach Entscheidungsspielen einen Weiter-/Raus-Tag ohne die sportlichen Werte zu verändern', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, {
      standings: [standing('Anna', 1), standing('Ben', 2)],
      scoreSport: false, scoreUnit: 'Bälle', unplayedWinners: new Set<string>(),
      previousFinishLabels: {}, withdrawalLabel: () => null,
      qualifyingPlaces: 1, cutoffIndex: 0, finalized: true,
      onSelectPlayer: () => {}, onShowBuchholz: () => {},
      decisionTags: {
        Anna: { label: 'Entscheidungsspiel', qualified: true },
        Ben: { label: 'Entscheidungsspiel', qualified: false },
      },
    }));
    expect(html).toContain('Entscheidungsspiel · weiter');
    expect(html).toContain('Entscheidungsspiel · raus');
    expect(html).toContain('swiss-lot-tag is-qualified');
    expect(html).toContain('swiss-lot-tag is-eliminated');
    expect(html).toContain('11,5');
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
