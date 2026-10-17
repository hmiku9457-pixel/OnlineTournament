import { useMemo, useState } from 'react';
import { recommendTournamentFormats } from '@/engine/recommendations';

export function CreateTournamentPage() {
  const [players, setPlayers] = useState(24);
  const [tables, setTables] = useState(8);
  const [minimumMatches, setMinimumMatches] = useState(4);

  const recommendations = useMemo(
    () => recommendTournamentFormats({ playerCount: players, tableCount: tables, minimumMatches }),
    [players, tables, minimumMatches],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turnier erstellen</h1>
          <p className="muted">Die Formatvorschläge sind Empfehlungen und jederzeit überschreibbar.</p>
        </div>
      </header>

      <section className="grid">
        <form className="card span-6" onSubmit={(event) => event.preventDefault()}>
          <h2>Grunddaten</h2>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="name">Name</label>
              <input id="name" placeholder="Vereinsmeisterschaft 2027" />
            </div>
            <div className="field">
              <label htmlFor="sport">Sportart</label>
              <select id="sport"><option value="table_tennis">Tischtennis</option></select>
            </div>
            <div className="field">
              <label htmlFor="discipline">Disziplin</label>
              <select id="discipline"><option>Einzel</option><option>Doppel</option></select>
            </div>
            <div className="field">
              <label htmlFor="players">Teilnehmer</label>
              <input id="players" type="number" min="2" value={players} onChange={(e) => setPlayers(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="tables">Tische</label>
              <input id="tables" type="number" min="1" value={tables} onChange={(e) => setTables(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="minimumMatches">Gewünschte Mindestspiele</label>
              <input id="minimumMatches" type="number" min="1" value={minimumMatches} onChange={(e) => setMinimumMatches(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="bestof">Best-of</label>
              <select id="bestof" defaultValue="5"><option>3</option><option>5</option><option>7</option></select>
            </div>
          </div>
        </form>

        <div className="span-6">
          <h2>Empfohlene Formate</h2>
          <div className="grid">
            {recommendations.slice(0, 3).map((item, index) => (
              <article className={`card span-12 recommendation ${index === 0 ? 'best' : ''}`} key={item.id}>
                <div className="badge">{index === 0 ? 'Empfohlen' : 'Alternative'}</div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
                <p className="muted">Geschätzte Spiele: {item.estimatedMatches}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
