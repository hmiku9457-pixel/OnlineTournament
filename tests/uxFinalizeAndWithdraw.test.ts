import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getMatchFinalization } from '@/domain/matchFinalization';
import { createVenueLayout, placeVenueCell } from '@/domain/venueLayout';
import { estimatePhaseMetrics } from '@/domain/tournamentCreation';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageEntrants, isStageCompleted, startFirstStage } from '@/services/mockPhaseLifecycle';
import { assignMockMatchToTable, canRestoreMockParticipant, completeMockMatch, getMockAssignmentBlockReason, getMockRuntimeMatches, isMockParticipantWithdrawn, restoreMockParticipant, saveMockMatchSets, withdrawMockParticipant } from '@/services/mockRuntime';

const storage = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return storage.get(key) ?? null; },
  setItem(key: string, value: string) { storage.set(key, String(value)); },
  removeItem(key: string) { storage.delete(key); },
};

beforeEach(() => {
  storage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function makeTournament(stages = 1, sport = 'table_tennis') {
  return createMockTournament({
    name: 'Test', sport, discipline: 'SINGLES', tables: 2, minimumMatches: 1,
    participantNames: ['Anna A', 'Ben B', 'Cora C', 'Dora D'],
    phases: Array.from({ length: stages }, (_, i) => ({
      type: i === 0 ? 'ROUND_ROBIN' as const : 'KNOCKOUT' as const,
      label: `Phase ${i + 1}`, bestOf: 3, entrantCount: i === 0 ? 4 : 2,
      groupCount: 1, swissRounds: 1, knockoutBestOf: [],
    })),
    estimatedDurationMinutes: 120, matchDurationMinutes: sport === 'table_tennis' ? 15 : 12,
    venueTurnoverMinutes: sport === 'table_tennis' ? 0 : 5,
  });
}

const scores = [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 8 }];

describe('UI completion workflow', () => {
  it('finishes BO1 immediately but requires explicit final confirmation for BO3/BO5', () => {
    expect(getMatchFinalization(1, scores.slice(0, 1))).toBe('AUTO_FINISH');
    expect(getMatchFinalization(3, scores)).toBe('NEEDS_CONFIRMATION');
    expect(getMatchFinalization(5, scores)).toBe('IN_PROGRESS');
    expect(getMatchFinalization(5, [...scores, { number: 3, sideAScore: 11, sideBScore: 6 }])).toBe('NEEDS_CONFIRMATION');
  });
  it('keeps the final set as LIVE until the final result is explicitly submitted', () => {
    const tournament = makeTournament();
    expect(startFirstStage(tournament)).toBe(true);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const match = getMockRuntimeMatches(running)[0];
    expect(assignMockMatchToTable(running, match.id, 'Tisch 1')).toBe(true);
    saveMockMatchSets(match.id, scores, 'LIVE');
    expect(getMockRuntimeMatches(running).find((x) => x.id === match.id)?.status).toBe('LIVE');
    completeMockMatch(match.id, scores);
    expect(getMockRuntimeMatches(running).find((x) => x.id === match.id)?.status).toBe('FINISHED');
  });
});

describe('Pre-phase withdrawal restoration', () => {
  it('can restore a withdrawal before tournament start', () => {
    const tournament = makeTournament();
    expect(withdrawMockParticipant(tournament, 'Anna A')).toBe(true);
    expect(canRestoreMockParticipant(tournament, 'Anna A')).toBe(true);
    expect(restoreMockParticipant(tournament, 'Anna A')).toBe(true);
    expect(isMockParticipantWithdrawn(tournament, 'Anna A')).toBe(false);
  });
  it('cannot restore a withdrawal made during an active round', () => {
    const tournament = makeTournament();
    startFirstStage(tournament);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    expect(withdrawMockParticipant(running, 'Anna A')).toBe(true);
    expect(canRestoreMockParticipant(running, 'Anna A')).toBe(false);
  });
  it('restores a qualified player if the following phase has not started', () => {
    const tournament = makeTournament(2);
    startFirstStage(tournament);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    getMockRuntimeMatches(running).forEach((match) => completeMockMatch(match.id, scores));
    expect(isStageCompleted(running, running.stages[0])).toBe(true);
    const finalist = getStageEntrants(running, running.stages[1])[0];
    expect(withdrawMockParticipant(running, finalist)).toBe(true);
    expect(canRestoreMockParticipant(running, finalist)).toBe(true);
    expect(restoreMockParticipant(running, finalist)).toBe(true);
    expect(getStageEntrants(running, running.stages[1])).toContain(finalist);
  });
});

describe('Hallenraster und zeitbasierte Sportarten', () => {
  it('toggles intentional empty spaces without a separate blank-button', () => {
    const layout = createVenueLayout(8);
    expect(layout.columns).toBe(10);
    expect(layout.rows).toBe(3);
    const marked = placeVenueCell(layout, 'space', 18);
    expect(marked.cells[18]).toBe('space');
    expect(placeVenueCell(marked, 'space', 18).cells[18]).toBe('');
  });
  it('applies game duration and turnover for a time-based tournament', () => {
    expect(estimatePhaseMetrics({ type: 'ROUND_ROBIN', entrantCount: 4, bestOf: 5 }, 2, {
      matchDurationMinutes: 12, venueTurnoverMinutes: 5,
    }).estimatedDurationMinutes).toBe(51);
  });
  it('blocks a venue until its turnaround interval has elapsed', () => {
    const tournament = makeTournament(1, 'football');
    startFirstStage(tournament);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const first = getMockRuntimeMatches(running)[0];
    expect(assignMockMatchToTable(running, first.id, 'Tisch 1')).toBe(true);
    completeMockMatch(first.id, scores);
    const next = getMockRuntimeMatches(running).find((match) => match.status === 'WAITING');
    expect(next).toBeDefined();
    expect(getMockAssignmentBlockReason(running, next!.id, 'Tisch 1')).toContain('Pause');
    vi.advanceTimersByTime(5 * 60_000);
    expect(getMockAssignmentBlockReason(running, next!.id, 'Tisch 1')).toBeNull();
  });
});
