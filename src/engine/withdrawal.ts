import type { Match, UUID } from '@/domain/types';

export interface WithdrawalResolution {
  updatedMatches: Match[];
  affectedMatchIds: UUID[];
}

/**
 * Bereits bestätigte Spiele bleiben unverändert. Zukünftige Spiele werden als Walkover
 * gegen den zurückgezogenen Teilnehmer gewertet. Bracket-Byes werden dabei nicht als
 * echtes Match behandelt, damit keine "zwei Freilose" hintereinander erzeugt werden.
 */
export function applyWithdrawal(matches: Match[], participantId: UUID): WithdrawalResolution {
  const affectedMatchIds: UUID[] = [];
  const updatedMatches = matches.map((match) => {
    if (['CONFIRMED', 'WALKOVER', 'CANCELLED'].includes(match.status)) return match;
    const isA = match.sideAId === participantId;
    const isB = match.sideBId === participantId;
    if (!isA && !isB) return match;

    const opponentId = isA ? match.sideBId : match.sideAId;
    if (!opponentId) {
      // Leerer Gegenpart/Bye: nicht künstlich als Walkover fortschreiben.
      return { ...match, status: 'CANCELLED' as const, winnerSideId: undefined };
    }

    affectedMatchIds.push(match.id);
    return {
      ...match,
      status: 'WALKOVER' as const,
      winnerSideId: opponentId,
      sets: [],
    };
  });

  return { updatedMatches, affectedMatchIds };
}
