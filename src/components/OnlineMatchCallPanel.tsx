import { useEffect,useRef,useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listOnlineMatchCalls,recallOnlineMatchCall } from '@/services/onlineTournaments';
import { callAgeMinutes,callLabel,type DirectorMatchCall } from '@/domain/onlineMatchCalls';
import { startOnlinePolling } from '@/domain/onlinePolling';
import { displayVenueName } from '@/domain/venueTerminology';
import { getAllMockTournaments } from '@/services/mockTournamentStore';

export function OnlineMatchCallPanel({id,disabled,onBusyChange}:{id:string;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const [rows,setRows]=useState<DirectorMatchCall[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [open,setOpen]=useState(false);
 const [epoch,setEpoch]=useState(0);
 const [now,setNow]=useState(Date.now());
 const lock=useRef(false);
 const path=useLocation();
 const sport=getAllMockTournaments().find(t=>t.id===id)?.sport??'';
 useEffect(()=>{
  let alive=true;
  const poll=startOnlinePolling(async()=>{
   if(lock.current)return;
   try{const result=await listOnlineMatchCalls(id);if(alive&&!lock.current){setRows(result);setError('');setNow(Date.now());}}
   catch{if(alive&&!lock.current){setRows([]);setError('Spielaufrufe konnten nicht aktualisiert werden.');}}
  },()=>document.visibilityState==='visible'?5000:30000,10000);
  return()=>{alive=false;poll.stop();};
 },[id,epoch]);
 async function recall(row:DirectorMatchCall){
  if(disabled||lock.current||error)return;
  lock.current=true;setBusy(true);onBusyChange(true);
  try{await recallOnlineMatchCall(row);setRows(old=>old.filter(r=>r.callId!==row.callId));setEpoch(v=>v+1);}
  catch(e){setError(e instanceof Error?e.message:'Erneuter Aufruf fehlgeschlagen.');}
  finally{lock.current=false;setBusy(false);onBusyChange(false);}
 }
 if(!path.pathname.endsWith('/control')||(!rows.length&&!error))return null;
 const outstanding=rows.filter(r=>!r.ackA||!r.ackB).length;
 return <section className="card no-print" aria-label="Spielaufrufe der Turnierleitung"><div className="actions"><h2>Spielaufrufe ({rows.length})</h2><span className="badge">{outstanding} offen</span><button className="btn small" onClick={()=>setOpen(v=>!v)}>{open?'Aufrufe einklappen':'Aufrufe anzeigen'}</button></div>
 {error&&<p role="alert">{error}</p>}
 {open&&<><p className="muted">Bestätigung bedeutet, dass der persönliche Link geöffnet und der Aufruf bestätigt wurde, nicht dass jemand physisch am Platz angekommen ist. Aufrufe gelten für zugewiesene, noch nicht gewertete Spiele.</p>
 {rows.map(row=><article className="online-catalog-row" key={row.callId}><div className="actions"><strong>{displayVenueName(sport,row.table)}</strong><span className="muted">Aufruf: {callLabel(callAgeMinutes(row.calledAt,now))}</span></div>
 <p>{row.sideA}: <strong>{row.ackA?'Bestätigt':'Offen'}</strong> · {row.sideB}: <strong>{row.ackB?'Bestätigt':'Offen'}</strong></p>
 <button className="btn small" disabled={disabled||busy||!!error} onClick={()=>void recall(row)}>Erneut aufrufen</button></article>)}</>}
 </section>;
}
