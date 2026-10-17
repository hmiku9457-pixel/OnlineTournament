import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet } from '@/domain/types';
import { getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeStage, getActiveStage } from '@/services/mockPhaseLifecycle';

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

const RESULT_KEY = 'online-tournament:mock-match-results:v2';
const RUNTIME_KEY = 'online-tournament:mock-match-runtime:v1';

const firstNames = [
  'Max', 'Lukas', 'Jonas', 'Leon', 'Tim', 'Felix', 'Paul', 'Ben', 'Noah', 'Elias', 'Nico', 'Jan',
  'Moritz', 'Tobias', 'Daniel', 'Simon', 'David', 'Florian', 'Marco', 'Erik', 'Julian', 'Robin', 'Marius', 'Kevin',
  'Anna', 'Laura', 'Sophie', 'Lea', 'Mia', 'Lena', 'Lisa', 'Julia', 'Nina', 'Sarah', 'Marie', 'Emma',
];
const lastNames = [
  'Müller', 'Schmidt', 'Bauer', 'Fischer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf',
  'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Schmitz', 'Krause', 'Meier', 'Lehmann',
];

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

function generateSingles(count: number) {
  return Array.from({ length: count }, (_, index) => `${firstNames[index % firstNames.length]} ${lastNames[(index * 5 + 3) % lastNames.length]}`);
}

export function getRuntimeParticipantNames(tournament: DemoTournament) {
  if (tournament.participantNames?.length) return tournament.participantNames;
  if (tournament.discipline === 'DOUBLES') {
    const names = generateSingles(tournament.participants * 2);
    return Array.from({ length: tournament.participants }, (_, index) => `${names[index * 2]} / ${names[index * 2 + 1]}`);
  }
  return generateSingles(tournament.participants);
}

function participantAt(names: string[], index: number) {
  return names[index % Math.max(1, names.length)] ?? `Teilnehmer ${index + 1}`;
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

export function getMockRuntimeMatches(tournament: DemoTournament): MockRuntimeMatch[] {
  const names = getRuntimeParticipantNames(tournament);
  const currentStage = getActiveStage(tournament);
  if (!currentStage) return [];
  const phase = currentStage.name;
  const stageId = currentStage.id;
  const bestOf = currentStage.bestOf;
  const tableCount = Math.max(1, tournament.tables);
  const storedResults = readResults();
  const storedRuntime = readRuntime();

  const liveCount = tournament.status === 'RUNNING'
    ? Math.min(Math.max(0, tournament.runningMatches), Math.min(tableCount, 4))
    : 0;

  const live = Array.from({ length: liveCount }, (_, index): MockRuntimeMatch => applyStoredState({
    id: `${stageId}-live-${index + 1}`,
    table: `Tisch ${index + 1}`,
    sideA: participantAt(names, index * 2),
    sideB: participantAt(names, index * 2 + 1),
    score: index % 3 === 0 ? '2 : 1' : index % 3 === 1 ? '1 : 1' : '1 : 2',
    status: index === liveCount - 1 && tournament.openConfirmations > 0 ? 'CONFIRMATION' : 'LIVE',
    phase,
    stageId,
    bestOf,
    pauseA: 12 + ((index * 7) % 19),
    pauseB: 5 + ((index * 11) % 23),
    round: currentStage?.type === 'SWISS'
      ? 'Runde 3'
      : currentStage?.type === 'GROUPS'
        ? `Gruppe ${String.fromCharCode(65 + (index % Math.max(1, Number(currentStage.settings.groups) || 4)))}`
        : 'Aktuelle Runde',
  }, storedResults, storedRuntime));

  const queuedCount = Math.min(10, Math.max(4, tournament.participants - liveCount * 2));
  const queued = Array.from({ length: queuedCount }, (_, index): MockRuntimeMatch => applyStoredState({
    id: `${stageId}-ready-${index + 1}`,
    table: 'Noch offen',
    sideA: participantAt(names, liveCount * 2 + index * 2),
    sideB: participantAt(names, liveCount * 2 + index * 2 + 1),
    score: '–',
    status: 'WAITING',
    phase,
    stageId,
    bestOf,
    pauseA: 3 + ((index * 6) % 28),
    pauseB: 8 + ((index * 9) % 24),
    round: currentStage?.type === 'SWISS'
      ? 'Runde 3'
      : currentStage?.type === 'GROUPS'
        ? `Gruppe ${String.fromCharCode(65 + (index % Math.max(1, Number(currentStage.settings.groups) || 4)))}`
        : 'Nächstes Spiel',
    note: 'Wartet auf Tischzuweisung',
  }, storedResults, storedRuntime));

  return [...live, ...queued];
}

function isActiveTableMatch(match: MockRuntimeMatch) {
  return ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) && match.table.startsWith('Tisch ');
}

export function getMockAssignmentBlockReason(tournament: DemoTournament, matchId: string, table: string) {
  const matches = getMockRuntimeMatches(tournament);
  const target = matches.find((match) => match.id === matchId);
  if (!target) return 'Spiel wurde nicht gefunden.';

  const tableOccupied = matches.some((match) => (
    match.id !== matchId
    && match.table === table
    && isActiveTableMatch(match)
  ));
  if (tableOccupied) return `${table} ist bereits belegt.`;

  const playerConflict = matches.find((match) => (
    match.id !== matchId
    && isActiveTableMatch(match)
    && (
      match.sideA === target.sideA
      || match.sideB === target.sideA
      || match.sideA === target.sideB
      || match.sideB === target.sideB
    )
  ));

  if (playerConflict) {
    const blockedPlayer = [target.sideA, target.sideB].find((player) => player === playerConflict.sideA || player === playerConflict.sideB);
    return `${blockedPlayer ?? 'Ein Teilnehmer'} ist bereits ${playerConflict.table} zugewiesen.`;
  }

  return null;
}

export function assignMockMatchToTable(tournament: DemoTournament, matchId: string, table: string) {
  if (getMockAssignmentBlockReason(tournament, matchId, table)) return false;
  // Eine Tischzuweisung startet die Partie sofort.
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

    const activeMatches = getMockRuntimeMatches(tournament).filter((match) => match.stageId === activeStage.id);
    const hasOpenMatches = activeMatches.some((match) => match.status !== 'FINISHED');
    if (activeMatches.length === 0 || hasOpenMatches) return;

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
  const next = matches.find((match) => match.status === 'READY' && (match.sideA === player || match.sideB === player))
    ?? matches.find((match) => match.status === 'WAITING' && (match.sideA === player || match.sideB === player))
    ?? matches.find((match) => match.status === 'READY' || match.status === 'WAITING');
  return {
    player,
    playerCode: '4821',
    matchCode: 'A7K2',
    currentMatch: ownLive,
    nextMatch: next,
    standing: getActiveStage(tournament)?.type === 'GROUPS'
      ? '2. Platz · Gruppe A'
      : getActiveStage(tournament)?.type === 'SWISS'
        ? 'Rang 5 · 3:1'
        : 'Noch im Turnier',
  };
}

export function findMockRuntimeMatch(matchId?: string) {
  if (!matchId) return undefined;
  for (const tournament of getAllMockTournaments()) {
    const match = getMockRuntimeMatches(tournament).find((item) => item.id === matchId);
    if (match) return { tournament, match };
  }
  return undefined;
}
