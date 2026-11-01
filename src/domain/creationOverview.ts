import type { Discipline, StageType } from './types';
import { knockoutRoundLabels } from './tournamentCreation';

export interface CreationOverviewPhase {
  type: StageType;
  entrantCount: number;
  groupCount?: number;
  swissRounds?: number;
}

/** Only the next competition determines who qualifies; breaks do not eliminate players. */
export function phaseQualificationPlaces(phases: readonly CreationOverviewPhase[], index: number): number | null {
  const phase = phases[index];
  if (!phase || phase.type === 'BREAK') return null;
  const following = phases.slice(index + 1).find((candidate) => candidate.type !== 'BREAK');
  return following && following.entrantCount < phase.entrantCount ? following.entrantCount : null;
}

export function formatPhaseOverview(
  phases: readonly CreationOverviewPhase[], index: number, discipline: Discipline,
): string {
  const phase = phases[index];
  if (!phase || phase.type === 'BREAK') return '';
  const count = phase.entrantCount;
  const unit = discipline === 'TEAMS' ? (count === 1 ? 'Mannschaft' : 'Mannschaften')
    : discipline === 'DOUBLES' ? 'Doppel'
      : count === 1 ? 'Spieler' : 'Spieler';
  const qualifiers = phaseQualificationPlaces(phases, index);
  const parts: string[] = [];
  switch (phase.type) {
    case 'GROUPS':
      parts.push(`${phase.groupCount ?? 2} Gruppen`);
      break;
    case 'SWISS':
      parts.push(`${count} ${unit}`, `${phase.swissRounds ?? 1} Runden`);
      break;
    case 'KNOCKOUT':
      parts.push(`${count} ${unit}`, `${knockoutRoundLabels(count).length} Runden`);
      break;
    default:
      parts.push(`${count} ${unit}`);
  }
  if (qualifiers !== null) parts.push(`${qualifiers} Qualifikationsplätze`);
  return parts.join(' · ');
}
