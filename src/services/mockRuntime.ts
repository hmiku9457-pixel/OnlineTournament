import type { DemoTournament } from '@/data/demoTournaments';
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
  round: string;
  note?: string;
}

const firstNames = [
  'Max', 'Lukas', 'Jonas', 'Leon', 'Tim', 'Felix', 'Paul', 'Ben', 'Noah', 'Elias', 'Nico', 'Jan',
  'Moritz', 'Tobias', 'Daniel', 'Simon', 'David', 'Florian', 'Marco', 'Erik', 'Julian', 'Robin', 'Marius', 'Kevin',
  'Anna', 'Laura', 'Sophie', 'Lea', 'Mia', 'Lena', 'Lisa', 'Julia', 'Nina', 'Sarah', 'Marie', 'Emma',
];
const lastNames = [
  'Müller', 'Schmidt', 'Bauer', 'Fischer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf',
  'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Schmitz', 'Krause', 'Meier', 'Lehmann',
];

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

export function getMockRuntimeMatches(tournament: DemoTournament): MockRuntimeMatch[] {
  const names = getRuntimeParticipantNames(tournament);
  const phase = tournament.stages[0]?.name ?? 'Turnier';
  const tableCount = Math.max(1, tournament.tables);

  const liveCount = tournament.status === 'RUNNING' ? Math.min(Math.max(2, tournament.runningMatches || 3), Math.min(tableCount, 8)) : 0;
  const live = Array.from({ length: liveCount }, (_, index): MockRuntimeMatch => ({
    id: `${tournament.id}-live-${index + 1}`,
    table: `Tisch ${index + 1}`,
    sideA: participantAt(names, index * 2),
    sideB: participantAt(names, index * 2 + 1),
    score: index % 3 === 0 ? '2 : 1' : index % 3 === 1 ? '1 : 1' : '1 : 2',
    status: index === liveCount - 1 && tournament.openConfirmations > 0 ? 'CONFIRMATION' : 'LIVE',
    phase,
    round: tournament.stages[0]?.type === 'SWISS' ? 'Runde 3' : tournament.stages[0]?.type === 'GROUPS' ? `Gruppe ${String.fromCharCode(65 + (index % 4))}` : 'Aktuelle Runde',
  }));

  const ready = Array.from({ length: Math.min(5, Math.max(2, tournament.participants - liveCount * 2)) }, (_, index): MockRuntimeMatch => ({
    id: `${tournament.id}-ready-${index + 1}`,
    table: index < Math.max(1, tableCount - liveCount) ? `Tisch ${liveCount + index + 1}` : 'Noch offen',
    sideA: participantAt(names, liveCount * 2 + index * 2),
    sideB: participantAt(names, liveCount * 2 + index * 2 + 1),
    score: '–',
    status: index < Math.max(1, tableCount - liveCount) ? 'READY' : 'WAITING',
    phase,
    round: tournament.stages[0]?.type === 'SWISS' ? 'Runde 3' : 'Nächstes Spiel',
    note: index >= Math.max(1, tableCount - liveCount) ? 'Wartet auf freien Tisch' : undefined,
  }));

  return [...live, ...ready];
}

export function getMockPlayerSnapshot(tournament: DemoTournament) {
  const participants = getRuntimeParticipantNames(tournament);
  const player = participants[0] ?? 'Max Mustermann';
  const matches = getMockRuntimeMatches(tournament);
  const ownLive = matches.find((match) => match.sideA === player || match.sideB === player);
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
