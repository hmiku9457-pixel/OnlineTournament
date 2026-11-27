import { supabase } from '@/lib/supabase';
import { backupTournamentName, captureTournamentBackup, validateTournamentBackup,
  initializeRemoteTournamentStorage, invalidateRemoteTournamentStorage, initialTournamentBackup, type TournamentBackup } from '@/services/localTournamentStorage';

import { buildNewTournament, type CreateMockTournamentInput } from '@/services/mockTournamentStore';
import type { DemoTournament } from '@/data/demoTournaments';

export interface OnlineTournamentSummary { id: string; name: string; revision: number; updated_at: string }
interface OnlineTournament extends OnlineTournamentSummary { payload: TournamentBackup }
async function account() {
  if (!supabase) throw new Error('Supabase ist nicht eingerichtet.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error('Bitte zuerst anmelden.');
  return { client: supabase, userId: data.user.id };
}
export async function listOnlineTournaments(): Promise<OnlineTournamentSummary[]> {
  const { client } = await account();
  const { data, error } = await client.rpc('list_online_tournaments');
  if (error) throw new Error('Online-Turniere konnten nicht geladen werden: ' + error.message);
  return (data ?? []) as OnlineTournamentSummary[];
}
async function load(id: string): Promise<OnlineTournament> {
  const { client } = await account();
  const { data, error } = await client.rpc('load_online_tournament', { p_id: id });
  if (error || !data || data.id !== id || !Number.isInteger(data.revision) || data.revision < 1) throw new Error('Online-Turnier nicht verfügbar.');
  const payload = validateTournamentBackup(data.payload);
  if (payload.tournamentId !== id) throw new Error('Falsche Turnierkennung.');
  return { ...data, payload } as OnlineTournament;
}
async function commit(backup: TournamentBackup, expected: number, ownerId: string, operationId = crypto.randomUUID()): Promise<number> {
  const args = { p_id: backup.tournamentId, p_name: backupTournamentName(backup),
    p_expected_revision: expected, p_operation_id: operationId, p_payload: backup };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { client, userId } = await account();
    if (userId !== ownerId) throw new Error('Die Anmeldung hat sich geändert.');
    const { data, error } = await client.rpc('commit_online_tournament', args);
    if (!error) {
      if (data !== expected + 1) throw new Error('Unerwartete Datenbankrevision.');
      return data as number;
    }
    if (error.code === '40001') throw new Error('Ein anderer Arbeitsbereich hat das Turnier geändert.');
    if (attempt === 0 && !error.code) continue;
    throw new Error(error.message || 'Verbindungsfehler.');
  }
  throw new Error('Speicherung nicht bestätigt.');
}
export interface OnlineCreationAttempt {
  tournament: DemoTournament;
  backup: TournamentBackup;
  operationId: string;
  inputFingerprint: string;
  ownerId: string;
}
/** An ambiguous creation can be retried with the original identity and exact payload. */
export async function prepareOnlineCreation(input: CreateMockTournamentInput): Promise<OnlineCreationAttempt> {
  const { userId } = await account();
  if (input.overwriteTournamentId) throw new Error('Online-Turniere werden nicht automatisch überschrieben.');
  const tournament = buildNewTournament(input);
  return { tournament, backup: initialTournamentBackup(tournament), operationId: crypto.randomUUID(),
    inputFingerprint: JSON.stringify(input), ownerId: userId };
}
export async function commitOnlineCreation(attempt: OnlineCreationAttempt): Promise<DemoTournament> {
  await commit(attempt.backup, 0, attempt.ownerId, attempt.operationId);
  return attempt.tournament;
}
export async function createOnlineTournamentFromLocal(id: string): Promise<void> {
  const { userId } = await account();
  const backup = await captureTournamentBackup(id);
  const record = JSON.parse(backup.entries['online-tournament:local-prototype-tournaments:v1:record:' + id]);
  if (record.tournament.hasStarted || !['DRAFT','REGISTRATION','READY'].includes(record.tournament.status))
    throw new Error('Nur noch nicht gestartete Turniere können als Online-Testturnier übernommen werden.');
  await commit(backup, 0, userId);
}
export function onlineWorkspaceUrl(id: string): string {
  const url = new URL(window.location.href);
  url.search = ''; url.searchParams.set('online', id); url.hash = '/tournaments/' + id + '/control';
  return url.href;
}
export function localOverviewUrl(): string {
  const url = new URL(window.location.href);
  url.search = ''; url.hash = '/online';
  return url.href;
}
export async function initializeOnlineWorkspace(id: string): Promise<void> {
  const { client, userId } = await account();
  const loaded = await load(id);
  let revision = loaded.revision;
  if ((await account()).userId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  initializeRemoteTournamentStorage(loaded.payload, async (snapshot) => { revision = await commit(snapshot, revision, userId); });
  client.auth.onAuthStateChange((_event, session) => {
    if (!session || session.user.id !== userId) invalidateRemoteTournamentStorage();
  });
}
