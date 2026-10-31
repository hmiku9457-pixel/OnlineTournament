import type { DemoTournament } from '@/data/demoTournaments';
import { recordMockAudit } from '@/services/mockAudit';

// Local-only prototype setting. Keys are tournament IDs so that separate
// tournaments can use the same table labels independently.
export const TABLE_LOCK_KEY = 'online-tournament:mock-blocked-tables:v1';

type StoredTableLocks = Record<string, string[]>;

function readTableLocks(): StoredTableLocks {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(TABLE_LOCK_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as StoredTableLocks;
  } catch {
    return {};
  }
}

function isValidTable(tournament: DemoTournament, table: string) {
  const number = Number(/^Tisch (\d+)$/.exec(table)?.[1]);
  return Number.isInteger(number) && number >= 1 && number <= tournament.tables;
}

export function getBlockedMockTables(tournament: DemoTournament): string[] {
  const blocked = readTableLocks()[tournament.id];
  return Array.isArray(blocked) ? blocked.filter((table) => isValidTable(tournament, table)) : [];
}

export function isMockTableBlocked(tournament: DemoTournament, table: string): boolean {
  return getBlockedMockTables(tournament).includes(table);
}

export function setMockTableBlocked(tournament: DemoTournament, table: string, blocked: boolean): boolean {
  if (!isValidTable(tournament, table) || typeof window === 'undefined') return false;
  const all = readTableLocks();
  const current = new Set(getBlockedMockTables(tournament));
  const wasBlocked = current.has(table);
  if (blocked) current.add(table);
  else current.delete(table);
  all[tournament.id] = [...current];
  window.localStorage.setItem(TABLE_LOCK_KEY, JSON.stringify(all));
  if (wasBlocked !== blocked) {
    recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)',
      action: blocked ? 'TABLE_BLOCKED' : 'TABLE_UNBLOCKED',
      description: `${table} ${blocked ? 'gesperrt' : 'freigegeben'}`, after: table });
  }
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}
