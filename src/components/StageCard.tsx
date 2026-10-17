import type { TournamentStage } from '@/domain/types';

function getStageDetails(stage: TournamentStage) {
  const entrants = typeof stage.settings.entrants === 'number' ? stage.settings.entrants : null;
  const groups = typeof stage.settings.groups === 'number' ? stage.settings.groups : null;
  const groupSize = typeof stage.settings.groupSize === 'number' ? stage.settings.groupSize : null;
  const rounds = typeof stage.settings.rounds === 'number' ? stage.settings.rounds : null;
  const byes = typeof stage.settings.byes === 'number' ? stage.settings.byes : 0;
  const places = typeof stage.settings.places === 'string' ? stage.settings.places : null;

  switch (stage.type) {
    case 'ROUND_ROBIN':
      return [entrants ? `${entrants} Teilnehmer` : null, 'jede Paarung spielt gegeneinander'].filter(Boolean).join(' · ');
    case 'GROUPS':
      return [groups ? `${groups} Gruppen` : null, groupSize ? `ca. ${groupSize} pro Gruppe` : null].filter(Boolean).join(' · ');
    case 'SWISS':
      return [rounds ? `${rounds} Runden` : null, entrants ? `${entrants} Teilnehmer` : null].filter(Boolean).join(' · ');
    case 'KNOCKOUT':
      return [entrants ? `${entrants} Teilnehmer` : null, byes ? `${byes} Freilose` : 'ohne Freilose'].filter(Boolean).join(' · ');
    case 'DOUBLE_ELIMINATION':
      return [entrants ? `${entrants} Teilnehmer` : null, 'Gewinner- und Verliererbaum'].filter(Boolean).join(' · ');
    case 'PLACEMENT':
      return [places ? `Plätze ${places}` : null, entrants ? `${entrants} Teilnehmer` : null].filter(Boolean).join(' · ');
    default:
      return '';
  }
}

function getAdvancementLabel(stage: TournamentStage) {
  if (stage.advancement.type === 'top_n') {
    return `${stage.advancement.value} Qualifizierte`;
  }

  if (stage.advancement.type === 'percentage') {
    return `${stage.advancement.value}% qualifizieren sich`;
  }

  return 'keine automatische Qualifikation';
}

export function StageCard({ stage }: { stage: TournamentStage }) {
  const details = getStageDetails(stage);

  return (
    <article className="card stage-card">
      <div className="stage-card-head">
        <span className="badge">{stage.type}</span>
        <span className="stage-card-order">Phase {stage.orderIndex + 1}</span>
      </div>
      <h3>{stage.name}</h3>
      <p className="muted">{details || `Best-of-${stage.bestOf}`}</p>
      <div className="stage-card-meta">
        <div>
          <span className="muted">Best-of</span>
          <strong>{stage.bestOf}</strong>
        </div>
        <div>
          <span className="muted">Qualifikation</span>
          <strong>{getAdvancementLabel(stage)}</strong>
        </div>
      </div>
    </article>
  );
}
