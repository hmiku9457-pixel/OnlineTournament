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

  it('rewards top seeds with byes and separates seed 1 and 2 across bracket halves', () => {
    const pairings = generateKnockoutFirstRound(
      Array.from({ length: 12 }, (_, index) => ({ participantId: `S${index + 1}`, seed: index + 1 })),
    );
    const slots = pairings.flatMap((pairing) => [pairing.sideAId, pairing.sideBId]);
    const midpoint = slots.length / 2;
    const byeRecipients = pairings
      .filter((pairing) => pairing.bye)
      .map((pairing) => pairing.sideAId ?? pairing.sideBId);

    expect(new Set(byeRecipients)).toEqual(new Set(['S1', 'S2', 'S3', 'S4']));
    expect((slots.indexOf('S1') < midpoint) === (slots.indexOf('S2') < midpoint)).toBe(false);

    const firstHalfPlayers = slots.slice(0, midpoint).filter(Boolean).length;
    const secondHalfPlayers = slots.slice(midpoint).filter(Boolean).length;
    expect(Math.abs(firstHalfPlayers - secondHalfPlayers)).toBeLessThanOrEqual(1);
  });
});
