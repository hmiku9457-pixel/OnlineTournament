import { isParticipantWithdrawn, saveParticipantWithdrawal, removeParticipantWithdrawal, markWithdrawalRestoreEligibility, getWithdrawalRestoreEligibility, saveWithdrawalTiming, type WithdrawalTiming } from '@/services/mockWithdrawals';
import { reconcilePrestartDraws } from '@/services/mockDrawStore';
import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { generateScoreGroupedSwissPairings, type SwissScorePlayer } from '@/engine/swissScoreGroups';
import { getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeStage, getActiveStage, getStageEntrants, getNextStartableStage, isStageCompleted, isStageStarted, setStageEntrants } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getBracketSlots, getGroupAssignments, getSwissOrder } from '@/services/mockDrawStore';
import { getBlockedMockTables, isMockTableBlocked } from '@/services/mockTableLocks';
import { getMockAudit, recordMockAudit } from '@/services/mockAudit';
import { rankStandings, type RankedParticipant } from '@/domain/standingRankings';
import { compareRankingRows, resultScore, resultWinnerSide, scoreWithDecision, sportScoring, validateCompleteResult, validateScoreDecision, type ExtraTimeProgress, type ScoreDecision, type WinnerSide } from '@/domain/sportScoring';
import { getWithdrawalAwardSets } from '@/domain/withdrawalScoring';
import { applySwissCutoffDecision, findSwissCutoffTie, type SwissCutoffTie } from '@/domain/swissCutoffTie';
import { clearSwissCutoffDecision, readSwissCutoffDecision, saveSwissCutoffDecision, type StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import { isValidSportSet } from '@/domain/sportScoring';

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
  sport: string;
  decisionSide?: WinnerSide;
  decision?: ScoreDecision;
  extraTimeProgress?: ExtraTimeProgress;
  requiresWinner: boolean;
  pauseA: number | null;
  pauseB: number | null;
  /** True pause before this match started, not the current elapsed time. */
  startedAt?: number;
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
  decisionSide?: WinnerSide;
  decision?: ScoreDecision;
  extraTimeProgress?: ExtraTimeProgress;
  /** Beide Halbfinalverlierer erhalten Platz 3, ohne eine Partie auszutragen. */
  thirdPlaceSkipped?: boolean;
  /** Tatsächlicher Abschlusszeitpunkt; bei kampflosen Partien wird keine Pause ausgelöst. */
  finishedAt?: number;
}

interface StoredMatchRuntime {
  matchId: string;
  table?: string;
  status?: MockMatchState;
  startedAt?: number;
  pauseAtStartA?: number | null;
  pauseAtStartB?: number | null;
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
const SWISS_FIXTURE_KEY = 'online-tournament:swiss-round-fixtures:v1';

interface SwissFixture { tournamentId: string; stageId: string; round: number; pairs: [string, string][] }

function readSwissFixtures(): SwissFixture[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(SWISS_FIXTURE_KEY) ?? '[]') as SwissFixture[]; } catch { return []; }
}

export function isMockParticipantWithdrawn(tournament: DemoTournament, name: string) {
  return isParticipantWithdrawn(tournament, name);
}

export function canEditFinishedResults(tournament: DemoTournament, stage: TournamentStage) {
  const next = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
  return !next || !isStageStarted(tournament, next);
}

// Zurückgezogene Gruppen-Teilnehmer verlieren ausnahmslos alle Partien 0:11.
// Die automatisch gewerteten Begegnungen dürfen daher nicht korrigiert werden.
export function canEditMockMatch(tournament: DemoTournament, matchId: string) {
  const stage = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`));
  if (!stage || !canEditFinishedResults(tournament, stage)) return false;
  if (readResults().find((item) => item.matchId === matchId)?.thirdPlaceSkipped) return false;
  if (stage.type === 'GROUPS' || stage.type === 'ROUND_ROBIN') {
    const match = getMockStageBaseMatches(tournament, stage).find((item) => item.id === matchId);
    if (match && (isMockParticipantWithdrawn(tournament, match.sideA)
      || isMockParticipantWithdrawn(tournament, match.sideB))) return false;
  }
  return true;
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

function resultWinner(result: StoredMatchResult | undefined, sideA: string, sideB: string, sport: string) {
  if (!result || result.status !== 'FINISHED') return undefined;
  if (result.forcedWinner) return result.forcedWinner;
  const side = resultWinnerSide(sport, result.sets, result.decisionSide);
  return side === 'A' ? sideA : side === 'B' ? sideB : undefined;
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
      const winner = autoWinner ?? resultWinner(results.find((item) => item.matchId === id), sideA, sideB, tournament.sport);
      rounds.push({ id, sideA, sideB, round: label, autoWinner, bestOf: knockoutRoundBestOf(stage, roundIndex) });
      nextSides.push(winner ?? 'TBD');
    }

    currentSides = nextSides;
    matchesInRound /= 2;
    roundIndex += 1;
  }

  if (stage.type === 'KNOCKOUT' && slots.filter((name) => name !== 'Freilos').length >= 4) {
    const semiFinals = rounds.filter((match) => match.round === 'Halbfinale');
    if (semiFinals.length === 2) {
      const losers = semiFinals.map((match) => {
        const winner = match.autoWinner ?? resultWinner(results.find((item) => item.matchId === match.id), match.sideA, match.sideB, tournament.sport);
        if (!winner) return 'TBD';
        const loser = winner === match.sideA ? match.sideB : match.sideA;
        return loser === 'Freilos' ? 'TBD' : loser;
      });
      rounds.push({
        id: `${stage.id}-third-place`,
        sideA: losers[0],
        sideB: losers[1],
        round: 'Spiel um Platz 3',
        // The bronze match has the same Best-of as the final round.
        bestOf: knockoutRoundBestOf(stage, roundIndex - 1),
      });
    }
  }

  return rounds;
}

export function isMockThirdPlaceMatch(matchId: string) {
  return matchId.endsWith('-third-place');
}

function swissScoreState(participants: string[], matches: BaseStageMatch[], results: StoredMatchResult[], sport: string) {
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
    const winner = resultWinner(result, match.sideA, match.sideB, sport);
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
  sport: string,
) {
  const state = swissScoreState(participants, previousMatches, results, sport);
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
      ? swissRoundPairings(eligible, [], results, tournament.sport)
      : swissRoundPairings(eligible, matches, results, tournament.sport));
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

/** Erfasst die letzte tatsächlich gespielte Partie pro Teilnehmer, auch aus vorherigen Phasen. */
function getLatestFinishedTimes(tournament: DemoTournament, results: StoredMatchResult[]) {
  const timestamps = new Map<string, number>();
  const finalResults = new Map(results.filter((item) => item.status === 'FINISHED' && item.finishedAt).map((item) => [item.matchId, item]));
  if (!finalResults.size) return timestamps;
  for (const stage of tournament.stages) {
    for (const match of baseStageMatches(tournament, stage, results)) {
      const result = finalResults.get(match.id);
      if (!result?.finishedAt || result.forcedWinner) continue;
      for (const participant of [match.sideA, match.sideB]) {
        timestamps.set(participant, Math.max(timestamps.get(participant) ?? 0, result.finishedAt));
      }
    }
  }
  return timestamps;
}

export function getElapsedRestMinutes(finishedAt: number | undefined, now = Date.now()): number | null {
  if (finishedAt === undefined || !Number.isFinite(finishedAt)) return null;
  return Math.max(0, Math.floor((now - finishedAt) / 60000));
}

export function formatMockMatchRest(match: MockRuntimeMatch, side: 'A' | 'B') {
  if (match.status === 'FINISHED' && !match.startedAt) return 'Nicht erfasst';
  return formatPlayerRest(side === 'A' ? match.pauseA : match.pauseB);
}

export function formatPlayerRest(minutes: number | null): string {
  if (minutes === null) return 'Noch kein Spiel';
  if (minutes < 60) return `${minutes} Min. Pause`;
  return `${Math.floor(minutes / 60)} Std. ${String(minutes % 60).padStart(2, '0')} Min. Pause`;
}

function applyStoredState(match: MockRuntimeMatch, storedResults: StoredMatchResult[], storedRuntime: StoredMatchRuntime[]) {
  const savedResult = storedResults.find((item) => item.matchId === match.id);
  const savedRuntime = storedRuntime.find((item) => item.matchId === match.id);
  const status = savedResult?.status === 'FINISHED' ? 'FINISHED' : savedRuntime?.status ?? savedResult?.status ?? match.status;
  return {
    ...match,
    table: savedRuntime?.table ?? match.table,
    status,
    startedAt: savedRuntime?.startedAt,
    pauseA: savedRuntime?.startedAt ? (savedRuntime.pauseAtStartA ?? null) : status === 'FINISHED' ? null : match.pauseA,
    pauseB: savedRuntime?.startedAt ? (savedRuntime.pauseAtStartB ?? null) : status === 'FINISHED' ? null : match.pauseB,
    score: savedResult?.thirdPlaceSkipped ? 'Beide Platz 3' : savedResult?.forcedWinner && !savedResult.sets.length ? 'W.O.' : savedResult ? resultScore(match.sport, savedResult.sets) : match.score,
    sets: savedResult?.sets ?? match.sets,
    decisionSide: savedResult?.decisionSide,
    decision: savedResult?.decision,
    extraTimeProgress: status === 'FINISHED' ? undefined : savedResult?.extraTimeProgress,
    note: status === 'WAITING' ? 'Wartet auf Tischzuweisung' : undefined,
  };
}

export function getMockStageMatches(tournament: DemoTournament, stage: TournamentStage): MockRuntimeMatch[] {
  const results = readResults();
  const runtime = readRuntime();
  const started = isStageStarted(tournament, stage);
  const lastFinishByParticipant = getLatestFinishedTimes(tournament, results);
  const now = Date.now();
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
      sport: tournament.sport,
      requiresWinner: ['SWISS', 'KNOCKOUT', 'DOUBLE_ELIMINATION', 'PLACEMENT'].includes(stage.type),
      pauseA: getElapsedRestMinutes(lastFinishByParticipant.get(match.sideA), now),
      pauseB: getElapsedRestMinutes(lastFinishByParticipant.get(match.sideB), now),
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

/** Sichtbarer Zuweisungskonflikt und serverunabhängige Schutzprüfung nutzen dieselbe Regel. */
export function getMockParticipantTableConflicts(
  target: Pick<MockRuntimeMatch, 'id' | 'sideA' | 'sideB'>,
  matches: readonly MockRuntimeMatch[],
): Array<{ participant: string; table: string }> {
  return [target.sideA, target.sideB].flatMap((participant) => {
    const other = matches.find((match) => match.id !== target.id && isActiveTableMatch(match) && (match.sideA === participant || match.sideB === participant));
    return other ? [{ participant, table: other.table }] : [];
  });
}

function getAssignmentBlockReasonForSnapshot(
  tournament: DemoTournament,
  matchId: string,
  table: string,
  matches: MockRuntimeMatch[],
  blockedTables: ReadonlySet<string>,
  tournamentStatus: string,
) {
  if (tournamentStatus !== 'RUNNING') return 'Pause aktiv oder Turnier nicht gestartet: Neue Tischzuweisungen sind gesperrt.';
  if (!/^Tisch [1-9]\d*$/.test(table) || Number(table.slice(6)) > tournament.tables) return 'Ungültiger Tisch.';
  if (blockedTables.has(table)) return `${table} ist für dieses Turnier gesperrt.`;
  // Die Wechselzeit ist eine unverbindliche Planungsgröße (Dauerprognose),
  // kein Sperrgrund. Nur gesperrte oder belegte Tische und Spielerkonflikte
  // verhindern eine neue Zuweisung.
  const target = matches.find((match) => match.id === matchId);
  if (!target) return 'Spiel wurde nicht gefunden.';
  if (target.status !== 'WAITING') return 'Dieses Spiel ist nicht mehr in der Warteschlange.';

  const tableOccupied = matches.some((match) => match.id !== matchId && match.table === table && isActiveTableMatch(match));
  if (tableOccupied) return `${table} ist bereits belegt.`;

  const [playerConflict] = getMockParticipantTableConflicts(target, matches);
  if (playerConflict) {
    return `${playerConflict.participant} ist bereits ${playerConflict.table} zugewiesen.`;
  }

  return null;
}

export function getMockAssignmentBlockReason(tournament: DemoTournament, matchId: string, table: string) {
  // Immer den aktuellen gespeicherten Zustand verwenden, auch bei alten React-Snapshots.
  const currentTournament = getAllMockTournaments().find((item) => item.id === tournament.id) ?? tournament;
  const matches = getMockRuntimeMatches(currentTournament);
  return getAssignmentBlockReasonForSnapshot(currentTournament, matchId, table, matches, new Set(getBlockedMockTables(currentTournament)), currentTournament.status);
}

/** Dieselbe Prüfung wie beim tatsächlichen Zuweisen, aber für die gesamte Warteschlange in einem Snapshot. */
export function getMockQueueAssignableTables(tournament: DemoTournament): Map<string, string[]> {
  const currentTournament = getAllMockTournaments().find((item) => item.id === tournament.id) ?? tournament;
  const matches = getMockRuntimeMatches(currentTournament);
  const blockedTables = new Set(getBlockedMockTables(currentTournament));
  const freeTables = Array.from({ length: currentTournament.tables }, (_, index) => `Tisch ${index + 1}`)
    .filter((table) => !blockedTables.has(table) && !matches.some((match) => match.table === table && isActiveTableMatch(match)));

  return new Map(matches.filter((match) => match.status === 'WAITING').map((match) => [
    match.id,
    freeTables.filter((table) => getAssignmentBlockReasonForSnapshot(currentTournament, match.id, table, matches, blockedTables, currentTournament.status) === null),
  ]));
}

/** Zuweisung = Spielstart. Restzeit ist der Wert genau zum Startzeitpunkt. */
export function assignMockMatchToTable(tournament: DemoTournament, matchId: string, table: string) {
  if (getMockAssignmentBlockReason(tournament, matchId, table)) return false;
  const match = getMockRuntimeMatches(tournament).find((item) => item.id === matchId);
  if (!match) return false;
  const previous = readRuntime().find((item) => item.matchId === matchId);
  const now = Date.now();
  const lastFinish = getLatestFinishedTimes(tournament, readResults());
  updateRuntime(matchId, {
    table, status: 'LIVE', startedAt: previous?.startedAt ?? now,
    pauseAtStartA: previous?.startedAt ? previous.pauseAtStartA : getElapsedRestMinutes(lastFinish.get(match.sideA), now),
    pauseAtStartB: previous?.startedAt ? previous.pauseAtStartB : getElapsedRestMinutes(lastFinish.get(match.sideB), now),
  });
  recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'MATCH_ASSIGNED', description: `${match.sideA} – ${match.sideB}: Spiel an ${table} gestartet`, after: table });
  return true;
}

/** Hebt die Tischzuweisung auf, behält bereits eingetragene Sätze. */
export function unassignMockMatch(tournament: DemoTournament, matchId: string) {
  const match = getMockRuntimeMatches(tournament).find((item) => item.id === matchId);
  if (!match || !isActiveTableMatch(match)) return false;
  updateRuntime(matchId, { table: 'Noch offen', status: 'WAITING' });
  recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'MATCH_UNASSIGNED', description: `Zuweisung von ${match.sideA} – ${match.sideB} aufgehoben (Sätze bleiben erhalten)`, before: match.table, after: 'Warteschlange' });
  return true;
}

/** Verlegt eine bereits gestartete Partie ohne Verlust von Sätzen oder Startzeit. */
export function moveMockMatchToTable(tournament: DemoTournament, matchId: string, table: string) {
  const match = getMockRuntimeMatches(tournament).find((item) => item.id === matchId);
  if (!match || !isActiveTableMatch(match) || match.table === table) return false;
  if (!/^Tisch [1-9]\d*$/.test(table) || Number(table.slice(6)) > tournament.tables) return false;
  if (isMockTableBlocked(tournament, table)) return false;
  if (getMockRuntimeMatches(tournament).some((item) => item.id !== matchId && item.table === table && isActiveTableMatch(item))) return false;
  updateRuntime(matchId, { table, status: 'LIVE' });
  recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'MATCH_MOVED', description: `${match.sideA} – ${match.sideB} an ${table} verlegt`, before: match.table, after: table });
  return true;
}

export function startMockMatch(matchId: string) {
  updateRuntime(matchId, { status: 'LIVE' });
}

export function saveMockMatchSets(matchId: string, sets: MatchSet[], status: MockMatchState = 'LIVE', extraTimeProgress?: ExtraTimeProgress) {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
  if (tournament && !canEditMockMatch(tournament, matchId)) return previous;
  const next: StoredMatchResult = { ...previous, matchId, sets, status, decisionSide: undefined, decision: undefined, extraTimeProgress, forcedWinner: undefined, thirdPlaceSkipped: undefined, confirmedA: previous?.confirmedA, confirmedB: previous?.confirmedB, finishedAt: status === 'FINISHED' ? (previous?.finishedAt ?? Date.now()) : previous?.finishedAt };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (tournament && sets.length > (previous?.sets.length ?? 0)) recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Ergebniseingabe (lokal)', action: 'SET_SAVED', description: sportScoring(tournament.sport).mode === 'score' ? 'Zwischenstand erfasst' : `Satz ${sets.length} bestätigt`, before: previous?.sets.map((set) => `${set.sideAScore}:${set.sideBScore}`).join(' · '), after: sets.map((set) => `${set.sideAScore}:${set.sideBScore}`).join(' · ') });
  return next;
}

// Gruppen-/Jeder-gegen-jeden-Rückzug: alle Partien der laufenden Phase
// (auch bereits gespielte) werden sportabhängig kampflos gewertet.
// Außerhalb dieser Phasen bleiben abgeschlossene Partien unverändert.
function settleWithdrawnMatches(tournament: DemoTournament) {
  const active = getActiveStage(tournament);
  if (!active) return;

  if (active.type === 'GROUPS' || active.type === 'ROUND_ROBIN') {
    const fixtures = baseStageMatches(tournament, active, readResults());
    const saved = readResults();
    const rewritten: StoredMatchResult[] = [];
    for (const match of fixtures) {
      const aWithdrawn = isMockParticipantWithdrawn(tournament, match.sideA);
      const bWithdrawn = isMockParticipantWithdrawn(tournament, match.sideB);
      if (!aWithdrawn && !bWithdrawn) continue;
      const existing = saved.find((result) => result.matchId === match.id);
      const sets = getWithdrawalAwardSets(
        tournament.sport,
        match.bestOf ?? active.bestOf,
        aWithdrawn && bWithdrawn ? 'BOTH' : aWithdrawn ? 'A' : 'B',
      );
      const forcedWinner = aWithdrawn && bWithdrawn ? 'Freilos' : aWithdrawn ? match.sideB : match.sideA;
      // Nicht bei jeder Ansicht erneut identische Resultate überschreiben.
      if (existing?.status === 'FINISHED' && existing.forcedWinner === forcedWinner
        && JSON.stringify(existing.sets) === JSON.stringify(sets)) continue;
      rewritten.push({ matchId: match.id, sets, status: 'FINISHED', forcedWinner });
    }
    if (rewritten.length) {
      const ids = new Set(rewritten.map((result) => result.matchId));
      writeResults([...rewritten, ...saved.filter((result) => !ids.has(result.matchId))]);
    }
    return;
  }

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

/** Ein sportlich ausgeschiedener K.-o.-Teilnehmer darf nicht nachträglich
 * als Rückzug behandelt werden. Halbfinalverlierer können noch am Spiel um
 * Platz 3 teilnehmen, bis dieses entschieden wurde. */
export function canWithdrawMockParticipant(tournament: DemoTournament, name: string): boolean {
  if (!getRuntimeParticipantNames(tournament).includes(name) || isMockParticipantWithdrawn(tournament, name)) return false;
  const started = tournament.stages.filter((stage) => isStageStarted(tournament, stage));
  const latest = started[started.length - 1];
  // Bereits vor einer laufenden Folgephase ausgeschiedene Teilnehmer
  // können nicht im Nachhinein als freiwilliger Rückzug geführt werden.
  if (latest && !getStageEntrants(tournament, latest).includes(name)) return false;
  for (const stage of tournament.stages) {
    if (stage.type !== 'KNOCKOUT' || !isStageStarted(tournament, stage)) continue;
    const matches = getMockStageBaseMatches(tournament, stage);
    const bronze = matches.find((match) => match.round === 'Spiel um Platz 3');
    const bronzePending = bronze && getMockStoredResult(bronze.id)?.status !== 'FINISHED';
    for (const match of matches) {
      if (match.sideA !== name && match.sideB !== name) continue;
      const result = getMockStoredResult(match.id);
      if (result?.status !== 'FINISHED') continue;
      const winner = match.autoWinner ?? result.forcedWinner ?? resultWinner(result, match.sideA, match.sideB, tournament.sport);
      if (winner && winner !== name) {
        // Nach Halbfinal-Niederlage ist der Spieler noch für Bronze aktiv.
        if (match.round === 'Halbfinale' && bronzePending) continue;
        return false;
      }
    }
    if (isStageCompleted(tournament, stage)) return false;
  }
  return true;
}

export function withdrawMockParticipant(tournament: DemoTournament, name: string) {
  if (!canWithdrawMockParticipant(tournament, name)) return false;
  const activeAtWithdrawal = getActiveStage(tournament);
  const next = getNextStartableStage(tournament);
  const beforeFirstStart = !tournament.hasStarted && !tournament.stages.some((stage) => isStageStarted(tournament, stage));
  const qualifiedForUpcoming = Boolean(!activeAtWithdrawal && next && getStageEntrants(tournament, next).includes(name));
  markWithdrawalRestoreEligibility(tournament.id, name,
    beforeFirstStart ? { kind: 'PRESTART', phaseId: tournament.stages[0]?.id ?? null }
      : qualifiedForUpcoming && next ? { kind: 'BETWEEN_PHASES', phaseId: next.id }
      : null);
  const latestCompleted = [...tournament.stages].reverse().find((stage) => isStageCompleted(tournament, stage));
  const withdrawalTiming: WithdrawalTiming = activeAtWithdrawal
    ? { kind: 'DURING_PHASE', stageId: activeAtWithdrawal.id }
    : latestCompleted ? { kind: 'AFTER_PHASE', stageId: latestCompleted.id }
      : { kind: 'BEFORE_TOURNAMENT', stageId: null };
  saveWithdrawalTiming(tournament.id, name, withdrawalTiming);
  saveParticipantWithdrawal(tournament, name);
  if (!tournament.hasStarted && !tournament.stages.some((stage) => isStageStarted(tournament, stage))) {
    // Eine zurückgezogene Person wird vor dem Turnierbeginn ersatzlos aus
    // der Auslosung entfernt; keine kampflosen Partien erzeugen.
    reconcilePrestartDraws(tournament);
  } else {
    settleWithdrawnMatches(tournament);
  }
  // Nach dem Phasenabschluss, aber vor dem Start der Folgephase, muss ein
  // Rückzug die Qualifikation neu bestimmen (inklusive Nachrückern).
  for (let index = tournament.stages.length - 2; index >= 0; index -= 1) {
    const completed = tournament.stages[index];
    const upcoming = tournament.stages[index + 1];
    if (isStageCompleted(tournament, completed) && !isStageStarted(tournament, upcoming)) {
      refreshCompletedStageQualifiers(tournament, completed);
      break;
    }
  }
  const active = getActiveStage(tournament);
  if (active) {
    const unfinished = getMockStageMatches(tournament, active).some((match) => match.status !== 'FINISHED');
    if (!unfinished) reconcileCompletedPhase(`${active.id}-withdrawal`);
  }
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}

/** Undo is allowed only if withdrawal happened BEFORE a phase started, and
 * for later phases only when the participant had qualified at withdrawal time. */
export function canRestoreMockParticipant(tournament: DemoTournament, name: string) {
  if (!isMockParticipantWithdrawn(tournament, name)) return false;
  const record = getWithdrawalRestoreEligibility(tournament.id, name);
  if (!record) return false;
  if (record.kind === 'PRESTART') {
    return !tournament.hasStarted && !tournament.stages.some((stage) => isStageStarted(tournament, stage));
  }
  const stage = tournament.stages.find((item) => item.id === record.phaseId);
  if (!stage || isStageStarted(tournament, stage) || getActiveStage(tournament)) return false;
  const previous = tournament.stages[tournament.stages.indexOf(stage) - 1];
  return Boolean(previous && isStageCompleted(tournament, previous));
}

export function restoreMockParticipant(tournament: DemoTournament, name: string) {
  if (!canRestoreMockParticipant(tournament, name)) return false;
  const record = getWithdrawalRestoreEligibility(tournament.id, name)!;
  removeParticipantWithdrawal(tournament, name);
  if (record.kind === 'PRESTART') reconcilePrestartDraws(tournament);
  else {
    const upcoming = tournament.stages.find((stage) => stage.id === record.phaseId);
    if (upcoming) {
      const previous = tournament.stages[tournament.stages.indexOf(upcoming) - 1];
      if (previous) refreshCompletedStageQualifiers(tournament, previous);
    }
  }
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'PARTICIPANT_RESTORED', description: `${name}: Rückzug vor Phasenstart rückgängig gemacht` });
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}

type RankingRow = RankedParticipant;

function rankParticipants(participants: string[], matches: BaseStageMatch[], results: StoredMatchResult[], sport: string, swiss = false, plannedRounds?: number): RankingRow[] {
  const resultById = new Map(results.map((result) => [result.matchId, result]));
  const automaticWins = matches
    .filter((match) => match.sideB === 'Freilos' && match.autoWinner)
    .map((match) => match.autoWinner!);
  const rankingMatches = matches.map((match) => {
    const result = resultById.get(match.id);
    return {
      sideA: match.sideA, sideB: match.sideB,
      status: result?.status, sets: result?.sets,
      forcedWinner: result?.forcedWinner, decisionSide: result?.decisionSide,
    };
  });
  return rankStandings(participants, rankingMatches, sport, automaticWins, swiss, plannedRounds);
}

function stageQualifierCount(tournament: DemoTournament, stage: TournamentStage) {
  const stageIndex = tournament.stages.findIndex((item) => item.id === stage.id);
  const nextStage = tournament.stages[stageIndex + 1];
  if (!nextStage) return 0;
  if (stage.advancement.type === 'top_n' && stage.advancement.value > 0) return stage.advancement.value;
  return Math.max(1, Number(nextStage.settings.entrants) || 1);
}

/** Pending/recorded manual decision at the Swiss qualifying boundary. A regular Swiss
 *  fixture is never fabricated for this: its result must not affect Swiss/Buchholz scores. */
export interface SwissCutoffStatus {
  stageId: string;
  tie: SwissCutoffTie;
  signature: string;
  decision: StoredSwissCutoffDecision | null;
}

function swissCutoffStatus(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): SwissCutoffStatus | null {
  if (stage.type !== 'SWISS' || !isStageStarted(tournament, stage)) return null;
  const nextStage = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
  if (!nextStage || isStageStarted(tournament, nextStage)) return null;
  const base = baseStageMatches(tournament, stage, results);
  const roundCount = Number(stage.settings.rounds) || 4;
  if (!base.some((match) => match.round === `Runde ${roundCount}`)) return null;
  const scheduled = base.filter((match) => !match.autoWinner && match.sideA !== 'TBD' && match.sideB !== 'TBD');
  if (scheduled.length === 0 || scheduled.some((match) => results.find((result) => result.matchId === match.id)?.status !== 'FINISHED')) return null;
  const participants = getStageEntrants(tournament, stage);
  const ranked = rankParticipants(participants, base, results, tournament.sport, true, roundCount);
  const withdrawn = new Set(ranked.filter((row) => isMockParticipantWithdrawn(tournament, row.name)).map((row) => row.name));
  const tie = findSwissCutoffTie(ranked, tournament.sport, stageQualifierCount(tournament, stage), withdrawn);
  if (!tie) return null;
  // Invalidate old decisions after corrections / withdrawals / changed pairings.
  const signature = JSON.stringify({
    tie, ranked: ranked.map((row) => [row.name, row.played, row.wins, row.losses, row.draws,
      row.buchholz, row.setsWon, row.setsLost, row.ballsWon, row.ballsLost]),
    games: base.map((match) => {
      const result = results.find((item) => item.matchId === match.id);
      return [match.id, match.sideA, match.sideB, match.autoWinner, result?.status, result?.sets, result?.forcedWinner, result?.decisionSide];
    }),
  });
  return { stageId: stage.id, tie, signature,
    decision: readSwissCutoffDecision(tournament.id, stage.id, signature) };
}

/** Available immediately after the last regular round; restored after page reload. */
export function getPendingSwissCutoff(tournament: DemoTournament): SwissCutoffStatus | null {
  const active = getActiveStage(tournament);
  if (!active || active.type !== 'SWISS') return null;
  const current = swissCutoffStatus(tournament, active, readResults());
  return current && current.decision?.winners?.length === current.tie.slots ? null : current;
}

/** Reflect the documented decision in the visible positions as well as qualification. */
export function applyResolvedSwissCutoffOrder<T extends { name: string }>(
  tournament: DemoTournament, stage: TournamentStage, rows: readonly T[],
): T[] {
  const current = swissCutoffStatus(tournament, stage, readResults());
  return applySwissCutoffDecision(rows, current?.tie ?? null, current?.decision?.winners ?? []);
}

function nextSwissCutoffPair(status: SwissCutoffStatus): [string, string] {
  const eliminated = new Set(status.decision?.eliminated ?? []);
  const played = new Map(status.tie.players.map((name) => [name, 0]));
  status.decision?.sets.forEach((match) => {
    played.set(match.sideA, (played.get(match.sideA) ?? 0) + 1);
    played.set(match.sideB, (played.get(match.sideB) ?? 0) + 1);
  });
  const remaining = status.tie.players.filter((name) => !eliminated.has(name));
  const ordered = remaining.sort((a, b) => (played.get(a) ?? 0) - (played.get(b) ?? 0)
    || status.tie.players.indexOf(a) - status.tie.players.indexOf(b));
  return [ordered[0], ordered[1]];
}

export function getSwissCutoffPair(status: SwissCutoffStatus): [string, string] {
  return nextSwissCutoffPair(status);
}

export function recordSwissCutoffSet(tournament: DemoTournament, sideAScore: number, sideBScore: number): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Stichentscheid vorhanden.';
  if (current.decision?.mode === 'LOT') return 'Ein Losentscheid wurde bereits festgelegt.';
  const remaining = current.tie.players.filter((name) => !current.decision?.eliminated.includes(name));
  if (remaining.length <= current.tie.slots) return 'Alle Qualifikationsplätze sind bereits entschieden.';
  if (![sideAScore, sideBScore].every((value) => Number.isSafeInteger(value) && value >= 0) || sideAScore === sideBScore) {
    return 'Bitte ein eindeutiges, gültiges Satzergebnis eintragen.';
  }
  if (sportScoring(tournament.sport).mode === 'sets'
    && !isValidSportSet(tournament.sport, 1, 0, { number: 1, sideAScore, sideBScore })) {
    return 'Ungültiges Satzergebnis für diese Sportart.';
  }
  const [sideA, sideB] = nextSwissCutoffPair(current);
  if (!sideA || !sideB) return 'Für diesen Stichentscheid fehlen Teilnehmer.';
  const winner = sideAScore > sideBScore ? sideA : sideB;
  const loser = winner === sideA ? sideB : sideA;
  const eliminated = [...(current.decision?.eliminated ?? []), loser];
  const sets = [...(current.decision?.sets ?? []), { sideA, sideB, pointsA: sideAScore, pointsB: sideBScore, winner }];
  const winners = current.tie.players.filter((name) => !eliminated.includes(name));
  const done = winners.length === current.tie.slots;
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: 'SET', eliminated, sets, winners: done ? winners : undefined,
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_SET',
    description: `Stichentscheid: ${sideA} gegen ${sideB} ${sideAScore}:${sideBScore} – ${winner} gewinnt.` });
  if (done) reconcileCompletedPhase(`${current.stageId}-sw-cutoff-decision`);
  return null;
}

export function recordSwissCutoffLot(tournament: DemoTournament, winners: string[]): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Losentscheid vorhanden.';
  if (current.decision?.sets.length) return 'Bereits erfasste Entscheidungssätze müssen zuerst zurückgesetzt werden.';
  const selected = new Set(winners);
  if (selected.size !== current.tie.slots || winners.some((name) => !current.tie.players.includes(name))) {
    return `Bitte genau ${current.tie.slots} ausgeloste Person(en) auswählen.`;
  }
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: 'LOT', eliminated: current.tie.players.filter((name) => !selected.has(name)), sets: [], winners,
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_LOT',
    description: `Physischer Losentscheid. Qualifiziert: ${winners.join(', ')}` });
  reconcileCompletedPhase(`${current.stageId}-sw-cutoff-decision`);
  return null;
}

export function resetSwissCutoffSets(tournament: DemoTournament): void {
  const current = getPendingSwissCutoff(tournament);
  if (!current || !current.decision?.sets.length) return;
  clearSwissCutoffDecision(tournament.id, current.stageId);
}

function computeStageQualifiers(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]) {
  const targetCount = stageQualifierCount(tournament, stage);
  if (targetCount <= 0) return [];
  const matches = baseStageMatches(tournament, stage, results);

  if (stage.type === 'GROUPS') {
    const rankings = groupMembers(tournament, stage).map((members, groupIndex) => {
      const groupLabel = `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
      return rankParticipants(members, matches.filter((match) => match.round === groupLabel), results, tournament.sport);
    });
    const qualified: string[] = [];
    for (let rankIndex = 0; qualified.length < targetCount; rankIndex += 1) {
      const tier = rankings.map((ranking) => ranking[rankIndex]).filter((row): row is RankingRow => Boolean(row));
      if (!tier.length) break;
      tier.sort((a, b) => compareRankingRows(tournament.sport, a, b));
      qualified.push(...tier.filter((row) => !isMockParticipantWithdrawn(tournament, row.name)).slice(0, targetCount - qualified.length).map((row) => row.name));
    }
    return qualified;
  }

  if (stage.type === 'ROUND_ROBIN' || stage.type === 'SWISS') {
    const ranked = rankParticipants(getStageEntrants(tournament, stage), matches, results, tournament.sport,
      stage.type === 'SWISS', stage.type === 'SWISS' ? Number(stage.settings.rounds) || 4 : undefined);
    const cutoff = stage.type === 'SWISS' ? swissCutoffStatus(tournament, stage, results) : null;
    if (cutoff && cutoff.decision?.winners?.length !== cutoff.tie.slots) return [];
    const ordered = applySwissCutoffDecision(ranked, cutoff?.tie ?? null, cutoff?.decision?.winners ?? []);
    return ordered.filter((row) => !isMockParticipantWithdrawn(tournament, row.name)).slice(0, targetCount).map((row) => row.name);
  }

  return getStageEntrants(tournament, stage).filter((name) => !isMockParticipantWithdrawn(tournament, name)).slice(0, targetCount);
}

export function refreshCompletedStageQualifiers(tournament: DemoTournament, stage: TournamentStage) {
  if (!isStageCompleted(tournament, stage)) return false;
  const stageIndex = tournament.stages.findIndex((item) => item.id === stage.id);
  const nextStage = tournament.stages[stageIndex + 1];
  if (!nextStage || isStageStarted(tournament, nextStage)) return false;
  const qualified = computeStageQualifiers(tournament, stage, readResults());
  if (stage.type === 'SWISS' && swissCutoffStatus(tournament, stage, readResults()) && !qualified.length) return false;
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

    // Suspend phase completion until the tournament director resolves a perfect
    // sporting tie at the cut. No alphabetic auto-qualification is permitted.
    const cutoff = swissCutoffStatus(tournament, activeStage, readResults());
    if (cutoff && cutoff.decision?.winners?.length !== cutoff.tie.slots) return;
    const qualifiedForNext = computeStageQualifiers(tournament, activeStage, readResults());
    completeStage(tournament, activeStage, qualifiedForNext);
    const isLastStage = tournament.stages[tournament.stages.length - 1]?.id === activeStage.id;
    updateMockTournamentStatus(tournament.id, isLastStage ? 'FINISHED' : 'PAUSED');
    return;
  }
}

export function completeMockMatch(matchId: string, sets: MatchSet[], status: MockMatchState = 'FINISHED', confirmedByAdmin = false, decisionSide?: WinnerSide, decision?: ScoreDecision) {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
  if (tournament && !canEditMockMatch(tournament, matchId)) return previous;
  const previousFinal = previous?.status === 'FINISHED';
  if (previousFinal) {
    const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
    const stage = tournament?.stages.find((item) => matchId.startsWith(`${item.id}-`));
    if (tournament && stage && !canEditFinishedResults(tournament, stage)) return previous;
  }
  const stage = tournament?.stages.find((item) => matchId.startsWith(`${item.id}-`));
  if (tournament && stage && status === 'FINISHED') {
    const bestOf = getMockStageMatches(tournament, stage).find((match) => match.id === matchId)?.bestOf ?? stage.bestOf;
    const isKnockout = ['KNOCKOUT', 'DOUBLE_ELIMINATION', 'PLACEMENT', 'SWISS'].includes(stage.type);
    const validationError = validateCompleteResult(tournament.sport, bestOf, sets, isKnockout, decisionSide);
    if (validationError) throw new Error(validationError);
    const decisionError = validateScoreDecision(tournament.sport, sets, decisionSide, decision);
    if (decisionError) throw new Error(decisionError);
  }
  const adminPhaseConfirmation = status === 'FINISHED' && confirmedByAdmin && (stage?.type === 'SWISS' || stage?.type === 'KNOCKOUT');
  const next: StoredMatchResult = {
    ...previous, matchId, sets, status, decisionSide, decision, extraTimeProgress: undefined, forcedWinner: undefined, thirdPlaceSkipped: undefined,
    confirmedA: adminPhaseConfirmation ? true : previousFinal ? false : previous?.confirmedA,
    confirmedB: adminPhaseConfirmation ? true : previousFinal ? false : previous?.confirmedB,
    finishedAt: status === 'FINISHED' ? (previous?.finishedAt ?? Date.now()) : previous?.finishedAt,
  };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (tournament && status === 'FINISHED') {
    const resultText = (value: StoredMatchResult | undefined) => {
      const scores = value?.sets.length
        ? sportScoring(tournament.sport).mode === 'score'
          ? scoreWithDecision(tournament.sport, value.sets, value.decision)
          : value.sets.map((set) => `${set.sideAScore}:${set.sideBScore}`).join(' · ')
        : '–';
      return value?.decisionSide ? `${scores} · Sieger ${value.decisionSide}` : scores;
    };
    recordMockAudit({ tournamentId: tournament.id, matchId, actor: previousFinal ? 'Turnierleitung (lokal)' : 'Ergebniseingabe (lokal)', action: previousFinal ? 'RESULT_CORRECTED' : 'RESULT_RECORDED', description: previousFinal ? 'Endergebnis nachträglich korrigiert' : 'Endergebnis eingetragen', before: resultText(previous), after: resultText(next), beforeSets: previousFinal ? previous?.sets : undefined, afterSets: previousFinal ? sets : undefined, beforeDecisionSide: previousFinal ? previous?.decisionSide : undefined, afterDecisionSide: previousFinal ? decisionSide : undefined, beforeDecision: previousFinal ? previous?.decision : undefined, afterDecision: previousFinal ? decision : undefined });
  }
  if (tournament && adminPhaseConfirmation) {
    recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'RESULT_CONFIRMED', description: 'Phasen-Endergebnis ausdrücklich durch die Turnierleitung bestätigt' });
  }
  if (status === 'FINISHED') {
    const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
    if (tournament) settleWithdrawnMatches(tournament);
    reconcileCompletedPhase(matchId);
  }
  return next;
}

/** Wertet das Bronze-Spiel ohne Partie: beide Halbfinalverlierer werden Dritte. */
/** Undo only the most recent administrative correction, while the next phase is unlocked. */
export function restoreMockCorrectedResult(tournament: DemoTournament, auditId: string) {
  const events = getMockAudit(tournament.id);
  const event = events.find((item) => item.id === auditId);
  if (!event || event.action !== 'RESULT_CORRECTED' || !event.matchId || !event.beforeSets?.length || !event.afterSets?.length) return false;
  const lastResultChange = events.find((item) => item.matchId === event.matchId && ['RESULT_RECORDED', 'RESULT_CORRECTED', 'RESULT_RESTORED'].includes(item.action));
  if (lastResultChange?.id !== auditId || !canEditMockMatch(tournament, event.matchId)) return false;
  const current = readResults();
  const previous = current.find((item) => item.matchId === event.matchId);
  if (!previous || previous.status !== 'FINISHED' || JSON.stringify(previous.sets) !== JSON.stringify(event.afterSets)) return false;
  const restored: StoredMatchResult = { ...previous, sets: event.beforeSets, decisionSide: event.beforeDecisionSide, decision: event.beforeDecision, confirmedA: false, confirmedB: false };
  writeResults([restored, ...current.filter((item) => item.matchId !== event.matchId)]);
  const stage = tournament.stages.find((item) => event.matchId!.startsWith(`${item.id}-`));
  if (stage) refreshCompletedStageQualifiers(tournament, stage);
  recordMockAudit({ tournamentId: tournament.id, matchId: event.matchId, actor: 'Turnierleitung (lokal)', action: 'RESULT_RESTORED', description: 'Letzte Ergebniskorrektur rückgängig gemacht', before: event.after, after: event.before });
  return true;
}

export function skipMockThirdPlaceMatch(tournament: DemoTournament, matchId: string) {
  if (!isMockThirdPlaceMatch(matchId)) return false;
  const stage = tournament.stages.find((item) => `${item.id}-third-place` === matchId);
  if (!stage || stage.type !== 'KNOCKOUT' || !isStageStarted(tournament, stage)) return false;
  const match = getMockStageMatches(tournament, stage).find((item) => item.id === matchId);
  if (!match || !['WAITING', 'LIVE', 'READY'].includes(match.status)) return false;
  const existing = readResults().find((item) => item.matchId === matchId);
  if (existing?.sets.length || existing?.status === 'FINISHED') return false;
  const current = readResults();
  const skipped: StoredMatchResult = { matchId, sets: [], status: 'FINISHED', thirdPlaceSkipped: true };
  writeResults([skipped, ...current.filter((item) => item.matchId !== matchId)]);
  updateRuntime(matchId, { table: 'Noch offen', status: 'FINISHED' });
  reconcileCompletedPhase(matchId);
  return true;
}

export function getMockParticipantCode(tournament: DemoTournament, player: string) {
  const index = getRuntimeParticipantNames(tournament).indexOf(player);
  if (index < 0) return null;
  return tournament.participantCodes?.[player] ?? String(4100 + index).slice(-4);
}

/** Predictable local-only preview code; never use this mechanism as production authentication. */
export function getMockMatchCode(matchId: string) {
  let hash = 2166136261;
  for (const char of matchId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

export function verifyMockMatchCode(matchId: string, code: string) {
  const current = findMockRuntimeMatch(matchId);
  return code.trim().toUpperCase() === getMockMatchCode(matchId) && Boolean(current && current.match.status === 'LIVE' && current.match.table.startsWith('Tisch '));
}

export function confirmMockMatchSide(matchId: string, side: 'A' | 'B', playerCode: string) {
  const found = findMockRuntimeMatch(matchId);
  if (!found || found.match.status !== 'FINISHED') return false;
  const player = side === 'A' ? found.match.sideA : found.match.sideB;
  if (playerCode.trim() !== getMockParticipantCode(found.tournament, player)) return false;
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  if (!previous || previous.status !== 'FINISHED') return false;
  const key = side === 'A' ? 'confirmedA' : 'confirmedB';
  if (previous[key]) return true;
  const next = { ...previous, [key]: true };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  recordMockAudit({ tournamentId: found.tournament.id, matchId, actor: `Teilnehmerseite ${side} (lokaler Code)`, action: 'RESULT_CONFIRMED', description: `${player} hat das Endergebnis bestätigt` });
  return true;
}

export function adminConfirmMockMatch(tournament: DemoTournament, matchId: string) {
  const found = getMockStageMatches(tournament, tournament.stages.find((stage) => matchId.startsWith(`${stage.id}-`)) ?? tournament.stages[0]).find((item) => item.id === matchId);
  if (!found || found.status !== 'FINISHED') return false;
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  if (!previous || previous.thirdPlaceSkipped || previous.forcedWinner) return false;
  if (previous.confirmedA && previous.confirmedB) return true;
  writeResults([{ ...previous, confirmedA: true, confirmedB: true }, ...current.filter((item) => item.matchId !== matchId)]);
  recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'RESULT_CONFIRMED', description: `Endergebnis von ${found.sideA} – ${found.sideB} durch Turnierleitung bestätigt` });
  return true;
}

export function countMockOpenConfirmations(tournament: DemoTournament) {
  const results = readResults();
  const stageIds = tournament.stages.map((stage) => `${stage.id}-`);
  return results.filter((result) => stageIds.some((prefix) => result.matchId.startsWith(prefix)) && result.status === 'FINISHED' && result.sets.length > 0 && !result.forcedWinner && !(result.confirmedA && result.confirmedB)).length;
}

export function getMockMatchConfirmation(matchId: string) {
  return readResults().find((item) => item.matchId === matchId);
}

/** Swiss-Record des Gegners VOR dem jeweiligen Paarungsdurchgang. */
export function getSwissRecordBeforeRound(tournament: DemoTournament, stage: TournamentStage, name: string, roundNumber: number) {
  const results = readResults();
  let wins = 0;
  let losses = 0;
  const fixtures = baseStageMatches(tournament, stage, results);
  for (const match of fixtures) {
    if ((Number(match.round.match(/\d+/)?.[0]) || 0) >= roundNumber) continue;
    if (match.sideA !== name && match.sideB !== name) continue;
    const finished = results.find((result) => result.matchId === match.id);
    const winner = match.autoWinner ?? resultWinner(finished, match.sideA, match.sideB, tournament.sport);
    if (!winner) continue;
    if (winner === name) wins += 1;
    else losses += 1;
  }
  return `${wins}:${losses}`;
}

/** Current, completed Swiss record (including earlier-round byes). */
export function getSwissCurrentRecord(tournament: DemoTournament, stage: TournamentStage, name: string) {
  return getSwissRecordBeforeRound(tournament, stage, name, Number.POSITIVE_INFINITY);
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
    playerCode: getMockParticipantCode(tournament, player) ?? '–',
    matchCode: (ownLive || next) ? getMockMatchCode((ownLive || next)!.id) : '–',
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
