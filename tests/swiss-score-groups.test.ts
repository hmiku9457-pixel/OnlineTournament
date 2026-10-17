import { describe, expect, it } from 'vitest';
import { generateScoreGroupedSwissPairings, type SwissScorePlayer } from '@/engine/swissScoreGroups';

function player(name: string, wins: number, losses: number, order: number, opponents: string[] = []): SwissScorePlayer {
  return { name, wins, losses, order, byes: 0, opponents: new Set(opponents) };
}

describe('score grouped Swiss pairing', () => {
  it('creates only one cross-score pairing when both score groups are odd', () => {
    const players = [
      ...Array.from({ length: 9 }, (_, index) => player(`W${index + 1}`, 1, 0, index)),
      ...Array.from({ length: 9 }, (_, index) => player(`L${index + 1}`, 0, 1, index + 9)),
    ];
    const pairings = generateScoreGroupedSwissPairings(players);
    const scores = new Map(players.map((item) => [item.name, item.wins]));
    const crossScore = pairings.filter(([a, b]) => b !== 'Freilos' && scores.get(a) !== scores.get(b));
    expect(crossScore).toHaveLength(1);
  });

  it('keeps even score groups entirely inside their score group', () => {
    const players = [
      ...Array.from({ length: 10 }, (_, index) => player(`W${index + 1}`, 1, 0, index)),
      ...Array.from({ length: 8 }, (_, index) => player(`L${index + 1}`, 0, 1, index + 10)),
    ];
    const pairings = generateScoreGroupedSwissPairings(players);
    const scores = new Map(players.map((item) => [item.name, item.wins]));
    const crossScore = pairings.filter(([a, b]) => b !== 'Freilos' && scores.get(a) !== scores.get(b));
    expect(crossScore).toHaveLength(0);
  });
});
