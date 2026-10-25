import { describe, expect, it } from 'vitest';
import { newPlayoffRound, playoffQualified, playoffRoundFinished, playoffScores } from '@/domain/swissCutoffPlayoff';

describe('Schweizer Stichentscheid: Zusatzrunden und Jeder gegen Jeden', () => {
  const players = ['Anna', 'Berta', 'Clara', 'Dora'];

  it('erstellt genau eine weitere Paarungsrunde ohne Freilos bei gerader Anzahl', () => {
    const round = newPlayoffRound(players, 'ROUND', []);
    expect(round).toMatchObject({ kind: 'ROUND' });
    expect(round.matches).toHaveLength(2);
    expect(round.bye).toBeUndefined();
    expect(new Set(round.matches.flatMap((game) => [game.sideA, game.sideB]))).toEqual(new Set(players));
  });

  it('verteilt ein erforderliches Freilos in Folgeentscheidungen möglichst nicht doppelt', () => {
    const first = newPlayoffRound(players.slice(0, 3), 'ROUND', []);
    expect(first.bye).toBeDefined();
    const filled = {
      ...first, matches: first.matches.map((game) => ({ ...game, pointsA: 11, pointsB: 7 })),
    };
    const second = newPlayoffRound(players.slice(0, 3), 'ROUND', [filled]);
    expect(second.bye).not.toBe(first.bye);
  });

  it('löst nicht per alphabetischer Reihenfolge auf, sondern fordert bei erneutem Cut-Gleichstand weitere Entscheidung', () => {
    const first = newPlayoffRound(players, 'ROUND', []);
    const tied = { ...first, matches: first.matches.map((game) => ({ ...game, pointsA: 11, pointsB: 7 })) };
    expect(playoffRoundFinished(tied)).toBe(true);
    expect(playoffQualified(players, 1, [tied])).toBeNull();
    const next = newPlayoffRound(players, 'ROUND', [tied]);
    const resolved = { ...next, matches: next.matches.map((game, i) => ({
      ...game, pointsA: i === 0 ? 11 : 11, pointsB: i === 0 ? 0 : 7,
    })) };
    expect(playoffQualified(players, 1, [tied, resolved])).not.toBeNull();
  });

  it('erzeugt für vier Spieler sechs Paarungen und entscheidet erst bei vollständiger Eingabe', () => {
    const round = newPlayoffRound(players, 'ROUND_ROBIN', []);
    expect(round.matches).toHaveLength(6);
    expect(playoffQualified(players, 2, [round])).toBeNull();
    const played = { ...round, matches: round.matches.map((game) => ({ ...game, pointsA: 11, pointsB: 0 })) };
    const qualified = playoffQualified(players, 2, [played]);
    expect(qualified).toHaveLength(2);
    expect(playoffScores(players, [played]).map((row) => row.points)).toEqual([3, 2, 1, 0]);
  });

  it('legt bei einem Unentschieden im Zusatzspiel nur halbe Punkte fest', () => {
    const played = [{ kind: 'ROUND_ROBIN' as const, matches: [
      { sideA: 'Anna', sideB: 'Berta', pointsA: 1, pointsB: 1 },
    ] }];
    expect(playoffScores(players.slice(0, 2), played).map((row) => row.points)).toEqual([.5, .5]);
    expect(playoffQualified(players.slice(0, 2), 1, played)).toBeNull();
  });
});
