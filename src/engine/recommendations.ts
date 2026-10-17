import {
  createPhaseTemplate,
  type CreationPhaseTemplate,
  type TournamentSystemId,
} from '@/domain/tournamentCreation';

export interface RecommendationInput {
  playerCount: number;
  tableCount: number;
  minimumMatches: number;
}

export interface RecommendationSettings {
  enabledSystems?: Partial<Record<TournamentSystemId, boolean>>;
  maxGroups?: number;
  maxSwissRounds?: number;
  knockoutQualifierCount?: number;
}

export interface FormatRecommendation {
  id: string;
  label: string;
  description: string;
  estimatedMatches: number;
  score: number;
  requiredSystems: TournamentSystemId[];
  phases: CreationPhaseTemplate[];
}

function roundRobinMatches(players: number): number {
  return (players * (players - 1)) / 2;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(max, Math.max(min, candidate));
}

function systemsEnabled(required: TournamentSystemId[], settings: RecommendationSettings): boolean {
  return required.every((system) => settings.enabledSystems?.[system] !== false);
}

function calculateGroupPlan(playerCount: number, minimumMatches: number, maxGroupsSetting?: number) {
  const preferredGroupSize = playerCount >= 20 ? 5 : 4;
  const naturalGroupCount = Math.max(2, Math.ceil(playerCount / preferredGroupSize));
  const maximumUsefulGroups = Math.max(2, Math.floor(playerCount / 2));
  const maxGroups = clampInteger(maxGroupsSetting, naturalGroupCount, 2, maximumUsefulGroups);
  const groupCount = Math.min(naturalGroupCount, maxGroups);
  const baseSize = Math.floor(playerCount / groupCount);
  const remainder = playerCount % groupCount;
  let matches = 0;
  for (let i = 0; i < groupCount; i += 1) {
    matches += roundRobinMatches(baseSize + (i < remainder ? 1 : 0));
  }

  const averageGroupSize = playerCount / groupCount;
  const fitScore = 100 - Math.abs(averageGroupSize - (minimumMatches + 1)) * 5;
  return { groupCount, matches, averageGroupSize, fitScore };
}

function calculateSwissPlan(playerCount: number, minimumMatches: number, maxSwissRoundsSetting?: number) {
  const recommendedRounds = Math.max(minimumMatches, Math.ceil(Math.log2(playerCount)));
  const rounds = clampInteger(maxSwissRoundsSetting, recommendedRounds, 1, recommendedRounds);
  const matches = Math.floor(playerCount / 2) * rounds;
  const roundsBelowMinimum = Math.max(0, minimumMatches - rounds);
  return { rounds, matches, roundsBelowMinimum };
}

export function recommendTournamentFormats(
  input: RecommendationInput,
  settings: RecommendationSettings = {},
): FormatRecommendation[] {
  const { playerCount, tableCount, minimumMatches } = input;
  if (playerCount < 2) return [];

  const recommendations: FormatRecommendation[] = [];
  const group = calculateGroupPlan(playerCount, minimumMatches, settings.maxGroups);
  const swiss = calculateSwissPlan(playerCount, minimumMatches, settings.maxSwissRounds);
  const defaultQualifiers = playerCount >= 16 ? 8 : 4;
  const qualifiers = clampInteger(settings.knockoutQualifierCount, defaultQualifiers, 2, playerCount);

  if (systemsEnabled(['round-robin'], settings)) {
    recommendations.push({
      id: 'round-robin',
      label: 'Jeder gegen jeden',
      description: 'Alle Teilnehmer spielen gegeneinander. Maximale Vergleichbarkeit, aber stark steigende Spielanzahl.',
      estimatedMatches: roundRobinMatches(playerCount),
      score: playerCount <= 10 ? 90 : Math.max(10, 80 - playerCount * 3),
      requiredSystems: ['round-robin'],
      phases: [createPhaseTemplate('ROUND_ROBIN', 1)],
    });
  }

  if (systemsEnabled(['groups'], settings)) {
    recommendations.push({
      id: 'groups',
      label: `${group.groupCount} Gruppen`,
      description: `Reine Gruppenphase mit durchschnittlich ${group.averageGroupSize.toFixed(1).replace('.0', '')} Teilnehmern je Gruppe.`,
      estimatedMatches: group.matches,
      score: group.fitScore - (playerCount >= 20 ? 12 : 0),
      requiredSystems: ['groups'],
      phases: [createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount })],
    });
  }

  if (systemsEnabled(['swiss'], settings)) {
    recommendations.push({
      id: 'swiss',
      label: `${swiss.rounds} Runden Schweizer System`,
      description: `Alle Teilnehmer bleiben über ${swiss.rounds} Runden im Turnier; Paarungen richten sich nach dem bisherigen Turnierverlauf.`,
      estimatedMatches: swiss.matches,
      score: (playerCount >= 12 ? 86 : 62) - swiss.roundsBelowMinimum * 25,
      requiredSystems: ['swiss'],
      phases: [createPhaseTemplate('SWISS', 1, { swissRounds: swiss.rounds })],
    });
  }

  if (systemsEnabled(['knockout'], settings)) {
    recommendations.push({
      id: 'single-ko',
      label: 'Einfaches K.-o.',
      description: 'Sehr kompakt; nach einer Niederlage scheidet ein Teilnehmer aus.',
      estimatedMatches: playerCount - 1,
      score: minimumMatches <= 1 ? 85 : 35,
      requiredSystems: ['knockout'],
      phases: [createPhaseTemplate('KNOCKOUT', 1, { entrantCount: playerCount })],
    });
  }

  if (systemsEnabled(['double-elimination'], settings)) {
    recommendations.push({
      id: 'double-elimination',
      label: 'Doppel-K.-o.',
      description: 'Ausscheiden erst nach zwei Niederlagen; mehr Spiele als beim einfachen K.-o.',
      estimatedMatches: Math.max(1, playerCount * 2 - 2),
      score: minimumMatches <= 2 ? 68 : 45,
      requiredSystems: ['double-elimination'],
      phases: [createPhaseTemplate('DOUBLE_ELIMINATION', 1, { entrantCount: playerCount })],
    });
  }

  if (systemsEnabled(['groups', 'knockout'], settings)) {
    const groupTableBonus = Math.min(tableCount, group.groupCount) * 2;
    const largeFieldPenalty = playerCount >= 20 ? 20 : playerCount >= 16 ? 10 : 0;
    recommendations.push({
      id: 'groups-ko',
      label: `${group.groupCount} Gruppen → ${qualifiers} Qualifizierte → K.-o.`,
      description: `Gruppenphase mit anschließender K.-o.-Phase für ${qualifiers} bestplatzierte Teilnehmer.`,
      estimatedMatches: group.matches + qualifiers - 1,
      score: group.fitScore + groupTableBonus - largeFieldPenalty,
      requiredSystems: ['groups', 'knockout'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount }),
        createPhaseTemplate('KNOCKOUT', 2, { entrantCount: qualifiers }),
      ],
    });
  }

  if (systemsEnabled(['swiss', 'knockout'], settings)) {
    recommendations.push({
      id: 'swiss-ko',
      label: `${swiss.rounds} Runden Schweizer System → ${qualifiers} Qualifizierte → K.-o.`,
      description: `${swiss.rounds} Schweizer Runden mit anschließender K.-o.-Phase für ${qualifiers} bestplatzierte Teilnehmer.`,
      estimatedMatches: swiss.matches + qualifiers - 1,
      score: (playerCount >= 16 ? 95 + Math.min(tableCount, 5) : 70) - swiss.roundsBelowMinimum * 25,
      requiredSystems: ['swiss', 'knockout'],
      phases: [
        createPhaseTemplate('SWISS', 1, { swissRounds: swiss.rounds }),
        createPhaseTemplate('KNOCKOUT', 2, { entrantCount: qualifiers }),
      ],
    });
  }

  if (systemsEnabled(['groups', 'swiss'], settings)) {
    recommendations.push({
      id: 'groups-swiss',
      label: `${group.groupCount} Gruppen → ${swiss.rounds} Runden Schweizer System`,
      description: 'Gruppenphase als Einstieg, anschließend Schweizer System statt einer K.-o.-Entscheidung.',
      estimatedMatches: group.matches + swiss.matches,
      score: playerCount >= 12 ? 78 : 58,
      requiredSystems: ['groups', 'swiss'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount }),
        createPhaseTemplate('SWISS', 2, { swissRounds: swiss.rounds }),
      ],
    });
  }

  if (systemsEnabled(['groups', 'swiss', 'knockout'], settings) && playerCount >= 12) {
    recommendations.push({
      id: 'groups-swiss-ko',
      label: `${group.groupCount} Gruppen → Schweizer System → ${qualifiers} Qualifizierte → K.-o.`,
      description: 'Mehrstufige Variante mit Gruppen, Schweizer Zwischenphase und abschließender K.-o.-Runde.',
      estimatedMatches: group.matches + swiss.matches + qualifiers - 1,
      score: 64,
      requiredSystems: ['groups', 'swiss', 'knockout'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount }),
        createPhaseTemplate('SWISS', 2, { swissRounds: swiss.rounds }),
        createPhaseTemplate('KNOCKOUT', 3, { entrantCount: qualifiers }),
      ],
    });
  }

  return recommendations.sort((a, b) => b.score - a.score || a.estimatedMatches - b.estimatedMatches);
}
