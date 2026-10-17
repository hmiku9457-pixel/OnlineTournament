import { Link } from 'react-router-dom';
import { countActiveTournaments, demoTournaments } from '@/data/demoTournaments';

function getStatusLabel(status: string) {
  switch (status) {
    case 'REGISTRATION':
      return 'Anmeldung';
    case 'READY':
      return 'Bereit';
    case 'RUNNING':
      return 'Läuft';
    case 'PAUSED':
      return 'Pausiert';
    default:
      return status;
  }
}

export function DashboardPage() {
  const activeTournaments = countActiveTournaments();
  const runningMatches = demoTournaments.reduce((sum, item) => sum + item.runningMatches, 0);
  const openConfirmations = demoTournaments.reduce((sum, item) => sum + item.openConfirmations, 0);
  const activePool = demoTournaments.filter((item) => ['REGISTRATION', 'READY', 'RUNNING', 'PAUSED'].includes(item.status));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turniere</h1>
          <p className="muted">Großer Testpool mit aktiven Demo-Turnieren zur visuellen Beurteilung der unterschiedlichen Turnierformen.</p>
        </div>
        <div className="actions">
          <Link className="btn" to="/tournaments/vm-2027">
            Demo öffnen
          </Link>
          <Link className="btn primary" to="/tournaments/new">
            Neues Turnier
          </Link>
        </div>
      </header>

      <section className="grid">
        <div className="card span-4">
          <div className="muted">Aktive Testturniere</div>
          <div className="metric">{activeTournaments}</div>
        </div>
        <div className="card span-4">
          <div className="muted">Laufende Spiele</div>
          <div className="metric">{runningMatches}</div>
        </div>
        <div className="card span-4">
          <div className="muted">Offene Bestätigungen</div>
          <div className="metric">{openConfirmations}</div>
        </div>

        <div className="card span-12 demo-pool-note">
          <strong>Hinweis:</strong> Diese Turniere sind absichtlich als Testpool angelegt und können vor dem Go-Live vollständig gelöscht werden.
        </div>

        <div className="span-12">
          <h2>Aktiver Testpool</h2>
        </div>
        {activePool.map((tournament) => (
          <article className="card span-6 tournament-preview-card" key={tournament.id}>
            <div className="tournament-preview-head">
              <div>
                <div className="tournament-preview-title-row">
                  <h3>{tournament.name}</h3>
                  <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{getStatusLabel(tournament.status)}</span>
                </div>
                <p className="muted">{tournament.subtitle}</p>
              </div>
              <Link className="btn small" to={`/tournaments/${tournament.id}`}>
                Öffnen
              </Link>
            </div>

            <div className="tournament-preview-meta">
              <div><span className="muted">Teilnehmer</span><strong>{tournament.participants}</strong></div>
              <div><span className="muted">Tische</span><strong>{tournament.tables}</strong></div>
              <div><span className="muted">Turnierform</span><strong>{tournament.phasesLabel}</strong></div>
              <div><span className="muted">Dauer</span><strong>{tournament.estimatedDuration}</strong></div>
            </div>

            <div className="tournament-preview-foot">
              <span className="muted">Letztes Update: {tournament.lastUpdate}</span>
              <span className="muted">Live: {tournament.runningMatches} Spiele · {tournament.openConfirmations} offen</span>
            </div>
          </article>
        ))}

        <div className="card span-12">
          <h2>Alle Testturniere</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Disziplin</th>
                  <th>Teilnehmer</th>
                  <th>Turnierform</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {demoTournaments.map((tournament) => (
                  <tr key={tournament.id}>
                    <td>
                      <strong>{tournament.name}</strong>
                      <div className="muted">{tournament.subtitle}</div>
                    </td>
                    <td>
                      <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>
                        {getStatusLabel(tournament.status)}
                      </span>
                    </td>
                    <td>{tournament.discipline === 'DOUBLES' ? 'Doppel' : 'Einzel'}</td>
                    <td>{tournament.participants}</td>
                    <td>{tournament.phasesLabel}</td>
                    <td>
                      <Link to={`/tournaments/${tournament.id}`}>Öffnen</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
