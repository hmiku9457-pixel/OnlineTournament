import { Link } from 'react-router-dom';
import { countActiveMockTournaments, getAllMockTournaments, removeLocalPrototypeTournaments } from '@/services/mockTournamentStore';

function getStatusLabel(status: string) {
  switch (status) {
    case 'REGISTRATION': return 'Anmeldung';
    case 'READY': return 'Bereit';
    case 'RUNNING': return 'Läuft';
    case 'PAUSED': return 'Pausiert';
    default: return status;
  }
}

export function DashboardPage() {
  const tournaments = getAllMockTournaments();
  const activeTournaments = countActiveMockTournaments();
  const runningMatches = tournaments.reduce((sum, item) => sum + item.runningMatches, 0);
  const openConfirmations = tournaments.reduce((sum, item) => sum + item.openConfirmations, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turniere</h1>
          <p className="muted">Lokaler Prototyp ohne Datenbank. Erstelle Testturniere direkt über den Wizard.</p>
        </div>
        <div className="actions">
          {tournaments.length > 0 && (
            <button className="btn" type="button" onClick={() => { removeLocalPrototypeTournaments(); window.location.reload(); }}>
              Lokale Tests zurücksetzen
            </button>
          )}
          <Link className="btn primary" to="/tournaments/new">Neues Turnier</Link>
        </div>
      </header>

      <section className="grid">
        <div className="card span-4"><div className="muted">Aktive Turniere</div><div className="metric">{activeTournaments}</div></div>
        <div className="card span-4"><div className="muted">Laufende Spiele</div><div className="metric">{runningMatches}</div></div>
        <div className="card span-4"><div className="muted">Offene Bestätigungen</div><div className="metric">{openConfirmations}</div></div>

        {tournaments.length === 0 ? (
          <div className="card span-12 empty-dashboard-state">
            <h2>Noch kein Testturnier</h2>
            <p className="muted">Erstelle ein Turnier und nutze in Schritt 2 den neuen 19-Spieler-Testbutton für einen schnellen Durchlauf.</p>
            <Link className="btn primary" to="/tournaments/new">Turnier erstellen</Link>
          </div>
        ) : (
          <div className="card span-12">
            <h2>Lokale Testturniere</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Status</th><th>Disziplin</th><th>Teilnehmer</th><th>Turnierform</th><th></th></tr></thead>
                <tbody>
                  {tournaments.map((tournament) => (
                    <tr key={tournament.id}>
                      <td><strong>{tournament.name}</strong><div className="muted">{tournament.subtitle}</div></td>
                      <td><span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{getStatusLabel(tournament.status)}</span></td>
                      <td>{tournament.discipline === 'DOUBLES' ? 'Doppel' : 'Einzel'}</td>
                      <td>{tournament.participants}</td>
                      <td>{tournament.phasesLabel}</td>
                      <td><Link to={`/tournaments/${tournament.id}/control`}>Öffnen</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
