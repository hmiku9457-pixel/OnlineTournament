import { supabase } from '@/lib/supabase';
import { backupTournamentName, captureTournamentBackup, validateTournamentBackup, type TournamentBackup } from '@/services/localTournamentStorage';

export interface CloudBackupSummary {
  id: string;
  tournament_id: string;
  tournament_name: string;
  created_at: string;
}
async function requireAccount() {
  if (!supabase) throw new Error('Supabase ist nicht eingerichtet.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error('Bitte zuerst anmelden.');
  return supabase;
}
export async function listCloudBackups(): Promise<CloudBackupSummary[]> {
  const client = await requireAccount();
  const { data, error } = await client.from('tournament_backups').select('id,tournament_id,tournament_name,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('Sicherungen konnten nicht geladen werden: ' + error.message);
  return (data ?? []) as CloudBackupSummary[];
}
export async function saveCloudBackup(tournamentId: string): Promise<void> {
  const client = await requireAccount();
  const backup = await captureTournamentBackup(tournamentId);
  const { error } = await client.from('tournament_backups').insert({ tournament_id: tournamentId, tournament_name: backupTournamentName(backup), payload: backup });
  if (error) throw new Error('Sicherung fehlgeschlagen: ' + error.message);
}
export async function loadCloudBackup(id: string): Promise<TournamentBackup> {
  const client = await requireAccount();
  const { data, error } = await client.from('tournament_backups').select('payload,tournament_id').eq('id', id).single();
  if (error || !data) throw new Error('Sicherung nicht verfügbar.');
  const backup = validateTournamentBackup(data.payload);
  if (backup.tournamentId !== data.tournament_id) throw new Error('Falsche Turnierkennung.');
  return backup;
}
export async function deleteCloudBackup(id: string): Promise<void> {
  const client = await requireAccount();
  const { data, error } = await client.from('tournament_backups').delete().eq('id', id).select('id').single();
  if (error || !data) throw new Error('Sicherung konnte nicht gelöscht werden.');
}
