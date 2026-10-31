import { isParticipantWithdrawn, saveParticipantWithdrawal, removeParticipantWithdrawal, markWithdrawalRestoreEligibility, getWithdrawalRestoreEligibility, saveWithdrawalTiming, type WithdrawalTiming } from '@/services/mockWithdrawals';
import { reconcilePrestartDraws, reconcileQualifiedDraw } from '@/services/mockDrawStore';
import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { generateScoreGroupedSwissPairings, type SwissScorePlayer } from '@/engine/swissScoreGroups';
import { getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeStage, getActiveStage, getStageEntrants, getNextStartableStage, getNextCompetitionStage, getPreviousCompetitionStage, isStageCompleted, isStageStarted, setStageEntrants, reopenStageForQualification, isSwissRoundApproved, approveSwissRound, revokeSwissRoundApprovals, reopenStageAfterCorrection } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getBracketSlots, getGroupAssignments, getSwissOrder } from '@/services/mockDrawStore';
import { getBlockedMockTables, isMockTableBlocked } from '@/services/mockTableLocks';
import { getMockAudit, recordMockAudit } from '@/services/mockAudit';
import { rankStandings, type RankedParticipant } from '@/domain/standingRankings';
import { compareRankingRows, resultScore, resultWinnerSide, scoreWithDecision, sportScoring, validateCompleteResult, validateScoreDecision, type ExtraTimeProgress, type ScoreDecision, type WinnerSide } from '@/domain/sportScoring';
import { getWithdrawalAwardSets } from '@/domain/withdrawalScoring';
import { newPlayoffRound, playoffBoundaryTie, playoffQualified, playoffRoundFinished, type PlayoffMode } from '@/domain/swissCutoffPlayoff';
import { addSwissExtraRound, getSwissExtraRoundCount } from '@/services/mockSwissExtendedRounds';
import { applySwissCutoffDecision, findSwissCutoffTie, type SwissCutoffTie } from '@/domain/swissCutoffTie';
import { clearSwissCutoffDecision, readSwissCutoffDecision, readSwissRoundRobinHistory, saveSwissCutoffDecision, type StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import { isValidSportSet } from '@/domain/sportScoring';

export { getRuntimeParticipantNames } from '@/services/mockParticipants';

export type MockMatchState = 'LIVE' | 'READY' | 'WAITING' | 'CONFIRMATION' | 'FINISHED' | 'CANCELLED';

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
  adminConfirmed?: boolean;
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
  const next = getNextCompetitionStage(tournament, stage);
  return !next || !isStageStarted(tournament, next);
}

/** Preserve scheduled breaks when an earlier competition needs reapproval. */
function statusAfterReopening(tournament: DemoTournament): 'PAUSED' | 'RUNNING' {
  // Preserve an explicitly requested pause during administrative corrections.
  const latest = getAllMockTournaments().find((item) => item.id === tournament.id);
  if ((latest?.status ?? tournament.status) === 'PAUSED') return 'PAUSED';
  return tournament.stages.some((stage) => stage.type === 'BREAK'
    && isStageStarted(tournament, stage) && !isStageCompleted(tournament, stage))
    ? 'PAUSED' : 'RUNNING';
}

/** Real KO / Swiss round index, excluding separate cutoff fixtures.
 * The bronze match is in the same round as the final. */
function competitionRoundIndex(tournament: DemoTournament, stage: TournamentStage, matchId: string): number | null {
  // Results and runtime storage are shared by all local tournaments.
  if (!matchId.startsWith(`${stage.id}-`)) return null;
  if (stage.type === 'SWISS') {
    const swiss = matchId.match(/-sw-r(\d+)-m\d+$/);
    return swiss ? Number(swiss[1]) : null;
  }
  if (!['KNOCKOUT', 'DOUBLE_ELIMINATION', 'PLACEMENT'].includes(stage.type)) return null;
  if (matchId.endsWith('-third-place')) return Math.log2(getBracketSlots(tournament, stage).length);
  const knockout = matchId.match(/-r(\d+)-m\d+$/);
  return knockout ? Number(knockout[1]) : null;
}

/** As soon as ANY later-round game was assigned, previous rounds are frozen.
 * startedAt persists after unassignment, so clearing the table cannot unlock
 * an earlier round. Completed later matches are protected as well. */
function nextRoundAlreadyStarted(tournament: DemoTournament, stage: TournamentStage, round: number): boolean {
  const runtime = readRuntime();
  const results = readResults();
  return runtime.some((entry) => {
    const index = competitionRoundIndex(tournament, stage, entry.matchId);
    return index !== null && index > round && Boolean(entry.startedAt);
  }) || results.some((entry) => {
    const index = competitionRoundIndex(tournament, stage, entry.matchId);
    return index !== null && index > round && (entry.status === 'FINISHED' || entry.sets.length > 0);
  });
}

/** After editing an earlier completed match, not-yet-started later-round
 * fixtures are invalidated and rebuilt using the corrected sporting results. */
function invalidateUnstartedLaterRounds(tournament: DemoTournament, stage: TournamentStage, correctedMatchId: string) {
  const round = competitionRoundIndex(tournament, stage, correctedMatchId);
  if (round === null || nextRoundAlreadyStarted(tournament, stage, round)) return;
  const isLater = (id: string) => {
    const index = competitionRoundIndex(tournament, stage, id);
    return index !== null && index > round;
  };
  const oldResults = readResults();
  if (oldResults.some((result) => isLater(result.matchId))) {
    writeResults(oldResults.filter((result) => !isLater(result.matchId)));
  }
  const oldRuntime = readRuntime();
  if (oldRuntime.some((runtime) => isLater(runtime.matchId))) {
    writeRuntime(oldRuntime.filter((runtime) => !isLater(runtime.matchId)));
  }
  if (stage.type === 'SWISS' && typeof window !== 'undefined') {
    const fixtures = readSwissFixtures();
    if (fixtures.some((entry) => entry.tournamentId === tournament.id && entry.stageId === stage.id && entry.round > round)) {
      window.localStorage.setItem(SWISS_FIXTURE_KEY, JSON.stringify(fixtures.filter((entry) =>
        entry.tournamentId !== tournament.id || entry.stageId !== stage.id || entry.round <= round)));
    }
  }
}

// Zurückgezogene Gruppen-Teilnehmer verlieren ausnahmslos alle Partien 0:11.
// Die automatisch gewerteten Begegnungen dürfen daher nicht korrigiert werden.
export function canEditMockMatch(tournament: DemoTournament, matchId: string) {
  const stage = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`));
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED' || !stage || !canEditFinishedResults(tournament, stage)) return false;
  const cutoffIndex = Number(matchId.match(/-sw-cutoff-set-m(\d+)$/)?.[1] ?? 0);
  if (stage.type === 'SWISS' && cutoffIndex > 0) {
    const prefix = `${stage.id}-sw-cutoff-set-m`;
    const future = (id: string) => id.startsWith(prefix) && Number(id.slice(prefix.length)) > cutoffIndex;
    // Later decision games depend on this winner, so the original result
    // becomes immutable as soon as a subsequent game was assigned.
    if (readRuntime().some((item) => future(item.matchId) && item.startedAt)
      || readResults().some((item) => future(item.matchId) && (item.status === 'FINISHED' || item.sets.length))) return false;
  }
  const round = competitionRoundIndex(tournament, stage, matchId);
  if (round !== null && nextRoundAlreadyStarted(tournament, stage, round)) return false;
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
    draws: 0,
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
    } else {
      a.draws += 1;
      b.draws += 1;
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
      pairingPoints: sportScoring(sport).mode === 'score' ? 3 * row.wins + row.draws : row.wins,
      losses: row.losses,
      byes: row.byes,
      order: row.order,
      opponents: row.opponents,
    };
  });
  return generateScoreGroupedSwissPairings(players);
}

export function getTotalSwissRoundCount(tournament: DemoTournament, stage: TournamentStage): number {
  return Math.max(1, Number(stage.settings.rounds) || 4) + getSwissExtraRoundCount(tournament.id, stage.id);
}

function swissMatches(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): BaseStageMatch[] {
  const participants = getSwissOrder(tournament, stage);
  const totalRounds = getTotalSwissRoundCount(tournament, stage);
  const matches: BaseStageMatch[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    if (round > 1) {
      const previous = matches.filter((match) => match.round === `Runde ${round - 1}` && !match.autoWinner);
      const previousDone = previous.every((match) => results.find((item) => item.matchId === match.id)?.status === 'FINISHED');
      if (!previousDone || !isSwissRoundApproved(tournament, stage, round - 1)) break;
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
      requiresWinner: stage.type === 'SWISS'
        ? !sportScoring(tournament.sport).allowsDraw
        : ['KNOCKOUT', 'DOUBLE_ELIMINATION', 'PLACEMENT'].includes(stage.type),
      pauseA: getElapsedRestMinutes(lastFinishByParticipant.get(match.sideA), now),
      pauseB: getElapsedRestMinutes(lastFinishByParticipant.get(match.sideB), now),
      note: 'Wartet auf Tischzuweisung',
    }, results, runtime))
    .map((match) => tournament.status === 'ABORTED' && match.status !== 'FINISHED' ? { ...match, status: 'CANCELLED' as const, table: 'Noch offen' } : match);
}

/** Phase 1.5 fixtures share the regular table-assignment and result-entry
 * runtime. Their IDs live under the parent Swiss stage but never enter its
 * ranking matches, so Sonneborn-Berger and original Swiss results are unaffected. */
export function getSwissRoundRobinMatches(tournament: DemoTournament, stage: TournamentStage): MockRuntimeMatch[] {
  const history = getSwissCutoffHistory(tournament, stage);
  if (!history) return [];
  const results = readResults();
  const runtime = readRuntime();
  const times = getLatestFinishedTimes(tournament, results);
  const rounds = history.extraRounds ?? [];
  return rounds.flatMap((round, roundIndex) => {
    if (round.kind !== 'ROUND_ROBIN') return [];
    return round.matches.map((match) => {
      return applyStoredState({
        id: `${stage.id}-sw-playoff-r${roundIndex + 1}-m${round.matches.indexOf(match) + 1}`,
        table: 'Noch offen',
        sideA: match.sideA,
        sideB: match.sideB,
        score: '–',
        status: 'WAITING',
        phase: `Phase ${tournament.stages.indexOf(stage) + 1}.5 · Jeder gegen Jeden`,
        stageId: stage.id,
        round: `Spieltag ${match.matchDay ?? (roundIndex + 1)}`,
        matchDay: match.matchDay,
        bestOf: 1,
        sport: tournament.sport,
        requiresWinner: true,
        pauseA: getElapsedRestMinutes(times.get(match.sideA)),
        pauseB: getElapsedRestMinutes(times.get(match.sideB)),
        note: 'Wartet auf Tischzuweisung',
      }, results, runtime);
    });
  });
}

/** A Swiss qualification tiebreak is a real table fixture, not an editable
 * score in the warning dialog. Completed tiebreaks remain available as history. */
export function getSwissCutoffSetMatches(tournament: DemoTournament, stage: TournamentStage): MockRuntimeMatch[] {
  const decision = getSwissCutoffHistory(tournament, stage);
  if (!decision || decision.mode !== 'SET') return [];
  const current = getPendingSwissCutoff(tournament);
  const savedResults = readResults();
  const savedRuntime = readRuntime();
  const times = getLatestFinishedTimes(tournament, savedResults);
  const complete = decision.sets.map((set) => [set.sideA, set.sideB] as const);
  const next = current?.stageId === stage.id ? getSwissCutoffPair(current) : null;
  const pairs = [...complete, ...(next?.[0] && next?.[1] ? [[next[0], next[1]] as const] : [])];
  return pairs.map(([sideA, sideB], index) => applyStoredState({
    id: `${stage.id}-sw-cutoff-set-m${index + 1}`,
    table: 'Noch offen',
    sideA, sideB,
    score: '–',
    status: 'WAITING',
    phase: `Phase ${tournament.stages.indexOf(stage) + 1} · Stichentscheid`,
    stageId: stage.id,
    round: `Entscheidungssatz ${index + 1}`,
    bestOf: 1,
    sport: tournament.sport,
    requiresWinner: true,
    pauseA: getElapsedRestMinutes(times.get(sideA)),
    pauseB: getElapsedRestMinutes(times.get(sideB)),
    note: 'Wartet auf Tischzuweisung',
  }, savedResults, savedRuntime));
}

/** Schedule the deciding set. The standard tournament overview assigns the
 * free table and displays the normal, compact game-entry card. */
export function beginSwissCutoffSetMatch(tournament: DemoTournament): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Stichentscheid vorhanden.';
  if (current.decision?.mode && current.decision.mode !== 'SET') return 'Ein anderes Entscheidungsverfahren wurde bereits begonnen.';
  if (current.decision?.mode === 'SET') return null;
  const [sideA, sideB] = getSwissCutoffPair(current);
  if (!sideA || !sideB) return 'Für den Stichentscheid fehlen Teilnehmer.';
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: 'SET', eliminated: [], sets: [],
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_SET',
    description: `Entscheidungssatz ${sideA} gegen ${sideB} zur Tischzuweisung freigegeben.` });
  return null;
}

export function getMockRuntimeMatches(tournament: DemoTournament): MockRuntimeMatch[] {
  const currentStage = getActiveStage(tournament);
  if (!currentStage) return [];
  if (currentStage.type === 'SWISS') {
    const pending = getPendingSwissCutoff(tournament);
    const decision = pending?.decision;
    if (decision?.mode === 'SET') return getSwissCutoffSetMatches(tournament, currentStage);
    if (decision?.extraRounds?.some((round) => round.kind === 'ROUND_ROBIN' && !playoffRoundFinished(round))) {
      return getSwissRoundRobinMatches(tournament, currentStage);
    }
  }
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
  if (previous?.adminConfirmed) throw new Error('Dieses Ergebnis wurde durch die Turnierleitung bestätigt und kann nur dort korrigiert werden.');
  if (tournament && !canEditMockMatch(tournament, matchId)) throw new Error('Dieses Ergebnis ist gesperrt und wurde nicht gespeichert.');
  const next: StoredMatchResult = { ...previous, matchId, sets, status, decisionSide: undefined, decision: undefined, extraTimeProgress, forcedWinner: undefined, thirdPlaceSkipped: undefined, confirmedA: previous?.confirmedA, confirmedB: previous?.confirmedB, finishedAt: status === 'FINISHED' ? (previous?.finishedAt ?? Date.now()) : previous?.finishedAt };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (tournament && JSON.stringify(sets) !== JSON.stringify(previous?.sets ?? [])) {
    recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Ergebniseingabe (lokal)',
      action: 'SET_SAVED', description: sportScoring(tournament.sport).mode === 'score' ? 'Zwischenstand geändert' : 'Satzzwischenstand geändert',
      before: previous?.sets.map((set) => `${set.sideAScore}:${set.sideBScore}`).join(' · ') ?? '–',
      after: sets.map((set) => `${set.sideAScore}:${set.sideBScore}`).join(' · ') });
  }
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
  const currentTournament = getAllMockTournaments().find((item) => item.id === tournament.id);
  if (['ABORTED', 'FINISHED'].includes(currentTournament?.status ?? tournament.status)) return false;
  if (!getRuntimeParticipantNames(tournament).includes(name) || isMockParticipantWithdrawn(tournament, name)) return false;
  const started = tournament.stages.filter((stage) => isStageStarted(tournament, stage));
  const latest = started[started.length - 1];
  const mostRecentCompleted = [...tournament.stages].reverse().find((stage) =>
    stage.type !== 'BREAK' && isStageCompleted(tournament, stage) && getStageEntrants(tournament, stage).includes(name));
  const upcoming = mostRecentCompleted && getNextCompetitionStage(tournament, mostRecentCompleted);
  if (upcoming && !isStageStarted(tournament, upcoming)
    && !getStageEntrants(tournament, upcoming).includes(name)) return false;
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
  const isSchedulingBreak = activeAtWithdrawal?.type === 'BREAK';
  const next = isSchedulingBreak && activeAtWithdrawal
    ? getNextCompetitionStage(tournament, activeAtWithdrawal)
    : getNextStartableStage(tournament);
  const beforeFirstStart = !tournament.hasStarted && !tournament.stages.some((stage) => isStageStarted(tournament, stage));
  const qualifiedForUpcoming = Boolean((!activeAtWithdrawal || isSchedulingBreak) && next && getStageEntrants(tournament, next).includes(name));
  markWithdrawalRestoreEligibility(tournament.id, name,
    beforeFirstStart ? { kind: 'PRESTART', phaseId: tournament.stages[0]?.id ?? null }
      : qualifiedForUpcoming && next ? { kind: 'BETWEEN_PHASES', phaseId: next.id }
      : null);
  const latestCompleted = [...tournament.stages].reverse().find((stage) => stage.type !== 'BREAK' && isStageCompleted(tournament, stage));
  const withdrawalTiming: WithdrawalTiming = activeAtWithdrawal && !isSchedulingBreak
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
  // Break stages are transparent to qualification: recompute the latest
  // completed competition until the following competition actually starts.
  for (let index = tournament.stages.length - 1; index >= 0; index -= 1) {
    const completed = tournament.stages[index];
    if (completed.type === 'BREAK' || !isStageCompleted(tournament, completed)) continue;
    const upcoming = getNextCompetitionStage(tournament, completed);
    if (upcoming && !isStageStarted(tournament, upcoming)) {
      refreshCompletedStageQualifiers(tournament, completed);
      break;
    }
  }
  const active = getActiveStage(tournament);
  if (active) {
    const unfinished = getMockStageMatches(tournament, active).some((match) => match.status !== 'FINISHED');
    if (!unfinished) reconcileCompletedPhase(`${active.id}-withdrawal`);
  }
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)',
    action: 'PARTICIPANT_WITHDRAWN', description: `${name} zurückgezogen (${withdrawalTiming.kind}).`, after: name });
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}

/** Undo is allowed only if withdrawal happened BEFORE a phase started, and
 * for later phases only when the participant had qualified at withdrawal time. */
export function canRestoreMockParticipant(tournament: DemoTournament, name: string) {
  const latest = getAllMockTournaments().find((item) => item.id === tournament.id);
  if (['ABORTED', 'FINISHED'].includes(latest?.status ?? tournament.status)) return false;
  if (!isMockParticipantWithdrawn(tournament, name)) return false;
  const record = getWithdrawalRestoreEligibility(tournament.id, name);
  if (!record) return false;
  if (record.kind === 'PRESTART') {
    return !tournament.hasStarted && !tournament.stages.some((stage) => isStageStarted(tournament, stage));
  }
  const stage = tournament.stages.find((item) => item.id === record.phaseId);
  const active = getActiveStage(tournament);
  if (!stage || isStageStarted(tournament, stage) || (active && active.type !== 'BREAK')) return false;
  const previous = getPreviousCompetitionStage(tournament, stage);
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
      const previous = getPreviousCompetitionStage(tournament, upcoming);
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
  const nextStage = getNextCompetitionStage(tournament, stage);
  if (!nextStage) return 0;
  if (stage.advancement.type === 'top_n' && stage.advancement.value > 0) return stage.advancement.value;
  return Math.max(1, Number(nextStage.settings.entrants) || 1);
}

/** Pending/recorded manual decision at the Swiss qualifying boundary. A regular Swiss
 *  fixture is never fabricated for this: its result must not affect Swiss/Sonneborn-Berger scores. */
export interface SwissCutoffStatus {
  stageId: string;
  tie: SwissCutoffTie;
  signature: string;
  decision: StoredSwissCutoffDecision | null;
}

function swissCutoffStatus(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): SwissCutoffStatus | null {
  if (stage.type !== 'SWISS' || !isStageStarted(tournament, stage)) return null;
  const nextStage = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
  if (!nextStage) return null;
  const base = baseStageMatches(tournament, stage, results);
  const roundCount = getTotalSwissRoundCount(tournament, stage);
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

/** Round-robin tie-break history remains viewable in the tournament timeline
 * after the Swiss phase was closed and the next phase has started. */
export function getSwissCutoffHistory(tournament: DemoTournament, stage: TournamentStage): StoredSwissCutoffDecision | null {
  const current = swissCutoffStatus(tournament, stage, readResults())?.decision;
  const archive = readSwissRoundRobinHistory(tournament.id, stage.id);
  if (!archive) return current ?? null;
  // If a later full-field Swiss round led to another tie, the archive stays
  // visible while the current decision (e.g. a draw) determines final qualifiers.
  // Preserve historical games, but an expired cutoff signature can never
  // count as a current decision or determine today's Swiss standings.
  return { ...archive, ...(current ?? {}), winners: current?.winners,
    extraRounds: current?.extraRounds?.some((round) => round.kind === 'ROUND_ROBIN')
      ? current.extraRounds : archive.extraRounds };
}

/** A saved historical decision is not necessarily valid for today's table. */
export function getValidSwissCutoffWinners(tournament: DemoTournament, stage: TournamentStage): string[] {
  return swissCutoffStatus(tournament, stage, readResults())?.decision?.winners ?? [];
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

/** Start another independent tie-break round, or the full round robin.
 * A subsequent round is permitted only after all prior games were recorded
 * and the qualification cut is still tied. */
export function beginSwissCutoffPlayoff(tournament: DemoTournament, kind: PlayoffMode): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Stichentscheid vorhanden.';
  if (current.tie.players.length < 3) return 'Bei zwei Spielern genügt ein Entscheidungssatz.';
  if (current.decision?.mode === 'LOT' || current.decision?.sets.length) return 'Ein anderer Stichentscheid wurde bereits begonnen.';
  if (kind === 'ROUND') {
    // Unlike the separate qualifying playoff, a further Swiss round includes
    // the *whole eligible field* and counts fully toward Swiss standings/SB.
    const count = addSwissExtraRound(tournament.id, current.stageId);
    if (!count) return 'Es können keine weiteren Schweizer Runden angesetzt werden.';
    const stage = tournament.stages.find((item) => item.id === current.stageId)!;
    const round = getTotalSwissRoundCount(tournament, stage);
    // Choosing an extra Swiss round is itself the director's approval of
    // the completed preceding round; no duplicate confirmation is required.
    approveSwissRound(tournament, stage, round - 1);
    recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung',
      action: 'SWISS_ROUND_APPROVED', description: `Schweizer Runde ${round - 1} fuer Zusatzrunde freigegeben` });
    const fixtures = getMockStageBaseMatches(tournament, stage);
    recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_SET',
      description: `Zusätzliche Schweizer Runde ${round} mit allen verbleibenden Teilnehmenden eröffnet (${fixtures.filter((match) => match.round === `Runde ${round}`).length} Paarungen inklusive Freilosen).` });
    return null;
  }
  const previous = current.decision?.extraRounds ?? [];
  if (previous.some((round) => !playoffRoundFinished(round))) return 'Bitte zuerst alle angesetzten Entscheidungsspiele abschließen.';
  if (previous.some((round) => round.kind === 'ROUND_ROBIN')) {
    return 'Nach abgeschlossenem Jeder gegen Jeden und ergebnislosem direkten Vergleich ist ein physischer Losentscheid erforderlich.';
  }
  if (playoffQualified(current.tie.players, current.tie.slots, previous, tournament.sport)) return 'Die Qualifikanten stehen bereits fest.';
  const round = newPlayoffRound(current.tie.players, kind, previous);
  if (!round.matches.length) return 'Es konnten keine zusätzlichen Paarungen gebildet werden.';
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: kind, eliminated: [], sets: [],
    extraRounds: [...previous, round], qualificationSlots: current.tie.slots,
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_SET',
    description: 'Jeder-gegen-Jeden-Entscheidung angesetzt' });
  return null;
}

export function recordSwissCutoffPlayoffResult(
  tournament: DemoTournament, matchIndex: number, pointsA: number, pointsB: number,
): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Stichentscheid vorhanden.';
  const rounds = current.decision?.extraRounds;
  if (!rounds?.length) return 'Zuerst den Modus der zusätzlichen Entscheidung auswählen.';
  const round = rounds[rounds.length - 1];
  if (!Number.isInteger(matchIndex) || matchIndex < 0 || matchIndex >= round.matches.length) return 'Ungültige Paarung.';
  const match = round.matches[matchIndex];
  if (match.pointsA !== undefined || match.pointsB !== undefined) return 'Dieses Ergebnis ist bereits bestätigt.';
  if (![pointsA, pointsB].every((value) => Number.isSafeInteger(value) && value >= 0)) return 'Bitte gültige, nichtnegative Punktzahlen eingeben.';
  if (sportScoring(tournament.sport).mode === 'sets'
    && !isValidSportSet(tournament.sport, 1, 0, { number: 1, sideAScore: pointsA, sideBScore: pointsB })) {
    return 'Ungültiges Satzergebnis für diese Sportart.';
  }
  const nextRounds = [...rounds.slice(0, -1), {
    ...round,
    matches: round.matches.map((item, index) => index === matchIndex ? { ...item, pointsA, pointsB } : item),
  }];
  const winners = playoffQualified(current.tie.players, current.tie.slots, nextRounds, tournament.sport) ?? undefined;
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: round.kind, eliminated: [], sets: [],
    extraRounds: nextRounds, winners,
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_SET',
    description: `Entscheidungsspiel: ${match.sideA} – ${match.sideB} ${pointsA}:${pointsB}` });
  if (winners) reconcileCompletedPhase(`${current.stageId}-sw-cutoff-decision`);
  return null;
}

/** Keep an intermediate phase's standings synchronized with the ordinary
 * result editor, including later corrections before the next phase starts. */
function syncSwissPlayoffFromStoredMatch(
  tournament: DemoTournament, stage: TournamentStage, roundIndex: number, matchIndex: number,
  pointsA: number, pointsB: number,
) {
  const current = swissCutoffStatus(tournament, stage, readResults());
  const decision = current?.decision;
  const oldRound = decision?.extraRounds?.[roundIndex];
  if (!current || !decision || !oldRound || oldRound.kind !== 'ROUND_ROBIN' || !oldRound.matches[matchIndex]) return;
  const rounds = decision.extraRounds!.map((round, index) => index === roundIndex ? {
    ...round,
    matches: round.matches.map((match, position) => position === matchIndex
      ? { ...match, pointsA, pointsB } : match),
  } : round);
  const winners = playoffQualified(current.tie.players, current.tie.slots, rounds, tournament.sport) ?? undefined;
  saveSwissCutoffDecision(tournament.id, stage.id, {
    ...decision, signature: current.signature, extraRounds: rounds, winners,
  });
  if (isStageCompleted(tournament, stage)) {
    // The parent phase may need reopening when a corrected score revives a tie.
    refreshCompletedStageQualifiers(tournament, stage);
  } else if (winners) {
    reconcileCompletedPhase(`${stage.id}-sw-cutoff-decision`);
  }
}

export function recordSwissCutoffLot(tournament: DemoTournament, winners: string[]): string | null {
  const current = getPendingSwissCutoff(tournament);
  if (!current) return 'Kein offener Losentscheid vorhanden.';
  if (current.decision?.sets.length) return 'Bereits erfasste Entscheidungssätze müssen zuerst zurückgesetzt werden.';
  if (current.decision?.extraRounds?.some((round) => !playoffRoundFinished(round))) {
    return 'Bitte zuerst alle begonnenen Entscheidungsspiele abschließen oder den Stichentscheid zurücksetzen.';
  }
  const previous = current.decision?.extraRounds ?? [];
  const hasRoundRobin = previous.some((round) => round.kind === 'ROUND_ROBIN');
  const boundary = hasRoundRobin
    ? playoffBoundaryTie(current.tie.players, current.tie.slots, previous, tournament.sport)
    : null;
  if (hasRoundRobin && !boundary) return 'Der direkte Vergleich hat die Qualifikationsplätze bereits eindeutig entschieden.';
  const candidates = boundary?.players ?? current.tie.players;
  const required = boundary?.slots ?? current.tie.slots;
  const selected = new Set(winners);
  if (selected.size !== required || winners.some((name) => !candidates.includes(name))) {
    return `Bitte genau ${required} ausgeloste Person(en) auswählen.`;
  }
  const qualifying = [...(boundary?.alreadyQualified ?? []), ...winners];
  saveSwissCutoffDecision(tournament.id, current.stageId, {
    signature: current.signature, mode: 'LOT',
    eliminated: current.tie.players.filter((name) => !qualifying.includes(name)), sets: [],
    extraRounds: current.decision?.extraRounds, qualificationSlots: current.tie.slots,
    lotPlayers: candidates, lotWinners: winners, winners: qualifying,
  });
  recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)', action: 'SWISS_TIE_LOT',
    description: `Physischer Losentscheid. Qualifiziert: ${qualifying.join(', ')}` });
  reconcileCompletedPhase(`${current.stageId}-sw-cutoff-decision`);
  return null;
}

export function resetSwissCutoffSets(tournament: DemoTournament): void {
  const current = getPendingSwissCutoff(tournament);
  if (!current || !current.decision) return;
  // A restarted decision must not inherit completed or assigned games from
  // an earlier attempt with the same deterministic fixture identifiers.
  if (current.decision.extraRounds?.length || current.decision.mode === 'SET') {
    const prefixes = [`${current.stageId}-sw-playoff-`, `${current.stageId}-sw-cutoff-set-`];
    writeResults(readResults().filter((result) => !prefixes.some((prefix) => result.matchId.startsWith(prefix))));
    writeRuntime(readRuntime().filter((runtime) => !prefixes.some((prefix) => runtime.matchId.startsWith(prefix))));
  }
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
      stage.type === 'SWISS', stage.type === 'SWISS' ? getTotalSwissRoundCount(tournament, stage) : undefined);
    const cutoff = stage.type === 'SWISS' ? swissCutoffStatus(tournament, stage, results) : null;
    if (cutoff && cutoff.decision?.winners?.length !== cutoff.tie.slots) return [];
    const ordered = applySwissCutoffDecision(ranked, cutoff?.tie ?? null, cutoff?.decision?.winners ?? []);
    return ordered.filter((row) => !isMockParticipantWithdrawn(tournament, row.name)).slice(0, targetCount).map((row) => row.name);
  }

  return getStageEntrants(tournament, stage).filter((name) => !isMockParticipantWithdrawn(tournament, name)).slice(0, targetCount);
}

export function refreshCompletedStageQualifiers(tournament: DemoTournament, stage: TournamentStage) {
  if (!isStageCompleted(tournament, stage)) return false;
  const nextStage = getNextCompetitionStage(tournament, stage);
  if (!nextStage || isStageStarted(tournament, nextStage)) return false;
  const qualified = computeStageQualifiers(tournament, stage, readResults());
  if (stage.type === 'SWISS' && swissCutoffStatus(tournament, stage, readResults()) && !qualified.length) {
    // A result correction has changed/invalidated the earlier cutoff decision.
    // Reopen the completed Swiss phase so the director must resolve it again.
    reopenStageForQualification(tournament, stage);
    return false;
  }
  const start = tournament.stages.indexOf(stage) + 1;
  const end = tournament.stages.indexOf(nextStage);
  for (const following of tournament.stages.slice(start, end + 1)) {
    setStageEntrants(tournament, following, qualified);
  }
  const adjustedDraw = reconcileQualifiedDraw(tournament, nextStage);
  if (adjustedDraw) {
    recordMockAudit({ tournamentId: tournament.id, actor: 'Turnierleitung (lokal)',
      action: 'FOLLOWUP_DRAW_ADJUSTED',
      description: `Teilnehmerfeld für ${nextStage.name} geändert: ${adjustedDraw === 'KNOCKOUT'
        ? 'KO-Auslosung neu aufgebaut und ungültige Fixierungen entfernt'
        : adjustedDraw === 'GROUPS' ? 'vorbereitete Gruppenauslosung an Nachrücker angepasst'
        : 'Schweizer Startreihenfolge an Nachrücker angepasst'}. Bitte die Auslosung kontrollieren.` });
  }
  return true;
}

/** Match completion records the score but never advances without director approval. */
function reconcileCompletedPhase(_matchId: string) {
  void _matchId;
  // Progression is deliberately controlled by approveMockProgress().
}

export interface MockProgressApproval {
  stageId: string;
  stageName: string;
  kind: 'ROUND' | 'STAGE';
  round: number | null;
  completedMatches: number;
  totalRounds: number;
  nextStageName?: string;
  isLastStage: boolean;
}

export function getPendingMockApproval(tournament: DemoTournament): MockProgressApproval | null {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED') return null;
  const stage = getActiveStage(tournament);
  if (!stage) return null;
  const matches = getMockStageMatches(tournament, stage);
  if (matches.some((match) => match.status !== 'FINISHED')) return null;
  const swissFixtures = stage.type === 'SWISS' ? getMockStageBaseMatches(tournament, stage) : [];
  const allBye = stage.type === 'SWISS' && swissFixtures.some((match) => match.autoWinner && match.sideB === 'Freilos');
  if (!matches.length && !allBye) return null;
  const totalRounds = stage.type === 'SWISS' ? getTotalSwissRoundCount(tournament, stage) : 0;
  const round = stage.type === 'SWISS'
    ? Math.max(0, ...swissFixtures.map((match) => Number(match.id.match(/-sw-r(\d+)-m\d+$/)?.[1] ?? 0)))
    : null;
  if (stage.type === 'SWISS' && (!round || (round < totalRounds && isSwissRoundApproved(tournament, stage, round)))) return null;
  const lastRound = stage.type !== 'SWISS' || round === totalRounds;
  if (lastRound) {
    const cutoff = swissCutoffStatus(tournament, stage, readResults());
    if (cutoff && cutoff.decision?.winners?.length !== cutoff.tie.slots) return null;
  }
  const index = tournament.stages.findIndex((entry) => entry.id === stage.id);
  return { stageId: stage.id, stageName: stage.name, kind: lastRound ? 'STAGE' : 'ROUND',
    round, completedMatches: matches.length, totalRounds,
    nextStageName: tournament.stages[index + 1]?.name,
    isLastStage: index === tournament.stages.length - 1 };
}

export function approveMockProgress(tournament: DemoTournament): MockProgressApproval | null {
  const latest = getAllMockTournaments().find((entry) => entry.id === tournament.id) ?? tournament;
  const pending = getPendingMockApproval(latest);
  if (!pending) return null;
  const stage = latest.stages.find((entry) => entry.id === pending.stageId)!;
  const ids = new Set(getMockStageMatches(latest, stage)
    .filter((match) => pending.kind === 'STAGE'
      || Number(match.id.match(/-sw-r(\d+)-m\d+$/)?.[1] ?? 0) === pending.round)
    .map((match) => match.id));
  if (pending.kind === 'STAGE' && stage.type === 'SWISS') {
    const decision = swissCutoffStatus(latest, stage, readResults())?.decision;
    if (decision?.mode === 'SET') {
      getSwissCutoffSetMatches(latest, stage).forEach((match) => ids.add(match.id));
    }
    if (decision?.extraRounds?.length) {
      getSwissRoundRobinMatches(latest, stage).forEach((match) => ids.add(match.id));
    }
  }
  const newlyApproved = readResults().filter((entry) => ids.has(entry.matchId)
    && entry.status === 'FINISHED' && !entry.adminConfirmed);
  writeResults(readResults().map((entry) => ids.has(entry.matchId) && entry.status === 'FINISHED'
    ? { ...entry, adminConfirmed: true } : entry));
  newlyApproved.filter((entry) => entry.matchId.includes('-sw-cutoff-set-') || entry.matchId.includes('-sw-playoff-'))
    .forEach((entry) => recordMockAudit({ tournamentId: latest.id, matchId: entry.matchId,
      actor: 'Turnierleitung (lokal)', action: 'RESULT_CONFIRMED',
      description: 'Ergebnis des Schweizer Stichentscheids bei der Phasenfreigabe bestätigt' }));
  if (pending.kind === 'ROUND') {
    if (!approveSwissRound(latest, stage, pending.round!)) return null;
    recordMockAudit({ tournamentId: latest.id, actor: 'Turnierleitung', action: 'SWISS_ROUND_APPROVED',
      description: `Schweizer Runde ${pending.round} von ${stage.name} nach Ergebniskontrolle freigegeben` });
  } else {
    const qualified = computeStageQualifiers(latest, stage, readResults());
    if (!completeStage(latest, stage, qualified)) return null;
    // Reapproval after a corrected group/Swiss result may replace qualifiers
    // just as a withdrawal does. Never attach old pins to their replacements.
    const followingCompetition = getNextCompetitionStage(latest, stage);
    const adjustedDraw = followingCompetition && reconcileQualifiedDraw(latest, followingCompetition);
    if (adjustedDraw) {
      recordMockAudit({ tournamentId: latest.id, actor: 'Turnierleitung (lokal)',
        action: 'FOLLOWUP_DRAW_ADJUSTED',
        description: `Qualifikanten nach Phasenfreigabe geändert: ${followingCompetition!.name} (${adjustedDraw}). Bitte die Auslosung kontrollieren.` });
    }
    updateMockTournamentStatus(latest.id, pending.isLastStage ? 'FINISHED' : 'PAUSED');
    recordMockAudit({ tournamentId: latest.id, actor: 'Turnierleitung', action: 'STAGE_APPROVED',
      description: `Phase ${stage.name} nach Ergebniskontrolle freigegeben`,
      after: pending.isLastStage ? 'Turnier beendet' : `Qualifiziert: ${qualified.join(', ')}` });
  }
  return pending;
}

export function abortMockTournament(tournament: DemoTournament, reason: string): boolean {
  const latest = getAllMockTournaments().find((entry) => entry.id === tournament.id) ?? tournament;
  if (latest.status === 'ABORTED' || latest.status === 'FINISHED') return false;
  const stages = latest.stages.filter((stage) => isStageStarted(latest, stage));
  const prefixes = stages.map((stage) => `${stage.id}-`);
  const results = readResults();
  const states = readRuntime();
  const ids = new Set(states.map((entry) => entry.matchId));
  const cancelled = stages.flatMap((stage) => getMockStageMatches(latest, stage))
    .filter((match) => match.status !== 'FINISHED')
    .map((match) => ({ matchId: match.id, table: 'Noch offen', status: 'CANCELLED' as const }));
  writeRuntime([...states.map((entry) => prefixes.some((prefix) => entry.matchId.startsWith(prefix))
    && !results.some((result) => result.matchId === entry.matchId && result.status === 'FINISHED')
    ? { ...entry, status: 'CANCELLED' as const, table: 'Noch offen' } : entry),
    ...cancelled.filter((entry) => !ids.has(entry.matchId))]);
  updateMockTournamentStatus(latest.id, 'ABORTED');
  recordMockAudit({ tournamentId: latest.id, actor: 'Turnierleitung', action: 'TOURNAMENT_ABORTED',
    description: 'Turnier vorzeitig abgebrochen', after: reason.trim() || 'Keine Begründung angegeben' });
  return true;
}

/** Keep the recorded qualification decision in sync with director edits of
 * completed Swiss cutoff sets; the sporting Swiss table is unaffected. */
function syncCorrectedSwissCutoffSet(tournament: DemoTournament, stage: TournamentStage, matchId: string, sets: MatchSet[]): boolean {
  const index = Number(matchId.match(/-sw-cutoff-set-m(\d+)$/)?.[1] ?? 0) - 1;
  if (index < 0 || !sets[0]) return false;
  const current = swissCutoffStatus(tournament, stage, readResults());
  const decision = current?.decision;
  if (!current || decision?.mode !== 'SET' || !decision.sets[index]) return false;
  const earlier = decision.sets.slice(0, index);
  const original = decision.sets[index];
  const winner = sets[0].sideAScore > sets[0].sideBScore ? original.sideA : original.sideB;
  const corrected = {
    sideA: original.sideA, sideB: original.sideB,
    pointsA: sets[0].sideAScore, pointsB: sets[0].sideBScore, winner,
  };
  const updated = [...earlier, corrected];
  const eliminated = updated.map((item) => item.winner === item.sideA ? item.sideB : item.sideA);
  const remaining = current.tie.players.filter((name) => !eliminated.includes(name));
  saveSwissCutoffDecision(tournament.id, stage.id, {
    ...decision, signature: current.signature, mode: 'SET',
    sets: updated, eliminated, winners: remaining.length === current.tie.slots ? remaining : undefined,
  });
  const prefix = `${stage.id}-sw-cutoff-set-m`;
  const later = (id: string) => id.startsWith(prefix) && Number(id.slice(prefix.length)) > index + 1;
  const savedResults = readResults();
  const savedRuntime = readRuntime();
  if (savedResults.some((result) => later(result.matchId))) writeResults(savedResults.filter((result) => !later(result.matchId)));
  if (savedRuntime.some((item) => later(item.matchId))) writeRuntime(savedRuntime.filter((item) => !later(item.matchId)));
  return true;
}

export function completeMockMatch(matchId: string, sets: MatchSet[], status: MockMatchState = 'FINISHED', confirmedByAdmin = false, decisionSide?: WinnerSide, decision?: ScoreDecision) {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
  if (previous?.adminConfirmed && !confirmedByAdmin) {
    throw new Error('Dieses Ergebnis wurde durch die Turnierleitung bestätigt und darf nicht durch Spieler überschrieben werden.');
  }
  if (tournament && !canEditMockMatch(tournament, matchId)) throw new Error('Dieses Ergebnis ist gesperrt und wurde nicht gespeichert.');
  const previousFinal = previous?.status === 'FINISHED';
  if (previousFinal) {
    const tournament = getAllMockTournaments().find((item) => item.stages.some((stage) => matchId.startsWith(`${stage.id}-`)));
    const stage = tournament?.stages.find((item) => matchId.startsWith(`${item.id}-`));
    if (tournament && stage && !canEditFinishedResults(tournament, stage)) return previous;
  }
  const stage = tournament?.stages.find((item) => matchId.startsWith(`${item.id}-`));
  if (tournament && stage && status === 'FINISHED') {
    const bestOf = matchId.includes('-sw-playoff-') || matchId.includes('-sw-cutoff-set-') ? 1
      : getMockStageMatches(tournament, stage).find((match) => match.id === matchId)?.bestOf ?? stage.bestOf;
    const isKnockout = ['KNOCKOUT', 'DOUBLE_ELIMINATION', 'PLACEMENT'].includes(stage.type)
      || (stage.type === 'SWISS' && !sportScoring(tournament.sport).allowsDraw)
      || matchId.includes('-sw-cutoff-set-') || matchId.includes('-sw-playoff-');
    const validationError = validateCompleteResult(tournament.sport, bestOf, sets, isKnockout, decisionSide);
    if (validationError) throw new Error(validationError);
    const decisionError = validateScoreDecision(tournament.sport, sets, decisionSide, decision);
    if (decisionError) throw new Error(decisionError);
  }
  const adminPhaseConfirmation = status === 'FINISHED' && confirmedByAdmin;
  const next: StoredMatchResult = {
    ...previous, matchId, sets, status, decisionSide, decision, extraTimeProgress: undefined, forcedWinner: undefined, thirdPlaceSkipped: undefined,
    confirmedA: previousFinal ? false : previous?.confirmedA,
    confirmedB: previousFinal ? false : previous?.confirmedB,
    adminConfirmed: adminPhaseConfirmation,
    finishedAt: status === 'FINISHED' ? (previous?.finishedAt ?? Date.now()) : previous?.finishedAt,
  };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (tournament && previousFinal && (
    JSON.stringify(previous?.sets) !== JSON.stringify(sets) ||
    previous?.decisionSide !== decisionSide || JSON.stringify(previous?.decision) !== JSON.stringify(decision)
  )) {
    const stageForCorrection = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`));
    if (stageForCorrection) {
      invalidateUnstartedLaterRounds(tournament, stageForCorrection, matchId);
      if (stageForCorrection.type === 'SWISS' && matchId.includes('-sw-cutoff-set-')) {
        syncCorrectedSwissCutoffSet(tournament, stageForCorrection, matchId, sets);
      }
      const round = competitionRoundIndex(tournament, stageForCorrection, matchId);
      if (round !== null && stageForCorrection.type === 'SWISS'
        && revokeSwissRoundApprovals(tournament, stageForCorrection, round)) {
        recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung',
          action: 'APPROVAL_REVOKED', description: `Freigabe der Schweizer Runde ${round} wegen Ergebniskorrektur zurueckgenommen` });
      }
      if (reopenStageAfterCorrection(tournament, stageForCorrection)) {
        updateMockTournamentStatus(tournament.id, statusAfterReopening(tournament));
        recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung',
          action: 'APPROVAL_REVOKED', description: `Freigabe der Phase ${stageForCorrection.name} wegen Ergebniskorrektur zurueckgenommen` });
      }
    }
  }
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
    if (tournament && matchId.includes('-sw-cutoff-set-')) {
      // The standard table card has completed the deciding BO1 game. Only
      // its winner advances; the regular Swiss/SB results remain untouched.
      const match = matchId.match(/-sw-cutoff-set-m(\d+)$/);
      const stage = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`));
      const pending = getPendingSwissCutoff(tournament);
      if (stage && match && pending?.stageId === stage.id
        && pending.decision?.mode === 'SET'
        && Number(match[1]) === pending.decision.sets.length + 1 && sets[0]) {
        recordSwissCutoffSet(tournament, sets[0].sideAScore, sets[0].sideBScore);
      }
    } else if (tournament && matchId.includes('-sw-playoff-')) {
      // Regular match controls have completed an intermediate-phase fixture.
      // Synchronize the independent qualification table and let it release the
      // next phase only after every fixture is finished.
      const stage = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`));
      const roundMatch = matchId.match(/-sw-playoff-r(\d+)-m(\d+)$/);
      if (stage && roundMatch && sets[0]) {
        syncSwissPlayoffFromStoredMatch(tournament, stage,
          Number(roundMatch[1]) - 1, Number(roundMatch[2]) - 1,
          sets[0].sideAScore, sets[0].sideBScore);
      }
    } else reconcileCompletedPhase(matchId);
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
  const restored: StoredMatchResult = { ...previous, sets: event.beforeSets, decisionSide: event.beforeDecisionSide, decision: event.beforeDecision, confirmedA: false, confirmedB: false, adminConfirmed: false };
  writeResults([restored, ...current.filter((item) => item.matchId !== event.matchId)]);
  const stage = tournament.stages.find((item) => event.matchId!.startsWith(`${item.id}-`));
  if (stage) {
    invalidateUnstartedLaterRounds(tournament, stage, event.matchId);
    if (stage.type === 'SWISS' && event.matchId.includes('-sw-cutoff-set-')) {
      syncCorrectedSwissCutoffSet(tournament, stage, event.matchId, event.beforeSets);
    }
    const round = competitionRoundIndex(tournament, stage, event.matchId);
    if (round !== null && stage.type === 'SWISS') revokeSwissRoundApprovals(tournament, stage, round);
    if (reopenStageAfterCorrection(tournament, stage)) updateMockTournamentStatus(tournament.id, statusAfterReopening(tournament));
    else refreshCompletedStageQualifiers(tournament, stage);
  }
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
  if (!found || found.match.status !== 'FINISHED' || found.tournament.status === 'ABORTED') return false;
  const player = side === 'A' ? found.match.sideA : found.match.sideB;
  if (playerCode.trim() !== getMockParticipantCode(found.tournament, player)) return false;
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  if (!previous || previous.status !== 'FINISHED') return false;
  const key = side === 'A' ? 'confirmedA' : 'confirmedB';
  if (previous[key] || previous.adminConfirmed) return true;
  const next = { ...previous, [key]: true };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  recordMockAudit({ tournamentId: found.tournament.id, matchId, actor: `Teilnehmerseite ${side} (lokaler Code)`, action: 'RESULT_CONFIRMED', description: `${player} hat das Endergebnis bestätigt` });
  return true;
}

export function adminConfirmMockMatch(tournament: DemoTournament, matchId: string) {
  const stage = tournament.stages.find((item) => matchId.startsWith(`${item.id}-`)) ?? tournament.stages[0];
  const found = getMockStageMatches(tournament, stage).find((item) => item.id === matchId)
    ?? (stage.type === 'SWISS' ? [
      ...getSwissRoundRobinMatches(tournament, stage),
      ...getSwissCutoffSetMatches(tournament, stage),
    ].find((item) => item.id === matchId) : undefined);
  if (!found || found.status !== 'FINISHED') return false;
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  if (!previous || previous.thirdPlaceSkipped || previous.forcedWinner) return false;
  if (previous.adminConfirmed) return true;
  writeResults([{ ...previous, adminConfirmed: true }, ...current.filter((item) => item.matchId !== matchId)]);
  recordMockAudit({ tournamentId: tournament.id, matchId, actor: 'Turnierleitung (lokal)', action: 'RESULT_CONFIRMED', description: `Endergebnis von ${found.sideA} – ${found.sideB} durch Turnierleitung bestätigt` });
  return true;
}

export function countMockOpenConfirmations(tournament: DemoTournament) {
  const results = readResults();
  const stageIds = tournament.stages.map((stage) => `${stage.id}-`);
  return results.filter((result) => stageIds.some((prefix) => result.matchId.startsWith(prefix)) && result.status === 'FINISHED' && result.sets.length > 0 && !result.forcedWinner && !(result.adminConfirmed || (result.confirmedA && result.confirmedB))).length;
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
      const match = getMockStageMatches(tournament, stage).find((item) => item.id === matchId)
        ?? (stage.type === 'SWISS' ? [
          ...getSwissRoundRobinMatches(tournament, stage),
          ...getSwissCutoffSetMatches(tournament, stage),
        ].find((item) => item.id === matchId) : undefined);
      if (match) return { tournament, match };
    }
  }
  return undefined;
}
