import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { resultScore, resultWinnerSide, type ExtraTimeProgress, type ScoreDecision } from '@/domain/sportScoring';
import { rankStandings } from '@/domain/standingRankings';
import { getStageEntrants } from '@/services/mockPhaseLifecycle';
import { getGroupAssignments, getSwissOrder } from '@/services/mockDrawStore';
import {
  getMockStageBaseMatches,
  getMockStageMatches,
  getMockStoredResult,
  applyResolvedSwissCutoffOrder, getTotalSwissRoundCount,
} from '@/services/mockRuntime';

export interface MockStanding {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  buchholz: number;
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
  decision?: ScoreDecision;
  extraTimeProgress?: ExtraTimeProgress;
  live?: boolean;
}

export interface MockBracketRound {
  label: string;
  matches: MockBracketMatch[];
}

function computeStandings(members: string[], matches: ReturnType<typeof getMockStageMatches>, sport: string, automaticWins: string[] = [], swiss = false, plannedRounds?: number): MockStanding[] {
  const rankingMatches = matches.map((match) => {
    const result = getMockStoredResult(match.id);
    return {
      sideA: match.sideA, sideB: match.sideB, status: match.status,
      sets: match.sets, forcedWinner: result?.forcedWinner, decisionSide: result?.decisionSide,
    };
  });
  return rankStandings(members, rankingMatches, sport, automaticWins, swiss, plannedRounds)
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      points: 3 * row.wins + row.draws,
      buchholz: row.buchholz,
      sets: `${row.setsWon}:${row.setsLost}`,
      setDifference: row.setsWon - row.setsLost,
      balls: `${row.ballsWon}:${row.ballsLost}`,
      ballDifference: row.ballsWon - row.ballsLost,
    }));
}

/** The regular all-player round-robin uses the same sport-specific standings
 * calculation as a group, without Buchholz. */
export function buildRoundRobinStandings(tournament: DemoTournament, stage: TournamentStage): MockStanding[] {
  return computeStandings(getStageEntrants(tournament, stage), getMockStageMatches(tournament, stage), tournament.sport);
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
    const standings = computeStandings(members, groupMatches, tournament.sport);
    const matches: MockGroupMatch[] = groupMatches.map((match) => {
      const status: MockGroupMatch['status'] = match.status === 'FINISHED' ? 'played' : match.status === 'LIVE' ? 'live' : 'open';
      return {
        id: match.id,
        sideA: match.sideA,
        sideB: match.sideB,
        score: match.status === 'FINISHED' ? match.score.replace(/\s/g, '') : match.status === 'LIVE' ? match.sets?.length ? resultScore(tournament.sport, match.sets) : '0:0' : '–',
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
      score = resultScore(tournament.sport, stored.sets);
      if (stored.status === 'FINISHED') {
        const winningSide = resultWinnerSide(tournament.sport, stored.sets, stored.decisionSide);
        winner = winningSide === 'A' ? match.sideA : winningSide === 'B' ? match.sideB : undefined;
      }
    } else if (match.autoWinner) {
      score = 'Freilos';
    }
    const list = byRound.get(match.round) ?? [];
    list.push({ id: match.id, sideA: match.sideA, sideB: match.sideB, score, winner, autoWinner: match.autoWinner, sets: stored?.sets, decision: stored?.decision, extraTimeProgress: stored?.status === 'FINISHED' ? undefined : stored?.extraTimeProgress, live: stored?.status === 'LIVE' || stored?.status === 'CONFIRMATION' });
    byRound.set(match.round, list);
  });

  return [...byRound.entries()].map(([label, roundMatches]) => ({ label, matches: roundMatches }));
}

/** Namen der Spieler, die in dieser Schweizer Phase einen Sieg durch Freilos erhalten haben.
 *  Ein Name kann mehrfach vorkommen, wenn ein Spieler mehr als ein Freilos erhalten hat. */
export function getSwissByeWinners(tournament: DemoTournament, stage: TournamentStage): string[] {
  return getMockStageBaseMatches(tournament, stage)
    .filter((match) => match.autoWinner && match.sideB === 'Freilos')
    .map((match) => match.autoWinner!);
}

/** Schweizer Siege ohne tatsächlichen Spielgewinn: Freilos oder kampflose Wertung. */
export function getSwissUnplayedWinWinners(tournament: DemoTournament, stage: TournamentStage): string[] {
  const byes = getSwissByeWinners(tournament, stage);
  const forfeits = getMockStageMatches(tournament, stage).flatMap((match) => {
    if (match.status !== 'FINISHED') return [];
    const winner = getMockStoredResult(match.id)?.forcedWinner;
    return winner === match.sideA || winner === match.sideB ? [winner] : [];
  });
  return [...byes, ...forfeits];
}

export function buildSwissStandings(tournament: DemoTournament, stage: TournamentStage): MockStanding[] {
  const order = getSwissOrder(tournament, stage);
  return applyResolvedSwissCutoffOrder(tournament, stage, computeStandings(order, getMockStageMatches(tournament, stage), tournament.sport,
    getSwissByeWinners(tournament, stage), true, getTotalSwissRoundCount(tournament, stage)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
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
    const standings = computeStandings(getStageEntrants(tournament, previous), getMockStageMatches(tournament, previous), tournament.sport);
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
