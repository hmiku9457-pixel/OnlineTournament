import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet, TournamentStage } from '@/domain/types';
import { getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeStage, getActiveStage, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getBracketSlots, getGroupAssignments } from '@/services/mockDrawStore';

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
  autoWinner?: string;
}

const RESULT_KEY = 'online-tournament:mock-match-results:v2';
const RUNTIME_KEY = 'online-tournament:mock-match-runtime:v1';

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
  let winsA = 0;
  let winsB = 0;
  result.sets.forEach((set) => {
    if (set.sideAScore > set.sideBScore) winsA += 1;
    else if (set.sideBScore > set.sideAScore) winsB += 1;
  });
  if (winsA === winsB) return undefined;
  return winsA > winsB ? sideA : sideB;
}

function groupMatches(tournament: DemoTournament, stage: TournamentStage): BaseStageMatch[] {
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

  const matches: BaseStageMatch[] = [];
  groups.forEach((members, groupIndex) => {
    let matchIndex = 0;
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        matchIndex += 1;
        matches.push({
          id: `${stage.id}-g${groupIndex + 1}-m${matchIndex}`,
          sideA: members[a],
          sideB: members[b],
          round: `Gruppe ${String.fromCharCode(65 + groupIndex)}`,
        });
      }
    }
  });
  return matches;
}

function roundRobinMatches(tournament: DemoTournament, stage: TournamentStage): BaseStageMatch[] {
  const names = getRuntimeParticipantNames(tournament);
  const entrantCount = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrantCount);
  const matches: BaseStageMatch[] = [];
  let matchIndex = 0;
  for (let a = 0; a < participants.length; a += 1) {
    for (let b = a + 1; b < participants.length; b += 1) {
      matchIndex += 1;
      matches.push({ id: `${stage.id}-rr-m${matchIndex}`, sideA: participants[a], sideB: participants[b], round: 'Jeder gegen jeden' });
    }
  }
  return matches;
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
      rounds.push({ id, sideA, sideB, round: label, autoWinner });
      nextSides.push(winner ?? 'TBD');
    }

    currentSides = nextSides;
    matchesInRound /= 2;
    roundIndex += 1;
  }

  return rounds;
}

function swissRoundPairings(participants: string[], roundNumber: number) {
  const rotated = [...participants];
  if (rotated.length > 2) {
    const shift = (roundNumber - 1) % rotated.length;
    rotated.push(...rotated.splice(0, shift));
  }
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < rotated.length; index += 2) {
    pairs.push([rotated[index], rotated[index + 1] ?? 'Freilos']);
  }
  return pairs;
}

function swissMatches(tournament: DemoTournament, stage: TournamentStage, results: StoredMatchResult[]): BaseStageMatch[] {
  const names = getRuntimeParticipantNames(tournament);
  const entrantCount = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrantCount);
  const totalRounds = Math.max(1, Number(stage.settings.rounds) || 4);
  const matches: BaseStageMatch[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const pairings = swissRoundPairings(participants, round);
    if (round > 1) {
      const previous = matches.filter((match) => match.round === `Runde ${round - 1}` && !match.autoWinner);
      const previousDone = previous.every((match) => results.find((item) => item.matchId === match.id)?.status === 'FINISHED');
      if (!previousDone) break;
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
    score: savedResult ? scoreFromSets(savedResult.sets) : match.score,
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
      bestOf: stage.bestOf,
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
  const next: StoredMatchResult = { ...previous, matchId, sets, status };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  return next;
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

    completeStage(tournament, activeStage);
    const isLastStage = tournament.stages[tournament.stages.length - 1]?.id === activeStage.id;
    updateMockTournamentStatus(tournament.id, isLastStage ? 'FINISHED' : 'PAUSED');
    return;
  }
}

export function completeMockMatch(matchId: string, sets: MatchSet[], status: MockMatchState = 'FINISHED') {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const next: StoredMatchResult = { ...previous, matchId, sets, status };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
  if (status === 'FINISHED') reconcileCompletedPhase(matchId);
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
