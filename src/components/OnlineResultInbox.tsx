import { useEffect,useState,useRef } from 'react';
import { adoptOnlineResultReport,listOnlineResultReports,matchingReports,reportMatchNames,resetOnlineResultReports,type OnlineResultReport } from '@/services/onlineTournaments';
import { flushPendingLocalTournamentWrites,getTournamentStorageError } from '@/services/localTournamentStorage';
export function OnlineResultInbox({id,disabled,onApplied}:{id:string;disabled:boolean;onApplied:()=>void}) {
 const [rows,setRows]=useState<OnlineResultReport[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 const [reset,setReset]=useState<OnlineResultReport|null>(null);
 useEffect(()=>{
  let alive=true;
  async function load(){if(lock.current)return;try{const next=await listOnlineResultReports(id);if(alive&&!lock.current)setRows(next.filter(r=>r.aSets||r.bSets));}catch{if(alive)setRows([]);}}
  void load();const timer=window.setInterval(()=>void load(),10000);
  return()=>{alive=false;window.clearInterval(timer);};
 },[id]);
 async function act(row:OnlineResultReport,discard:boolean){
  if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');
  try{
   if(discard)await resetOnlineResultReports(row);
   else {await adoptOnlineResultReport(row);await flushPendingLocalTournamentWrites();if(getTournamentStorageError())throw new Error(getTournamentStorageError());onApplied();}
   setRows(old=>old.filter(r=>r.matchId!==row.matchId));setReset(null);
  }catch(e){setError(e instanceof Error?e.message:'Aktion fehlgeschlagen.');}
  finally{lock.current=false;setBusy(false);}
 }
 if(!rows.length&&!error)return null;
 return <section className="card no-print"><h2>Spielermeldungen ({rows.length})</h2><p className="muted">Nur übereinstimmende Meldungen können übernommen werden. Die reguläre Ergebniseingabe bleibt für Sonderfälle verfügbar.</p>
 {rows.map(r=>{const names=reportMatchNames(r);if(!names)return null;return <article className="online-catalog-row" key={r.matchId}><strong>{names.a} – {names.b}</strong><p>{matchingReports(r)?'Beide Seiten stimmen überein':r.aSets&&r.bSets?'Abweichende Meldungen':'Eine Bestätigung fehlt'}</p><p>{names.a}: {r.aSets?.map(s=>s.sideAScore+':'+s.sideBScore).join(' · ')??'–'} · {names.b}: {r.bSets?.map(s=>s.sideAScore+':'+s.sideBScore).join(' · ')??'–'}</p><div className="actions"><button className="btn primary small" disabled={disabled||busy||!matchingReports(r)} onClick={()=>void act(r,false)}>Übereinstimmendes Ergebnis übernehmen</button><button className="btn small" disabled={disabled||busy} onClick={()=>setReset(r)}>Meldungen zurücksetzen</button></div></article>;})}
 {error&&<p role="alert">{error}</p>}
 {reset&&<div role="dialog" aria-label="Spielermeldungen zurücksetzen"><p>Beide Meldungen verwerfen und neue Eingaben erlauben?</p><div className="actions"><button className="btn" disabled={busy} onClick={()=>setReset(null)}>Abbrechen</button><button className="btn danger" disabled={busy||disabled} onClick={()=>void act(reset,true)}>Zurücksetzen bestätigen</button></div></div>}
 </section>;
}
