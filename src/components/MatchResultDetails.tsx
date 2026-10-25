import { useEffect, useRef, useState } from 'react';
import type { MatchSet } from '@/domain/types';
import { scoreDecisionSuffix, sportScoring, type ScoreDecision } from '@/domain/sportScoring';

interface Props {
  score: string;
  sets?: MatchSet[];
  onEdit?: () => void;
  onOpenResult?: () => void;
  className?: string;
  sport?: string;
  decision?: ScoreDecision;
  decisionReversed?: boolean;
}

function tooltip(sets?: MatchSet[], sport = 'Tischtennis') {
  if (!sets?.length) return undefined;
  if (sportScoring(sport).mode === 'score') return `Spielstand: ${sets[0].sideAScore}:${sets[0].sideBScore}`;
  return sets.map((set, index) => `Satz ${index + 1}: ${set.sideAScore}:${set.sideBScore}`).join(' · ');
}

export function MatchResultDetails({ score, sets, onEdit, onOpenResult, className = '', sport = 'Tischtennis', decision, decisionReversed = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  return (
    <span className={`match-result-details ${className}`.trim()} ref={ref}>
      <button
        className={onOpenResult ? 'match-result-trigger direct-result-trigger' : 'match-result-trigger'}
        type="button"
        title={score === 'W.O.' ? 'Kampflos gewertete Partie (Walkover)' : [tooltip(sets, sport), scoreDecisionSuffix(decision, decisionReversed)].filter(Boolean).join(' · ')}
        onClick={(event) => {
          event.stopPropagation();
          if (onOpenResult) {
            setOpen(false);
            onOpenResult();
            return;
          }
          if (sets?.length) setOpen((value) => !value);
        }}
      >
        {score === 'W.O.' ? 'Kampflos' : [score, scoreDecisionSuffix(decision, decisionReversed)].filter(Boolean).join(' ')}
      </button>
      {open && !onOpenResult && sets?.length ? (
        <span className="match-result-popover" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
          <strong>{sportScoring(sport).mode === 'score' ? 'Spielstand' : 'Sätze'}</strong>
          <span className="match-result-set-list">
            {sets.map((set, index) => <span className="match-result-set-row" key={set.number}><span>{sportScoring(sport).mode === 'score' ? 'Ergebnis' : `Satz ${index + 1}`}</span><strong>{set.sideAScore}:{set.sideBScore}</strong></span>)}
          </span>
          {decision && <span className="field-hint">{decision.type === 'EXTRA_TIME' ? 'Nach Verlängerung' : decision.type === 'PENALTIES' ? `Elfmeterschießen: ${scoreDecisionSuffix(decision, decisionReversed)}` : 'Sieger nach Losentscheid'}</span>}
          {onEdit && <button className="btn small" type="button" onClick={() => { setOpen(false); onEdit(); }}>Ergebnis bearbeiten</button>}
        </span>
      ) : null}
    </span>
  );
}
