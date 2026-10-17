import { describe, expect, it } from 'vitest';
import { parseShortSet } from '@/components/SetBySetEntry';

describe('Kurznotation der Sätze', () => {
  it('interpretiert -0 als 0:11 und +0 bzw. 0 als 11:0', () => {
    expect(parseShortSet('-0', 1)).toEqual({ number: 1, sideAScore: 0, sideBScore: 11 });
    expect(parseShortSet('0', 2)).toEqual({ number: 2, sideAScore: 11, sideBScore: 0 });
    expect(parseShortSet('+0', 3)).toEqual({ number: 3, sideAScore: 11, sideBScore: 0 });
  });
  it('erhält die bisherige Kurznotation auch bei Verlängerung', () => {
    expect(parseShortSet('-10', 1)).toEqual({ number: 1, sideAScore: 10, sideBScore: 12 });
    expect(parseShortSet('7', 1)).toEqual({ number: 1, sideAScore: 11, sideBScore: 7 });
  });
});
