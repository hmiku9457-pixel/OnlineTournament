export interface RecommendationInput {
  playerCount: number;
  tableCount: number;
  minimumMatches: number;
}

export interface FormatRecommendation {
  id: string;
  label: string;
  description: string;
  estimatedMatches: number;
  score: number;
}

function roundRobinMatches(players: number): number {
  return (players * (players - 1)) / 2;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function recommendTournamentFormats(input: RecommendationInput): FormatRecommendation[] {
  const { playerCount, tableCount, minimumMatches } = input;
  if (playerCount < 2) return [];

  const recommendations: FormatRecommendation[] = [];
  const fullRoundRobin = roundRobinMatches(playerCount);
  recommendations.push({
    id: 'round-robin',
    label: 'Jeder gegen jeden',
    description: 'Maximale Vergleichbarkeit, aber stark steigende Spielanzahl.',
    estimatedMatches: fullRoundRobin,
    score: playerCount <= 10 ? 90 : Math.max(10, 80 - playerCount * 3),
  });

  const preferredGroupSize = playerCount >= 20 ? 5 : 4;
  const groupCount = Math.ceil(playerCount / preferredGroupSize);
  const baseSize = Math.floor(playerCount / groupCount);
  const remainder = playerCount % groupCount;
  let groupMatches = 0;
  for (let i = 0; i < groupCount; i += 1) {
    groupMatches += roundRobinMatches(baseSize + (i < remainder ? 1 : 0));
  }
  const qualifiers = Math.min(nextPowerOfTwo(Math.max(4, groupCount * 2)), playerCount);
  const knockoutMatches = qualifiers - 1;
  recommendations.push({
    id: 'groups-ko',
    label: `${groupCount} Gruppen → Top-Spieler → K.-o.`,
    description: `Gruppen à etwa ${preferredGroupSize} Spieler mit anschließender K.-o.-Phase.`,
    estimatedMatches: groupMatches + knockoutMatches,
    score: 100 - Math.abs(preferredGroupSize - (minimumMatches + 1)) * 5 + Math.min(tableCount, groupCount) * 2,
  });

  const swissRounds = Math.max(minimumMatches, Math.ceil(Math.log2(playerCount)));
  const swissMatches = Math.floor(playerCount / 2) * swissRounds;
  const topN = playerCount >= 16 ? 8 : 4;
  recommendations.push({
    id: 'swiss-ko',
    label: `${swissRounds} Runden Schweizer System → Top ${topN} K.-o.`,
    description: 'Viele relevante Partien ohne vollständige Jeder-gegen-jeden-Runde; ideal für größere Felder.',
    estimatedMatches: swissMatches + topN - 1,
    score: playerCount >= 16 ? 95 + Math.min(tableCount, 5) : 70,
  });

  recommendations.push({
    id: 'single-ko',
    label: 'Einfaches K.-o.',
    description: 'Sehr kompakt; ausgeschiedene Spieler haben ohne Trostrunde nur wenige Spiele.',
    estimatedMatches: playerCount - 1,
    score: minimumMatches <= 1 ? 85 : 35,
  });

  return recommendations.sort((a, b) => b.score - a.score || a.estimatedMatches - b.estimatedMatches);
}
