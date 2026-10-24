import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StageCard } from '@/components/StageCard';
import { getMockTournament } from '@/services/mockTournamentStore';
import { getVenueTerminology } from '@/domain/venueTerminology';

function getStatusLabel(status: string) {
  switch (status) {
    case 'REGISTRATION':
      return 'Anmeldung offen';
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

export function TournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const venue = getVenueTerminology(tournament.sport);

  return (
    <>
      <header className="page-head">
        <div>
          <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          <div className="tournament-page-status-row" style={{ marginTop: 10 }}>
            <h1>{tournament.name}</h1>
            <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{getStatusLabel(tournament.status)}</span>
            {tournament.isLocalPrototype && <span className="badge prototype">Lokal gespeichert</span>}
          </div>
          <p className="muted">{tournament.subtitle} · ID: {tournament.id}</p>
        </div>
        <div className="actions no-print">
          <button className="btn" onClick={() => window.print()}>Spielplan drucken</button>
          <Link className="btn" to={`/live/${tournament.id}`}>Zuschaueransicht</Link>
          <Link className="btn" to={`/player/${tournament.id}`}>Spieleransicht</Link>
          <Link className="btn primary" to={`/tournaments/${tournament.id}/control`}>Turnier öffnen</Link>
        </div>
      </header>

      <section className="grid">
        <div className="card span-3">
          <div className="muted">Teilnehmer</div>
          <div className="metric">{tournament.participants}</div>
        </div>
        <div className="card span-3">
          <div className="muted">{venue.plural}</div>
          <div className="metric">{tournament.tables}</div>
        </div>
        <div className="card span-3">
          <div className="muted">Aktive {venue.plural}</div>
          <div className="metric">{tournament.activeTables}</div>
        </div>
        <div className="card span-3">
          <div className="muted">Vorauss. Dauer</div>
          <div className="metric metric-small">{tournament.estimatedDuration}</div>
        </div>

        <div className="card span-8">
          <h2>Turnierprofil</h2>
          <div className="tournament-profile-grid">
            <div><span className="muted">Sportart</span><strong>{tournament.sport}</strong></div>
            <div><span className="muted">Disziplin</span><strong>{tournament.discipline === 'DOUBLES' ? 'Doppel' : 'Einzel'}</strong></div>
            <div><span className="muted">Sichtbarkeit</span><strong>{tournament.visibility}</strong></div>
            <div><span className="muted">Turnierform</span><strong>{tournament.phasesLabel}</strong></div>
            <div><span className="muted">Laufende Spiele</span><strong>{tournament.runningMatches}</strong></div>
            <div><span className="muted">Offene Bestätigungen</span><strong>{tournament.openConfirmations}</strong></div>
          </div>
        </div>

        <div className="card span-4">
          <h2>Prototyp-Modus</h2>
          <p className="muted">Ab hier sind Turnierleitung, Spieler- und Zuschaueransicht ohne Datenbank klickbar. Zustände werden für lokal erstellte Turniere im Browser gespeichert.</p>
          <div className="tournament-mini-facts">
            <div><span className="muted">Status</span><strong>{getStatusLabel(tournament.status)}</strong></div>
            <div><span className="muted">Letztes Update</span><strong>{tournament.lastUpdate}</strong></div>
          </div>
        </div>

        <div className="span-12"><h2>Phasen</h2></div>
        {tournament.stages.map((stage) => (
          <div className="span-6" key={stage.id}>
            <StageCard stage={stage} />
          </div>
        ))}

        <div className="card span-12">
          <h2>Spielbereiche</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Bereich</th><th>{venue.plural}</th><th>Bevorzugte Turniersegmente</th><th>Modus</th></tr>
              </thead>
              <tbody>
                {tournament.areas.map((area) => (
                  <tr key={area.name}>
                    <td>{area.name}</td>
                    <td>{area.tables}</td>
                    <td>{area.preferred}</td>
                    <td>{area.mode}</td>
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
