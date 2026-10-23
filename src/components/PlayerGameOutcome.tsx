import { describePlayerGameOutcome } from '@/domain/playerGameOutcome';

/** Einheitliche, spielerseitige Darstellung – unabhängig von Heim/Gast. */
export function PlayerGameOutcome({ score, finished }: { score: string; finished: boolean }) {
  const { label, tone } = describePlayerGameOutcome(score, finished);
  return <span className={`player-game-outcome-tag ${tone}`}>{label}</span>;
}
