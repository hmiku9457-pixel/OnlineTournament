import { describe, expect, it } from 'vitest';
import { calculateStandings } from '@/engine/standings';
import type { Match, Participant } from '@/domain/types';

const participants: Participant[] = ['A', 'B', 'C'].map((id) => ({
  id,
  tournamentId: 'T',
  discipline: 'SINGLES',
  displayName: id,
  memberPersonIds: [id],
  status: 'ACTIVE',
}));

function match(id: string, a: string, b: string, winner: string, sets: Array<[number, number]>): Match {
  return {
    id,
    tournamentId: 'T',
    stageId: 'S',
    roundNumber: 1,
    sideAId: a,
    sideBId: b,
    winnerSideId: winner,
    status: 'CONFIRMED',
    bestOf: 5,
    sets: sets.map(([sideAScore, sideBScore], index) => ({ number: index + 1, sideAScore, sideBScore })),
  };
}

describe('standings', () => {
  it('sorts by wins, set difference, sets won and buchholz', () => {
    const standings = calculateStandings(participants, [
      match('1', 'A', 'B', 'A', [[11, 5], [11, 5], [11, 5]]),
      match('2', 'B', 'C', 'B', [[11, 7], [11, 7], [11, 7]]),
      match('3', 'C', 'A', 'C', [[11, 9], [11, 9], [11, 9], [8, 11]]),
    ]);
    expect(standings).toHaveLength(3);
    expect(standings.every((row) => row.wins === 1)).toBe(true);
    expect(standings[0].participantId).toBe('A');
  });
});
