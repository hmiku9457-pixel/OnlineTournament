import type { PriorMeeting, StandingRow, UUID } from '@/domain/types';

export interface SwissPairing {
  sideAId: UUID;
  sideBId?: UUID;
  bye: boolean;
}

function pairKey(a: UUID, b: UUID): string {
  return [a, b].sort().join('|');
}

export function generateSwissPairings(
  standings: StandingRow[],
  priorMeetings: PriorMeeting[],
  priorByes: UUID[] = [],
): SwissPairing[] {
  const meetingSet = new Set(priorMeetings.map(({ a, b }) => pairKey(a, b)));
  const remaining = standings.map((row) => row.participantId);
  const pairings: SwissPairing[] = [];

  if (remaining.length % 2 === 1) {
    const byeCandidate = [...remaining].reverse().find((id) => !priorByes.includes(id)) ?? remaining[remaining.length - 1];
    remaining.splice(remaining.indexOf(byeCandidate), 1);
    pairings.push({ sideAId: byeCandidate, bye: true });
  }

  while (remaining.length) {
    const a = remaining.shift()!;
    let index = remaining.findIndex((b) => !meetingSet.has(pairKey(a, b)));
    if (index === -1) index = 0;
    const b = remaining.splice(index, 1)[0];
    pairings.push({ sideAId: a, sideBId: b, bye: false });
  }

  return pairings;
}
