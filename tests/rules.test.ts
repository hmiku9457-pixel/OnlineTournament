import { describe, expect, it } from 'vitest';
import { hasMatchWinner, isValidFinishedSet, tableTennisRules, winsRequired } from '@/domain/rules';

describe('table tennis rules', () => {
  it('supports best of one', () => {
    expect(winsRequired(1)).toBe(1);
    expect(hasMatchWinner([{ number: 1, sideAScore: 11, sideBScore: 7 }], 1)).toBe('A');
  });

  it('requires three set wins in best of five', () => {
    expect(winsRequired(5)).toBe(3);
  });

  it('validates deuce scores', () => {
    const rules = tableTennisRules(5);
    expect(isValidFinishedSet({ number: 1, sideAScore: 12, sideBScore: 10 }, rules)).toBe(true);
    expect(isValidFinishedSet({ number: 1, sideAScore: 11, sideBScore: 10 }, rules)).toBe(false);
  });

  it('finds a match winner', () => {
    expect(hasMatchWinner([
      { number: 1, sideAScore: 11, sideBScore: 7 },
      { number: 2, sideAScore: 9, sideBScore: 11 },
      { number: 3, sideAScore: 11, sideBScore: 8 },
      { number: 4, sideAScore: 11, sideBScore: 6 },
    ], 5)).toBe('A');
  });
});
