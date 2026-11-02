import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { participantId, participantName } from '@/domain/participantIdentity';
import type { DemoTournament } from '@/data/demoTournaments';
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

/** Persist fingerprints under technical identities so renaming does not
 * invalidate a certified qualification decision. */
function tournamentForDecision(tournamentId: string): DemoTournament | undefined {
  return getAllMockTournaments().find((item) => item.id === tournamentId);
}
function canonicalSignature(tournament: DemoTournament | undefined, signature: string): string {
  if (!tournament) return signature;
  try {
    const walk = (value: unknown): unknown => {
      if (typeof value === 'string') return participantId(tournament, value);
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
      }
      return value;
    };
    const canonical = walk(JSON.parse(signature) as unknown) as {
      tie?: { players?: string[] };
      groups?: unknown[][];
    };
    // Sporting ties are displayed alphabetically. A name correction can
    // reorder equal-ranked rows/participants without changing any result.
    // Their identity fingerprint must therefore use a stable ID order.
    if (canonical.tie?.players) canonical.tie.players.sort();
    if (Array.isArray(canonical.groups)) {
      canonical.groups = canonical.groups.map((group) => [
        group[0],
        ...group.slice(1).sort((a, b) => {
          const left = Array.isArray(a) ? String(a[0]) : String(a);
          const right = Array.isArray(b) ? String(b[0]) : String(b);
          return left.localeCompare(right);
        }),
      ]);
    }
    return JSON.stringify(canonical);
  } catch { return signature; }
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
  const tournament = tournamentForDecision(tournamentId);
  const stored = readAll().find((x) => x.tournamentId === tournamentId && x.stageId === stageId
    && x.signature === canonicalSignature(tournament, signature));
  return stored ? {
    ...stored, signature,
    winners: tournament ? stored.winners.map((id) => participantName(tournament, id)) : stored.winners,
  } : null;
}

export function saveGroupCutoffDecision(decision: GroupCutoffDecision): void {
  // Multiple independent group ties can exist in one stage. Keep other
  // decisions for the same results, but replace a corrected choice for this signature.
  const tournament = tournamentForDecision(decision.tournamentId);
  const stored: GroupCutoffDecision = tournament ? {
    ...decision,
    signature: canonicalSignature(tournament, decision.signature),
    winners: decision.winners.map((name) => participantId(tournament, name)),
  } : decision;
  const prior = readAll().filter((x) => !(x.tournamentId === stored.tournamentId && x.stageId === stored.stageId && x.signature === stored.signature));
  if (typeof window === 'undefined') throw new Error('Eine Speicherung ist nur im Turnierbrowser möglich.');
  localTournamentStorage.setItem(KEY, JSON.stringify([...prior, stored]));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}
