import { useState, type ReactNode } from 'react';
import { getBracketCompactStartIndex } from '@/domain/bracketViewport';

interface BracketRound {
  label: string;
  matches: { id: string; live?: boolean }[];
}

interface Props<T extends BracketRound> {
  rounds: T[];
  renderRound: (round: T, roundIndex: number) => ReactNode;
  className?: string;
  editable?: boolean;
}

/** Große K.-o.-Bäume auf die entscheidenden Runden fokussieren; frühere Runden bleiben zugänglich. */
export function BracketRoundViewport<T extends BracketRound>({ rounds, renderRound, className = 'bracket-board', editable = false }: Props<T>) {
  const [showAll, setShowAll] = useState(false);
  const compactStart = getBracketCompactStartIndex(rounds);
  const hiddenRounds = rounds.slice(0, compactStart);
  const hiddenMatchCount = hiddenRounds.reduce((total, round) => total + round.matches.length, 0);
  const hiddenLiveCount = hiddenRounds.reduce((total, round) => total + round.matches.filter((match) => match.live).length, 0);
  const firstVisibleIndex = showAll ? 0 : compactStart;

  return <div className="bracket-viewport">
    {compactStart > 0 && <div className="bracket-round-toggle-bar">
      <div className="bracket-round-toggle-info">
        <strong>{showAll ? 'Alle K.-o.-Runden' : `Kompakt · ab ${rounds[compactStart].label}`}</strong>
        <span>{hiddenRounds.length} frühere {hiddenRounds.length === 1 ? 'Runde' : 'Runden'} · {hiddenMatchCount} Spiele
          {hiddenLiveCount > 0 && <em>{hiddenLiveCount} live</em>}
        </span>
        {editable && !showAll && <small>Zum Bearbeiten der ersten Runde bitte einblenden.</small>}
      </div>
      <button className="btn small" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Frühere Runden ausblenden' : 'Frühere Runden anzeigen'}
      </button>
    </div>}
    <div className="bracket-scroll">
      <div className={className}>
        {rounds.slice(firstVisibleIndex).map((round, index) => renderRound(round, firstVisibleIndex + index))}
      </div>
    </div>
  </div>;
}
