import type { DemoTournament } from '@/data/demoTournaments';
import type { MatchSet } from '@/domain/types';
import { getAllMockTournaments } from '@/services/mockTournamentStore';

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

const RESULT_KEY = 'online-tournament:mock-match-results:v2';

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

export function getMockRuntimeMatches(tournament: DemoTournament): MockRuntimeMatch[] {
  const names = getRuntimeParticipantNames(tournament);
  const currentStage = tournament.stages[0];
  const phase = currentStage?.name ?? 'Turnier';
  const stageId = currentStage?.id ?? `${tournament.id}-stage`;
  const bestOf = currentStage?.bestOf ?? 3;
  const tableCount = Math.max(1, tournament.tables);
  const stored = readResults();

  const liveCount = tournament.status === 'RUNNING' ? Math.min(Math.max(2, tournament.runningMatches || 3), Math.min(tableCount, 8)) : 0;
  const live = Array.from({ length: liveCount }, (_, index): MockRuntimeMatch => {
    const id = `${tournament.id}-live-${index + 1}`;
    const saved = stored.find((item) => item.matchId === id);
    return {
      id,
      table: `Tisch ${index + 1}`,
      sideA: participantAt(names, index * 2),
      sideB: participantAt(names, index * 2 + 1),
      score: saved ? scoreFromSets(saved.sets) : index % 3 === 0 ? '2 : 1' : index % 3 === 1 ? '1 : 1' : '1 : 2',
      status: saved?.status ?? (index === liveCount - 1 && tournament.openConfirmations > 0 ? 'CONFIRMATION' : 'LIVE'),
      phase,
      stageId,
      bestOf,
      pauseA: 12 + ((index * 7) % 19),
      pauseB: 5 + ((index * 11) % 23),
      sets: saved?.sets,
      round: currentStage?.type === 'SWISS' ? 'Runde 3' : currentStage?.type === 'GROUPS' ? `Gruppe ${String.fromCharCode(65 + (index % Math.max(1, Number(currentStage.settings.groups) || 4)))}` : 'Aktuelle Runde',
    };
  });

  const ready = Array.from({ length: Math.min(7, Math.max(3, tournament.participants - liveCount * 2)) }, (_, index): MockRuntimeMatch => ({
    id: `${tournament.id}-ready-${index + 1}`,
    table: index < Math.max(1, tableCount - liveCount) ? `Tisch ${liveCount + index + 1}` : 'Noch offen',
    sideA: participantAt(names, liveCount * 2 + index * 2),
    sideB: participantAt(names, liveCount * 2 + index * 2 + 1),
    score: '–',
    status: index < Math.max(1, tableCount - liveCount) ? 'READY' : 'WAITING',
    phase,
    stageId,
    bestOf,
    pauseA: 3 + ((index * 6) % 28),
    pauseB: 8 + ((index * 9) % 24),
    round: currentStage?.type === 'SWISS' ? 'Runde 3' : currentStage?.type === 'GROUPS' ? `Gruppe ${String.fromCharCode(65 + (index % Math.max(1, Number(currentStage.settings.groups) || 4)))}` : 'Nächstes Spiel',
    note: index >= Math.max(1, tableCount - liveCount) ? 'Wartet auf freien Tisch' : undefined,
  }));

  return [...live, ...ready];
}

export function completeMockMatch(matchId: string, sets: MatchSet[], status: MockMatchState = 'FINISHED') {
  const current = readResults();
  const previous = current.find((item) => item.matchId === matchId);
  const next: StoredMatchResult = { ...previous, matchId, sets, status };
  writeResults([next, ...current.filter((item) => item.matchId !== matchId)]);
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
  const next = matches.find((match) => match.status === 'READY' && (match.sideA === player || match.sideB === player)) ?? matches.find((match) => match.status === 'READY');
  return {
    player,
    playerCode: '4821',
    matchCode: 'A7K2',
    currentMatch: ownLive,
    nextMatch: next,
    standing: tournament.stages[0]?.type === 'GROUPS' ? '2. Platz · Gruppe A' : tournament.stages[0]?.type === 'SWISS' ? 'Rang 5 · 3:1' : 'Noch im Turnier',
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
