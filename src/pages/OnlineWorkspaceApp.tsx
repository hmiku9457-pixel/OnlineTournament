import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { TournamentControlPage } from '@/pages/TournamentControlPage';
import { ScoringPage } from '@/pages/ScoringPage';
import { getTournamentStorageError, hasPendingRemoteWrites, getRemoteRecovery, retryRemoteTournamentWrite } from '@/services/localTournamentStorage';
import { localOverviewUrl, checkOnlineWorkspaceRevision, releaseCurrentOnlineWorkspace } from '@/services/onlineTournaments';

function OnlineControl({ id }: { id: string }) {
  const params = useParams();
  return params.tournamentId === id ? <TournamentControlPage key={id} /> : <Navigate to={'/tournaments/' + id + '/control'} replace />;
}
export function OnlineWorkspaceApp({ id }: { id: string }) {
  const [, refresh] = useState(0);
  const [connected, setConnected] = useState(navigator.onLine);
  const [revisionState,setRevisionState] = useState<'current'|'stale'|'unknown'>('current');
  const [checking,setChecking] = useState(false);
  const [leaving,setLeaving] = useState(false);
  
  const inFlight=useRef(false);
  const active=useRef(true);
  const checkRevision=useCallback(async ()=>{
    if(inFlight.current || !navigator.onLine || hasPendingRemoteWrites() || getTournamentStorageError()) return;
    inFlight.current=true; setChecking(true);
    try {
      const result=await checkOnlineWorkspaceRevision(id);
      if(active.current) setRevisionState(previous=>previous==='stale'?'stale':result);
    } catch { if(active.current) setRevisionState(previous=>previous==='stale'?'stale':'unknown'); }
    finally { inFlight.current=false; if(active.current) setChecking(false); }
  },[id]);
  useEffect(()=>{
    active.current=true;
    const checkVisible=()=>{if(document.visibilityState==='visible') void checkRevision();};
    const timer=window.setInterval(()=>void checkRevision(),20000);
    window.addEventListener('focus',checkVisible);
    window.addEventListener('online',checkVisible);
    document.addEventListener('visibilitychange',checkVisible);
    return ()=>{active.current=false;window.clearInterval(timer);window.removeEventListener('focus',checkVisible);window.removeEventListener('online',checkVisible);document.removeEventListener('visibilitychange',checkVisible);};
  },[checkRevision]);
  useEffect(() => {
    const changed = () => refresh((n) => n + 1);
    window.addEventListener('tournament-storage-integrity-change', changed);
    const connectionChanged = () => setConnected(navigator.onLine);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    changed();
    return () => { window.removeEventListener('tournament-storage-integrity-change', changed); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); };
  }, []);
  const pending = hasPendingRemoteWrites();
  const error = getTournamentStorageError();
  const recovery = getRemoteRecovery();
  const route = '/tournaments/' + id + '/control';
  async function leave(reload=false) {
    if(pending || leaving) return;
    setLeaving(true);
    try { await releaseCurrentOnlineWorkspace(); }
    catch { /* The lease expires automatically if release could not be confirmed. */ }
    finally { if(reload) window.location.reload(); else window.location.assign(localOverviewUrl()); }
  }
  return <main className="main">
    <section className="card no-print" style={{ marginBottom: 12 }}>
      <div className="actions">
        <strong>Online-Testbetrieb</strong>
        <span role="status">{pending ? 'Wird in Supabase gespeichert …' : error ? 'Speicherung nicht bestätigt' : !connected ? 'Offline – Bearbeitung gesperrt' : revisionState==='stale' ? 'Bearbeitungssperre verloren oder neuer Datenbankstand' : revisionState==='unknown' ? 'Aktualität nicht geprüft' : 'Datenbankstand bestätigt'}</span>
        <button className="btn small" disabled={pending || checking || !connected || !!error || revisionState==='stale'} onClick={()=>void checkRevision()}>{checking?'Prüfe …':'Datenbankstand prüfen'}</button>
        <button className="btn small" disabled={pending || leaving || !connected} onClick={()=>void leave(true)}>Arbeitsbereich neu laden</button>
        <button className="btn small" disabled={pending || leaving} onClick={()=>void leave()}>Bearbeitung freigeben und zurück</button>
      </div>
      {!connected && <p role="alert">Keine Internetverbindung. Bereits laufende Partien können am Tisch beendet werden. Neue Änderungen werden erst nach Wiederverbindung zugelassen.</p>}
      {revisionState==='stale' && !error && <div role="alert"><p>Die Bearbeitungssperre ist abgelaufen oder ein neuerer Datenbankstand vorhanden. Bitte lade das Turnier neu.</p><button className="btn primary small" disabled={pending || !connected} onClick={()=>void leave(true)}>Datenbankstand neu laden</button></div>}
      {revisionState==='unknown' && !error && connected && <p className="muted">Die Aktualität konnte nicht geprüft werden. Der nächste Schreibvorgang wird weiterhin durch die Datenbankrevision abgesichert.</p>}
      {error && <div role="alert"><p>{error}</p><div className="actions">
        {recovery?.retryable && <button className="btn primary small" disabled={!connected || pending} onClick={() => void retryRemoteTournamentWrite().catch(() => {})}>Speicherung erneut versuchen</button>}
        {recovery && <button className="btn small" disabled={pending} onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(recovery.snapshot, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a'); a.href = url; a.download = 'unbestaetigter-turnierstand-' + id + '.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Unbestätigten Stand als JSON sichern</button>}
        <button className="btn small" disabled={pending || !connected} onClick={() => void leave(true)}>Datenbankstand neu laden</button>
      </div>{recovery && <p className="muted">Die ursprüngliche übertragene Anfrage wird in diesem Browser journalisiert. Wenn weitere Änderungen hinzugekommen sind, enthält der JSON-Export auch den aktuellsten unbestätigten Stand. Sichere diese Datei vor dem Neuladen. Die JSON-Datei ist keine bestätigte Cloud-Version und darf nicht blind überschrieben werden.</p>}</div>}
      <p className="muted">Nur für Entwicklungstests. Spieler- und Zuschauerzugriffe sind in der Online-Übersicht separat freizugeben.</p>
    </section>
    {!error && <div inert={pending || leaving || !connected || revisionState==='stale'} aria-busy={pending}>
      {revisionState!=='stale' && <Routes>
        <Route path="/tournaments/:tournamentId/control" element={<OnlineControl id={id} />} />
        <Route path="/score/:matchId" element={<ScoringPage />} />
        <Route path="*" element={<Navigate to={route} replace />} />
      </Routes>}
    </div>}
  </main>;
}
