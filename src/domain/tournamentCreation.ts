import type { StageType } from './types';

export type TournamentSystemId =
  | 'round-robin'
  | 'groups'
  | 'swiss'
  | 'knockout';

export interface TournamentSystemOption {
  id: TournamentSystemId;
  label: string;
  stageType: StageType;
}

export interface CreationPhaseTemplate {
  key: string;
  label: string;
  type: StageType;
  defaultBestOf: number;
  groupCount?: number;
  swissRounds?: number;
  entrantCount?: number;
}



export interface PhaseEstimate {
  estimatedMatches: number;
  estimatedDurationMinutes: number;
  approximate: boolean;
}

export interface SwissScoreProjection {
  wins: number;
  losses: number;
  approximatePlayers: number;
}

export interface TournamentDurationPhaseInput {
  type: StageType;
  entrantCount: number;
  bestOf: number;
  groupCount?: number;
  swissRounds?: number;
  knockoutBestOf?: number[];
}

const MINUTES_PER_SET = 15;

function averageSetsForBestOf(bestOf: number): number {
  const normalized = Math.max(1, Math.trunc(bestOf));
  const winsNeeded = Math.floor(normalized / 2) + 1;
  return (winsNeeded + normalized) / 2;
}

function roundRobinMatchCount(entrantCount: number): number {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  return (entrants * (entrants - 1)) / 2;
}

function groupMatchCount(entrantCount: number, groupCount: number): number {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const groups = Math.max(1, Math.min(Math.trunc(groupCount), entrants));
  const baseSize = Math.floor(entrants / groups);
  const largerGroups = entrants % groups;
  let total = 0;

  for (let index = 0; index < groups; index += 1) {
    const size = baseSize + (index < largerGroups ? 1 : 0);
    total += (size * (size - 1)) / 2;
  }
  return total;
}

function waveMinutes(matchCount: number, tableCount: number, bestOf: number): number {
  if (matchCount <= 0) return 0;
  const waves = Math.ceil(matchCount / Math.max(1, Math.trunc(tableCount)));
  return waves * averageSetsForBestOf(bestOf) * MINUTES_PER_SET;
}

function knockoutRoundMatchCounts(entrantCount: number): number[] {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const bracketSize = 2 ** Math.ceil(Math.log2(entrants));
  const counts: number[] = [];
  const firstRoundMatches = entrants - bracketSize / 2;
  counts.push(Math.max(0, firstRoundMatches));

  let matches = bracketSize / 4;
  while (matches >= 1) {
    counts.push(matches);
    matches /= 2;
  }

  return counts;
}

export function recommendedSwissRounds(entrantCount: number): number {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  return Math.max(1, Math.min(entrants - 1, Math.ceil(Math.log2(entrants))));
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= effectiveK; index += 1) {
    result = (result * (n - effectiveK + index)) / index;
  }
  return result;
}

export function projectSwissTopScores(entrantCount: number, rounds: number): SwissScoreProjection[] {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const normalizedRounds = Math.max(1, Math.trunc(rounds));
  const minimumWins = Math.max(0, normalizedRounds - 2);
  const projections: SwissScoreProjection[] = [];

  for (let wins = normalizedRounds; wins >= minimumWins; wins -= 1) {
    const probability = combination(normalizedRounds, wins) / (2 ** normalizedRounds);
    let approximatePlayers = Math.round(entrants * probability);
    if (wins === normalizedRounds) approximatePlayers = Math.max(1, approximatePlayers);
    if (approximatePlayers <= 0) continue;
    projections.push({
      wins,
      losses: normalizedRounds - wins,
      approximatePlayers,
    });
  }

  return projections;
}

export function knockoutByeCount(entrantCount: number): number {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const bracketSize = 2 ** Math.ceil(Math.log2(entrants));
  return bracketSize - entrants;
}

export interface TimedMatchSettings { matchDurationMinutes: number; venueTurnoverMinutes?: number }

export function estimatePhaseMetrics(
  phase: TournamentDurationPhaseInput,
  tableCount: number,
  timing?: TimedMatchSettings,
): PhaseEstimate {
  const tables = Math.max(1, Math.trunc(tableCount));
  const entrants = Math.max(2, Math.trunc(phase.entrantCount));
  // Timed sports use one match duration per fixture, plus a preparation break between slots.
  const gameMinutes = timing ? Math.max(1, timing.matchDurationMinutes) + Math.max(0, timing.venueTurnoverMinutes ?? 0) : 0;
  const waveDurationForPhase = (count: number, bo: number) => timing
    ? Math.ceil(count / tables) * gameMinutes
    : waveMinutes(count, tables, bo);

  switch (phase.type) {
    case 'ROUND_ROBIN': {
      const matches = roundRobinMatchCount(entrants);
      return { estimatedMatches: matches, estimatedDurationMinutes: Math.round(waveDurationForPhase(matches, phase.bestOf)), approximate: false };
    }
    case 'GROUPS': {
      const matches = groupMatchCount(entrants, phase.groupCount ?? 2);
      return { estimatedMatches: matches, estimatedDurationMinutes: Math.round(waveDurationForPhase(matches, phase.bestOf)), approximate: false };
    }
    case 'SWISS': {
      const matchesPerRound = Math.floor(entrants / 2);
      const rounds = Math.max(1, Math.trunc(phase.swissRounds ?? 1));
      return {
        estimatedMatches: matchesPerRound * rounds,
        estimatedDurationMinutes: Math.round(rounds * waveDurationForPhase(matchesPerRound, phase.bestOf)),
        approximate: entrants % 2 !== 0,
      };
    }
    case 'KNOCKOUT': {
      const roundMatches = knockoutRoundMatchCounts(entrants);
      let duration = 0;
      roundMatches.forEach((matches, roundIndex) => {
        const bestOf = phase.knockoutBestOf?.[roundIndex] ?? phase.bestOf;
        duration += waveDurationForPhase(matches, bestOf);
      });
      return {
        estimatedMatches: roundMatches.reduce((sum, matches) => sum + matches, 0),
        estimatedDurationMinutes: Math.round(duration),
        approximate: false,
      };
    }
    case 'DOUBLE_ELIMINATION': {
      const approximateMatches = Math.ceil(Math.max(1, entrants * 2 - 2) * 1.25);
      return {
        estimatedMatches: approximateMatches,
        estimatedDurationMinutes: Math.round(waveMinutes(approximateMatches, tables, phase.bestOf)),
        approximate: true,
      };
    }
    case 'PLACEMENT': {
      const matches = Math.floor(entrants / 2);
      return { estimatedMatches: matches, estimatedDurationMinutes: Math.round(waveDurationForPhase(matches, phase.bestOf)), approximate: true };
    }
  }
}

export function estimateTournamentDurationMinutes(
  phases: TournamentDurationPhaseInput[],
  tableCount: number,
  timing?: TimedMatchSettings,
): number {
  return Math.round(
    phases.reduce(
      (total, phase) => total + estimatePhaseMetrics(phase, tableCount, timing).estimatedDurationMinutes,
      0,
    ),
  );
}

export const tournamentSystemOptions: TournamentSystemOption[] = [
  { id: 'round-robin', label: 'Jeder gegen jeden', stageType: 'ROUND_ROBIN' },
  { id: 'groups', label: 'Gruppenphase', stageType: 'GROUPS' },
  { id: 'swiss', label: 'Schweizer System', stageType: 'SWISS' },
  { id: 'knockout', label: 'K.-o.-Phase', stageType: 'KNOCKOUT' },
];

export const bestOfOptions = [1, 3, 5, 7] as const;
export const knockoutEntrantOptions = [2, 4, 8, 16, 32, 64] as const;

export function defaultBestOfForStage(type: StageType): number {
  return type === 'GROUPS' || type === 'ROUND_ROBIN' ? 1 : 5;
}

export function stageLabel(type: StageType): string {
  switch (type) {
    case 'ROUND_ROBIN': return 'Jeder gegen jeden';
    case 'GROUPS': return 'Gruppenphase';
    case 'SWISS': return 'Schweizer System';
    case 'KNOCKOUT': return 'K.-o.-Phase';
    case 'DOUBLE_ELIMINATION': return 'Doppel-K.-o.';
    case 'PLACEMENT': return 'Platzierungs-/Trostrunde';
  }
}

export function systemIdForStage(type: StageType): TournamentSystemId {
  switch (type) {
    case 'ROUND_ROBIN': return 'round-robin';
    case 'GROUPS': return 'groups';
    case 'SWISS': return 'swiss';
    case 'KNOCKOUT': return 'knockout';
    // Frühere experimentelle Formate werden nicht mehr angeboten.
    case 'DOUBLE_ELIMINATION': return 'knockout';
    case 'PLACEMENT': return 'groups';
  }
}

export function createPhaseTemplate(
  type: StageType,
  sequence: number,
  settings: Partial<CreationPhaseTemplate> = {},
): CreationPhaseTemplate {
  return {
    key: `${type.toLowerCase()}-${sequence}`,
    label: stageLabel(type),
    type,
    defaultBestOf: defaultBestOfForStage(type),
    ...settings,
  };
}

export function knockoutRoundLabels(entrantCount: number): string[] {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const bracketSize = 2 ** Math.ceil(Math.log2(entrants));
  const rounds = Math.log2(bracketSize);
  const labels: string[] = [];

  for (let round = rounds; round >= 1; round -= 1) {
    const playersInRound = 2 ** round;
    if (playersInRound === 2) labels.push('Finale');
    else if (playersInRound === 4) labels.push('Halbfinale');
    else if (playersInRound === 8) labels.push('Viertelfinale');
    else if (playersInRound === 16) labels.push('Achtelfinale');
    else if (playersInRound === 32) labels.push('Sechzehntelfinale');
    else labels.push(`Runde der ${playersInRound}`);
  }

  return labels;
}

export function knockoutEntrantPresets(maxParticipants: number): number[] {
  const maximum = Math.max(2, Math.trunc(maxParticipants));
  return knockoutEntrantOptions.filter((count) => count <= maximum);
}

export function isTerminalStage(type: StageType): boolean {
  return type === 'KNOCKOUT' || type === 'DOUBLE_ELIMINATION';
}

export function hasValidTerminalStageOrder(types: StageType[]): boolean {
  const terminalIndex = types.findIndex(isTerminalStage);
  return terminalIndex === -1 || terminalIndex === types.length - 1;
}
