import type { StageType } from './types';

export type TournamentSystemId =
  | 'round-robin'
  | 'groups'
  | 'swiss'
  | 'knockout'
  | 'double-elimination'
  | 'placement';

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

export function estimateTournamentDurationMinutes(
  phases: TournamentDurationPhaseInput[],
  tableCount: number,
): number {
  const tables = Math.max(1, Math.trunc(tableCount));
  let total = 0;

  for (const phase of phases) {
    const entrants = Math.max(2, Math.trunc(phase.entrantCount));
    switch (phase.type) {
      case 'ROUND_ROBIN':
        total += waveMinutes(roundRobinMatchCount(entrants), tables, phase.bestOf);
        break;
      case 'GROUPS':
        total += waveMinutes(groupMatchCount(entrants, phase.groupCount ?? 2), tables, phase.bestOf);
        break;
      case 'SWISS': {
        const matchesPerRound = Math.floor(entrants / 2);
        const rounds = Math.max(1, Math.trunc(phase.swissRounds ?? 1));
        total += rounds * waveMinutes(matchesPerRound, tables, phase.bestOf);
        break;
      }
      case 'KNOCKOUT': {
        const roundMatches = knockoutRoundMatchCounts(entrants);
        roundMatches.forEach((matches, roundIndex) => {
          const bestOf = phase.knockoutBestOf?.[roundIndex] ?? phase.bestOf;
          total += waveMinutes(matches, tables, bestOf);
        });
        break;
      }
      case 'DOUBLE_ELIMINATION': {
        const approximateMatches = Math.max(1, entrants * 2 - 2);
        total += waveMinutes(Math.ceil(approximateMatches * 1.25), tables, phase.bestOf);
        break;
      }
      case 'PLACEMENT':
        total += waveMinutes(Math.floor(entrants / 2), tables, phase.bestOf);
        break;
    }
  }

  return Math.round(total);
}

export const tournamentSystemOptions: TournamentSystemOption[] = [
  { id: 'round-robin', label: 'Jeder gegen jeden', stageType: 'ROUND_ROBIN' },
  { id: 'groups', label: 'Gruppenphase', stageType: 'GROUPS' },
  { id: 'swiss', label: 'Schweizer System', stageType: 'SWISS' },
  { id: 'knockout', label: 'K.-o.-Phase', stageType: 'KNOCKOUT' },
  { id: 'double-elimination', label: 'Doppel-K.-o.', stageType: 'DOUBLE_ELIMINATION' },
  { id: 'placement', label: 'Platzierungs-/Trostrunde', stageType: 'PLACEMENT' },
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
    case 'DOUBLE_ELIMINATION': return 'double-elimination';
    case 'PLACEMENT': return 'placement';
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
