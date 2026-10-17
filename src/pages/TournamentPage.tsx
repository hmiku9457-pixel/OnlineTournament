import { useParams } from 'react-router-dom';
import { StageCard } from '@/components/StageCard';
import type { TournamentStage } from '@/domain/types';

const stages: TournamentStage[] = [
  {
    id: 'stage-1',
    tournamentId: 'demo',
    name: 'Schweizer System',
    type: 'SWISS',
    orderIndex: 0,
    settings: { rounds: 5, bestOf: 5 },
    advancement: { type: 'top_n', value: 8 },
  },
  {
    id: 'stage-2',
    tournamentId: 'demo',
    name: 'K.-o.-Runde',
    type: 'KNOCKOUT',
    orderIndex: 1,
    settings: { bestOf: 5, avoidPriorOpponents: true },
    advancement: { type: 'manual', value: 0 },
  },
];

export function TournamentPage() {
  const { tournamentId } = useParams();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Herbstcup</h1>
          <p className="muted">ID: {tournamentId}</p>
        </div>
        <div className="actions no-print">
          <button className="btn" onClick={() => window.print()}>Spielplan drucken</button>
          <button className="btn primary">Turnier starten</button>
        </div>
      </header>

      <section className="grid">
        <div className="card span-4"><div className="muted">Teilnehmer</div><div className="metric">24</div></div>
        <div className="card span-4"><div className="muted">Tische</div><div className="metric">8</div></div>
        <div className="card span-4"><div className="muted">Status</div><div className="metric">READY</div></div>

        <div className="span-12"><h2>Phasen</h2></div>
        {stages.map((stage) => <div className="span-6" key={stage.id}><StageCard stage={stage} /></div>)}

        <div className="card span-12">
          <h2>Tischbereiche</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bereich</th><th>Tische</th><th>Bevorzugte Gruppen</th><th>Modus</th></tr></thead>
              <tbody>
                <tr><td>Hauptfeld</td><td>1–4</td><td>A, B</td><td>bevorzugt</td></tr>
                <tr><td>Nebenfeld</td><td>5–8</td><td>C, D</td><td>bevorzugt</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
