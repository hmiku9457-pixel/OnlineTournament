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
  eliminated: string[];
  sets: SwissCutoffSetDecision[];
  winners?: string[];
}

const STORE_KEY = 'online-tournament:swiss-cutoff-decisions:v1';

function allDecisions(): Record<string, StoredSwissCutoffDecision> {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, StoredSwissCutoffDecision> : {};
  } catch { return {}; }
}

const key = (tournamentId: string, stageId: string) => `${tournamentId}:${stageId}`;

export function readSwissCutoffDecision(tournamentId: string, stageId: string, signature: string): StoredSwissCutoffDecision | null {
  const state = allDecisions()[key(tournamentId, stageId)];
  return state?.signature === signature ? state : null;
}

export function saveSwissCutoffDecision(tournamentId: string, stageId: string, state: StoredSwissCutoffDecision): void {
  if (typeof window === 'undefined') return;
  const all = allDecisions();
  all[key(tournamentId, stageId)] = state;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

export function clearSwissCutoffDecision(tournamentId: string, stageId: string): void {
  if (typeof window === 'undefined') return;
  const all = allDecisions();
  delete all[key(tournamentId, stageId)];
  window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

export function clearAllSwissCutoffDecisions(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORE_KEY);
}
