import type { DemoTournament } from '@/data/demoTournaments';

export const WITHDRAWAL_KEY = 'online-tournament:withdrawn-participants:v1';
export const WITHDRAWAL_TIMING_KEY = 'online-tournament:withdrawal-timing:v1';

export type WithdrawalTiming =
  | { kind: 'BEFORE_TOURNAMENT'; stageId: null }
  | { kind: 'DURING_PHASE' | 'AFTER_PHASE'; stageId: string };

function readTimingRecords(): Record<string, Record<string, WithdrawalTiming>> {
  if (typeof window === 'undefined') return {};
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(WITHDRAWAL_TIMING_KEY) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, Record<string, WithdrawalTiming>> : {};
  } catch { return {}; }
}

export function saveWithdrawalTiming(tournamentId: string, name: string, timing: WithdrawalTiming): void {
  const all = readTimingRecords();
  all[tournamentId] = { ...(all[tournamentId] ?? {}), [name]: timing };
  window.localStorage.setItem(WITHDRAWAL_TIMING_KEY, JSON.stringify(all));
}

/** Existing between-phase withdrawals can be identified from their restore record. */
export function getWithdrawalTiming(tournament: DemoTournament, name: string): WithdrawalTiming | null {
  if (!isParticipantWithdrawn(tournament, name)) return null;
  const saved = readTimingRecords()[tournament.id]?.[name];
  if (saved) return saved;
  const legacy = getWithdrawalRestoreEligibility(tournament.id, name);
  if (legacy?.kind === 'PRESTART') return { kind: 'BEFORE_TOURNAMENT', stageId: null };
  if (legacy?.kind === 'BETWEEN_PHASES' && legacy.phaseId) {
    const upcoming = tournament.stages.findIndex((stage) => stage.id === legacy.phaseId);
    if (upcoming > 0) return { kind: 'AFTER_PHASE', stageId: tournament.stages[upcoming - 1].id };
  }
  // No timestamp was captured for historical withdrawals during an active phase.
  return null;
}

export function getWithdrawalLabel(tournament: DemoTournament, name: string): string | null {
  if (!isParticipantWithdrawn(tournament, name)) return null;
  const timing = getWithdrawalTiming(tournament, name);
  if (!timing) return 'Zurückgezogen';
  if (timing.kind === 'BEFORE_TOURNAMENT') return 'Zurückgezogen vor Turnierstart';
  const phaseIndex = tournament.stages.findIndex((stage) => stage.id === timing.stageId);
  if (phaseIndex < 0) return 'Zurückgezogen';
  return `Zurückgezogen ${timing.kind === 'DURING_PHASE' ? 'während' : 'nach'} Phase ${phaseIndex + 1}`;
}

/** Never mark historic phase standings before the actual withdrawal. */
export function getStageWithdrawalLabel(tournament: DemoTournament, name: string, stageId: string): string | null {
  const timing = getWithdrawalTiming(tournament, name);
  if (!timing) return null;
  const viewedIndex = tournament.stages.findIndex((stage) => stage.id === stageId);
  if (viewedIndex < 0) return null;
  if (timing.kind === 'BEFORE_TOURNAMENT') return getWithdrawalLabel(tournament, name);
  const withdrawalIndex = tournament.stages.findIndex((stage) => stage.id === timing.stageId);
  return withdrawalIndex >= 0 && viewedIndex >= withdrawalIndex ? getWithdrawalLabel(tournament, name) : null;
}



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
  const timings = readTimingRecords();
  if (timings[tournament.id]) {
    delete timings[tournament.id][name];
    window.localStorage.setItem(WITHDRAWAL_TIMING_KEY, JSON.stringify(timings));
  }
}
