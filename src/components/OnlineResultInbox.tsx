import { useEffect,useState,useRef,useCallback } from 'react';
import { adoptOnlineResultReports,listOnlineResultReports,matchingReports,reportMatchNamesById,resetOnlineResultReports,type OnlineResultReport } from '@/services/onlineTournaments';
import { onlinePage } from '@/domain/onlineMatchViews';
import { flushPendingLocalTournamentWrites,getTournamentStorageError } from '@/services/localTournamentStorage';
export function OnlineResultInbox({id,disabled,onApplied,onBusyChange}:{id:string;disabled:boolean;onApplied:()=>void;onBusyChange:(busy:boolean)=>void}) {
 const [rows,setRows]=useState<OnlineResultReport[]>([]);
 const [error,setError]=useState('');
 const [loadError,setLoadError]=useState(false);
 const [busy,setBusy]=useState(false);
 const [expanded,setExpanded]=useState(true);
 const [filter,setFilter]=useState('all');
 const [search,setSearch]=useState('');
 const [page,setPage]=useState(0);
 const [loading,setLoading]=useState(false);
 const reading=useRef(false);
 const lock=useRef(false),alive=useRef(false),sequence=useRef(0);
 const [reset,setReset]=useState<OnlineResultReport|null>(null);
 const [batch,setBatch]=useState<OnlineResultReport[]|null>(null);
 const load=useCallback(async()=>{
   if(lock.current||reading.current)return;
   reading.current=true;setLoading(true);
   const request=++sequence.current;
   try{const next=await listOnlineResultReports(id);if(alive.current&&!lock.current&&request===sequence.current){setRows(next.filter(r=>r.aSets||r.bSets));setLoadError(false);}}
   catch{if(alive.current&&request===sequence.current)setLoadError(true);}
   finally{reading.current=false;if(alive.current)setLoading(false);}
 },[id]);
 useEffect(()=>{
  alive.current=true;void load();const timer=window.setInterval(()=>void load(),5000);
  const focus=()=>void load();
  window.addEventListener('focus',focus);window.addEventListener('online',focus);
  return()=>{alive.current=false;sequence.current++;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
 },[load]);
 const ready=rows.filter(matchingReports);
 const conflicts=rows.filter(r=>r.aSets&&r.bSets&&!matchingReports(r));
 const waiting=rows.length-ready.length-conflicts.length;
 const namesById=rows.length?reportMatchNamesById():new Map<string,{a:string;b:string}>();
 const query=search.trim().toLocaleLowerCase('de-DE');
 const visible=rows.filter(r=>{
   const names=namesById.get(r.matchId);
   return (!query||!!names&&[names.a,names.b].some(n=>n.toLocaleLowerCase('de-DE').includes(query)))&&(filter==='all'||(filter==='ready'?matchingReports(r):filter==='conflict'?r.aSets&&r.bSets&&!matchingReports(r):!r.aSets||!r.bSets));
 });
 const current=onlinePage(visible,page,12);
 const readyBatch=ready.slice(0,500);
 async function act(selection:OnlineResultReport[],discard=false){
  if(lock.current||disabled||loadError)return;
  lock.current=true;sequence.current++;setBusy(true);onBusyChange(true);setError('');
  try{
   if(discard)await resetOnlineResultReports(selection[0]);
   else {await adoptOnlineResultReports(selection);await flushPendingLocalTournamentWrites();const failure=getTournamentStorageError();if(failure)throw new Error(failure);onApplied();}
   const ids=new Set(selection.map(r=>r.matchId));
   setRows(old=>old.filter(r=>!ids.has(r.matchId)));setReset(null);setBatch(null);
  }catch(e){setError(e instanceof Error?e.message:'Aktion fehlgeschlagen.');}
  finally{lock.current=false;setBusy(false);onBusyChange(false);void load();}
 }
 if(!rows.length&&!error&&!loadError)return null;
 return <section className="card no-print"><div className="actions"><h2>Spielermeldungen ({rows.length})</h2><button className="btn small" onClick={()=>setExpanded(v=>!v)}>{expanded?'Einklappen':'Aufklappen'}</button><button className="btn small" disabled={busy||loading} onClick={()=>void load()}>{loading?'Aktualisiere …':'Meldungen aktualisieren'}</button></div>
 <div className="actions"><span className="badge ready">{ready.length} übereinstimmend</span><span className="badge">{waiting} unvollständig</span><span className="badge">{conflicts.length} abweichend</span></div>
 {loadError&&<p role="alert">Meldungen konnten nicht aktualisiert werden. Übernahme vorübergehend gesperrt.</p>}
 {expanded&&<><p className="muted">Übereinstimmende Meldungen können gemeinsam als ein bestätigter Datenbankstand übernommen werden.</p>
 <div className="actions"><label>Anzeige<select aria-label="Meldungsstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Alle Meldungen</option><option value="ready">Übereinstimmend</option><option value="waiting">Bestätigung fehlt</option><option value="conflict">Abweichend</option></select></label><label>Teilnehmer suchen<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Name"/></label>{ready.length>1&&<button className="btn primary" disabled={disabled||busy||loadError} onClick={()=>setBatch(readyBatch)}>{ready.length>500?'Erste':'Alle'} {readyBatch.length} übereinstimmenden Ergebnisse übernehmen</button>}</div>
 <p className="muted">{visible.length} passende Meldungen{ready.length>500?' · Sammelübernahme in Blöcken von höchstens 500.':''}</p>
 {!visible.length&&<p>Keine passenden Meldungen.</p>}
 {current.items.map(r=>{const names=namesById.get(r.matchId);if(!names)return <article className="online-catalog-row" key={r.matchId}><p role="status">Begegnung derzeit nicht auflösbar. Bitte Meldungen aktualisieren.</p></article>;return <article className="online-catalog-row" key={r.matchId}><strong>{names.a} – {names.b}</strong><p>{matchingReports(r)?'Beide Seiten stimmen überein':r.aSets&&r.bSets?'Abweichende Meldungen':'Eine Bestätigung fehlt'}</p><p>{names.a}: {r.aSets?.map(s=>s.sideAScore+':'+s.sideBScore).join(' · ')??'–'} · {names.b}: {r.bSets?.map(s=>s.sideAScore+':'+s.sideBScore).join(' · ')??'–'}</p><div className="actions"><button className="btn primary small" disabled={disabled||busy||loadError||!matchingReports(r)} onClick={()=>void act([r])}>Übereinstimmendes Ergebnis übernehmen</button><button className="btn small" disabled={disabled||busy||loadError} onClick={()=>setReset(r)}>Meldungen zurücksetzen</button></div></article>;})}{current.pages>1&&<div className="actions"><button className="btn small" disabled={current.page===0} onClick={()=>setPage(current.page-1)}>Zurück</button><span>Seite {current.page+1}/{current.pages}</span><button className="btn small" disabled={current.page+1===current.pages} onClick={()=>setPage(current.page+1)}>Weiter</button></div>}</>}
 {error&&<p role="alert">{error}</p>}
 {batch&&<div role="dialog" aria-label="Sammelübernahme bestätigen"><p>{batch.length} übereinstimmende Ergebnisse verbindlich übernehmen? Abweichende und unvollständige Meldungen bleiben unberührt.</p><div className="actions"><button className="btn" disabled={busy} onClick={()=>setBatch(null)}>Abbrechen</button><button className="btn primary" disabled={busy||disabled||loadError} onClick={()=>void act(batch)}>Sammelübernahme bestätigen</button></div></div>}
 {reset&&<div role="dialog" aria-label="Spielermeldungen zurücksetzen"><p>Beide Meldungen verwerfen und neue Eingaben erlauben?</p><div className="actions"><button className="btn" disabled={busy} onClick={()=>setReset(null)}>Abbrechen</button><button className="btn danger" disabled={busy||disabled||loadError} onClick={()=>void act([reset],true)}>Zurücksetzen bestätigen</button></div></div>}
 </section>;
}
