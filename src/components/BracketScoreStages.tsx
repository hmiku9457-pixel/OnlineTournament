import type { BracketScoreStage } from '@/domain/bracketScoreStages';

interface StageProps { stages: BracketScoreStage[] }

/** Gemeinsamer Spaltenkopf für Turnierleitung und Zuschaueransicht. */
export function BracketStageHeader({ stages }: StageProps) {
  if (!stages.length) return null;
  return <header className="bracket-stage-header" aria-label="Ergebnisverlauf">
    <span className="bracket-stage-heading">Spielstand</span>
    <div className="bracket-stage-grid" style={{ gridTemplateColumns: `repeat(${stages.length}, 43px)` }}>
      {stages.map((stage) => <span key={stage.label} className={stage.deciding ? 'bracket-stage-label decisive' : 'bracket-stage-label'}>
        {stage.label}{stage.live && <small>LIVE</small>}
      </span>)}
    </div>
  </header>;
}

export function BracketStageValues({ stages, sideIndex }: StageProps & { sideIndex: 0 | 1 }) {
  return <span className="bracket-stage-grid bracket-stage-values" style={{ gridTemplateColumns: `repeat(${stages.length}, 43px)` }}>
    {stages.map((stage) => <strong key={stage.label} className={stage.deciding ? 'bracket-stage-value decisive' : 'bracket-stage-value'}>
      {sideIndex === 0 ? stage.sideA : stage.sideB}
    </strong>)}
  </span>;
}
