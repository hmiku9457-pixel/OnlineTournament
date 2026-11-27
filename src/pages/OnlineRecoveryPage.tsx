import { useState } from 'react';
import { useAccount } from '@/lib/useAccount';
import { localOverviewUrl, resolvePendingOnlineOperation } from '@/services/onlineTournaments';
import type { PendingOnlineOperation } from '@/services/onlineOutbox';

export function OnlineRecoveryPage({ operations }: { operations: PendingOnlineOperation[] }) {
  const { session, loading } = useAccount();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [confirm,setConfirm] = useState<string|null>(null);
  async function resolve(op: PendingOnlineOperation, discard: boolean) {
    if(busy) return;
    setBusy(true); setMessage('');
    try { await resolvePendingOnlineOperation(op,discard); if(discard && op.expectedRevision===0) window.location.assign(localOverviewUrl()); else window.location.reload(); }
    catch(error) { setMessage(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <main className="main"><section className="card">
    <h1>Unbestätigte Online-Speicherung</h1>
    <p>Vor einer weiteren Bearbeitung muss die frühere Speicheranfrage geklärt werden. Sie wurde vor der Übertragung dauerhaft in diesem Browser hinterlegt.</p>
    {loading ? <p>Konto wird geprüft …</p> : session?.user.id !== operations[0]?.ownerId ? <p role="alert">Bitte mit dem ursprünglichen Konto anmelden.</p> : operations.map((op,index) => <div className="card" key={op.operationId}>
      <strong>{op.expectedRevision===0 ? 'Unbestätigte Turniererstellung' : 'Änderung nach Revision '+op.expectedRevision}</strong>
      <p>{new Date(op.createdAt).toLocaleString('de-DE')}</p>
      <div className="actions">
        <button className="btn primary" disabled={busy || index!==0} onClick={()=>void resolve(op,false)}>Ursprüngliche Anfrage erneut senden</button>
        <button className="btn" disabled={busy} onClick={()=>{
          const url=URL.createObjectURL(new Blob([JSON.stringify(op.snapshot,null,2)],{type:'application/json'}));
          const a=document.createElement('a');a.href=url;a.download='unbestaetigt-'+op.tournamentId+'.json';a.click();
          setTimeout(()=>URL.revokeObjectURL(url),1000);
        }}>JSON sichern</button>
        {confirm===op.operationId ? <><button className="btn danger" disabled={busy} onClick={()=>void resolve(op,true)}>Unbestätigten Eintrag verwerfen</button><button className="btn" disabled={busy} onClick={()=>setConfirm(null)}>Abbrechen</button></> : <button className="btn" disabled={busy} onClick={()=>setConfirm(op.operationId)}>Verwerfen …</button>}
      </div>
    </div>)}
    {message && <p role="alert">{message} Bei einem Revisionskonflikt wird nichts überschrieben. Sichere bei Bedarf die JSON-Datei und verwirf den Eintrag erst nach Prüfung.</p>}
    <a className="btn" href={localOverviewUrl()}>Zur Online-Übersicht</a>
  </section></main>;
}
