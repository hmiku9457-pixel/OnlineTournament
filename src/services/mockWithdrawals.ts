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
