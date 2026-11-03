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
  inlineBreakAfterRound?: number;
  dayBreaks?: readonly { afterRound: number; date: string; time: string }[];
}

/** Review all previously existing phases whose entrant count was changed
 * implicitly by insertion, removal, reordering or qualifier adjustment. */
export function changedPhaseEntrantIds<T extends { id: string; entrantCount: number }>(
  previous: readonly T[], normalized: readonly T[], manuallyEditedId?: string,
): string[] {
  const previousCount = new Map(previous.map((phase) => [phase.id, phase.entrantCount]));
  return normalized.filter((phase) => phase.id !== manuallyEditedId && previousCount.has(phase.id)
    && previousCount.get(phase.id) !== phase.entrantCount).map((phase) => phase.id);
}

export function needsRosterPhaseReview(before: RosterReviewPhase, after: RosterReviewPhase, index: number): boolean {
  return (index > 0 && before.type !== 'BREAK' && before.entrantCount !== after.entrantCount)
    || before.groupCount !== after.groupCount
    || JSON.stringify(before.knockoutBestOf) !== JSON.stringify(after.knockoutBestOf)
    || before.inlineBreakAfterRound !== after.inlineBreakAfterRound
    || JSON.stringify(before.dayBreaks) !== JSON.stringify(after.dayBreaks)
    || (after.type === 'SWISS' && !isValidSwissRoundCount(after.swissRounds, after.entrantCount))
    || (after.type === 'GROUPS' && (after.entrantCount < 4
      || after.groupCount > Math.floor(after.entrantCount / 2)));
}
