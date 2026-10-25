import type { ReactNode } from 'react';
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

export function BracketStageValues({ stages, sideIndex, onOpenResult }: StageProps & { sideIndex: 0 | 1; onOpenResult?: () => void }) {
  const values = stages.map((stage) => <strong key={stage.label} className={stage.deciding ? 'bracket-stage-value decisive' : 'bracket-stage-value'}>
    {sideIndex === 0 ? stage.sideA : stage.sideB}
  </strong>);
  const style = { gridTemplateColumns: `repeat(${stages.length}, 43px)` };
  return onOpenResult
    ? <button className="bracket-stage-grid bracket-stage-values bracket-result-action" type="button" style={style} onClick={onOpenResult} title="Ergebnis öffnen">{values}</button>
    : <span className="bracket-stage-grid bracket-stage-values" style={style}>{values}</span>;
}

export function BracketScoreCells({ children, onOpenResult }: { children: ReactNode; onOpenResult?: () => void }) {
  return onOpenResult
    ? <button className="bracket-score-cells bracket-result-action" type="button" onClick={onOpenResult} title="Ergebnis öffnen">{children}</button>
    : <span className="bracket-score-cells">{children}</span>;
}

/** Einheitliche Live-Markierung für laufende K.-o.-Spiele, auch beim Spiel um Platz 3. */
export function BracketLiveStatus({ live }: { live?: boolean }) {
  if (!live) return null;
  return (
    <div className="bracket-live-status" role="status" aria-label="Spiel läuft">
      <span className="bracket-live-dot" aria-hidden="true" />
      <span>Läuft</span>
    </div>
  );
}
