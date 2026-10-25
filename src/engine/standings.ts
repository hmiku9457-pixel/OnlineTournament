import type { Match, Participant, StandingRow, UUID } from '@/domain/types';

export function calculateStandings(participants: Participant[], matches: Match[]): StandingRow[] {
  const rows = new Map<UUID, StandingRow>();
  for (const participant of participants) {
    rows.set(participant.id, {
      participantId: participant.id,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      setDifference: 0,
      buchholz: 0,
    });
  }

  const confirmed = matches.filter((match) => ['CONFIRMED', 'WALKOVER'].includes(match.status));
  const opponents = new Map<UUID, Array<{ id: UUID; result: number }>>();

  for (const match of confirmed) {
    if (!match.sideAId || !match.sideBId) continue;
    const a = rows.get(match.sideAId);
    const b = rows.get(match.sideBId);
    if (!a || !b) continue;

    const setsA = match.sets.filter((set) => set.sideAScore > set.sideBScore).length;
    const setsB = match.sets.filter((set) => set.sideBScore > set.sideAScore).length;
    a.played += 1; b.played += 1;
    a.setsWon += setsA; a.setsLost += setsB;
    b.setsWon += setsB; b.setsLost += setsA;

    if (match.winnerSideId === match.sideAId) { a.wins += 1; b.losses += 1; }
    if (match.winnerSideId === match.sideBId) { b.wins += 1; a.losses += 1; }

    // One point for winning, half for a drawn game, zero for losing.
    // Each encounter contributes separately, including repeat opponents.
    const resultA = match.winnerSideId === match.sideAId ? 1
      : match.winnerSideId === match.sideBId ? 0 : 0.5;
    opponents.set(a.participantId, [...(opponents.get(a.participantId) ?? []), { id: b.participantId, result: resultA }]);
    opponents.set(b.participantId, [...(opponents.get(b.participantId) ?? []), { id: a.participantId, result: 1 - resultA }]);
  }

  for (const row of rows.values()) row.setDifference = row.setsWon - row.setsLost;

  // Sonneborn-Berger: Nur Siege (voll) und Remis (halb) gegen Gegner
  // tragen deren aktuelle Gesamtpunkte zur Feinwertung bei.
  // Das historische Datenfeld buchholz bleibt vorerst API-kompatibel.
  for (const row of rows.values()) {
    row.buchholz = (opponents.get(row.participantId) ?? []).reduce(
      (sum, opponent) => sum + opponent.result * (rows.get(opponent.id)?.wins ?? 0),
      0,
    );
  }

  return [...rows.values()].sort(compareStandingRows);
}

export function compareStandingRows(a: StandingRow, b: StandingRow): number {
  return (
    b.wins - a.wins ||
    b.setDifference - a.setDifference ||
    b.setsWon - a.setsWon ||
    b.buchholz - a.buchholz ||
    a.participantId.localeCompare(b.participantId)
  );
}
