import { useEffect, useRef, useState } from 'react';
import type { MatchSet } from '@/domain/types';

interface Props {
  score: string;
  sets?: MatchSet[];
  onEdit?: () => void;
  className?: string;
}

function tooltip(sets?: MatchSet[]) {
  if (!sets?.length) return undefined;
  return sets.map((set, index) => `Satz ${index + 1}: ${set.sideAScore}:${set.sideBScore}`).join(' · ');
}

export function MatchResultDetails({ score, sets, onEdit, className = '' }: Props) {
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
        className="match-result-trigger"
        type="button"
        title={score === 'W.O.' ? 'Kampflos gewertete Partie (Walkover)' : tooltip(sets)}
        onClick={(event) => {
          event.stopPropagation();
          if (sets?.length) setOpen((value) => !value);
        }}
      >
        {score === 'W.O.' ? 'Kampflos' : score}
      </button>
      {open && sets?.length ? (
        <span className="match-result-popover" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
          <strong>Sätze</strong>
          <span className="match-result-set-list">
            {sets.map((set, index) => <span className="match-result-set-row" key={set.number}><span>Satz {index + 1}</span><strong>{set.sideAScore}:{set.sideBScore}</strong></span>)}
          </span>
          {onEdit && <button className="btn small" type="button" onClick={() => { setOpen(false); onEdit(); }}>Ergebnis bearbeiten</button>}
        </span>
      ) : null}
    </span>
  );
}
