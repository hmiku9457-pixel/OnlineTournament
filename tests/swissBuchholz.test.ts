import { describe, expect, it } from 'vitest';
import { rankStandings, type RankingMatch } from '@/domain/standingRankings';

const game = (sideA: string, sideB: string, sideAScore = 11, sideBScore = 7): RankingMatch => ({
  sideA, sideB, status: 'FINISHED',
  sets: [{ number: 1, sideAScore, sideBScore }],
});

describe('Schweizer System: Sonneborn-Berger und kampflose Ergebnisse', () => {
  it('entscheidet bei gleicher Siegzahl zuerst über die Stärke der besiegten Gegner, nicht über Satzpunkte', () => {
    const matches = [
      game('A', 'X', 11, 9), game('Y', 'A', 11, 7),
      game('B', 'C', 11, 0), game('D', 'B', 11, 10),
      game('X', 'Z'), game('Y', 'Z'), game('D', 'Z'),
    ];
    const names = ['A', 'B', 'C', 'D', 'X', 'Y', 'Z'];
    const swiss = rankStandings(names, matches, 'table_tennis', [], true, 3);
    const regular = rankStandings(names, matches, 'table_tennis');
    expect(swiss.find((row) => row.name === 'A')).toMatchObject({ wins: 1, buchholz: 1 });
    expect(swiss.find((row) => row.name === 'B')).toMatchObject({ wins: 1, buchholz: 0 });
    expect(swiss.findIndex((row) => row.name === 'A')).toBeLessThan(swiss.findIndex((row) => row.name === 'B'));
    expect(regular.findIndex((row) => row.name === 'B')).toBeLessThan(regular.findIndex((row) => row.name === 'A'));
  });

  it('gibt Freilosen einen begrenzten virtuellen SB-Gegner ohne zusätzliche Sätze', () => {
    const ranked = rankStandings(['A', 'B', 'C'], [game('B', 'C')], 'table_tennis', ['A', 'A'], true, 3);
    expect(ranked.find((row) => row.name === 'A')).toMatchObject({
      wins: 2, played: 2, setsWon: 0, setsLost: 0, buchholz: 3,
    });
    // Zwei Freilose: je min(eigene 2 Punkte, drei Runden / 2 = 1,5).
    expect(ranked.find((row) => row.name === 'B')?.buchholz).toBe(0);
  });

  it('wertet kampflose Siege als Sieg ohne Sätze und mit begrenztem virtuellem Gegner', () => {
    const matches: RankingMatch[] = [
      { sideA: 'A', sideB: 'B', status: 'FINISHED', forcedWinner: 'A', sets: [] },
      game('C', 'A'),
    ];
    const ranked = rankStandings(['A', 'B', 'C'], matches, 'table_tennis', [], true, 3);
    expect(ranked.find((row) => row.name === 'A')).toMatchObject({
      played: 2, wins: 1, losses: 1, setsWon: 0, setsLost: 1, buchholz: 0,
    });
    expect(ranked.find((row) => row.name === 'B')).toMatchObject({ played: 1, losses: 1, buchholz: 0 });
  });

  it('wertet einen Sieg gegen starke Gegner höher als eine Niederlage gegen noch stärkere', () => {
    const matches = [
      game('A', 'X'), game('Y', 'A'),
      game('B', 'C'), game('D', 'B'),
      game('X', 'Z'), game('X', 'C'),
      game('Y', 'Z'), game('Y', 'C'), game('Y', 'X'),
      game('D', 'Z'), game('D', 'C'),
    ];
    const ranking = rankStandings(['A', 'B', 'C', 'D', 'X', 'Y', 'Z'], matches, 'table_tennis', [], true, 4);
    const a = ranking.find((row) => row.name === 'A')!;
    const b = ranking.find((row) => row.name === 'B')!;
    expect(a.wins).toBe(1);
    expect(b.wins).toBe(1);
    // A defeated X with two wins; B defeated C with none.
    // A's loss against the strong Y contributes precisely zero.
    expect(a.buchholz).toBe(2);
    expect(b.buchholz).toBe(0);
  });

  it('gibt bei einem Unentschieden nur die Hälfte der Gegnerwertung', () => {
    const matches = [
      game('A', 'B', 1, 1), game('B', 'C', 2, 1),
      game('C', 'D', 2, 1),
    ];
    const ranking = rankStandings(['A', 'B', 'C', 'D'], matches, 'football', [], true, 3);
    const a = ranking.find((row) => row.name === 'A')!;
    const b = ranking.find((row) => row.name === 'B')!;
    expect(a.draws).toBe(1);
    expect(b.wins).toBe(1);
    expect(b.draws).toBe(1);
    expect(a.buchholz).toBe(0.75);
    expect(b.buchholz).toBe(0.5);
  });

  it('zählt Begegnungen mit demselben Gegner ergebnisgewichtet für Sonneborn-Berger', () => {
    const ranked = rankStandings(['A', 'B'], [game('A', 'B'), game('B', 'A')], 'table_tennis', [], true, 2);
    expect(ranked.map((row) => ({ name: row.name, buchholz: row.buchholz }))).toEqual([
      { name: 'A', buchholz: 1 }, { name: 'B', buchholz: 1 },
    ]);
  });
});
