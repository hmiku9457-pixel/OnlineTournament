import type { MatchSet } from '@/domain/types';
import { scoreDecisionTimeline, type ExtraTimeProgress, type ScoreDecision } from '@/domain/sportScoring';

interface Props {
  sets?: MatchSet[];
  decision?: ScoreDecision;
  extraTimeProgress?: ExtraTimeProgress;
  winner?: string;
}

/** Zeitlicher Ergebnisverlauf statt einer zusätzlichen Ergebnis-Bannerzeile. */
export function BracketDecisionTimeline({ sets, decision, extraTimeProgress, winner }: Props) {
  if ((!decision && !extraTimeProgress) || !sets?.length) return null;
  const steps = decision ? scoreDecisionTimeline(sets, decision) : [
    { label: 'FT', score: `${extraTimeProgress!.regulationScore.sideAScore}:${extraTimeProgress!.regulationScore.sideBScore}` },
    { label: 'n.V.', score: `${sets[0].sideAScore}:${sets[0].sideBScore}` },
  ];

  return <div className="bracket-decision-timeline" aria-label="Spielverlauf">
    {steps.map((step, index) => <div className="bracket-decision-timeline-item" key={step.label}>
      {index > 0 && <span className="bracket-decision-timeline-arrow" aria-hidden="true">›</span>}
      <span className="bracket-decision-timeline-step"><small>{step.label}</small><strong>{step.score}</strong></span>
    </div>)}
    {extraTimeProgress && <small className="bracket-decision-timeline-live">LIVE</small>}
    {decision?.type === 'LOT' && winner && <span className="bracket-decision-lot-winner">Sieger: {winner}</span>}
  </div>;
}
