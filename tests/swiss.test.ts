import { describe, expect, it } from 'vitest';
import { generateSwissPairings } from '@/engine/swiss';
import type { StandingRow } from '@/domain/types';

const rows: StandingRow[] = ['A', 'B', 'C', 'D', 'E'].map((participantId, index) => ({
  participantId,
  played: index,
  wins: 5 - index,
  losses: 0,
  setsWon: 0,
  setsLost: 0,
  setDifference: 0,
  buchholz: 0,
}));

describe('Swiss pairing', () => {
  it('assigns one bye for an odd field and avoids a previous bye where possible', () => {
    const pairings = generateSwissPairings(rows, [], ['E']);
    expect(pairings.filter((p) => p.bye)).toHaveLength(1);
    expect(pairings.find((p) => p.bye)?.sideAId).toBe('D');
  });

  it('avoids prior meetings where possible', () => {
    const pairings = generateSwissPairings(rows.slice(0, 4), [{ a: 'A', b: 'B' }]);
    expect(pairings.some((p) => p.sideAId === 'A' && p.sideBId === 'B')).toBe(false);
  });
});
