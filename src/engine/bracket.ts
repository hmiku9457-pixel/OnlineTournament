import type { PriorMeeting, UUID } from '@/domain/types';

export interface SeededParticipant {
  participantId: UUID;
  seed: number;
  sourceGroup?: string;
}

export interface BracketPairing {
  sideAId?: UUID;
  sideBId?: UUID;
  bye: boolean;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function seedOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('Bracket size must be a power of two');
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return order;
}

function metBefore(a: UUID, b: UUID, prior: PriorMeeting[]): boolean {
  return prior.some((meeting) => (meeting.a === a && meeting.b === b) || (meeting.a === b && meeting.b === a));
}

/**
 * Erstellt eine deterministische erste K.-o.-Runde mit klassischer Setzverteilung.
 * Die Setzposition bleibt die höchste Priorität. Danach werden lokale Swaps versucht,
 * um frühere Gegner bzw. Spieler derselben Ursprungsgruppe in Runde 1 zu vermeiden.
 */
export function generateKnockoutFirstRound(
  seeded: SeededParticipant[],
  priorMeetings: PriorMeeting[] = [],
): BracketPairing[] {
  if (!seeded.length) return [];
  const ordered = [...seeded].sort((a, b) => a.seed - b.seed || a.participantId.localeCompare(b.participantId));
  const size = nextPowerOfTwo(Math.max(2, ordered.length));
  const slots = seedOrder(size).map((seed) => ordered[seed - 1]);

  // Nur die jeweils zweite Position eines Paares wird mit einer anderen zweiten
  // Position getauscht. So bleibt die Position der gesetzten Favoriten stabil.
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    if (!a || !b) continue;
    const conflict = metBefore(a.participantId, b.participantId, priorMeetings) ||
      Boolean(a.sourceGroup && a.sourceGroup === b.sourceGroup);
    if (!conflict) continue;

    for (let j = i + 3; j < slots.length; j += 2) {
      const candidate = slots[j];
      if (!candidate) continue;
      const candidateConflict = metBefore(a.participantId, candidate.participantId, priorMeetings) ||
        Boolean(a.sourceGroup && a.sourceGroup === candidate.sourceGroup);
      if (!candidateConflict) {
        slots[i + 1] = candidate;
        slots[j] = b;
        break;
      }
    }
  }

  const result: BracketPairing[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    result.push({
      sideAId: slots[i]?.participantId,
      sideBId: slots[i + 1]?.participantId,
      bye: !slots[i] || !slots[i + 1],
    });
  }
  return result;
}
