/** Structured identities distinguish real players from technical match slots. */
export type MatchSlot = { kind: 'participant'; name: string } | { kind: 'bye' } | { kind: 'pending' } | { kind: 'unclaimed' };
/** Serialized technical tokens are impossible as real participant names. */
export const BYE_SLOT = '\u0000ot:bye';
export const PENDING_SLOT = '\u0000ot:pending';
export const UNCLAIMED_WINNER = '\u0000ot:unclaimed';
export function decodeMatchSlot(value: string): MatchSlot {
  if (value === BYE_SLOT) return { kind: 'bye' };
  if (value === PENDING_SLOT) return { kind: 'pending' };
  if (value === UNCLAIMED_WINNER) return { kind: 'unclaimed' };
  return { kind: 'participant', name: value };
}
export function encodeMatchSlot(slot: MatchSlot): string {
  switch (slot.kind) {
    case 'participant': return slot.name;
    case 'bye': return BYE_SLOT;
    case 'pending': return PENDING_SLOT;
    case 'unclaimed': return UNCLAIMED_WINNER;
  }
}
export function isByeSlot(value: string): boolean { return decodeMatchSlot(value).kind === 'bye'; }
export function isPendingSlot(value: string): boolean { return decodeMatchSlot(value).kind === 'pending'; }
export function displayMatchSlot(value: string): string {
  switch (decodeMatchSlot(value).kind) {
    case 'bye': return 'Freilos';
    case 'pending': return 'TBD';
    case 'unclaimed': return 'Kein Sieger';
    default: return value;
  }
}
