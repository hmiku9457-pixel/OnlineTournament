import type { DemoTournament } from '@/data/demoTournaments';
import { BYE_SLOT, PENDING_SLOT, UNCLAIMED_WINNER, type MatchSlot } from '@/domain/matchSlots';

/** Stable participant identities belong to one tournament and never change
 * when the organizer edits the display name. The fallback covers synthetic
 * in-memory test fixtures, not any previous storage schema. */
export function participantId(tournament: DemoTournament, name: string): string {
  if (name === BYE_SLOT || name === PENDING_SLOT || name === UNCLAIMED_WINNER) return name;
  return tournament.participantIds?.[name] ?? name;
}
// One reverse index per immutable tournament snapshot avoids O(n²) work
// when restoring thousands of match slots and group assignments.
const reverseIndex = new WeakMap<DemoTournament, Map<string, string>>();
export function participantName(tournament: DemoTournament, id: string): string {
  if (id === BYE_SLOT || id === PENDING_SLOT || id === UNCLAIMED_WINNER) return id;
  let lookup = reverseIndex.get(tournament);
  if (!lookup) {
    lookup = new Map(Object.entries(tournament.participantIds ?? {})
      .map(([name, participantId]) => [participantId, name]));
    reverseIndex.set(tournament, lookup);
  }
  return lookup.get(id) ?? id;
}
export function newParticipantId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}
export function newParticipantIds(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, newParticipantId()]));
}

/** Storage uses actual discriminated match slots instead of a string
 * interpreted as a name, bye or unknown future winner. */
export type StoredMatchSlot =
  | { kind: 'participant'; participantId: string }
  | { kind: 'bye' }
  | { kind: 'pending' }
  | { kind: 'unclaimed' };
export function storeMatchSlot(tournament: DemoTournament, value: string): StoredMatchSlot {
  if (value === BYE_SLOT) return { kind: 'bye' };
  if (value === PENDING_SLOT) return { kind: 'pending' };
  if (value === UNCLAIMED_WINNER) return { kind: 'unclaimed' };
  return { kind: 'participant', participantId: participantId(tournament, value) };
}
export function restoreMatchSlot(tournament: DemoTournament, slot: StoredMatchSlot): string {
  if (slot.kind === 'bye') return BYE_SLOT;
  if (slot.kind === 'pending') return PENDING_SLOT;
  if (slot.kind === 'unclaimed') return UNCLAIMED_WINNER;
  return participantName(tournament, slot.participantId);
}
export function asDisplaySlot(tournament: DemoTournament, slot: StoredMatchSlot): MatchSlot {
  return slot.kind === 'participant'
    ? { kind: 'participant', name: participantName(tournament, slot.participantId) }
    : slot;
}
