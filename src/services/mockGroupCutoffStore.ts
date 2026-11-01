import { localTournamentStorage } from '@/services/localTournamentStorage';
/** Director-resolved qualification tie in a GROUPS stage.
 * A choice is valid only for the exact completed group results/draw signature.
 * No alphabetic ordering may silently break a sporting tie at the cutoff. */
const KEY = 'online-tournament:group-cutoff-decisions:v1';

export interface GroupCutoffDecision {
  tournamentId: string;
  stageId: string;
  signature: string;
  winners: string[];
  method: 'PLAYOFF' | 'LOT';
  explanation: string;
}

function readAll(): GroupCutoffDecision[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localTournamentStorage.getItem(KEY) || '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is GroupCutoffDecision =>
      Boolean(x && typeof x === 'object' && typeof (x as GroupCutoffDecision).stageId === 'string')) : [];
  } catch { return []; }
}

export function getGroupCutoffDecision(tournamentId: string, stageId: string, signature: string): GroupCutoffDecision | null {
  return readAll().find((x) => x.tournamentId === tournamentId && x.stageId === stageId && x.signature === signature) ?? null;
}

export function saveGroupCutoffDecision(decision: GroupCutoffDecision): void {
  // Multiple independent group ties can exist in one stage. Keep other
  // decisions for the same results, but replace a corrected choice for this signature.
  const prior = readAll().filter((x) => !(x.tournamentId === decision.tournamentId && x.stageId === decision.stageId && x.signature === decision.signature));
  if (typeof window === 'undefined') throw new Error('Eine Speicherung ist nur im Turnierbrowser möglich.');
  localTournamentStorage.setItem(KEY, JSON.stringify([...prior, decision]));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}
