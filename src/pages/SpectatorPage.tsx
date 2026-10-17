import { useParams } from 'react-router-dom';

export function SpectatorPage() {
  const { tournamentId } = useParams();
  const matches = [
    ['Tisch 1', 'Müller', 'Schmidt', '2:1'],
    ['Tisch 2', 'Bauer', 'Fischer', '1:2'],
    ['Tisch 4', 'Meier', 'Wagner', '0:1'],
  ];

  return (
    <>
      <header className="page-head">
        <div><h1>Live</h1><p className="muted">Turnier {tournamentId}</p></div>
        <span className="badge live">● LIVE</span>
      </header>
      <section className="grid">
        {matches.map(([table, a, b, score]) => (
          <article className="card span-4" key={table}>
            <span className="badge">{table}</span>
            <h2>{a}</h2>
            <div className="metric">{score}</div>
            <h2>{b}</h2>
          </article>
        ))}
        <div className="card span-12">
          <h2>Nächste Spiele</h2>
          <div className="table-wrap"><table><thead><tr><th>Tisch</th><th>Spiel</th><th>Status</th></tr></thead><tbody><tr><td>3</td><td>Schulz – Becker</td><td>bereit</td></tr></tbody></table></div>
        </div>
      </section>
    </>
  );
}
