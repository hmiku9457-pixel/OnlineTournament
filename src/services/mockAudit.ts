/** Local prototype audit trail. Not a substitute for server-side identity or tamper-proof logging. */
import type { MatchSet } from '@/domain/types';
import type { ScoreDecision } from '@/domain/sportScoring';

export type MockAuditAction =
  | 'MATCH_ASSIGNED' | 'MATCH_MOVED' | 'MATCH_UNASSIGNED'
  | 'SET_SAVED' | 'RESULT_RECORDED' | 'RESULT_CORRECTED' | 'RESULT_RESTORED'
  | 'RESULT_CONFIRMED' | 'TOURNAMENT_PAUSED' | 'TOURNAMENT_RESUMED'
  | 'PARTICIPANT_RESTORED' | 'PARTICIPANT_WITHDRAWN' | 'PARTICIPANT_ADDED' | 'PARTICIPANT_UPDATED'
  | 'TABLE_BLOCKED' | 'TABLE_UNBLOCKED' | 'KNOCKOUT_DRAW_REBUILT' | 'FOLLOWUP_DRAW_ADJUSTED' | 'DRAW_CHANGED' | 'SWISS_TIE_SET' | 'SWISS_TIE_LOT'
  | 'SWISS_ROUND_APPROVED' | 'STAGE_APPROVED' | 'APPROVAL_REVOKED' | 'TOURNAMENT_ABORTED'
  | 'PRESTART_PHASES_CHANGED';

export interface MockAuditEntry {
  id: string;
  tournamentId: string;
  matchId?: string;
  at: number;
  actor: string;
  action: MockAuditAction;
  description: string;
  before?: string;
  after?: string;
  /** Previous and new scored sets (only recorded for a correction). */
  beforeSets?: MatchSet[];
  afterSets?: MatchSet[];
  beforeDecisionSide?: 'A' | 'B';
  afterDecisionSide?: 'A' | 'B';
  beforeDecision?: ScoreDecision;
  afterDecision?: ScoreDecision;
}

const KEY = 'online-tournament:mock-audit:v1';

export function getMockAudit(tournamentId: string): MockAuditEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(data) ? (data as MockAuditEntry[]).filter((entry) => entry.tournamentId === tournamentId) : [];
  } catch { return []; }
}

export function recordMockAudit(event: Omit<MockAuditEntry, 'id' | 'at'>) {
  if (typeof window === 'undefined') return;
  let old: MockAuditEntry[] = [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(parsed)) old = parsed as MockAuditEntry[];
  } catch { /* clean invalid local test state */ }
  const entry: MockAuditEntry = { ...event, id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, at: Date.now() };
  window.localStorage.setItem(KEY, JSON.stringify([entry, ...old].slice(0, 2000)));
  window.dispatchEvent(new CustomEvent('mock-audit-change', { detail: entry }));
  return entry;
}
