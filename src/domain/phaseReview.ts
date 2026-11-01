import { isValidSwissRoundCount } from '@/domain/tournamentCreation';
import type { StageType } from '@/domain/types';

/** A roster change can make a phase invalid without changing the phase's
 * explicit values (e.g. six Swiss rounds for only four entrants). */
export interface RosterReviewPhase {
  id: string;
  type: StageType;
  entrantCount: number;
  groupCount: number;
  swissRounds: number;
  knockoutBestOf: readonly number[];
}

export function needsRosterPhaseReview(before: RosterReviewPhase, after: RosterReviewPhase, index: number): boolean {
  return (index > 0 && before.type !== 'BREAK' && before.entrantCount !== after.entrantCount)
    || before.groupCount !== after.groupCount
    || JSON.stringify(before.knockoutBestOf) !== JSON.stringify(after.knockoutBestOf)
    || (after.type === 'SWISS' && !isValidSwissRoundCount(after.swissRounds, after.entrantCount))
    || (after.type === 'GROUPS' && (after.entrantCount < 4
      || after.groupCount > Math.floor(after.entrantCount / 2)));
}
