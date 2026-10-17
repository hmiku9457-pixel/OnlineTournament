export interface SwissScorePlayer {
  name: string;
  wins: number;
  losses: number;
  byes: number;
  order: number;
  opponents: ReadonlySet<string>;
}

export type SwissNamePairing = [string, string];

function pairBucket(players: string[], state: Map<string, SwissScorePlayer>) {
  const remaining = [...players];
  const pairings: SwissNamePairing[] = [];

  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    const aState = state.get(a)!;
    let opponentIndex = remaining.findIndex((candidate) => !aState.opponents.has(candidate));
    if (opponentIndex < 0) opponentIndex = 0;
    const b = remaining.splice(opponentIndex, 1)[0];
    pairings.push([a, b]);
  }

  return { pairings, leftover: remaining[0] };
}

export function generateScoreGroupedSwissPairings(players: SwissScorePlayer[]): SwissNamePairing[] {
  const state = new Map(players.map((player) => [player.name, player]));
  const sorted = [...players].sort((a, b) => (
    b.wins - a.wins
    || a.losses - b.losses
    || a.order - b.order
  ));

  const groups = new Map<number, string[]>();
  sorted.forEach((player) => {
    const bucket = groups.get(player.wins) ?? [];
    bucket.push(player.name);
    groups.set(player.wins, bucket);
  });

  const pairings: SwissNamePairing[] = [];
  let carry: string | undefined;
  const scores = [...groups.keys()].sort((a, b) => b - a);

  scores.forEach((score, scoreIndex) => {
    const bucket = [...(groups.get(score) ?? [])];
    if (carry) bucket.unshift(carry);
    carry = undefined;

    const isLastScoreGroup = scoreIndex === scores.length - 1;
    if (bucket.length % 2 === 1 && !isLastScoreGroup) carry = bucket.pop();

    const paired = pairBucket(bucket, state);
    pairings.push(...paired.pairings);
    if (paired.leftover) carry = paired.leftover;
  });

  if (carry) {
    const carryState = state.get(carry)!;
    if (carryState.byes === 0) {
      pairings.push([carry, 'Freilos']);
    } else {
      const swapIndex = pairings.findIndex(([, b]) => b !== 'Freilos' && state.get(b)?.byes === 0);
      if (swapIndex >= 0) {
        const [a, b] = pairings[swapIndex];
        pairings[swapIndex] = [a, carry];
        pairings.push([b, 'Freilos']);
      } else {
        pairings.push([carry, 'Freilos']);
      }
    }
  }

  return pairings;
}
