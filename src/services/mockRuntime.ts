import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { generateScoreGroupedSwissPairings, type SwissScorePlayer } from '@/engine/swissScoreGroups';
import { getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeStage, getActiveStage, getStageEntrants, isStageCompleted, isStageStarted, setStageEntrants } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getBracketSlots, getGroupAssignments, getSwissOrder } from '@/services/mockDrawStore';

export { getRuntimeParticipantNames } from '@/services/mockParticipants';

export type MockMatchState = 'LIVE' | 'READY' | 'WAITING' | 'CONFIRMATION' | 'FINISHED';

export interface MockRuntimeMatch {
  id: string;
  table: string;
  sideA: string;
  sideB: string;
  score: string;
  status: MockMatchState;
  phase: string;
  stageId: string;
  round: string;
  matchDay?: number;
  bestOf: number;
  pauseA: number;
  pauseB: number;
  sets?: MatchSet[];
  note?: string;
}

interface StoredMatchResult {
  matchId: string;
  sets: MatchSet[];
  status: MockMatchState;
  confirmedA?: boolean;
  confirmedB?: boolean;
  forcedWinner?: string;
}

interface StoredMatchRuntime {
  matchId: string;
  table?: string;
  status?: MockMatchState;
}

interface BaseStageMatch {
  id: string;
  sideA: string;
  sideB: string;
  round: string;
  matchDay?: number;
  autoWinner?: string;
  bestOf?: number;
}

const RESULT_KEY = 'online-tournament:mock-match-results:v2';
const RUNTIME_KEY = 'online-tournament:mock-match-runtime:v1';
const WITHDRAWAL_KEY = 'online-tournament:withdrawn-participants:v1';
const SWISS_FIXTURE_KEY = 'online-tournament:swiss-round-fixtures:v1';

interface SwissFixture { tournamentId: string; stageId: string; round: number; pairs: [string, string][] }

function readSwissFixtures(): SwissFixture[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(SWISS_FIXTURE_KEY) ?? '[]') as SwissFixture[]; } catch { return []; }
}

function readWithdrawn(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(WITHDRAWAL_KEY) ?? '{}') as Record<string, string[]>; } catch { return {}; }
}

export function isMockParticipantWithdrawn(tournament: DemoTournament, name: string) {
  return (readWithdrawn()[tournament.id] ?? []).includes(name);
}

export function canEditFinishedResults(tournament: DemoTournament, stage: TournamentStage) {
  const next = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
  return !next || !isStageStarted(tournament, next);
}


function readResults(): StoredMatchResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESULT_KEY) ?? '[]') as StoredMatchResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeResults(results: StoredMatchResult[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RESULT_KEY, JSON.stringify(results));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

function readRuntime(): StoredMatchRuntime[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUNTIME_KEY) ?? '[]') as StoredMatchRuntime[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRuntime(states: StoredMatchRuntime[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RUNTIME_KEY, JSON.stringify(states));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
}

function updateRuntime(matchId: string, update: Omit<StoredMatchRuntime, 'matchId'>) {
  const current = readRuntime();
  const previous = current.find((item) => item.matchId === matchId) ?? { matchId };
  const next = { ...previous, ...update, matchId };
  writeRuntime([next, ...current.filter((item) => item.matchId !== matchId)]);
  return next;
}

function scoreFromSets(sets: MatchSet[]) {
  let winsA = 0;
  let winsB = 0;
  for (const set of sets) {
    if (set.sideAScore > set.sideBScore) winsA += 1;
    else if (set.sideBScore > set.sideAScore) winsB += 1;
  }
  return `${winsA} : ${winsB}`;
}

function resultWinner(result: StoredMatchResult | undefined, sideA: string, sideB: string) {
  if (!result || result.status !== 'FINISHED') return undefined;
  if (result.forcedWinner) return result.forcedWinner;
  let winsA = 0;
  let winsB = 0;
  result.sets.forEach((set) => {
    if (set.sideAScore > set.sideBScore) winsA += 1;
    else if (set.sideBScore > set.sideAScore) winsB += 1;
  });
  if (winsA === winsB) return undefined;
  return winsA > winsB ? sideA : sideB;
}

function groupMembers(tournament: DemoTournament, stage: TournamentStage) {
  const participants = getStageEntrants(tournament, stage);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const assignments = getGroupAssignments(tournament, stage);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  participants.forEach((name, index) => {
    const groupIndex = assignments[name] ?? index % groupCount;
    groups[Math.max(0, Math.min(groupCount - 1, groupIndex))].push(name);
  });
  return groups;
}

function roundRobinSchedule(participants: string[]) {
  const rotation: Array<string | null> = [...participants];
  if (rotation.length % 2 === 1) rotation.push(null);
  if (rotation.length < 2) return [] as Array<Array<[string, string]>>;
  const rounds: Array<Array<[string, string]>> = [];

  for (let roundIndex = 0; roundIndex < rotation.length - 1; roundIndex += 1) {
    const pairings: Array<[string, string]> = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const sideA = rotation[index];
      const sideB = rotation[rotation.length - 1 - index];
      if (sideA && sideB) pairings.push([sideA, sideB]);
    }
    rounds.push(pairings);
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop() ?? null);
    rotation.splice(0, rotation.length, fixed, ...rest);
  }
  return rounds;
}

function groupMatches(tournament: DemoTournament, stage: TournamentStage): BaseStageMatch[] {
  const groups = groupMembers(tournament, stage);
  const schedules = groups.map((members) => roundRobinSchedule(members));
  const maxDays = Math.max(0, ...schedules.map((schedule) => schedule.length));
  const matches: BaseStageMatch[] = [];

  for (let dayIndex = 0; dayIndex < maxDays; dayIndex += 1) {
    schedules.forEach((schedule, groupIndex) => {
      const groupLabel = `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
      (schedule[dayIndex] ?? []).forEach(([sideA, sideB], matchIndex) => {
        matches.push({
          id: `${stage.id}-g${groupIndex + 1}-d${dayIndex + 1}-m${matchIndex + 1}`,
          sideA,
          sideB,
          round: groupLabel,
          matchDay: dayIndex + 1,
        });
      });
    });
  }
  return matches;
}

function roundRobinMatches(tournament: DemoTournament, stage: TournamentStage): BaseStageMatch[] {
  const participants = getStageEntrants(tournament, stage);
  return roundRobinSchedule(participants).flatMap((pairings, dayIndex) => pairings.map(([sideA, sideB], matchIndex) => ({
    id: `${stage.id}-rr-d${dayIndex + 1}-m${matchIndex + 1}`,
    sideA,
    sideB,
    round: `Spieltag ${dayIndex + 1}`,
    matchDay: dayIndex + 1,
  })));
}

function knockoutRoundBestOf(stage: TournamentStage, roundIndex: number) {
  const configured = typeof stage.settings.roundBestOf === 'string'
    ? stage.settings.roundBestOf.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return configured[roundIndex] ?? stage.bestOf;
}

function knockoutMatches(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): BaseStageMatch[] {
  const slots = getBracketSlots(tournament, stage);
  const rounds: BaseStageMatch[] = [];
  let currentSides = [...slots];
  let matchesInRound = slots.length / 2;
  let roundIndex = 0;

  while (matchesInRound >= 1) {
    const label = matchesInRound === 1
      ? 'Finale'
      : matchesInRound === 2
        ? 'Halbfinale'
        : matchesInRound === 4
          ? 'Viertelfinale'
          : matchesInRound === 8
            ? 'Achtelfinale'
            : `Runde ${roundIndex + 1}`;
    const nextSides: string[] = [];

    for (let index = 0; index < matchesInRound; index += 1) {
      const sideA = currentSides[index * 2] ?? 'TBD';
      const sideB = currentSides[index * 2 + 1] ?? 'TBD';
      const id = `${stage.id}-r${roundIndex + 1}-m${index + 1}`;
      let autoWinner: string | undefined;
      if (sideA === 'Freilos' && sideB !== 'Freilos' && sideB !== 'TBD') autoWinner = sideB;
      if (sideB === 'Freilos' && sideA !== 'Freilos' && sideA !== 'TBD') autoWinner = sideA;
      const winner = autoWinner ?? resultWinner(results.find((item) => item.matchId === id), sideA, sideB);
      rounds.push({ id, sideA, sideB, round: label, autoWinner, bestOf: knockoutRoundBestOf(stage, roundIndex) });
      nextSides.push(winner ?? 'TBD');
    }

    currentSides = nextSides;
    matchesInRound /= 2;
    roundIndex += 1;
  }

  return rounds;
}

function swissScoreState(participants: string[], matches: BaseStageMatch[], results: StoredMatchResult[]) {
  const state = new Map(participants.map((name, index) => [name, {
    name,
    wins: 0,
    losses: 0,
    byes: 0,
    order: index,
    opponents: new Set<string>(),
  }]));

  matches.forEach((match) => {
    const a = state.get(match.sideA);
    if (!a) return;
    if (match.autoWinner === match.sideA && match.sideB === 'Freilos') {
      a.wins += 1;
      a.byes += 1;
      return;
    }
    const b = state.get(match.sideB);
    if (!b) return;
    const result = results.find((item) => item.matchId === match.id && item.status === 'FINISHED');
    if (!result) return;
    a.opponents.add(match.sideB);
    b.opponents.add(match.sideA);
    const winner = resultWinner(result, match.sideA, match.sideB);
    if (winner === match.sideA) {
      a.wins += 1;
      b.losses += 1;
    } else if (winner === match.sideB) {
      b.wins += 1;
      a.losses += 1;
    }
  });

  return state;
}


function swissRoundPairings(
  participants: string[],
  previousMatches: BaseStageMatch[],
  results: StoredMatchResult[],
) {
  const state = swissScoreState(participants, previousMatches, results);
  const players: SwissScorePlayer[] = participants.map((name) => {
    const row = state.get(name)!;
    return {
      name,
      wins: row.wins,
      losses: row.losses,
      byes: row.byes,
      order: row.order,
      opponents: row.opponents,
    };
  });
  return generateScoreGroupedSwissPairings(players);
}

function swissMatches(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): BaseStageMatch[] {
  const participants = getSwissOrder(tournament, stage);
  const totalRounds = Math.max(1, Number(stage.settings.rounds) || 4);
  const matches: BaseStageMatch[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    if (round > 1) {
      const previous = matches.filter((match) => match.round === `Runde ${round - 1}` && !match.autoWinner);
      const previousDone = previous.every((match) => results.find((item) => item.matchId === match.id)?.status === 'FINISHED');
      if (!previousDone) break;
    }

    const savedRound = readSwissFixtures().find((item) => item.tournamentId === tournament.id && item.stageId === stage.id && item.round === round);
    const eligible = participants.filter((name) => !isMockParticipantWithdrawn(tournament, name));
    const pairings = savedRound?.pairs ?? (round === 1
      ? swissRoundPairings(eligible, [], results)
      : swissRoundPairings(eligible, matches, results));
    if (!savedRound && isStageStarted(tournament, stage) && typeof window !== 'undefined') {
      window.localStorage.setItem(SWISS_FIXTURE_KEY, JSON.stringify([
        ...readSwissFixtures().filter((item) => !(item.tournamentId === tournament.id && item.stageId === stage.id && item.round === round)),
        { tournamentId: tournament.id, stageId: stage.id, round, pairs: pairings },
      ]));
    }

    pairings.forEach(([sideA, sideB], index) => {
      matches.push({
        id: `${stage.id}-sw-r${round}-m${index + 1}`,
        sideA,
        sideB,
        round: `Runde ${round}`,
        autoWinner: sideB === 'Freilos' ? sideA : undefined,
      });
    });
  }
  return matches;
}

function baseStageMatches(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]) {
  switch (stage.type) {
    case 'GROUPS': return groupMatches(tournament, stage);
    case 'ROUND_ROBIN': return roundRobinMatches(tournament, stage);
    case 'KNOCKOUT':
    case 'DOUBLE_ELIMINATION':
    case 'PLACEMENT': return knockoutMatches(tournament, stage, results);
    case 'SWISS': return swissMatches(tournament, stage, results);
    default: return [];
  }
}

function deterministicPause(matchId: string, side: 'A' | 'B') {
  let hash = side === 'A' ? 17 : 29;
  for (const char of matchId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 3 + (hash % 29);
}

function applyStoredState(match: MockRuntimeMatch, storedResults: StoredMatchResult[], storedRuntime: StoredMatchRuntime[]) {
  const savedResult = storedResults.find((item) => item.matchId === match.id);
  const savedRuntime = storedRuntime.find((item) => item.matchId === match.id);
  const status = savedResult?.status ?? savedRuntime?.status ?? match.status;
  return {
    ...match,
    table: savedRuntime?.table ?? match.table,
    status,
    score: savedResult?.forcedWinner ? 'W.O.' : savedResult ? scoreFromSets(savedResult.sets) : match.score,
    sets: savedResult?.sets ?? match.sets,
    note: status === 'WAITING' ? 'Wartet auf Tischzuweisung' : undefined,
  };
}

export function getMockStageMatches(tournament: DemoTournament, stage: TournamentStage): MockRuntimeMatch[] {
  const results = readResults();
  const runtime = readRuntime();
  const started = isStageStarted(tournament, stage);
  return baseStageMatches(tournament, stage, results)
    .filter((match) => match.sideA !== 'TBD' && match.sideB !== 'TBD' && match.sideA !== 'Freilos' && match.sideB !== 'Freilos')
    .map((match) => applyStoredState({
      id: match.id,
      table: 'Noch offen',
      sideA: match.sideA,
      sideB: match.sideB,
      score: '–',
      status: started ? 'WAITING' : 'WAITING',
      phase: stage.name,
      stageId: stage.id,
      round: match.round,
      matchDay: match.matchDay,
      bestOf: match.bestOf ?? stage.bestOf,
      pauseA: deterministicPause(match.id, 'A'),
      pauseB: deterministicPause(match.id, 'B'),
      note: 'Wartet auf Tischzuweisung',
    }, results, runtime));
}

export function getMockRuntimeMatches(tournament: DemoTournament): MockRuntimeMatch[] {
  const currentStage = getActiveStage(tournament);
  if (!currentStage) return [];
  return getMockStageMatches(tournament, currentStage);
}

export function getMockStoredResult(matchId: string) {
  return readResults().find((item) => item.matchId === matchId);
}

export function getMockStageBaseMatches(tournament: DemoTournament, stage: TournamentStage) {
  return baseStageMatches(tournament, stage, readResults());
}

function isActiveTableMatch(match: MockRuntimeMatch) {
  return ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) && match.table.startsWith('Tisch ');
}

export function getMockAssignmentBlockReason(tournament: DemoTournament, matchId: string, table: string) {
  const matches = getMockRuntimeMatches(tournament);
  const target = matches.find((match) => match.id === matchId);
  if (!target) return 'Spiel wurde nicht gefunden.';

  const tableOccupied = matches.some((match) => match.id !== matchId && match.table === table && isActiveTableMatch(match));
  if (tableOccupied) return `${table} ist bereits belegt.`;

  const playerConflict = matches.find((match) => (
    match.id !== matchId
    && isActiveTableMatch(match)
    && (match.sideA === target.sideA || match.sideB === target.sideA || match.sideA === target.sideB || match.sideB === target.sideB)
  ));

  if (playerConflict) {
    const blockedPlayer = [target.sideA, target.sideB].find((player) => player === playerConflict.sideA || player === playerConflict.sideB);
    return `${blockedPlayer ?? 'Ein Teilnehmer'} ist bereits ${playerConflict.table} zugewiesen.`;
  }

  return null;
}

export function assignMockMatchToTable(tournament: DemoTournament, matchId: string, table: string) {
  if (getMockAssignmentBlockReason(tournament, matchId, table)) return false;
  updateRuntime(matchId, { table, status: 'LIVE' });
  return true;
}

export function unassignMockMatch(matchId: string) {
  updateRuntime(matchId, { table: 'Noch offen', status: 'WAITING' });
}

export function startMockMatch(matchId: string) {
  updateRuntime(matchId, { status: 'LIVE' });
}

export function saveMockMatchSets(matchId: string, sets: MatchSet[], status: MockMatchState = 'LIVE') {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const next: StoredMatchResult = { ...previous, matchId, sets, status, forcedWinner: undefined };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  return next;
}

// Turnierweiter Rückzug: offene Partien werden als kampfloser Sieg des Gegners
// behandelt. Bereits beendete Partien bleiben unverändert. Kommende Schweizer
// Runden paaren nur noch aktive Teilnehmer; aktuelle Paarungen bleiben stabil.
function settleWithdrawnMatches(tournament: DemoTournament) {
  const active = getActiveStage(tournament);
  if (!active) return;
  for (let pass = 0; pass < 24; pass += 1) {
    const pending = getMockStageMatches(tournament, active).filter((match) => (
      match.status !== 'FINISHED' &&
      (isMockParticipantWithdrawn(tournament, match.sideA) || isMockParticipantWithdrawn(tournament, match.sideB))
    ));
    if (!pending.length) break;
    const saved = readResults();
    let changed = false;
    for (const match of pending) {
      const aWithdrawn = isMockParticipantWithdrawn(tournament, match.sideA);
      const bWithdrawn = isMockParticipantWithdrawn(tournament, match.sideB);
      // Bei zwei Rückzügen gibt es keinen Sieger; der Ast bleibt frei.
      // Die Begegnung zählt für beide als kampflos beendet.
      if (saved.some((item) => item.matchId === match.id && item.status === 'FINISHED')) continue;
      saved.unshift({ matchId: match.id, sets: [], status: 'FINISHED', forcedWinner: aWithdrawn && bWithdrawn ? 'Freilos' : aWithdrawn ? match.sideB : match.sideA });
      changed = true;
    }
    if (!changed) break;
    writeResults(saved);
  }
}

export function reconcileWithdrawalsForTournament(tournament: DemoTournament) {
  settleWithdrawnMatches(tournament);
}

export function withdrawMockParticipant(tournament: DemoTournament, name: string) {
  if (!getRuntimeParticipantNames(tournament).includes(name) || isMockParticipantWithdrawn(tournament, name)) return false;
  const current = readWithdrawn();
  current[tournament.id] = [...(current[tournament.id] ?? []), name];
  window.localStorage.setItem(WITHDRAWAL_KEY, JSON.stringify(current));
  settleWithdrawnMatches(tournament);
  const active = getActiveStage(tournament);
  if (active) {
    const unfinished = getMockStageMatches(tournament, active).some((match) => match.status !== 'FINISHED');
    if (!unfinished) reconcileCompletedPhase(`${active.id}-withdrawal`);
  }
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}

interface RankingRow {
  name: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  ballsWon: number;
  ballsLost: number;
  buchholz: number;
}

function rankParticipants(participants: string[], matches: BaseStageMatch[], results: StoredMatchResult[]) {
  const rows = new Map(participants.map((name) => [name, {
    name,
    played: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    ballsWon: 0,
    ballsLost: 0,
    buchholz: 0,
  } satisfies RankingRow]));
  const opponents = new Map(participants.map((name) => [name, [] as string[]]));

  matches.forEach((match) => {
    const result = results.find((item) => item.matchId === match.id && item.status === 'FINISHED');
    if (!result) return;
    const rowA = rows.get(match.sideA);
    const rowB = rows.get(match.sideB);
    if (!rowA || !rowB) return;
    rowA.played += 1;
    rowB.played += 1;
    opponents.get(match.sideA)?.push(match.sideB);
    opponents.get(match.sideB)?.push(match.sideA);
    result.sets.forEach((set) => {
      rowA.ballsWon += set.sideAScore;
      rowA.ballsLost += set.sideBScore;
      rowB.ballsWon += set.sideBScore;
      rowB.ballsLost += set.sideAScore;
      if (set.sideAScore > set.sideBScore) {
        rowA.setsWon += 1;
        rowB.setsLost += 1;
      } else if (set.sideBScore > set.sideAScore) {
        rowB.setsWon += 1;
        rowA.setsLost += 1;
      }
    });
    const winner = resultWinner(result, match.sideA, match.sideB);
    if (winner === match.sideA) {
      rowA.wins += 1;
      rowB.losses += 1;
    } else if (winner === match.sideB) {
      rowB.wins += 1;
      rowA.losses += 1;
    }
  });

  rows.forEach((row) => {
    row.buchholz = (opponents.get(row.name) ?? []).reduce((sum, opponent) => sum + (rows.get(opponent)?.wins ?? 0), 0);
  });

  return [...rows.values()].sort((a, b) => (
    b.wins - a.wins
    || ((b.setsWon - b.setsLost) - (a.setsWon - a.setsLost))
    || b.setsWon - a.setsWon
    || ((b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost))
    || b.ballsWon - a.ballsWon
    || b.buchholz - a.buchholz
    || a.name.localeCompare(b.name, 'de')
  ));
}

function stageQualifierCount(tournament: DemoTournament, stage: TournamentStage) {
  const stageIndex = tournament.stages.findIndex((item) => item.id === stage.id);
  const nextStage = tournament.stages[stageIndex + 1];
  if (!nextStage) return 0;
  if (stage.advancement.type === 'top_n' && stage.advancement.value > 0) return stage.advancement.value;
  return Math.max(1, Number(nextStage.settings.entrants) || 1);
}

function computeStageQualifiers(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]) {
  const targetCount = stageQualifierCount(tournament, stage);
  if (targetCount <= 0) return [];
  const matches = baseStageMatches(tournament, stage, results);

  if (stage.type === 'GROUPS') {
    const rankings = groupMembers(tournament, stage).map((members, groupIndex) => {
      const groupLabel = `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
      return rankParticipants(members, matches.filter((match) => match.round === groupLabel), results);
    });
    const qualified: string[] = [];
    for (let rankIndex = 0; qualified.length < targetCount; rankIndex += 1) {
      const tier = rankings.map((ranking) => ranking[rankIndex]).filter((row): row is RankingRow => Boolean(row));
      if (!tier.length) break;
      tier.sort((a, b) => (
        b.wins - a.wins
        || ((b.setsWon - b.setsLost) - (a.setsWon - a.setsLost))
        || b.setsWon - a.setsWon
        || ((b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost))
        || b.ballsWon - a.ballsWon
        || a.name.localeCompare(b.name, 'de')
      ));
      qualified.push(...tier.filter((row) => !isMockParticipantWithdrawn(tournament, row.name)).slice(0, targetCount - qualified.length).map((row) => row.name));
    }
    return qualified;
  }

  if (stage.type === 'ROUND_ROBIN' || stage.type === 'SWISS') {
    return rankParticipants(getStageEntrants(tournament, stage), matches, results).filter((row) => !isMockParticipantWithdrawn(tournament, row.name)).slice(0, targetCount).map((row) => row.name);
  }

  return getStageEntrants(tournament, stage).filter((name) => !isMockParticipantWithdrawn(tournament, name)).slice(0, targetCount);
}

export function refreshCompletedStageQualifiers(tournament: DemoTournament, stage: TournamentStage) {
  if (!isStageCompleted(tournament, stage)) return false;
  const stageIndex = tournament.stages.findIndex((item) => item.id === stage.id);
  const nextStage = tournament.stages[stageIndex + 1];
  if (!nextStage || isStageStarted(tournament, nextStage)) return false;
  const qualified = computeStageQualifiers(tournament, stage, readResults());
  setStageEntrants(tournament, nextStage, qualified);
  return true;
}

function reconcileCompletedPhase(matchId: string) {
  for (const tournament of getAllMockTournaments()) {
    const activeStage = getActiveStage(tournament);
    if (!activeStage || !matchId.startsWith(`${activeStage.id}-`)) continue;

    const activeMatches = getMockStageMatches(tournament, activeStage);
    const hasOpenMatches = activeMatches.some((match) => match.status !== 'FINISHED');
    if (activeMatches.length === 0 || hasOpenMatches) return;

    // Bei K.-o./Swiss können durch den Abschluss der aktuellen Runde neue Spiele entstehen.
    const refreshedMatches = getMockStageMatches(tournament, activeStage);
    const refreshedOpen = refreshedMatches.some((match) => match.status !== 'FINISHED');
    if (refreshedOpen) return;

    const baseMatches = getMockStageBaseMatches(tournament, activeStage).filter((match) => !match.autoWinner && match.sideA !== 'TBD' && match.sideB !== 'TBD' && match.sideA !== 'Freilos' && match.sideB !== 'Freilos');
    if (baseMatches.some((match) => readResults().find((result) => result.matchId === match.id)?.status !== 'FINISHED')) return;

    const qualifiedForNext = computeStageQualifiers(tournament, activeStage, readResults());
    completeStage(tournament, activeStage, qualifiedForNext);
    const isLastStage = tournament.stages[tournament.stages.length - 1]?.id === activeStage.id;
    updateMockTournamentStatus(tournament.id, isLastStage ? 'FINISHED' : 'PAUSED');
    return;
  }
}

export function completeMockMatch(matchId: string, sets: MatchSet[], status: MockMatchState = 'FINISHED') {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const previousFinal = previous?.status === 'FINISHED';
  if (previousFinal) {
    const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
    const stage = tournament?.stages.find((item) => matchId.startsWith(`${item.id}-`));
    if (tournament && stage && !canEditFinishedResults(tournament, stage)) return previous;
  }
  const next: StoredMatchResult = { ...previous, matchId, sets, status, forcedWinner: undefined };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (status === 'FINISHED') {
    const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
    if (tournament) settleWithdrawnMatches(tournament);
    reconcileCompletedPhase(matchId);
  }
  return next;
}

export function confirmMockMatchSide(matchId: string, side: 'A' | 'B') {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId) ?? { matchId, sets: [], status: 'FINISHED' as MockMatchState };
  const next = { ...previous, [side === 'A' ? 'confirmedA' : 'confirmedB']: true };
  if (next.confirmedA && next.confirmedB) next.status = 'FINISHED';
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  return next;
}

export function getMockMatchConfirmation(matchId: string) {
  return readResults().find((item) => item.matchId === matchId);
}

export function getMockPlayerSnapshot(tournament: DemoTournament) {
  const participants = getRuntimeParticipantNames(tournament);
  const player = participants[0] ?? 'Max Mustermann';
  const matches = getMockRuntimeMatches(tournament);
  const ownLive = matches.find((match) => (match.status === 'LIVE' || match.status === 'CONFIRMATION') && (match.sideA === player || match.sideB === player));
  const next = matches.find((match) => match.status === 'WAITING' && (match.sideA === player || match.sideB === player))
    ?? matches.find((match) => match.status === 'WAITING');
  return {
    player,
    playerCode: '4821',
    matchCode: 'A7K2',
    currentMatch: ownLive,
    nextMatch: next,
    standing: getActiveStage(tournament)?.type === 'GROUPS'
      ? 'Gruppenphase'
      : getActiveStage(tournament)?.type === 'SWISS'
        ? 'Schweizer System'
        : 'Noch im Turnier',
  };
}

export function findMockRuntimeMatch(matchId?: string) {
  if (!matchId) return undefined;
  for (const tournament of getAllMockTournaments()) {
    for (const stage of tournament.stages) {
      const match = getMockStageMatches(tournament, stage).find((item) => item.id === matchId);
      if (match) return { tournament, match };
    }
  }
  return undefined;
}
