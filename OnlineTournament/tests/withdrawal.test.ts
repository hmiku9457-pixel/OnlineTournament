import { describe, expect, it } from 'vitest';
import { applyWithdrawal } from '@/engine/withdrawal';
import type { Match } from '@/domain/types';

const baseMatch: Match = {
  id: 'M1', tournamentId: 'T', stageId: 'S', roundNumber: 1,
  sideAId: 'A', sideBId: 'B', status: 'SCHEDULED', bestOf: 5, sets: [],
};

describe('withdrawal', () => {
  it('turns future matches into walkovers', () => {
    const result = applyWithdrawal([baseMatch], 'A');
    expect(result.updatedMatches[0].status).toBe('WALKOVER');
    expect(result.updatedMatches[0].winnerSideId).toBe('B');
  });

  it('keeps confirmed history intact', () => {
    const result = applyWithdrawal([{ ...baseMatch, status: 'CONFIRMED', winnerSideId: 'A' }], 'A');
    expect(result.updatedMatches[0].winnerSideId).toBe('A');
  });
});
