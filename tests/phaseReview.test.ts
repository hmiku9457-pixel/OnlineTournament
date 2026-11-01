import { describe, expect, it } from 'vitest';
import { needsRosterPhaseReview, type RosterReviewPhase } from '@/domain/phaseReview';

const swiss: RosterReviewPhase = {
  id: 'swiss', type: 'SWISS', entrantCount: 16,
  groupCount: 2, swissRounds: 6, knockoutBestOf: [],
};

describe('roster-dependent mandatory phase reviews', () => {
  it('flags previously valid Swiss settings when the roster is reduced', () => {
    expect(needsRosterPhaseReview(swiss, { ...swiss, entrantCount: 4 }, 0)).toBe(true);
    expect(needsRosterPhaseReview(swiss, { ...swiss, entrantCount: 10 }, 0)).toBe(false);
  });

  it('flags a group phase with fewer than four entrants even when the group count remains unchanged', () => {
    const groups: RosterReviewPhase = { ...swiss, type: 'GROUPS', groupCount: 2 };
    expect(needsRosterPhaseReview(groups, { ...groups, entrantCount: 3 }, 0)).toBe(true);
  });

  it('flags changed qualification slots and round-specific knockout settings', () => {
    const ko: RosterReviewPhase = { ...swiss, type: 'KNOCKOUT', entrantCount: 8, knockoutBestOf: [3, 5, 7] };
    expect(needsRosterPhaseReview(ko, { ...ko, entrantCount: 4, knockoutBestOf: [5, 7] }, 1)).toBe(true);
    expect(needsRosterPhaseReview(ko, { ...ko }, 1)).toBe(false);
  });
});
