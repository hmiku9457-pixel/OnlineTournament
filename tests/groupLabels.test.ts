import { describe, expect, it } from 'vitest';
import { groupLetter } from '@/domain/groupLabels';

describe('alphabetische Gruppenbezeichnungen', () => {
  it('rolls over after Z correctly', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(groupLetter))
      .toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});
