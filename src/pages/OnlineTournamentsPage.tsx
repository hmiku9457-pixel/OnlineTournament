import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '@/lib/useAccount';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { createOnlineTournamentFromLocal, listOnlineTournaments, onlineWorkspaceUrl, type OnlineTournamentSummary } from '@/services/onlineTournaments';

export function OnlineTournamentsPage() {
  const { session, loading } = useAccount();
  const userId = session?.user.id;
  const [items, setItems] = useState<OnlineTournamentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const local = getAllMockTournaments().filter((t) => !t.hasStarted && ['DRAFT','REGISTRATION','READY'].includes(t.status));
  useEffect(() => {
    let active = true;
    setItems([]); setMessage('');
    if (userId) listOnlineTournaments().then((rows) => { if (active) setItems(rows); })
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
    finally { setBusy(false); }
  }
  return <div className="tournament-dashboard">
    <header className="dashboard-page-hero"><div><h1>Online-Turniere</h1><p className="muted">Experimenteller Entwicklungsmodus – noch nicht für echte Veranstaltungen freigegeben.</p></div><Link className="btn" to="/">Lokale Turniere</Link></header>
    {message && <p className="callout" role="status">{message}</p>}
    {loading ? <p>Konto wird geladen …</p> : !userId ? <div className="card"><p>Bitte melde dich an, um Online-Turniere anzulegen.</p><Link className="btn primary" to="/login">Anmelden</Link></div> : <>
      <section className="card"><h2>Meine Online-Testturniere</h2>
        <p className="muted">Online-Turniere werden unabhängig vom lokalen Browserspeicher in Supabase gespeichert. Gleichzeitige Bearbeitung wird über Datenbankrevisionen erkannt.</p>
        <button className="btn small" disabled={busy} onClick={() => {
          setBusy(true); void listOnlineTournaments().then(setItems).catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Laden fehlgeschlagen.')).finally(() => setBusy(false));
        }}>Aktualisieren</button>
        {!items.length && <p>Keine Online-Turniere vorhanden.</p>}
        {items.map((item) => <div key={item.id} className="actions" style={{ marginTop: 12 }}>
          <strong>{item.name}</strong><span className="muted">Revision {item.revision}</span>
          <a className="btn primary" href={onlineWorkspaceUrl(item.id)}>Online-Turnierleitung öffnen</a>
        </div>)}
      </section>
      <section className="card"><h2>Online-Testturnier vorbereiten</h2>
        <p className="muted">Erstelle ein neues Online-Turnier direkt im Assistenten oder übernimm ein vorhandenes, ungestartetes lokales Turnier als unabhängige Kopie.</p>
        <Link className="btn primary" to="/tournaments/new?mode=online">Neues Online-Turnier erstellen</Link>
        {local.map((t) => <div key={t.id} className="actions" style={{ marginTop: 12 }}><strong>{t.name}</strong>
          <button className="btn small primary" disabled={busy || items.some((i) => i.id === t.id)} onClick={() => void copy(t.id)}>Als Online-Testturnier anlegen</button>
        </div>)}
      </section>
    </>}
  </div>;
}
