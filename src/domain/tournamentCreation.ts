import type { StageType } from './types';

export type SupportedFormatId = 'round-robin' | 'groups-ko' | 'swiss-ko' | 'single-ko';

export interface CreationPhaseTemplate {
  key: string;
  label: string;
  type: StageType;
  defaultBestOf: number;
}

const templates: Record<SupportedFormatId, CreationPhaseTemplate[]> = {
  'round-robin': [
    { key: 'round-robin', label: 'Jeder gegen jeden', type: 'ROUND_ROBIN', defaultBestOf: 1 },
  ],
  'groups-ko': [
    { key: 'groups', label: 'Gruppenphase', type: 'GROUPS', defaultBestOf: 1 },
    { key: 'knockout', label: 'K.-o.-Runde', type: 'KNOCKOUT', defaultBestOf: 5 },
  ],
  'swiss-ko': [
    { key: 'swiss', label: 'Schweizer System', type: 'SWISS', defaultBestOf: 5 },
    { key: 'knockout', label: 'K.-o.-Runde', type: 'KNOCKOUT', defaultBestOf: 5 },
  ],
  'single-ko': [
    { key: 'knockout', label: 'K.-o.-Runde', type: 'KNOCKOUT', defaultBestOf: 5 },
  ],
};

export const bestOfOptions = [1, 3, 5, 7] as const;

export function phasesForFormat(formatId: string): CreationPhaseTemplate[] {
  if (!(formatId in templates)) return [];
  return templates[formatId as SupportedFormatId].map((phase) => ({ ...phase }));
}
