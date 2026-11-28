import { useState } from 'react';
import { useAccount } from '@/lib/useAccount';
import { localOverviewUrl, resolvePendingOnlineOperation, inspectPendingOnlineOperation, type OnlineOperationReceipt } from '@/services/onlineTournaments';
import type { PendingOnlineOperation } from '@/services/onlineOutbox';

export function OnlineRecoveryPage({ operations }: { operations: PendingOnlineOperation[] }) {
  const { session, loading } = useAccount();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [confirm,setConfirm] = useState<string|null>(null);
  const [receipts,setReceipts]=useState<Record<string,OnlineOperationReceipt>>({});
  async function inspect(op:PendingOnlineOperation){
    setBusy(true);setMessage('');
    try{const result=await inspectPendingOnlineOperation(op);setReceipts(old=>({...old,[op.operationId]:result}));}
    catch(e){setMessage(e instanceof Error?e.message:'Speicherstatus nicht prüfbar.');}
    finally{setBusy(false);}
  }
  async function resolve(op: PendingOnlineOperation, discard: boolean) {
    if(busy) return;
    setBusy(true); setMessage('');
    try { await resolvePendingOnlineOperation(op,discard); if(discard && op.expectedRevision===0) window.location.assign(localOverviewUrl()); else window.location.reload(); }
    catch(error) { setMessage(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <main className="main"><section className="card">
    <h1>Unbestätigte Online-Speicherung</h1>
    <p>Vor einer weiteren Bearbeitung muss die frühere Speicheranfrage geklärt werden. Sie wurde vor der Übertragung dauerhaft in diesem Browser hinterlegt. Solange ein anderer Arbeitsbereich die Bearbeitungssperre hält, können Änderungen weder erneut gesendet noch verworfen werden.</p>
    {loading ? <p>Konto wird geprüft …</p> : session?.user.id !== operations[0]?.ownerId ? <p role="alert">Bitte mit dem ursprünglichen Konto anmelden.</p> : operations.map((op,index) => <div className="card" key={op.operationId}>
      <strong>{op.expectedRevision===0 ? 'Unbestätigte Turniererstellung' : 'Änderung nach Revision '+op.expectedRevision}</strong>
      <p>{new Date(op.createdAt).toLocaleString('de-DE')}</p>
      {receipts[op.operationId]&&<p role="status">{receipts[op.operationId].state==='confirmed'?'Bereits gespeichert: Revision '+receipts[op.operationId].committedRevision:receipts[op.operationId].state==='conflict'?'Revisionskonflikt – nicht überschreiben.':receipts[op.operationId].state==='unconfirmed'?'Keine Speicherbestätigung gefunden.':'Keine eindeutige Zuordnung gefunden.'}{receipts[op.operationId].currentRevision!==null?' · Aktueller Stand: Revision '+receipts[op.operationId].currentRevision:''}</p>}
      <div className="actions">
        <button className="btn" disabled={busy} onClick={()=>void inspect(op)}>Speicherstatus prüfen</button>
        <button className="btn primary" disabled={busy || index!==0 || receipts[op.operationId]?.state==='conflict'} onClick={()=>void resolve(op,false)}>{receipts[op.operationId]?.state==='confirmed'?'Bestätigung übernehmen':'Ursprüngliche Anfrage erneut senden'}</button>
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
