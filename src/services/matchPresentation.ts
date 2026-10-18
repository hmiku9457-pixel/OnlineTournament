import type { MatchSet } from '@/domain/types';

/** Display result and individual sets from the selected participant's perspective. */
export function resultForParticipant(
  score: string,
  sets: MatchSet[] | undefined,
  participantIsSideB: boolean,
): { score: string; sets: MatchSet[] | undefined } {
  if (!participantIsSideB) return { score, sets };
  const regularScore = /^(\d+)\s*:\s*(\d+)$/.exec(score);
  return {
    score: regularScore ? `${regularScore[2]}:${regularScore[1]}` : score,
    sets: sets?.map((set) => ({
      ...set,
      sideAScore: set.sideBScore,
      sideBScore: set.sideAScore,
    })),
  };
}
