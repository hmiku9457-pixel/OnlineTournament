import type { SupportedFormatId } from '@/domain/tournamentCreation';

export interface RecommendationInput {
  playerCount: number;
  tableCount: number;
  minimumMatches: number;
}

export interface RecommendationSettings {
  enabledFormats?: Partial<Record<SupportedFormatId, boolean>>;
  maxGroups?: number;
  maxSwissRounds?: number;
  knockoutQualifierCount?: number;
}

export interface FormatRecommendation {
  id: SupportedFormatId;
  label: string;
  description: string;
  estimatedMatches: number;
  score: number;
}

function roundRobinMatches(players: number): number {
  return (players * (players - 1)) / 2;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(max, Math.max(min, candidate));
}

function isEnabled(formatId: SupportedFormatId, settings: RecommendationSettings): boolean {
  return settings.enabledFormats?.[formatId] !== false;
}

export function recommendTournamentFormats(
  input: RecommendationInput,
  settings: RecommendationSettings = {},
): FormatRecommendation[] {
  const { playerCount, tableCount, minimumMatches } = input;
  if (playerCount < 2) return [];

  const recommendations: FormatRecommendation[] = [];
  const fullRoundRobin = roundRobinMatches(playerCount);

  if (isEnabled('round-robin', settings)) {
    recommendations.push({
      id: 'round-robin',
      label: 'Jeder gegen jeden',
      description: 'Maximale Vergleichbarkeit, aber stark steigende Spielanzahl.',
      estimatedMatches: fullRoundRobin,
      score: playerCount <= 10 ? 90 : Math.max(10, 80 - playerCount * 3),
    });
  }

  if (isEnabled('groups-ko', settings)) {
    const preferredGroupSize = playerCount >= 20 ? 5 : 4;
    const naturalGroupCount = Math.max(2, Math.ceil(playerCount / preferredGroupSize));
    const maximumUsefulGroups = Math.max(2, Math.floor(playerCount / 2));
    const maxGroups = clampInteger(settings.maxGroups, naturalGroupCount, 2, maximumUsefulGroups);
    const groupCount = Math.min(naturalGroupCount, maxGroups);
    const baseSize = Math.floor(playerCount / groupCount);
    const remainder = playerCount % groupCount;
    let groupMatches = 0;
    for (let i = 0; i < groupCount; i += 1) {
      groupMatches += roundRobinMatches(baseSize + (i < remainder ? 1 : 0));
    }

    const defaultQualifiers = playerCount >= 16 ? 8 : 4;
    const qualifiers = clampInteger(settings.knockoutQualifierCount, defaultQualifiers, 2, playerCount);
    const knockoutMatches = qualifiers - 1;
    const averageGroupSize = playerCount / groupCount;
    const groupSizeFit = 100 - Math.abs(averageGroupSize - (minimumMatches + 1)) * 5;
    const groupTableBonus = Math.min(tableCount, groupCount) * 2;
    const largeFieldGroupPenalty = playerCount >= 20 ? 20 : playerCount >= 16 ? 10 : 0;

    recommendations.push({
      id: 'groups-ko',
      label: `${groupCount} Gruppen → ${qualifiers} Qualifizierte → K.-o.`,
      description: `Gruppen mit durchschnittlich ${averageGroupSize.toFixed(1).replace('.0', '')} Teilnehmern. Insgesamt ${qualifiers} bestplatzierte Teilnehmer erreichen die K.-o.-Phase.`,
      estimatedMatches: groupMatches + knockoutMatches,
      score: groupSizeFit + groupTableBonus - largeFieldGroupPenalty,
    });
  }

  if (isEnabled('swiss-ko', settings)) {
    const recommendedSwissRounds = Math.max(minimumMatches, Math.ceil(Math.log2(playerCount)));
    const swissRounds = clampInteger(settings.maxSwissRounds, recommendedSwissRounds, 1, recommendedSwissRounds);
    const swissMatches = Math.floor(playerCount / 2) * swissRounds;
    const defaultQualifiers = playerCount >= 16 ? 8 : 4;
    const qualifiers = clampInteger(settings.knockoutQualifierCount, defaultQualifiers, 2, playerCount);
    const roundsBelowMinimum = Math.max(0, minimumMatches - swissRounds);

    recommendations.push({
      id: 'swiss-ko',
      label: `${swissRounds} Runden Schweizer System → ${qualifiers} Qualifizierte → K.-o.`,
      description: `${swissRounds} Schweizer Runden mit anschließender K.-o.-Phase für ${qualifiers} Teilnehmer.${roundsBelowMinimum > 0 ? ` Die Rundengrenze liegt ${roundsBelowMinimum} unter den gewünschten Mindestspielen.` : ''}`,
      estimatedMatches: swissMatches + qualifiers - 1,
      score: (playerCount >= 16 ? 95 + Math.min(tableCount, 5) : 70) - roundsBelowMinimum * 25,
    });
  }

  if (isEnabled('single-ko', settings)) {
    recommendations.push({
      id: 'single-ko',
      label: 'Einfaches K.-o.',
      description: 'Sehr kompakt; ausgeschiedene Teilnehmer haben ohne Trostrunde nur wenige Spiele.',
      estimatedMatches: playerCount - 1,
      score: minimumMatches <= 1 ? 85 : 35,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score || a.estimatedMatches - b.estimatedMatches);
}
