import type { DemoTournament } from '@/data/demoTournaments';

export const WITHDRAWAL_KEY = 'online-tournament:withdrawn-participants:v1';

export function readWithdrawnParticipants(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(WITHDRAWAL_KEY) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, string[]> : {};
  } catch { return {}; }
}

export function isParticipantWithdrawn(tournament: DemoTournament, name: string): boolean {
  return (readWithdrawnParticipants()[tournament.id] ?? []).includes(name);
}

export function saveParticipantWithdrawal(tournament: DemoTournament, name: string): void {
  const current = readWithdrawnParticipants();
  current[tournament.id] = [...new Set([...(current[tournament.id] ?? []), name])];
  window.localStorage.setItem(WITHDRAWAL_KEY, JSON.stringify(current));
}


// Stores eligibility at withdrawal time. A withdrawal DURING a running phase
// must never be undone later, even if that phase subsequently finishes.
const RESTORE_KEY = 'online-tournament:withdrawal-restore:v1';
export interface WithdrawalRestoreRecord { phaseId: string | null; kind: 'PRESTART' | 'BETWEEN_PHASES' }

function readRestoreRecords(): Record<string, Record<string, WithdrawalRestoreRecord>> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(RESTORE_KEY) ?? '{}') as Record<string, Record<string, WithdrawalRestoreRecord>>; }
  catch { return {}; }
}

export function markWithdrawalRestoreEligibility(tournamentId: string, name: string, record: WithdrawalRestoreRecord | null) {
  const records = readRestoreRecords();
  const entries = { ...(records[tournamentId] ?? {}) };
  if (record) entries[name] = record;
  else delete entries[name];
  records[tournamentId] = entries;
  window.localStorage.setItem(RESTORE_KEY, JSON.stringify(records));
}

export function getWithdrawalRestoreEligibility(tournamentId: string, name: string) {
  return readRestoreRecords()[tournamentId]?.[name];
}

export function removeParticipantWithdrawal(tournament: DemoTournament, name: string) {
  const all = readWithdrawnParticipants();
  all[tournament.id] = (all[tournament.id] ?? []).filter((entry) => entry !== name);
  window.localStorage.setItem(WITHDRAWAL_KEY, JSON.stringify(all));
  markWithdrawalRestoreEligibility(tournament.id, name, null);
}
