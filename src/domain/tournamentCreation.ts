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
