import { describe, expect, it } from 'vitest';
import type { DemoTournament } from '@/data/demoTournaments';
import { createPrestartPhase, estimatePrestartDuration, hasStartedAnyStage, initialPrestartPhases,
  normalizePrestartPhases, recommendedPrestartGroupCount, validatePrestartPhases } from '@/domain/prestartPhasePlanning';

const tournament: DemoTournament = {
  id: 'test', name: 'Turnier', subtitle: '', status: 'READY', visibility: 'PRIVATE',
  sport: 'Tischtennis', discipline: 'SINGLES', participants: 19, tables: 6,
  activeTables: 0, runningMatches: 0, openConfirmations: 0,
  phasesLabel: '', estimatedDuration: '', lastUpdate: '', hasStarted: false,
  stages: [
    { id: 'a', tournamentId: 'test', name: 'Gruppen', type: 'GROUPS', orderIndex: 0,
      bestOf: 1, settings: { entrants: 19, groups: 8 }, advancement: { type: 'top_n', value: 12 } },
    { id: 'b', tournamentId: 'test', name: 'Schweizer', type: 'SWISS', orderIndex: 1,
      bestOf: 1, settings: { entrants: 12, rounds: 7 }, advancement: { type: 'top_n', value: 8 } },
    { id: 'c', tournamentId: 'test', name: 'K.-o.', type: 'KNOCKOUT', orderIndex: 2,
      bestOf: 5, settings: { entrants: 8, roundBestOf: '3,5,5' }, advancement: { type: 'manual', value: 0 } },
  ],
  areas: [], participantNames: Array.from({ length: 19 }, (_, i) => 'Spieler ' + (i + 1)),
};

describe('replan before tournament start', () => {
  it('takes the actual active field and bounds every subsequent qualification', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 7);
    expect(phases.map((phase) => phase.entrantCount)).toEqual([7, 7, 7]);
    expect(phases[0].groupCount).toBe(8); // unsafe group setting is not silently rewritten
    expect(validatePrestartPhases(phases, 7)).toContain(
      'Phase 1: Die Gruppenanzahl muss zwischen 2 und 3 liegen (mindestens zwei pro Gruppe).');
    expect(phases[2].knockoutBestOf.length).toBe(3);
  });

  it('flags too many Swiss rounds and accepts a recommended correction', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 4);
    expect(validatePrestartPhases(phases, 4).some((issue) => issue.includes('Schweizer Runden'))).toBe(true);
    phases[0].groupCount = 2;
    phases[1].swissRounds = 3;
    expect(validatePrestartPhases(phases, 4)).toEqual([]);
  });

  it('recommends groups with the following qualification count', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 19);
    expect(recommendedPrestartGroupCount(phases, 0)).toBe(4);
  });

  it('prevents invalid phase ordering and no-player scenarios', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 1);
    expect(validatePrestartPhases(phases, 1)[0]).toContain('Mindestens zwei');
    const valid = normalizePrestartPhases(initialPrestartPhases(tournament), 12);
    valid[0].groupCount = 3;
    valid[1].swissRounds = 5;
    valid.splice(0, 0, createPrestartPhase('BREAK', 12));
    expect(validatePrestartPhases(valid, 12)).toContain('Eine Pause muss zwischen zwei Spielphasen stehen.');
  });

  it('validiert die neue Pausenart mit Uhrzeit getrennt von Minuten und Spieltagsende', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 12);
    phases[0].groupCount = 3;
    phases[1].swissRounds = 5;
    const pause = createPrestartPhase('BREAK', 12);
    pause.breakKind = 'until';
    pause.breakUntil = '14:30';
    phases.splice(1, 0, pause);
    expect(validatePrestartPhases(phases, 12)).toEqual([]);
    pause.breakUntil = '25:99';
    expect(validatePrestartPhases(phases, 12)).toContain('Phase 2: Für „Pause bis“ ist eine gültige Uhrzeit (HH:MM) erforderlich.');
    pause.breakUntil = '14:30';
    expect(validatePrestartPhases(phases, 12)).toEqual([]);
  });

  it('keeps set duration estimates sport aware and blocks edits after start', () => {
    const phases = normalizePrestartPhases(initialPrestartPhases(tournament), 19);
    expect(estimatePrestartDuration(tournament, phases)).toBeGreaterThan(0);
    expect(hasStartedAnyStage(tournament, [])).toBe(false);
    expect(hasStartedAnyStage(tournament, ['a'])).toBe(true);
    expect(hasStartedAnyStage({ ...tournament, hasStarted: true }, [])).toBe(true);
  });
});
