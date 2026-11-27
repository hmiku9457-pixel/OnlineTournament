import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Progress {
  name:string; sport:string; status:string; revision:number; updatedAt:string;
  participantCount:number; tables:number; recordedResults:number; occupiedTables:number;
  phases:Array<{name:string|null;type:string;started:boolean;completed:boolean}>;
}
const statuses:Record<string,string>={DRAFT:'Entwurf',REGISTRATION:'Anmeldung',READY:'Bereit',RUNNING:'Läuft',PAUSED:'Pausiert',FINISHED:'Abgeschlossen',ABORTED:'Abgebrochen'};
export function OnlineSpectatorPage({token}:{token:string}) {
  const [data,setData]=useState<Progress|null>(null);
  const [message,setMessage]=useState('Turnier wird geladen …');
  useEffect(()=>{
    let active=true, running=false;
    async function refresh() {
      if(running||!active)return;
      if(!supabase||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setMessage('Zuschauerlink ungültig oder nicht verfügbar.');return;}
      running=true;
      try {
        const result=await supabase.rpc('read_online_spectator',{p_token:token}).abortSignal(AbortSignal.timeout(8000));
        if(!active)return;
        if(result.error)throw new Error(result.error.message);
        setData(result.data as Progress|null);
        setMessage(result.data?'':'Dieser Zuschauerlink ist nicht mehr verfügbar.');
      } catch {if(active){setData(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
      finally{running=false;}
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),15000);
    const focus=()=>void refresh();
    window.addEventListener('focus',focus);window.addEventListener('online',focus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
  },[token]);
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
      <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 15 Sekunden. Nur Lesezugriff.</p>
    </>}
  </main>;
}
