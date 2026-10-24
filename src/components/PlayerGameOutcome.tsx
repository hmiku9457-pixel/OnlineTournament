import { describePlayerGameOutcome } from '@/domain/playerGameOutcome';

/** Einheitliche, spielerseitige Darstellung – unabhängig von Heim/Gast. */
export function PlayerGameOutcome({ score, finished, wonByDecision }: { score: string; finished: boolean; wonByDecision?: boolean }) {
  const { label, tone } = finished && wonByDecision !== undefined && /^(\d+)\s*:\s*\1$/.test(score)
    ? wonByDecision ? { label: 'Sieg n. E.', tone: 'win' as const } : { label: 'Niederlage n. E.', tone: 'loss' as const }
    : describePlayerGameOutcome(score, finished);
  return <span className={`player-game-outcome-tag ${tone}`}>{label}</span>;
}
