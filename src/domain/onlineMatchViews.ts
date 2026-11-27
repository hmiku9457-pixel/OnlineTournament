export interface OnlineMatchView {
  sideA: string; sideB: string; phase: string; round: string;
  status: string; table: string; score: string;
  sets: Array<{ sideAScore: number; sideBScore: number }>;
}

export function orientOnlineScore(score: string, sideA: boolean): string {
  return sideA ? score : score.replace(/(\d+)\s*:\s*(\d+)/g, '$2:$1');
}

/** Only explicitly classifiable final scores are counted. A walkover or
 * a decision whose winner is not in the projection remains unclassified. */
export function onlinePlayerSummary(matches: readonly OnlineMatchView[], participant: string) {
  const own = matches.filter(m => m.sideA === participant || m.sideB === participant);
  const summary = { active: 0, waiting: 0, finished: 0, wins: 0, losses: 0, draws: 0, other: 0 };
  for (const match of own) {
    if (['LIVE', 'READY', 'CONFIRMATION'].includes(match.status)) summary.active++;
    if (match.status === 'WAITING') summary.waiting++;
    if (match.status !== 'FINISHED') continue;
    summary.finished++;
    const score = orientOnlineScore(match.score, match.sideA === participant);
    const numeric = /^(\d+)\s*:\s*(\d+)(?:\s+n\.V\.)?$/.exec(score);
    const penalties = /^\d+\s*:\s*\d+\s*\((\d+)\s*:\s*(\d+)\s+i\.E\.\)$/.exec(score);
    const values = penalties ?? numeric;
    if (!values) { summary.other++; continue; }
    const a = Number(values[1]), b = Number(values[2]);
    if (a > b) summary.wins++;
    else if (a < b) summary.losses++;
    else if (penalties) summary.other++;
    else summary.draws++;
  }
  // Published fixture order is not a guaranteed assignment sequence.
  return { ...summary, upcoming: own.filter(m => m.status === 'WAITING').slice(0, 3) };
}

export function publicHallAssignments(matches: readonly OnlineMatchView[], venueCount: number) {
  const groups = new Map<number, OnlineMatchView[]>();
  for (const match of matches) {
    if (!['LIVE', 'READY', 'CONFIRMATION'].includes(match.status)) continue;
    const parsed = /^Tisch ([1-9]\d*)$/.exec(match.table);
    if (!parsed) continue;
    const number = Number(parsed[1]);
    if (number > venueCount || !Number.isSafeInteger(number)) continue;
    groups.set(number, [...(groups.get(number) ?? []), match]);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([number, matches]) => ({ number, matches }));
}

export function onlinePage<T>(items: readonly T[], requested: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return { page, pages, items: items.slice(page * size, (page + 1) * size) };
}
