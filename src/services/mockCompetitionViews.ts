import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getGroupAssignments } from '@/services/mockDrawStore';
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
}

export interface MockGroupMatch {
  id: string;
  sideA: string;
  sideB: string;
  score: string;
  status: 'played' | 'live' | 'open';
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

function computeStandings(members: string[], matches: ReturnType<typeof getMockStageMatches>): MockStanding[] {
  const rows = new Map(members.map((name) => [name, { rank: 0, name, played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0 }]));

  matches.forEach((match) => {
    if (match.status !== 'FINISHED' || !match.sets?.length) return;
    const a = rows.get(match.sideA);
    const b = rows.get(match.sideB);
    if (!a || !b) return;
    const { winsA, winsB } = resultStats(match.sets);
    a.played += 1;
    b.played += 1;
    a.setsWon += winsA;
    a.setsLost += winsB;
    b.setsWon += winsB;
    b.setsLost += winsA;
    if (winsA > winsB) {
      a.wins += 1;
      b.losses += 1;
    } else if (winsB > winsA) {
      b.wins += 1;
      a.losses += 1;
    }
  });

  return [...rows.values()]
    .sort((a, b) => (
      b.wins - a.wins
      || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
      || b.setsWon - a.setsWon
      || a.name.localeCompare(b.name, 'de')
    ))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      sets: `${row.setsWon}:${row.setsLost}`,
    }));
}

export function buildMockGroups(tournament: DemoTournament, stage: TournamentStage): MockGroupView[] {
  const names = getRuntimeParticipantNames(tournament);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const entrantCount = Math.max(groupCount, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrantCount);
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
    const matches: MockGroupMatch[] = groupMatches.map((match) => ({
      id: match.id,
      sideA: match.sideA,
      sideB: match.sideB,
      score: match.status === 'FINISHED' ? match.score.replace(/\s/g, '') : match.status === 'LIVE' ? match.score : '–',
      status: match.status === 'FINISHED' ? 'played' : match.status === 'LIVE' ? 'live' : 'open',
    }));
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
    if (stored?.sets.length) {
      score = scoreFromSets(stored.sets);
      if (stored.status === 'FINISHED') {
        const { winsA, winsB } = resultStats(stored.sets);
        winner = winsA > winsB ? match.sideA : winsB > winsA ? match.sideB : undefined;
      }
    } else if (match.autoWinner) {
      score = 'Freilos';
    }
    const list = byRound.get(match.round) ?? [];
    list.push({ id: match.id, sideA: match.sideA, sideB: match.sideB, score, winner, autoWinner: match.autoWinner });
    byRound.set(match.round, list);
  });

  return [...byRound.entries()].map(([label, roundMatches]) => ({ label, matches: roundMatches }));
}

export function buildSwissStandings(tournament: DemoTournament, stage: TournamentStage): MockStanding[] {
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  return computeStandings(names.slice(0, entrants), getMockStageMatches(tournament, stage));
}
