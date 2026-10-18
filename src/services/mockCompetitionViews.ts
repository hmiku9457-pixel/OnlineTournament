import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { getStageEntrants } from '@/services/mockPhaseLifecycle';
import { getGroupAssignments, getSwissOrder } from '@/services/mockDrawStore';
import {
  getMockStageBaseMatches,
  getMockStageMatches,
  getMockStoredResult,
} from '@/services/mockRuntime';

export interface MockStanding {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  sets: string;
  setDifference: number;
  balls: string;
  ballDifference: number;
}

export interface MockGroupMatch {
  id: string;
  sideA: string;
  sideB: string;
  score: string;
  status: 'played' | 'live' | 'open';
  matchDay?: number;
  sets?: MatchSet[];
}

export interface MockGroupView {
  id: string;
  label: string;
  standings: MockStanding[];
  matches: MockGroupMatch[];
}

export interface MockBracketMatch {
  id: string;
  sideA: string;
  sideB: string;
  score?: string;
  winner?: string;
  autoWinner?: string;
  sets?: MatchSet[];
}

export interface MockBracketRound {
  label: string;
  matches: MockBracketMatch[];
}

function resultStats(sets: MatchSet[]) {
  let winsA = 0;
  let winsB = 0;
  let setsA = 0;
  let setsB = 0;
  sets.forEach((set) => {
    if (set.sideAScore > set.sideBScore) winsA += 1;
    else if (set.sideBScore > set.sideAScore) winsB += 1;
    setsA += set.sideAScore > set.sideBScore ? 1 : 0;
    setsB += set.sideBScore > set.sideAScore ? 1 : 0;
  });
  return { winsA, winsB, setsA, setsB };
}

function scoreFromSets(sets: MatchSet[]) {
  const { winsA, winsB } = resultStats(sets);
  return `${winsA}:${winsB}`;
}

function computeStandings(members: string[], matches: ReturnType<typeof getMockStageMatches>, tieOrder?: string[], automaticWins: string[] = []): MockStanding[] {
  const rows = new Map(members.map((name) => [name, {
    rank: 0,
    name,
    played: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    ballsWon: 0,
    ballsLost: 0,
  }]));

  matches.forEach((match) => {
    if (match.status !== 'FINISHED') return;
    const forceWinner = getMockStoredResult(match.id)?.forcedWinner;
    const sets = match.sets ?? [];
    if (!sets.length && !forceWinner) return;
    const a = rows.get(match.sideA);
    const b = rows.get(match.sideB);
    if (!a || !b) return;
    const { winsA, winsB } = resultStats(sets);
    a.played += 1;
    b.played += 1;
    a.setsWon += winsA;
    a.setsLost += winsB;
    b.setsWon += winsB;
    b.setsLost += winsA;
    sets.forEach((set) => {
      a.ballsWon += set.sideAScore;
      a.ballsLost += set.sideBScore;
      b.ballsWon += set.sideBScore;
      b.ballsLost += set.sideAScore;
    });
    if (forceWinner === 'Freilos') {
      // Beide Teilnehmer zurückgezogen: niemand bekommt einen Sieg.
      a.losses += 1;
      b.losses += 1;
    } else if (forceWinner === match.sideA || (!forceWinner && winsA > winsB)) {
      a.wins += 1;
      b.losses += 1;
    } else if (forceWinner === match.sideB || (!forceWinner && winsB > winsA)) {
      b.wins += 1;
      a.losses += 1;
    }
  });

  automaticWins.forEach((name) => {
    const row = rows.get(name);
    if (!row) return;
    row.played += 1;
    row.wins += 1;
  });

  const orderIndex = new Map((tieOrder ?? members).map((name, index) => [name, index]));

  return [...rows.values()]
    .sort((a, b) => (
      b.wins - a.wins
      || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
      || b.setsWon - a.setsWon
      || (b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost)
      || b.ballsWon - a.ballsWon
      || (orderIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name, 'de')
    ))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      sets: `${row.setsWon}:${row.setsLost}`,
      setDifference: row.setsWon - row.setsLost,
      balls: `${row.ballsWon}:${row.ballsLost}`,
      ballDifference: row.ballsWon - row.ballsLost,
    }));
}

export function buildMockGroups(tournament: DemoTournament, stage: TournamentStage): MockGroupView[] {
  const participants = getStageEntrants(tournament, stage);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const assignments = getGroupAssignments(tournament, stage);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  participants.forEach((name, index) => {
    const groupIndex = assignments[name] ?? index % groupCount;
    groups[Math.max(0, Math.min(groupCount - 1, groupIndex))].push(name);
  });
  const stageMatches = getMockStageMatches(tournament, stage);

  return groups.map((members, groupIndex) => {
    const label = `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
    const groupMatches = stageMatches.filter((match) => match.round === label);
    const standings = computeStandings(members, groupMatches);
    const matches: MockGroupMatch[] = groupMatches.map((match) => {
      const status: MockGroupMatch['status'] = match.status === 'FINISHED' ? 'played' : match.status === 'LIVE' ? 'live' : 'open';
      return {
        id: match.id,
        sideA: match.sideA,
        sideB: match.sideB,
        score: match.status === 'FINISHED' ? match.score.replace(/\s/g, '') : match.status === 'LIVE' ? match.score : '–',
        status,
        matchDay: match.matchDay,
        sets: match.sets,
      };
    }).sort((a, b) => (a.matchDay ?? 0) - (b.matchDay ?? 0) || a.id.localeCompare(b.id));
    return { id: `${stage.id}-group-${groupIndex + 1}`, label, standings, matches };
  });
}

export function buildMockBracket(tournament: DemoTournament, stage: TournamentStage): MockBracketRound[] {
  const matches = getMockStageBaseMatches(tournament, stage);
  const byRound = new Map<string, MockBracketMatch[]>();

  matches.forEach((match) => {
    const stored = getMockStoredResult(match.id);
    let winner = match.autoWinner;
    let score: string | undefined;
    if (stored?.thirdPlaceSkipped) {
      score = 'Beide Platz 3';
    } else if (stored?.forcedWinner) {
      winner = stored.forcedWinner;
      score = 'W.O.';
    } else if (stored?.sets.length) {
      score = scoreFromSets(stored.sets);
      if (stored.status === 'FINISHED') {
        const { winsA, winsB } = resultStats(stored.sets);
        winner = winsA > winsB ? match.sideA : winsB > winsA ? match.sideB : undefined;
      }
    } else if (match.autoWinner) {
      score = 'Freilos';
    }
    const list = byRound.get(match.round) ?? [];
    list.push({ id: match.id, sideA: match.sideA, sideB: match.sideB, score, winner, autoWinner: match.autoWinner, sets: stored?.sets });
    byRound.set(match.round, list);
  });

  return [...byRound.entries()].map(([label, roundMatches]) => ({ label, matches: roundMatches }));
}

export function buildSwissStandings(tournament: DemoTournament, stage: TournamentStage): MockStanding[] {
  const order = getSwissOrder(tournament, stage);
  const automaticWins = getMockStageBaseMatches(tournament, stage).filter((match) => match.autoWinner && match.sideB === 'Freilos').map((match) => match.autoWinner!);
  return computeStandings(order, getMockStageMatches(tournament, stage), order, automaticWins);
}


export function getPreviousStageFinishLabels(tournament: DemoTournament, stage: TournamentStage) {
  const stageIndex = tournament.stages.findIndex((item) => item.id === stage.id);
  if (stageIndex <= 0) return {} as Record<string, string>;
  const previous = tournament.stages[stageIndex - 1];
  const labels: Record<string, string> = {};

  if (previous.type === 'GROUPS') {
    buildMockGroups(tournament, previous).forEach((group) => {
      group.standings.forEach((row) => { labels[row.name] = `${group.label} - ${row.rank}.`; });
    });
    return labels;
  }

  if (previous.type === 'SWISS') {
    buildSwissStandings(tournament, previous).forEach((row) => { labels[row.name] = `Platz ${row.rank}`; });
    return labels;
  }

  if (previous.type === 'ROUND_ROBIN') {
    const standings = computeStandings(getStageEntrants(tournament, previous), getMockStageMatches(tournament, previous));
    standings.forEach((row) => { labels[row.name] = `Platz ${row.rank}`; });
    return labels;
  }

  if (previous.type === 'KNOCKOUT' || previous.type === 'DOUBLE_ELIMINATION' || previous.type === 'PLACEMENT') {
    const rounds = buildMockBracket(tournament, previous);
    const final = rounds[rounds.length - 1]?.matches[0];
    if (final?.winner) labels[final.winner] = 'Sieger';
    if (final) {
      const finalist = final.sideA === final.winner ? final.sideB : final.sideA;
      if (finalist && finalist !== 'TBD' && finalist !== 'Freilos') labels[finalist] = 'Finalist';
    }
    const semifinal = rounds.find((round) => round.label === 'Halbfinale');
    semifinal?.matches.forEach((match) => {
      [match.sideA, match.sideB].forEach((name) => {
        if (name !== 'TBD' && name !== 'Freilos' && !labels[name]) labels[name] = 'Halbfinale';
      });
    });
  }

  return labels;
}
