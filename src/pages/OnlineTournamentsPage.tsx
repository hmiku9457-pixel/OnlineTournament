import type { PendingOnlineOperation } from '@/services/onlineOutbox';
import { backupTournamentName } from '@/services/localTournamentStorage';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '@/lib/useAccount';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { createOnlineTournamentFromLocal, listPendingOnlineCreations, listOnlineTournaments, onlineWorkspaceUrl, listOnlineCheckpoints, loadOnlineCheckpoint, type OnlineCheckpoint, type OnlineTournamentSummary } from '@/services/onlineTournaments';

export function OnlineTournamentsPage() {
  const { session, loading } = useAccount();
  const userId = session?.user.id;
  const [items, setItems] = useState<OnlineTournamentSummary[]>([]);
  const [pendingCreations,setPendingCreations] = useState<PendingOnlineOperation[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; rows: OnlineCheckpoint[] } | null>(null);
  const [message, setMessage] = useState('');
  const local = getAllMockTournaments().filter((t) => !t.hasStarted && ['DRAFT','REGISTRATION','READY'].includes(t.status));
  useEffect(() => {
    let active = true;
    setItems([]); setMessage(''); setHistory(null); setPendingCreations([]);
    if (userId) Promise.all([listOnlineTournaments(),listPendingOnlineCreations()]).then(([rows,pending]) => { if (active) {setItems(rows);setPendingCreations(pending);} })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Laden fehlgeschlagen.'); });
    return () => { active = false; };
  }, [userId]);
  async function copy(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await createOnlineTournamentFromLocal(id);
      setItems(await listOnlineTournaments());
      setMessage('Online-Testturnier angelegt. Lokale und Online-Version sind jetzt voneinander unabhängig.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Anlegen fehlgeschlagen.'); }
    finally { setBusy(false); void listPendingOnlineCreations().then(setPendingCreations).catch(()=>{}); }
  }
  return <div className="tournament-dashboard">
    <header className="dashboard-page-hero"><div><h1>Online-Turniere</h1><p className="muted">Experimenteller Entwicklungsmodus – noch nicht für echte Veranstaltungen freigegeben.</p></div><Link className="btn" to="/">Lokale Turniere</Link></header>
    {message && <p className="callout" role="status">{message}</p>}
    {loading ? <p>Konto wird geladen …</p> : !userId ? <div className="card"><p>Bitte melde dich an, um Online-Turniere anzulegen.</p><Link className="btn primary" to="/login">Anmelden</Link></div> : <>
      {pendingCreations.length>0 && <section className="card"><h2>Unbestätigte Turniererstellungen</h2><p>Bitte kläre diese Anfragen vor einer weiteren Online-Erstellung.</p>{pendingCreations.map(op=><div className="actions" key={op.operationId}><strong>{backupTournamentName(op.snapshot)}</strong><a className="btn primary" href={onlineWorkspaceUrl(op.tournamentId)}>Erstellung wiederherstellen</a></div>)}</section>}
      <section className="card"><h2>Meine Online-Testturniere</h2>
        <p className="muted">Online-Turniere werden unabhängig vom lokalen Browserspeicher in Supabase gespeichert. Gleichzeitige Bearbeitung wird über Datenbankrevisionen erkannt.</p>
        <button className="btn small" disabled={busy} onClick={() => {
          setBusy(true); void Promise.all([listOnlineTournaments(),listPendingOnlineCreations()]).then(([rows,pending])=>{setItems(rows);setPendingCreations(pending);}).catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Laden fehlgeschlagen.')).finally(() => setBusy(false));
        }}>Aktualisieren</button>
        {!items.length && <p>Keine Online-Turniere vorhanden.</p>}
        {items.map((item) => <div key={item.id} className="actions" style={{ marginTop: 12 }}>
          <strong>{item.name}</strong><span className="muted">Revision {item.revision}</span>
          <a className="btn primary" href={onlineWorkspaceUrl(item.id)}>Online-Turnierleitung öffnen</a>
          <button className="btn small" disabled={busy} onClick={() => { setBusy(true); void listOnlineCheckpoints(item.id).then(rows=>setHistory({id:item.id,rows})).catch((e: unknown)=>setMessage(e instanceof Error?e.message:'Laden fehlgeschlagen.')).finally(()=>setBusy(false)); }}>Wiederherstellungspunkte</button>
        </div>)}
        {history && <div className="card" style={{marginTop:12}}><div className="actions"><h3>Wiederherstellungspunkte</h3><button className="btn small" onClick={()=>setHistory(null)}>Schließen</button></div>
          <p className="muted">Bis zu 20 letzte Revisionen (maximal 16 MiB je Turnier). Der aktive Datenbankstand wird nicht überschrieben. JSON kann separat lokal wiederhergestellt werden.</p>
          {history.rows.map(row=><div className="actions" key={row.revision}><strong>Revision {row.revision}</strong><span>{new Date(row.created_at).toLocaleString('de-DE')}</span>
            <button className="btn small" disabled={busy} onClick={()=>{setBusy(true);void loadOnlineCheckpoint(history.id,row.revision).then(backup=>{
              const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
              const a=document.createElement('a');a.href=url;a.download='turnier-'+history.id+'-r'+row.revision+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
            }).catch((e:unknown)=>setMessage(e instanceof Error?e.message:'Download fehlgeschlagen.')).finally(()=>setBusy(false));}}>JSON herunterladen</button>
          </div>)}
        </div>}
      </section>
      <section className="card"><h2>Online-Testturnier vorbereiten</h2>
        <p className="muted">Erstelle ein neues Online-Turnier direkt im Assistenten oder übernimm ein vorhandenes, ungestartetes lokales Turnier als unabhängige Kopie.</p>
        <Link className="btn primary" to="/tournaments/new?mode=online">Neues Online-Turnier erstellen</Link>
        {local.map((t) => <div key={t.id} className="actions" style={{ marginTop: 12 }}><strong>{t.name}</strong>
          <button className="btn small primary" disabled={busy || pendingCreations.length>0 || items.some((i) => i.id === t.id)} onClick={() => void copy(t.id)}>Als Online-Testturnier anlegen</button>
        </div>)}
      </section>
    </>}
  </div>;
}
