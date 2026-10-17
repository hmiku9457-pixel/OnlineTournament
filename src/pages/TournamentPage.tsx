import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { StageCard } from '@/components/StageCard';
import { getDemoTournament } from '@/data/demoTournaments';

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
  const tournament = useMemo(() => getDemoTournament(tournamentId), [tournamentId]);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="tournament-page-status-row">
            <h1>{tournament.name}</h1>
            <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{getStatusLabel(tournament.status)}</span>
          </div>
          <p className="muted">{tournament.subtitle} · ID: {tournament.id}</p>
        </div>
        <div className="actions no-print">
          <button className="btn" onClick={() => window.print()}>Spielplan drucken</button>
          <button className="btn primary">Turnier öffnen</button>
        </div>
      </header>

      <section className="grid">
        <div className="card span-3">
          <div className="muted">Teilnehmer</div>
          <div className="metric">{tournament.participants}</div>
        </div>
        <div className="card span-3">
          <div className="muted">Tische</div>
          <div className="metric">{tournament.tables}</div>
        </div>
        <div className="card span-3">
          <div className="muted">Aktive Tische</div>
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
          <h2>Visualisierungs-Hinweis</h2>
          <p className="muted">Dieses Turnier gehört zum Testpool. Nutze es, um Aufbau, Abstände, Stufen und Informationsdichte der jeweiligen Turnierform grafisch zu beurteilen.</p>
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
          <h2>Tischbereiche</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Bereich</th><th>Tische</th><th>Bevorzugte Turniersegmente</th><th>Modus</th></tr>
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
