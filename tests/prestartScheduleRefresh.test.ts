import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlannedTimeline } from '@/domain/tournamentSchedule';
import { initialPrestartPhases } from '@/domain/prestartPhasePlanning';
import { addMockParticipant, createMockTournament, getMockTournament, refreshPrestartSchedule, updatePrestartTournamentPhases } from '@/services/mockTournamentStore';
import { saveParticipantWithdrawal } from '@/services/mockWithdrawals';
import { getGroupAssignments, setParticipantGroup } from '@/services/mockDrawStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { getLiveScheduleDeviations } from '@/services/mockLiveSchedule';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function sample(withBreak = false) {
  const stages = [
    { type: 'GROUPS' as const, label: 'Gruppen', entrantCount: 8, groupCount: 2, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
    ...(withBreak ? [{
      type: 'BREAK' as const, label: 'Pause', entrantCount: 8, groupCount: 2, swissRounds: 1,
      bestOf: 1, knockoutBestOf: [], breakKind: 'minutes' as const, breakMinutes: 15,
    }] : []),
    { type: 'KNOCKOUT' as const, label: 'Finale', entrantCount: 4, groupCount: 2, swissRounds: 1,
      bestOf: 1, knockoutBestOf: [1, 1] },
  ];
  const timeline = buildPlannedTimeline('2026-11-21T09:00', stages.map((stage) => ({
    label: stage.label, type: stage.type,
    estimatedMinutes: stage.type === 'GROUPS' ? 15 : stage.type === 'BREAK' ? 0 : 10,
    breakKind: stage.type === 'BREAK' ? 'minutes' as const : undefined,
    breakMinutes: stage.type === 'BREAK' ? 15 : undefined,
  })));
  return createMockTournament({
    name: 'Phasenprüfung', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 9, minimumMatches: 2, participantNames: Array.from({ length: 8 }, (_, i) => `Spieler ${i + 1}`),
    phases: stages, estimatedDurationMinutes: withBreak ? 40 : 25,
    scheduledStart: '2026-11-21T09:00',
    plannedSchedule: [
      ...timeline.items,
      { id: 'award-ceremony', at: timeline.estimatedEnd, type: 'other', title: 'Siegerehrung', autoTime: true },
    ],
  });
}

describe('prestart schedule consistency after roster and phase edits', () => {
  it('regenerates saved phase timings and auto ceremony after changing a group plan', () => {
    const tournament = sample();
    const phases = initialPrestartPhases(tournament);
    phases[0].groupCount = 4;
    const result = updatePrestartTournamentPhases(tournament.id, phases);
    expect(result.ok).toBe(true);
    const updated = getMockTournament(tournament.id);
    expect(updated.plannedSchedule?.find((item) => item.id === 'phase-2')?.at).toBe('2026-11-21T09:05');
    expect(updated.plannedSchedule?.find((item) => item.id === 'award-ceremony')?.at).toBe('2026-11-21T09:15');
    expect(updated.estimatedDuration).toContain('15min');
  });

  it('preserves the original schedule until phase start and shows extra time after an uneven draw', () => {
    const tournament = sample();
    const group = tournament.stages[0];
    const assignments = getGroupAssignments(tournament, group);
    const from = tournament.participantNames!.find((name) => assignments[name] === 0)!;
    expect(setParticipantGroup(tournament, group, from, 1)).toBe(true);
    expect(getMockTournament(tournament.id).plannedSchedule?.find((item) => item.id === 'phase-2')?.at)
      .toBe('2026-11-21T09:15');
    expect(startFirstStage(tournament)).toBe(true);
    const deviations = getLiveScheduleDeviations(tournament);
    expect(deviations['phase-1'].extraMinutes).toBe(10);
    expect(deviations['phase-2'].offsetMinutes).toBe(10);
    expect(deviations['award-ceremony'].offsetMinutes).toBe(10);
  });

  it('keeps the newly balanced baseline after a phase edit clears manual group assignments', () => {
    const tournament = sample();
    const group = tournament.stages[0];
    const assignments = getGroupAssignments(tournament, group);
    const from = tournament.participantNames!.find((name) => assignments[name] === 0)!;
    expect(setParticipantGroup(tournament, group, from, 1)).toBe(true);
    const phases = initialPrestartPhases(tournament);
    phases[0].label = 'Vorrunde';
    expect(updatePrestartTournamentPhases(tournament.id, phases).ok).toBe(true);
    expect(getMockTournament(tournament.id).plannedSchedule?.find((item) => item.id === 'phase-2')?.at)
      .toBe('2026-11-21T09:15');
  });

  it('updates the forecast on registration and withdrawal, without rewriting configured group counts', () => {
    const tournament = sample();
    expect(addMockParticipant(tournament.id, 'Zusatz', 'Spieler').ok).toBe(true);
    const added = getMockTournament(tournament.id);
    expect(added.stages[0].settings.groups).toBe(2);
    expect(added.plannedSchedule?.find((item) => item.id === 'phase-2')?.at).toBe('2026-11-21T09:25');
    expect(added.plannedSchedule?.find((item) => item.id === 'award-ceremony')?.at).toBe('2026-11-21T09:35');
    saveParticipantWithdrawal(added, 'Zusatz Spieler');
    refreshPrestartSchedule(tournament.id);
    const removed = getMockTournament(tournament.id);
    expect(removed.plannedSchedule?.find((item) => item.id === 'phase-2')?.at).toBe('2026-11-21T09:15');
    expect(removed.plannedSchedule?.find((item) => item.id === 'award-ceremony')?.at).toBe('2026-11-21T09:25');
  });

  it('rejects impossible break-until settings before saving a modified phase plan', () => {
    const tournament = sample(true);
    const phases = initialPrestartPhases(tournament);
    phases[1].breakKind = 'until';
    phases[1].breakUntil = '09:05';
    const result = updatePrestartTournamentPhases(tournament.id, phases);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Pause bis');
    expect(getMockTournament(tournament.id).stages[1].settings.breakKind).toBe('minutes');
  });
});
