import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, getMockTournament, updateMockTournamentStatus, type MockPhaseInput } from '@/services/mockTournamentStore';
import { getStageEntrants, startFirstStage } from '@/services/mockPhaseLifecycle';
import { getGroupAssignments, setParticipantGroup } from '@/services/mockDrawStore';
import { buildMockGroups } from '@/services/mockCompetitionViews';
import { completeMockMatch, getMockStageMatches, getPendingGroupCutoff,
  getPendingMockApproval, getEditableGroupCutoffs, resolveGroupCutoff, approveMockProgress } from '@/services/mockRuntime';
import { getLiveScheduleDeviations } from '@/services/mockLiveSchedule';
import { buildPlannedTimeline, parseLocalDateTime } from '@/domain/tournamentSchedule';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
  }}));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function fixture(type: 'GROUPS' | 'ROUND_ROBIN', fieldSize = 4, groupCount = 2) {
  const phases: MockPhaseInput[] = [
    { type, label: 'Vorrunde', entrantCount: fieldSize, groupCount, swissRounds: 2, bestOf: 1, knockoutBestOf: [] },
    { type: 'KNOCKOUT', label: 'Finale', entrantCount: 2, groupCount: 1, swissRounds: 2, bestOf: 1, knockoutBestOf: [1] },
  ];
  const names = Array.from({ length: fieldSize }, (_, i) => String.fromCharCode(65 + i) + ' Spieler');
  const t = createMockTournament({ name: 'Qualifikation', sport: 'football', discipline: 'SINGLES',
    tables: 8, minimumMatches: 1, participantNames: names,
    phases, estimatedDurationMinutes: 55 });
  return t;
}

describe('same sporting criteria across all qualification formats', () => {
  it('requires a separate decision for each group-local boundary tie', () => {
    const t = fixture('GROUPS');
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    getMockStageMatches(t, t.stages[0]).forEach((match) =>
      completeMockMatch(match.id, [{ number: 1, sideAScore: 1, sideBScore: 1 }]));
    expect(getPendingMockApproval(t)).toBeNull();
    const chosen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const cutoff = getPendingGroupCutoff(t);
      expect(cutoff?.scope).toBe('intra');
      expect(cutoff?.groupLabel).toMatch(/^Gruppe /);
      expect(cutoff?.tie.slots).toBe(1);
      const winner = cutoff!.tie.players.at(-1)!;
      chosen.push(winner);
      expect(resolveGroupCutoff(t, [winner], 'PLAYOFF', 'Separates Entscheidungsspiel 3:1')).toBeNull();
    }
    expect(getPendingGroupCutoff(t)).toBeNull();
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(new Set(getStageEntrants(t, t.stages[1]))).toEqual(new Set(chosen));
    const recorded = getEditableGroupCutoffs(t);
    expect(recorded).toHaveLength(2);
    const second = recorded[1];
    const alternate = second.tie.players.find((name) => !second.decision?.winners.includes(name))!;
    expect(resolveGroupCutoff(t, [alternate], 'LOT',
      'Korrigierter Losentscheid mit Zeugen', second.signature)).toBeNull();
    expect(getStageEntrants(t, t.stages[1])).toContain(alternate);
    expect(getStageEntrants(t, t.stages[1])).not.toContain(chosen[1]);
  });

  it('never selects the alphabetical round-robin cutoff without director approval', () => {
    const t = fixture('ROUND_ROBIN');
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    getMockStageMatches(t, t.stages[0]).forEach((match) =>
      completeMockMatch(match.id, [{ number: 1, sideAScore: 0, sideBScore: 0 }]));
    expect(approveMockProgress(t)).toBeNull();
    const cutoff = getPendingGroupCutoff(t)!;
    expect(cutoff.scope).toBe('round-robin');
    const chosen = cutoff.tie.players.slice(-2);
    expect(resolveGroupCutoff(t, chosen, 'LOT', 'Losverfahren mit Zeugen dokumentiert')).toBeNull();
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(new Set(getStageEntrants(t, t.stages[1]))).toEqual(new Set(chosen));
  });

  it('removes empty groups on phase start and remaps every retained assignment', () => {
    const t = fixture('GROUPS', 8, 3);
    const stage = t.stages[0];
    const assignments = getGroupAssignments(t, stage);
    for (const [player, group] of Object.entries(assignments)) {
      if (group === 2) expect(setParticipantGroup(t, stage, player, 0)).toBe(true);
    }
    expect(startFirstStage(t)).toBe(true);
    expect(t.stages[0].settings.groups).toBe(2);
    expect(getMockTournament(t.id).stages[0].settings.groups).toBe(2);
    expect(buildMockGroups(t, stage)).toHaveLength(2);
    expect(Object.values(getGroupAssignments(t, stage)).every((group) => group < 2)).toBe(true);
  });
});

describe('original schedule and live shift indicators', () => {
  it('lets a fixed-target pause absorb delays until the director starts it', () => {
    const t = fixture('GROUPS', 8, 2);
    t.stages.splice(1, 0, { ...t.stages[0], id: t.id + '-break-test', name: 'Pause',
      type: 'BREAK', settings: { ...t.stages[0].settings, breakKind: 'until', breakUntil: '10:00' } });
    const timeline = buildPlannedTimeline('2030-11-21T09:00', [
      { label: 'Vorrunde', type: 'GROUPS', estimatedMinutes: 15 },
      { label: 'Pause', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '10:00' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 10 },
    ]);
    t.plannedSchedule = [...timeline.items, { id: 'award-ceremony',
      title: 'Siegerehrung', at: timeline.estimatedEnd, type: 'other' }];
    const phaseKey = 'online-tournament:mock-phase-lifecycle:v1';
    storage.set(phaseKey, JSON.stringify([{ tournamentId: t.id,
      startedStageIds: [t.stages[0].id], completedStageIds: [],
      stageStartedAt: { [t.stages[0].id]: parseLocalDateTime('2030-11-21T09:00')!.toISOString() },
      stageExtraMinutes: { [t.stages[0].id]: 10 },
    }]));
    const absorbed = getLiveScheduleDeviations(t);
    expect(absorbed['phase-1'].extraMinutes).toBe(10);
    expect(absorbed['phase-2'].offsetMinutes).toBe(10);
    expect(absorbed['phase-3'].offsetMinutes).toBe(0);
    const plannedAfterPause = timeline.items.find((item) => item.id === 'phase-3')!.at;
    const resumeAt = parseLocalDateTime(plannedAfterPause)!;
    resumeAt.setMinutes(resumeAt.getMinutes() + 15);
    storage.set(phaseKey, JSON.stringify([{ tournamentId: t.id,
      startedStageIds: [t.stages[0].id, t.stages[1].id], completedStageIds: [],
      stageStartedAt: { [t.stages[0].id]: '2030-11-21T09:00:00.000Z',
        [t.stages[1].id]: parseLocalDateTime('2030-11-21T09:25')!.toISOString() },
      stageExtraMinutes: { [t.stages[0].id]: 10 },
      breakResumeAt: { [t.stages[1].id]: resumeAt.toISOString() },
    }]));
    expect(getLiveScheduleDeviations(t)['phase-3'].offsetMinutes).toBe(15);
    expect(t.plannedSchedule.find((item) => item.id === 'phase-3')?.at).toBe(plannedAfterPause);
  });
});
