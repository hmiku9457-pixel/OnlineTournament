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

/** Entfernt vermeidbare Wiederholungen, ohne die ursprüngliche Paarung bei bereits gültigem Plan zu verändern.
 *  Die Suche läuft nur als Fallback für Konfliktfälle und ist bewusst begrenzt. */
function avoidRepeatPairings(pairings: SwissNamePairing[], players: SwissScorePlayer[]): SwissNamePairing[] {
  const state = new Map(players.map((player) => [player.name, player]));
  const bye = pairings.find(([, opponent]) => opponent === 'Freilos');
  const matches = pairings.filter(([, opponent]) => opponent !== 'Freilos');
  const repeated = ([a, b]: SwissNamePairing) => state.get(a)?.opponents.has(b) ?? false;
  if (!matches.some(repeated)) return pairings;

  // Erst lokale Tauschversuche; damit bleibt die Score-Gruppenstruktur möglichst erhalten.
  const fixed = [...matches];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < fixed.length && !changed; i += 1) {
      if (!repeated(fixed[i])) continue;
      for (let j = 0; j < fixed.length && !changed; j += 1) {
        if (i === j) continue;
        const [a, b] = fixed[i];
        const [c, d] = fixed[j];
        const candidates: Array<[SwissNamePairing, SwissNamePairing]> = [
          [[a, c], [b, d]], [[a, d], [b, c]],
        ];
        for (const [first, second] of candidates) {
          if (repeated(first) || repeated(second)) continue;
          fixed[i] = first;
          fixed[j] = second;
          changed = true;
          break;
        }
      }
    }
  }
  if (!fixed.some(repeated)) return bye ? [...fixed, bye] : fixed;

  // Schwierige Konstellationen: begrenztes Backtracking, bevor tatsächlich eine
  // unvermeidbare Wiederholung zugelassen wird.
  const remaining = fixed.flatMap(([a, b]) => [a, b]);
  const solution: SwissNamePairing[] = [];
  let attempts = 0;
  function search(names: string[]): boolean {
    if (!names.length) return true;
    if (++attempts > 20000) return false;
    const a = names[0];
    const aWins = state.get(a)?.wins ?? 0;
    const choices = names.slice(1)
      .filter((b) => !state.get(a)?.opponents.has(b))
      .sort((b, c) => Math.abs(aWins - (state.get(b)?.wins ?? 0)) - Math.abs(aWins - (state.get(c)?.wins ?? 0)));
    for (const b of choices) {
      solution.push([a, b]);
      if (search(names.filter((name) => name !== a && name !== b))) return true;
      solution.pop();
    }
    return false;
  }
  return search(remaining) ? (bye ? [...solution, bye] : solution) : (bye ? [...fixed, bye] : fixed);
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

  return avoidRepeatPairings(pairings, players);
}
