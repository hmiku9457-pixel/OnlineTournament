import { describe, expect, it } from 'vitest';
import { filterControlMatches, filterControlQueueMatches, summarizeControlProgress } from '@/domain/controlOverview';

const matches = [
  { id: 'a', sideA: 'Anna Müller', sideB: 'Ben', phase: 'Gruppen', table: 'Tisch 1', status: 'LIVE' },
  { id: 'b', sideA: 'Clara', sideB: 'Dora', phase: 'Gruppen', table: 'Noch offen', status: 'WAITING' },
  { id: 'c', sideA: 'Anna Müller', sideB: 'Dora', phase: 'Gruppen', table: 'Tisch 2', status: 'FINISHED' },
  { id: 'd', sideA: 'Eva', sideB: 'Finn', phase: 'Finale', table: 'Tisch 1', status: 'CONFIRMATION' },
  { id: 'e', sideA: 'Gina', sideB: 'Henri', phase: 'Finale', table: 'Tisch 3', status: 'READY' },
];
const all = { status: 'all' as const, phase: '', table: '', search: '' };

describe('Filter für alle Turnierspiele', () => {
  it('kombiniert Teilnehmersuche, Phase und Tisch', () => {
    expect(filterControlMatches(matches, { ...all, phase: 'Gruppen', table: 'Tisch 2', search: '  MÜLLER ' }).map((match) => match.id)).toEqual(['c']);
    expect(filterControlMatches(matches, { ...all, search: 'NiemAnd' })).toEqual([]);
  });

  it('unterscheidet wartende, zugewiesene/laufende und abgeschlossene Spiele', () => {
    expect(filterControlMatches(matches, { ...all, status: 'waiting' }).map((match) => match.id)).toEqual(['b']);
    expect(filterControlMatches(matches, { ...all, status: 'live' }).map((match) => match.id)).toEqual(['a', 'd', 'e']);
    expect(filterControlMatches(matches, { ...all, status: 'finished' }).map((match) => match.id)).toEqual(['c']);
  });
});

describe('Kombinierte Filter der Warteliste', () => {
  const waiting = [
    { id: 'q1', sideA: 'Anna Müller', sideB: 'Ben', round: 'Gruppe A', matchDay: 1 },
    { id: 'q2', sideA: 'Clara', sideB: 'Dora', round: 'Gruppe B', matchDay: 1 },
    { id: 'q3', sideA: 'Eva', sideB: 'Anna Müller', round: 'Gruppe A', matchDay: 2 },
    { id: 'q4', sideA: 'Finn', sideB: 'Gina', round: 'Gruppe B', matchDay: 2 },
  ];
  const assignableIds = new Set(['q1', 'q3']);
  const filters = { status: 'all' as const, group: '', matchDay: '', search: '' };

  it('trennt zuweisbare und blockierte Spiele ohne die Reihenfolge zu verändern', () => {
    expect(filterControlQueueMatches(waiting, filters, assignableIds).map((match) => match.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(filterControlQueueMatches(waiting, { ...filters, status: 'assignable' }, assignableIds).map((match) => match.id)).toEqual(['q1', 'q3']);
    expect(filterControlQueueMatches(waiting, { ...filters, status: 'blocked' }, assignableIds).map((match) => match.id)).toEqual(['q2', 'q4']);
  });

  it('kombiniert Status, Gruppe, Spieltag und Namenssuche', () => {
    expect(filterControlQueueMatches(waiting, { status: 'assignable', group: 'Gruppe A', matchDay: '2', search: ' müLLer ' }, assignableIds).map((match) => match.id)).toEqual(['q3']);
    expect(filterControlQueueMatches(waiting, { ...filters, group: 'Gruppe B', matchDay: '1' }, assignableIds).map((match) => match.id)).toEqual(['q2']);
    expect(filterControlQueueMatches(waiting, { ...filters, search: 'nicht vorhanden' }, assignableIds)).toEqual([]);
    expect(filterControlQueueMatches(waiting, { ...filters, status: 'blocked', group: 'Gruppe A' }, assignableIds)).toEqual([]);
  });

  it('kann auch bei Spielplänen ohne Spieltage nach Teilnehmern filtern', () => {
    const knockout = [{ id: 'ko1', sideA: 'Herr Beispiel', sideB: 'Frau Beispiel', round: 'Halbfinale' }];
    expect(filterControlQueueMatches(knockout, { ...filters, search: 'frau' }, new Set(['ko1']))).toEqual(knockout);
    expect(filterControlQueueMatches(knockout, { ...filters, matchDay: '1' }, new Set(['ko1']))).toEqual([]);
  });
});

describe('Fortschritt nach Phasen', () => {
  const stages = [
    { id: 'groups', name: 'Gruppenphase', started: true, completed: false },
    { id: 'ko', name: 'K.-o.-Phase', started: false, completed: false },
  ];

  it('berechnet den Zwischenstand in der laufenden Phase', () => {
    expect(summarizeControlProgress(stages, 'groups', [{ status: 'FINISHED' }, { status: 'LIVE' }])).toMatchObject({ percent: 25, currentPhaseIndex: 1, completedMatches: 1, matchesInPhase: 2 });
  });

  it('zeigt den Phasenwechsel ohne künstlich gestartete Begegnungen', () => {
    expect(summarizeControlProgress([{ ...stages[0], completed: true }, stages[1]], null, [])).toMatchObject({ percent: 50, completedPhases: 1, currentPhaseIndex: 2, matchesInPhase: 0 });
  });

  it('erkennt den Turnierabschluss und einen leeren Phasenplan', () => {
    expect(summarizeControlProgress(stages.map((stage) => ({ ...stage, completed: true })), null, []).percent).toBe(100);
    expect(summarizeControlProgress([], null, []).percent).toBe(0);
  });
});
