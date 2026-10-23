import type { MatchSet } from '@/domain/types';

/**
 * A finished match's sets are the source of truth for its set score.
 * The score label may be formatted differently, stale, or side-relative in
 * older local snapshots; never use it over completed individual sets.
 */
export function resultForParticipant(
  score: string,
  sets: MatchSet[] | undefined,
  participantIsSideB: boolean,
): { score: string; sets: MatchSet[] | undefined } {
  const numericScore = /^(\d+)\s*:\s*(\d+)$/.exec(score.trim());
  const orientedSets = participantIsSideB
    ? sets?.map((set) => ({
        ...set,
        sideAScore: set.sideBScore,
        sideBScore: set.sideAScore,
      }))
    : sets;

  // Preserve pending and special match labels (e.g. W.O.). Live sets must
  // not be mistaken for a final result in a player's match history.
  if (!numericScore) return { score, sets: orientedSets };

  if (orientedSets?.length) {
    const ownWins = orientedSets.filter((set) => set.sideAScore > set.sideBScore).length;
    const opponentWins = orientedSets.filter((set) => set.sideBScore > set.sideAScore).length;
    return { score: `${ownWins}:${opponentWins}`, sets: orientedSets };
  }

  return {
    score: participantIsSideB
      ? `${numericScore[2]}:${numericScore[1]}`
      : `${numericScore[1]}:${numericScore[2]}`,
    sets: orientedSets,
  };
}

/** Match identity is explicit here: callers cannot accidentally reverse A/B twice. */
export function resultForMatchParticipant(
  match: { sideA: string; sideB: string; score: string; sets?: MatchSet[] },
  participantName: string,
): { score: string; sets: MatchSet[] | undefined } {
  if (participantName !== match.sideA && participantName !== match.sideB) {
    throw new Error(`Participant ${participantName} is not in match ${match.sideA} – ${match.sideB}`);
  }
  return resultForParticipant(match.score, match.sets, participantName === match.sideB);
}
