import { describe, expect, it } from 'vitest';
import { generateKnockoutFirstRound } from '@/engine/bracket';

describe('knockout bracket', () => {
  it('distributes byes without creating an empty-vs-empty first-round match', () => {
    const pairings = generateKnockoutFirstRound(
      ['A', 'B', 'C', 'D', 'E'].map((participantId, index) => ({ participantId, seed: index + 1 })),
    );
    expect(pairings).toHaveLength(4);
    expect(pairings.some((pairing) => !pairing.sideAId && !pairing.sideBId)).toBe(false);
    expect(pairings.filter((pairing) => pairing.bye)).toHaveLength(3);
  });

  it('tries to avoid a first-round rematch by swapping lower seeds', () => {
    const pairings = generateKnockoutFirstRound(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((participantId, index) => ({ participantId, seed: index + 1 })),
      [{ a: 'A', b: 'H' }],
    );
    expect(pairings[0]).not.toMatchObject({ sideAId: 'A', sideBId: 'H' });
  });
});
