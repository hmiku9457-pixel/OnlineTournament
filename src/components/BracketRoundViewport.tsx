import type { ReactNode } from 'react';

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

/** Zeigt alle K.-o.-Runden vollständig; breite Ergebniszeilen wachsen bei Bedarf. */
export function BracketRoundViewport<T extends BracketRound>({ rounds, renderRound, className = 'bracket-board' }: Props<T>) {
  return <div className="bracket-viewport">
    <div className="bracket-scroll">
      <div className={className}>
        {rounds.map((round, index) => renderRound(round, index))}
      </div>
    </div>
  </div>;
}
