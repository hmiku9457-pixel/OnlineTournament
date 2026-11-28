import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/useAccount';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { captureTournamentBackup, restoreTournamentBackup, validateTournamentBackup } from '@/services/localTournamentStorage';
import { listCloudBackups, saveCloudBackup, loadCloudBackup, deleteCloudBackup, type CloudBackupSummary } from '@/services/cloudBackups';

export function BackupsPage() {
  const {session,loading}=useAccount();
  return <BackupWorkspace key={session?.user.id??'anonymous'} userId={session?.user.id} loading={loading}/>;
}
function BackupWorkspace({userId,loading}:{userId:string|undefined;loading:boolean}) {
  const navigate = useNavigate();
  const [local, setLocal] = useState(getAllMockTournaments);
  const [cloud, setCloud] = useState<CloudBackupSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setCloud([]); setRemoveId(null);
    if (userId) listCloudBackups().then((items) => { if (current) setCloud(items); })
      .catch((error: unknown) => { if (current) setMessage(error instanceof Error ? error.message : 'Sicherungen konnten nicht geladen werden.'); });
    return () => { current = false; };
  }, [userId]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); setLocal(getAllMockTournaments()); }
  }
  async function download(id: string) {
    const backup = await captureTournamentBackup(id);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'turnier-' + id + '.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('JSON-Sicherung erstellt. Bitte vertraulich aufbewahren.');
  }
  async function restore(input: unknown) {
    const id = await restoreTournamentBackup(input);
    navigate('/tournaments/' + id + '/control');
  }
  return <div className="tournament-dashboard">
    <header className="dashboard-page-hero"><div><h1>Turniersicherungen</h1><p className="muted">Einzelne Turniere sichern oder auf einem anderen Rechner wiederherstellen. Keine automatische Synchronisierung.</p></div><Link className="btn" to="/">Zur Übersicht</Link></header>
    {message && <p className="callout" role="status">{message}</p>}
    <section className="card"><h2>Lokale Turniere</h2>
      <p className="muted">Sicherungen enthalten auch Auslosungen, Ergebnisse, Pausen, Bestätigungen und Teilnehmercodes. Nicht öffentlich weitergeben.</p>
      {!local.length && <p>Keine lokalen Turniere vorhanden.</p>}
      {local.map((t) => <div className="actions" key={t.id} style={{ marginTop: 12 }}><strong>{t.name}</strong>
        <button className="btn small" disabled={busy} onClick={() => void run(() => download(t.id))}>JSON herunterladen</button>
        <button className="btn small primary" disabled={busy || !userId} onClick={() => void run(async () => { await saveCloudBackup(t.id); setCloud(await listCloudBackups()); setMessage('Cloud-Sicherung gespeichert.'); })}>In Supabase sichern</button>
      </div>)}
      <div className="field" style={{ marginTop: 16 }}><label htmlFor="restore-file">JSON-Sicherung wiederherstellen</label><input id="restore-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run(async () => { if (file.size > 8 * 1024 * 1024) throw new Error('Sicherungsdatei zu groß.'); await restore(validateTournamentBackup(JSON.parse(await file.text()))); });
      }} /></div>
    </section>
    <section className="card"><h2>Cloud-Sicherungen</h2>
      {loading ? <p>Lade Konto …</p> : !userId ? <p>Für private Cloud-Sicherungen bitte <Link to="/login">anmelden</Link>.</p> : <>
        <p className="muted">Bis zu 100 jüngste Sicherungen deines Kontos. Lokale Turniere werden beim Wiederherstellen niemals überschrieben.</p>
        <button className="btn small" disabled={busy} onClick={() => void run(async () => setCloud(await listCloudBackups()))}>Aktualisieren</button>
        {!cloud.length && <p>Keine Cloud-Sicherungen gefunden.</p>}
        {cloud.map((item) => <div key={item.id} style={{ marginTop: 12 }}>
          <strong>{item.tournament_name}</strong><p className="muted">{new Date(item.created_at).toLocaleString('de-DE')}</p>
          <div className="actions">
            <button className="btn small primary" disabled={busy || local.some(t => t.id === item.tournament_id)} onClick={() => void run(async () => restore(await loadCloudBackup(item.id)))}>Lokal wiederherstellen</button>
            {local.some(t => t.id === item.tournament_id) && <span className="muted">Bereits lokal vorhanden</span>}
            {removeId === item.id ? <><button className="btn small danger" disabled={busy} onClick={() => void run(async () => { await deleteCloudBackup(item.id); setRemoveId(null); setCloud(await listCloudBackups()); setMessage('Cloud-Sicherung gelöscht.'); })}>Endgültig löschen</button><button className="btn small" disabled={busy} onClick={() => setRemoveId(null)}>Abbrechen</button></>
              : <button className="btn small" disabled={busy} onClick={() => setRemoveId(item.id)}>Sicherung löschen</button>}
          </div>
        </div>)}
      </>}
    </section>
  </div>;
}
