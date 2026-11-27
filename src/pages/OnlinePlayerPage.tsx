import { useEffect,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { displayVenueMessage } from '@/domain/venueTerminology';
interface Match {sideA:string;sideB:string;phase:string;round:string;status:string;table:string;score:string;sets:Array<{sideAScore:number;sideBScore:number}>}
interface PlayerView {name:string;participant:string;sport:string;status:string;revision:number;updatedAt:string;complete:boolean|null;matches:Match[]|null}
const active=(status:string)=>['LIVE','READY','CONFIRMATION'].includes(status);
const statuses:Record<string,string>={WAITING:'Wartend',LIVE:'Läuft',READY:'Zugewiesen',CONFIRMATION:'Bestätigung offen',FINISHED:'Beendet',CANCELLED:'Abgebrochen'};
export function OnlinePlayerPage({token}:{token:string}) {
 const [data,setData]=useState<PlayerView|null>(null);
 const [message,setMessage]=useState('Persönliche Spielübersicht wird geladen …');
 const [filter,setFilter]=useState('all');
 const [page,setPage]=useState(0);
 useEffect(()=>{
  let alive=true,running=false;
  async function refresh(){
   if(!alive||running)return;
   if(!supabase||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setMessage('Spielerlink ungültig.');return;}
   running=true;
   try{
    const result=await supabase.rpc('read_online_player_access',{p_token:token}).abortSignal(AbortSignal.timeout(8000));
    if(!alive)return;
    if(result.error)throw new Error(result.error.message);
    setData(result.data as PlayerView|null);setMessage(result.data?'':'Dieser Spielerlink ist nicht mehr verfügbar.');
   }catch{if(alive){setData(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
   finally{running=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),15000);
  const focus=()=>void refresh();
  window.addEventListener('focus',focus);window.addEventListener('online',focus);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
 },[token]);
 const rows=(data?.matches??[]).filter(m=>filter==='all'||(filter==='active'?active(m.status):m.status===filter));
 const lastPage=Math.max(0,Math.ceil(rows.length/25)-1),currentPage=Math.min(lastPage,page);
 return <main className="main online-spectator">
 {!data?<section className="card"><h1>Persönliche Spielübersicht</h1><p role="status">{message}</p></section>:<>
 <header className="dashboard-page-hero"><div><h1>{data.participant}</h1><p>{data.name} · {data.sport}</p></div><span className="badge">Spieleransicht · Nur Lesen</span></header>
 <section className="card"><h2>Meine Spiele</h2>
 {data.matches===null?<p role="status">Die Spielübersicht wird für die aktuelle Revision aktualisiert. Bitte warte auf die Turnierleitung.</p>:<>
 <div className="control-metrics-grid"><div><span>Laufend / zugewiesen</span><strong>{data.matches.filter(m=>active(m.status)).length}</strong></div><div><span>Wartend</span><strong>{data.matches.filter(m=>m.status==='WAITING').length}</strong></div><div><span>Beendet</span><strong>{data.matches.filter(m=>m.status==='FINISHED').length}</strong></div></div>
 {data.complete===false&&<p role="status">Die Übersicht enthält einen begrenzten Auszug des Spielplans.</p>}
 <label>Spielstatus<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Alle Spiele</option><option value="active">Laufend / zugewiesen</option><option value="WAITING">Wartend</option><option value="FINISHED">Beendet</option></select></label>
 {!rows.length&&<p>Keine passenden Begegnungen vorhanden.</p>}
 {rows.slice(currentPage*25,(currentPage+1)*25).map((m,i)=>{
  const sideA=m.sideA===data.participant;
  const score=sideA?m.score:m.score.replace(/^(\d+)\s*:\s*(\d+)$/,'$2:$1');
  return <article className="online-catalog-row" key={i}><div className="actions"><strong>gegen {sideA?m.sideB:m.sideA}</strong><strong>{score}</strong><span className="badge">{statuses[m.status]??m.status}</span></div>
  <p>{m.phase} · {m.round} · {displayVenueMessage(data.sport,m.table)}</p>
  {m.sets.length>0&&<p className="muted">{m.sets.map(s=>sideA?s.sideAScore+':'+s.sideBScore:s.sideBScore+':'+s.sideAScore).join(', ')}</p>}</article>;
 })}
 {lastPage>0&&<div className="actions"><button className="btn" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Zurück</button><span>Seite {currentPage+1}/{lastPage+1}</span><button className="btn" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Weiter</button></div>}
 </>}
 </section>
 <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 15 Sekunden. Gib diesen persönlichen Link nicht weiter.</p>
 </>}
 </main>;
}
