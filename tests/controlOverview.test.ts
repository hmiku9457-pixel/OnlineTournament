import { describe, expect, it } from 'vitest';
import { filterControlMatches, summarizeControlProgress } from '@/domain/controlOverview';

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
