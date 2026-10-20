import {
  createPhaseTemplate,
  type CreationPhaseTemplate,
  type TournamentSystemId,
} from '@/domain/tournamentCreation';

export interface RecommendationInput {
  playerCount: number;
  tableCount: number;
  minimumMatches: number;
  matchDurationMinutes?: number;
  venueTurnoverMinutes?: number;
}

export interface RecommendationSettings {
  enabledSystems?: Partial<Record<TournamentSystemId, boolean>>;
  maxGroups?: number;
  maxSwissRounds?: number;
  knockoutQualifierCount?: number;
  maxRecommendedDurationMinutes?: number;
}

export interface FormatRecommendation {
  id: string;
  label: string;
  description: string;
  estimatedMatches: number;
  estimatedDurationMinutes: number;
  minimumGuaranteedMatches: number;
  score: number;
  requiredSystems: TournamentSystemId[];
  phases: CreationPhaseTemplate[];
}

const MINUTES_PER_SET = 15;
export const DEFAULT_MAX_RECOMMENDED_DURATION_MINUTES = 210;

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
  const targetGroupSize = Math.max(3, minimumMatches + 1);
  const maximumUsefulGroups = Math.max(2, Math.floor(playerCount / 2));
  const maximumGroupsForMinimum = Math.max(1, Math.floor(playerCount / targetGroupSize));
  const naturalGroupCount = Math.max(2, Math.min(maximumUsefulGroups, maximumGroupsForMinimum));
  const maxGroups = clampInteger(maxGroupsSetting, naturalGroupCount, 2, maximumUsefulGroups);
  const groupCount = Math.min(naturalGroupCount, maxGroups);
  const baseSize = Math.floor(playerCount / groupCount);
  const remainder = playerCount % groupCount;
  let matches = 0;
  for (let i = 0; i < groupCount; i += 1) {
    matches += roundRobinMatches(baseSize + (i < remainder ? 1 : 0));
  }

  const averageGroupSize = playerCount / groupCount;
  const minimumGroupSize = baseSize;
  const minimumGuaranteedMatches = Math.max(0, minimumGroupSize - 1);
  const fitScore = 100 - Math.abs(averageGroupSize - targetGroupSize) * 5;
  return {
    groupCount,
    matches,
    averageGroupSize,
    minimumGroupSize,
    minimumGuaranteedMatches,
    fitScore,
  };
}

function calculateSwissPlan(playerCount: number, minimumMatches: number, maxSwissRoundsSetting?: number) {
  const recommendedRounds = Math.max(minimumMatches, Math.ceil(Math.log2(playerCount)));
  const rounds = clampInteger(maxSwissRoundsSetting, recommendedRounds, 1, recommendedRounds);
  const matches = Math.floor(playerCount / 2) * rounds;
  const roundsBelowMinimum = Math.max(0, minimumMatches - rounds);
  return { rounds, matches, roundsBelowMinimum };
}

function distributedGroupMatches(playerCount: number, groupCount: number): number {
  const groups = Math.max(1, Math.min(groupCount, Math.max(1, Math.floor(playerCount / 2))));
  const baseSize = Math.floor(playerCount / groups);
  const remainder = playerCount % groups;
  let matches = 0;
  for (let index = 0; index < groups; index += 1) {
    matches += roundRobinMatches(baseSize + (index < remainder ? 1 : 0));
  }
  return matches;
}

function waveDuration(matches: number, tableCount: number): number {
  if (matches <= 0) return 0;
  return Math.ceil(matches / Math.max(1, tableCount)) * MINUTES_PER_SET;
}

function swissDuration(entrantCount: number, rounds: number, tableCount: number): number {
  const matchesPerRound = Math.floor(entrantCount / 2);
  return Math.max(1, rounds) * waveDuration(matchesPerRound, tableCount);
}

function knockoutDuration(entrantCount: number, tableCount: number): number {
  const entrants = Math.max(2, Math.trunc(entrantCount));
  const bracketSize = 2 ** Math.ceil(Math.log2(entrants));
  const firstRoundMatches = entrants - bracketSize / 2;
  let duration = firstRoundMatches > 0 ? waveDuration(firstRoundMatches, tableCount) : 0;
  let remainingPlayers = bracketSize / 2;

  while (remainingPlayers >= 2) {
    duration += waveDuration(remainingPlayers / 2, tableCount);
    remainingPlayers /= 2;
  }

  return duration;
}

function estimateDurationMinutes(
  phases: CreationPhaseTemplate[],
  playerCount: number,
  tableCount: number,
): number {
  let total = 0;

  for (const phase of phases) {
    const entrants = Math.max(2, Math.min(playerCount, phase.entrantCount ?? playerCount));
    switch (phase.type) {
      case 'ROUND_ROBIN':
        total += waveDuration(roundRobinMatches(entrants), tableCount);
        break;
      case 'GROUPS':
        total += waveDuration(distributedGroupMatches(entrants, phase.groupCount ?? 2), tableCount);
        break;
      case 'SWISS':
        total += swissDuration(entrants, phase.swissRounds ?? 1, tableCount);
        break;
      case 'KNOCKOUT':
        total += knockoutDuration(entrants, tableCount);
        break;
      case 'DOUBLE_ELIMINATION': {
        const matches = Math.max(1, entrants * 2 - 2);
        const baseWaves = Math.ceil(matches / Math.max(1, tableCount));
        total += Math.ceil(baseWaves * 1.25) * MINUTES_PER_SET;
        break;
      }
      case 'PLACEMENT':
        total += waveDuration(Math.floor(entrants / 2), tableCount);
        break;
    }
  }

  return total;
}

function totalEstimatedMatches(phases: CreationPhaseTemplate[], playerCount: number): number {
  let total = 0;
  for (const phase of phases) {
    const entrants = Math.max(2, Math.min(playerCount, phase.entrantCount ?? playerCount));
    switch (phase.type) {
      case 'ROUND_ROBIN':
        total += roundRobinMatches(entrants);
        break;
      case 'GROUPS':
        total += distributedGroupMatches(entrants, phase.groupCount ?? 2);
        break;
      case 'SWISS':
        total += Math.floor(entrants / 2) * Math.max(1, phase.swissRounds ?? 1);
        break;
      case 'KNOCKOUT':
        total += entrants - 1;
        break;
      case 'DOUBLE_ELIMINATION':
        total += Math.max(1, entrants * 2 - 2);
        break;
      case 'PLACEMENT':
        total += Math.floor(entrants / 2);
        break;
    }
  }
  return total;
}

export function recommendTournamentFormats(
  input: RecommendationInput,
  settings: RecommendationSettings = {},
): FormatRecommendation[] {
  const { playerCount, tableCount, minimumMatches } = input;
  if (playerCount < 2 || tableCount < 1) return [];

  const recommendations: FormatRecommendation[] = [];
  const maxDuration = settings.maxRecommendedDurationMinutes ?? DEFAULT_MAX_RECOMMENDED_DURATION_MINUTES;
  const group = calculateGroupPlan(playerCount, minimumMatches, settings.maxGroups);
  const swiss = calculateSwissPlan(playerCount, minimumMatches, settings.maxSwissRounds);
  const defaultQualifiers = playerCount >= 16 ? 8 : 4;
  const qualifiers = clampInteger(settings.knockoutQualifierCount, defaultQualifiers, 2, playerCount);

  function addRecommendation(candidate: Omit<FormatRecommendation, 'estimatedDurationMinutes' | 'estimatedMatches'>) {
    const baselineDuration = estimateDurationMinutes(candidate.phases, playerCount, tableCount);
    const estimatedDurationMinutes = Math.round(baselineDuration * (Math.max(1, input.matchDurationMinutes ?? 15) + Math.max(0, input.venueTurnoverMinutes ?? 0)) / MINUTES_PER_SET);
    const estimatedMatches = totalEstimatedMatches(candidate.phases, playerCount);

    if (estimatedDurationMinutes > maxDuration) return;

    const minimumMatchShortfall = Math.max(0, minimumMatches - candidate.minimumGuaranteedMatches);
    recommendations.push({
      ...candidate,
      score: candidate.score - minimumMatchShortfall * 20,
      estimatedDurationMinutes,
      estimatedMatches,
    });
  }

  if (systemsEnabled(['round-robin'], settings)) {
    addRecommendation({
      id: 'round-robin',
      label: 'Jeder gegen jeden',
      description: 'Alle Teilnehmer spielen gegeneinander. Maximale Vergleichbarkeit, aber stark steigende Spielanzahl.',
      minimumGuaranteedMatches: playerCount - 1,
      score: playerCount <= 10 ? 90 : Math.max(10, 80 - playerCount * 3),
      requiredSystems: ['round-robin'],
      phases: [createPhaseTemplate('ROUND_ROBIN', 1, { entrantCount: playerCount })],
    });
  }

  if (systemsEnabled(['groups'], settings)) {
    addRecommendation({
      id: 'groups',
      label: `${group.groupCount} Gruppen`,
      description: `Reine Gruppenphase mit durchschnittlich ${group.averageGroupSize.toFixed(1).replace('.0', '')} Teilnehmern je Gruppe.`,
      minimumGuaranteedMatches: group.minimumGuaranteedMatches,
      score: group.fitScore - (playerCount >= 20 ? 12 : 0),
      requiredSystems: ['groups'],
      phases: [createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount, entrantCount: playerCount })],
    });
  }

  if (systemsEnabled(['swiss'], settings)) {
    addRecommendation({
      id: 'swiss',
      label: `${swiss.rounds} Runden Schweizer System`,
      description: `Alle Teilnehmer bleiben über ${swiss.rounds} Runden im Turnier; Paarungen richten sich nach dem bisherigen Turnierverlauf.`,
      minimumGuaranteedMatches: swiss.rounds,
      score: (playerCount >= 12 ? 86 : 62) - swiss.roundsBelowMinimum * 25,
      requiredSystems: ['swiss'],
      phases: [createPhaseTemplate('SWISS', 1, { swissRounds: swiss.rounds, entrantCount: playerCount })],
    });
  }

  if (minimumMatches <= 1 && systemsEnabled(['knockout'], settings)) {
    addRecommendation({
      id: 'single-ko',
      label: 'Einfaches K.-o.',
      description: 'Sehr kompakt; nach einer Niederlage scheidet ein Teilnehmer aus.',
      minimumGuaranteedMatches: 1,
      score: minimumMatches <= 1 ? 85 : 35,
      requiredSystems: ['knockout'],
      phases: [createPhaseTemplate('KNOCKOUT', 1, { entrantCount: playerCount })],
    });
  }

  if (systemsEnabled(['groups', 'knockout'], settings)) {
    const groupTableBonus = Math.min(tableCount, group.groupCount) * 2;
    const largeFieldPenalty = playerCount >= 20 ? 20 : playerCount >= 16 ? 10 : 0;
    addRecommendation({
      id: 'groups-ko',
      label: `${group.groupCount} Gruppen → ${qualifiers} Qualifizierte → K.-o.`,
      description: `Gruppenphase mit anschließender K.-o.-Phase für ${qualifiers} bestplatzierte Teilnehmer.`,
      minimumGuaranteedMatches: group.minimumGuaranteedMatches,
      score: group.fitScore + groupTableBonus - largeFieldPenalty,
      requiredSystems: ['groups', 'knockout'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount, entrantCount: playerCount }),
        createPhaseTemplate('KNOCKOUT', 2, { entrantCount: qualifiers }),
      ],
    });
  }

  if (systemsEnabled(['swiss', 'knockout'], settings)) {
    addRecommendation({
      id: 'swiss-ko',
      label: `${swiss.rounds} Runden Schweizer System → ${qualifiers} Qualifizierte → K.-o.`,
      description: `${swiss.rounds} Schweizer Runden mit anschließender K.-o.-Phase für ${qualifiers} bestplatzierte Teilnehmer.`,
      minimumGuaranteedMatches: swiss.rounds,
      score: (playerCount >= 16 ? 95 + Math.min(tableCount, 5) : 70) - swiss.roundsBelowMinimum * 25,
      requiredSystems: ['swiss', 'knockout'],
      phases: [
        createPhaseTemplate('SWISS', 1, { swissRounds: swiss.rounds, entrantCount: playerCount }),
        createPhaseTemplate('KNOCKOUT', 2, { entrantCount: qualifiers }),
      ],
    });
  }

  if (systemsEnabled(['groups', 'swiss'], settings)) {
    addRecommendation({
      id: 'groups-swiss',
      label: `${group.groupCount} Gruppen → ${swiss.rounds} Runden Schweizer System`,
      description: 'Gruppenphase als Einstieg, anschließend Schweizer System statt einer K.-o.-Entscheidung.',
      minimumGuaranteedMatches: group.minimumGuaranteedMatches + swiss.rounds,
      score: playerCount >= 12 ? 78 : 58,
      requiredSystems: ['groups', 'swiss'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount, entrantCount: playerCount }),
        createPhaseTemplate('SWISS', 2, { swissRounds: swiss.rounds, entrantCount: playerCount }),
      ],
    });
  }

  if (systemsEnabled(['groups', 'swiss', 'knockout'], settings) && playerCount >= 12) {
    addRecommendation({
      id: 'groups-swiss-ko',
      label: `${group.groupCount} Gruppen → Schweizer System → ${qualifiers} Qualifizierte → K.-o.`,
      description: 'Mehrstufige Variante mit Gruppen, Schweizer Zwischenphase und abschließender K.-o.-Runde.',
      minimumGuaranteedMatches: group.minimumGuaranteedMatches + swiss.rounds,
      score: 64,
      requiredSystems: ['groups', 'swiss', 'knockout'],
      phases: [
        createPhaseTemplate('GROUPS', 1, { groupCount: group.groupCount, entrantCount: playerCount }),
        createPhaseTemplate('SWISS', 2, { swissRounds: swiss.rounds, entrantCount: playerCount }),
        createPhaseTemplate('KNOCKOUT', 3, { entrantCount: qualifiers }),
      ],
    });
  }

  return recommendations.sort((a, b) => b.score - a.score || a.estimatedDurationMinutes - b.estimatedDurationMinutes);
}
