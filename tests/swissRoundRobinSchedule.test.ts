import { describe, expect, it } from 'vitest';
import {
  newPlayoffRound, playoffBoundaryTie, playoffQualified, playoffRankingsWithHeadToHead,
} from '@/domain/swissCutoffPlayoff';

describe('Spielplan und Tie-Breaker in Phase 1.5', () => {
  for (const size of [3, 4, 5, 6]) {
    it(`verteilt ${size} Spieler sinnvoll auf Spieltage, ohne Doppelansetzungen`, () => {
      const players = Array.from({ length: size }, (_, i) => `Spieler ${i + 1}`);
      const round = newPlayoffRound(players, 'ROUND_ROBIN', []);
      expect(round.matches).toHaveLength(size * (size - 1) / 2);
      const days = [...new Set(round.matches.map((match) => match.matchDay))];
      expect(days).toEqual(Array.from({ length: size % 2 ? size : size - 1 }, (_, i) => i + 1));
      days.forEach((day) => {
        const participants = round.matches.filter((match) => match.matchDay === day)
          .flatMap((match) => [match.sideA, match.sideB]);
        expect(participants.length).toBe(Math.floor(size / 2) * 2);
        expect(new Set(participants).size).toBe(participants.length);
      });
      const pairs = round.matches.map((match) => [match.sideA, match.sideB].sort().join('|'));
      expect(new Set(pairs).size).toBe(round.matches.length);
    });
  }

  it('fordert bei A>B, B>C, C>A und identischen Satz-/Ballwerten einen physischen Losentscheid', () => {
    const players = ['Anna', 'Berta', 'Clara'];
    const round = newPlayoffRound(players, 'ROUND_ROBIN', []);
    const wins = new Set(['Anna|Berta', 'Berta|Clara', 'Clara|Anna']);
    const played = { ...round, matches: round.matches.map((match) => {
      const aWins = wins.has(`${match.sideA}|${match.sideB}`);
      return { ...match, pointsA: aWins ? 11 : 7, pointsB: aWins ? 7 : 11 };
    }) };
    expect(playoffRankingsWithHeadToHead(players, [played]).map((row) => row.wins)).toEqual([1, 1, 1]);
    expect(playoffRankingsWithHeadToHead(players, [played]).map((row) => row.ballsWon - row.ballsLost)).toEqual([0, 0, 0]);
    expect(playoffQualified(players, 1, [played])).toBeNull();
    expect(playoffBoundaryTie(players, 1, [played])).toMatchObject({
      players: expect.arrayContaining(players), slots: 1, alreadyQualified: [],
    });
    expect(playoffBoundaryTie(players, 2, [played])?.slots).toBe(2);
  });

  it('wertet bei einem unauflösbaren Tor-Gleichstand für Fußball ebenfalls per Losentscheid', () => {
    const players = ['Adler', 'Bären', 'Clubs'];
    const round = newPlayoffRound(players, 'ROUND_ROBIN', []);
    const played = { ...round, matches: round.matches.map((match) => ({
      ...match, pointsA: 1, pointsB: 1,
    })) };
    expect(playoffRankingsWithHeadToHead(players, [played], 'football').map((row) => row.draws)).toEqual([2, 2, 2]);
    expect(playoffQualified(players, 1, [played], 'football')).toBeNull();
    expect(playoffBoundaryTie(players, 1, [played], 'football')?.players).toHaveLength(3);
  });

  it('gibt vor dem letzten Spieltag keine Qualifikation oder Auslosung frei', () => {
    const players = ['Anna', 'Berta', 'Clara'];
    const round = newPlayoffRound(players, 'ROUND_ROBIN', []);
    const partial = { ...round, matches: round.matches.map((match, i) => i === 0
      ? { ...match, pointsA: 11, pointsB: 7 } : match) };
    expect(playoffBoundaryTie(players, 1, [partial])).toBeNull();
    expect(playoffQualified(players, 1, [partial])).toBeNull();
  });
});
