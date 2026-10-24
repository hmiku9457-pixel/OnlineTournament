import type { MatchSet } from '@/domain/types';
import { scoreDecisionTimeline, type ExtraTimeProgress, type ScoreDecision } from '@/domain/sportScoring';

export interface BracketScoreStage {
  label: string;
  sideA: string;
  sideB: string;
  live: boolean;
  deciding: boolean;
}

/** Ergebnisphasen stehen nebeneinander, damit sie nicht unter den Spielern wiederholt werden. */
export function getBracketScoreStages(
  sets: MatchSet[] | undefined,
  decision: ScoreDecision | undefined,
  extraTimeProgress: ExtraTimeProgress | undefined,
  winner: string | undefined,
  sideA: string,
  sideB: string,
  isLive = false,
): BracketScoreStage[] {
  if (!sets?.length) return [];
  const steps = decision ? scoreDecisionTimeline(sets, decision) : extraTimeProgress ? [
    { label: 'FT', score: `${extraTimeProgress.regulationScore.sideAScore}:${extraTimeProgress.regulationScore.sideBScore}` },
    { label: 'n.V.', score: `${sets[0].sideAScore}:${sets[0].sideBScore}` },
  ] : [{ label: 'FT', score: `${sets[0].sideAScore}:${sets[0].sideBScore}` }];

  return steps.map((step, index) => {
    const [scoreA, scoreB] = step.score.split(':');
    const lot = step.label === 'Los';
    return {
      label: step.label,
      sideA: lot ? (winner ? (winner === sideA ? '✓' : '–') : '–') : scoreA,
      sideB: lot ? (winner ? (winner === sideB ? '✓' : '–') : '–') : scoreB,
      live: (isLive || Boolean(extraTimeProgress)) && index === steps.length - 1,
      deciding: !isLive && !extraTimeProgress && index === steps.length - 1,
    };
  });
}
