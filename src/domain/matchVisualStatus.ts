/** One visual status language for match lists in every tournament format.
 * Match results are authoritative: a finished game stays grey even if it
 * still has an old table assignment in local state. */
export type MatchVisualState = 'waiting' | 'live' | 'finished' | 'cancelled';

export function matchVisualState(status: string | null | undefined): MatchVisualState {
  switch (status) {
    case 'FINISHED':
    case 'played':
      return 'finished';
    case 'LIVE':
    case 'READY':
    case 'CONFIRMATION':
    case 'live':
      return 'live';
    case 'CANCELLED':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'waiting';
  }
}

export function matchVisualLabel(status: string | null | undefined): string {
  switch (matchVisualState(status)) {
    case 'finished': return 'Abgeschlossen';
    case 'live': return 'Läuft gerade';
    case 'cancelled': return 'Nicht ausgetragen';
    case 'waiting': return 'Ausstehend';
  }
}

export function matchVisualClass(status: string | null | undefined): string {
  return `match-state-${matchVisualState(status)}`;
}
