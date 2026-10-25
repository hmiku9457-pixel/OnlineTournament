import type { PlayoffRound } from '@/domain/swissCutoffPlayoff';
export interface SwissCutoffSetDecision {
  sideA: string;
  sideB: string;
  pointsA: number;
  pointsB: number;
  winner: string;
}

export interface StoredSwissCutoffDecision {
  signature: string;
  mode: 'SET' | 'LOT' | 'ROUND' | 'ROUND_ROBIN';
  extraRounds?: PlayoffRound[];
  /** Number of qualifying places in the intermediate phase. */
  qualificationSlots?: number;
  /** Only the actually inseparable players draw lots; prior secured spots remain intact. */
  lotPlayers?: string[];
  lotWinners?: string[];
  eliminated: string[];
  sets: SwissCutoffSetDecision[];
  winners?: string[];
}

const STORE_KEY = 'online-tournament:swiss-cutoff-decisions:v1';
const ROUND_ROBIN_ARCHIVE_KEY = 'online-tournament:swiss-round-robin-history:v1';

function allDecisions(): Record<string, StoredSwissCutoffDecision> {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, StoredSwissCutoffDecision> : {};
  } catch { return {}; }
}

const key = (tournamentId: string, stageId: string) => `${tournamentId}:${stageId}`;

function archivedRoundRobins(): Record<string, StoredSwissCutoffDecision> {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ROUND_ROBIN_ARCHIVE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, StoredSwissCutoffDecision> : {};
  } catch { return {}; }
}

/** Keep the intermediate stage visible even if another Swiss round changes the cutoff fingerprint. */
export function readSwissRoundRobinHistory(tournamentId: string, stageId: string): StoredSwissCutoffDecision | null {
  return archivedRoundRobins()[key(tournamentId, stageId)] ?? null;
}

export function readSwissCutoffDecision(tournamentId: string, stageId: string, signature: string): StoredSwissCutoffDecision | null {
  const state = allDecisions()[key(tournamentId, stageId)];
  return state?.signature === signature ? state : null;
}

export function saveSwissCutoffDecision(tournamentId: string, stageId: string, state: StoredSwissCutoffDecision): void {
  if (typeof window === 'undefined') return;
  const all = allDecisions();
  all[key(tournamentId, stageId)] = state;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  if (state.extraRounds?.some((round) => round.kind === 'ROUND_ROBIN')) {
    const archive = archivedRoundRobins();
    archive[key(tournamentId, stageId)] = state;
    window.localStorage.setItem(ROUND_ROBIN_ARCHIVE_KEY, JSON.stringify(archive));
  }
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

export function clearSwissCutoffDecision(tournamentId: string, stageId: string): void {
  if (typeof window === 'undefined') return;
  const all = allDecisions();
  delete all[key(tournamentId, stageId)];
  window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  const archive = archivedRoundRobins();
  delete archive[key(tournamentId, stageId)];
  window.localStorage.setItem(ROUND_ROBIN_ARCHIVE_KEY, JSON.stringify(archive));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

export function clearAllSwissCutoffDecisions(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem(ROUND_ROBIN_ARCHIVE_KEY);
  }
}
