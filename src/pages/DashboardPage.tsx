import { Link } from 'react-router-dom';

const demoTournaments = [
  { name: 'Vereinsmeisterschaft 2027', status: 'DRAFT', players: 24 },
  { name: 'Herbstcup', status: 'RUNNING', players: 32 },
];

export function DashboardPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turniere</h1>
          <p className="muted">Verwalten, live verfolgen und Ergebnisse erfassen.</p>
        </div>
        <Link className="btn primary" to="/tournaments/new">
          Neues Turnier
        </Link>
      </header>

      <section className="grid">
        <div className="card span-4">
          <div className="muted">Aktive Turniere</div>
          <div className="metric">1</div>
        </div>
        <div className="card span-4">
          <div className="muted">Laufende Spiele</div>
          <div className="metric">6</div>
        </div>
        <div className="card span-4">
          <div className="muted">Offene Bestätigungen</div>
          <div className="metric">3</div>
        </div>

        <div className="card span-12">
          <h2>Zuletzt verwendet</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Status</th><th>Teilnehmer</th><th></th></tr>
              </thead>
              <tbody>
                {demoTournaments.map((tournament, index) => (
                  <tr key={tournament.name}>
                    <td>{tournament.name}</td>
                    <td><span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{tournament.status}</span></td>
                    <td>{tournament.players}</td>
                    <td><Link to={`/tournaments/demo-${index + 1}`}>Öffnen</Link></td>
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
