import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Progress {
  name:string; sport:string; status:string; revision:number; updatedAt:string;
  participantCount:number; tables:number; recordedResults:number; occupiedTables:number;
  phases:Array<{name:string|null;type:string;started:boolean;completed:boolean}>;
}
interface MatchDetail {sideA:string;sideB:string;phase:string;round:string;status:string;table:string;score:string;sets:Array<{sideAScore:number;sideBScore:number}>}
interface Details {revision:number;matches:MatchDetail[]|null;total:number|null}
const matchStatuses:Record<string,string>={WAITING:'Wartend',LIVE:'Läuft',READY:'Zugewiesen',CONFIRMATION:'Bestätigung offen',FINISHED:'Beendet',CANCELLED:'Abgebrochen'};
const statuses:Record<string,string>={DRAFT:'Entwurf',REGISTRATION:'Anmeldung',READY:'Bereit',RUNNING:'Läuft',PAUSED:'Pausiert',FINISHED:'Abgeschlossen',ABORTED:'Abgebrochen'};
export function OnlineSpectatorPage({token}:{token:string}) {
  const [data,setData]=useState<Progress|null>(null);
  const [details,setDetails]=useState<Details|null>(null);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [pageIndex,setPageIndex]=useState(0);
  const [message,setMessage]=useState('Turnier wird geladen …');
  useEffect(()=>{
    let active=true, running=false;
    async function refresh() {
      if(running||!active)return;
      if(!supabase||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setDetails(null);setMessage('Zuschauerlink ungültig oder nicht verfügbar.');return;}
      running=true;
      try {
        const [result,detailResult]=await Promise.all([supabase.rpc('read_online_spectator',{p_token:token}).abortSignal(AbortSignal.timeout(8000)),supabase.rpc('read_online_spectator_details',{p_token:token}).abortSignal(AbortSignal.timeout(8000))]);
        if(!active)return;
        if(result.error)throw new Error(result.error.message);
        setData(result.data as Progress|null);
        setDetails(!detailResult.error&&result.data&&detailResult.data?.revision===result.data.revision?detailResult.data as Details:null);
        setMessage(result.data?'':'Dieser Zuschauerlink ist nicht mehr verfügbar.');
      } catch {if(active){setData(null);setDetails(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
      finally{running=false;}
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),15000);
    const focus=()=>void refresh();
    window.addEventListener('focus',focus);window.addEventListener('online',focus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
  },[token]);
  const matches=(details?.matches??[]).filter(m=>(filter==='all'||(filter==='live'?['LIVE','READY','CONFIRMATION'].includes(m.status):m.status===filter))&&[m.sideA,m.sideB,m.phase,m.round].some(v=>v.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))));
  const maxPage=Math.max(0,Math.ceil(matches.length/25)-1);
  const currentPage=Math.min(pageIndex,maxPage);
  return <main className="main online-spectator">
    {!data?<section className="card"><h1>Zuschaueransicht</h1><p role="status">{message}</p></section>:<>
      <header className="dashboard-page-hero"><div><h1>{data.name}</h1><p className="muted">{data.sport} · Zuschaueransicht</p></div><span className="badge">{statuses[data.status]??data.status}</span></header>
      <section className="card"><h2>Turnier auf einen Blick</h2><div className="control-metrics-grid">
        <div><span className="muted">Teilnehmer</span><strong>{data.participantCount}</strong></div>
        <div><span className="muted">Belegte Spielflächen</span><strong>{data.occupiedTables}/{data.tables}</strong></div>
        <div><span className="muted">Erfasste Endergebnisse</span><strong>{data.recordedResults}</strong></div>
        <div><span className="muted">Abgeschlossene Phasen</span><strong>{data.phases.filter(p=>p.completed).length}/{data.phases.length}</strong></div>
      </div></section>
      <section className="card"><h2>Turnierverlauf</h2>{data.phases.map((phase,index)=><div className="online-catalog-row actions" key={index}><strong>{phase.name||'Phase '+(index+1)}</strong><span className="badge">{phase.completed?'Abgeschlossen':phase.started?'Gestartet':'Ausstehend'}</span></div>)}</section>
      {details&&<section className="card"><h2>Spielpaarungen und Ergebnisse</h2>
        {details.matches===null?<p role="status">Die Detailansicht wird für die aktuelle Revision aktualisiert. Bitte die Turnierleitung geöffnet lassen.</p>:<>
          <div className="control-match-filter-fields"><label>Teilnehmer suchen<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPageIndex(0);}} placeholder="Name oder Phase"/></label><label>Status<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPageIndex(0);}}><option value="all">Alle</option><option value="live">Laufend</option><option value="FINISHED">Beendet</option><option value="WAITING">Wartend</option></select></label></div>
          {(details.total??0)>details.matches.length&&<p className="muted">Auszug: {details.matches.length} von {details.total} Partien.</p>}
          {!matches.length&&<p>Keine passenden Spiele.</p>}
          {matches.slice(currentPage*25,(currentPage+1)*25).map((m,i)=><article className="online-catalog-row" key={currentPage*25+i}>
            <div className="actions"><strong>{m.sideA} – {m.sideB}</strong><strong>{m.score}</strong><span className="badge">{matchStatuses[m.status]??m.status}</span></div>
            <p className="muted">{m.phase} · {m.round}{m.table!=='Noch offen'?' · '+m.table:''}{m.sets.length?' · '+m.sets.map(s=>s.sideAScore+':'+s.sideBScore).join(', '):''}</p>
          </article>)}
          {maxPage>0&&<div className="actions"><button className="btn small" disabled={!currentPage} onClick={()=>setPageIndex(currentPage-1)}>Zurück</button><span>Seite {currentPage+1} / {maxPage+1}</span><button className="btn small" disabled={currentPage===maxPage} onClick={()=>setPageIndex(currentPage+1)}>Weiter</button></div>}
        </>}
      </section>}
      <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 15 Sekunden. Nur Lesezugriff.</p>
    </>}
  </main>;
}
