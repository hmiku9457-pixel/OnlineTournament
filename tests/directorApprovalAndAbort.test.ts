import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareRankingRows } from '@/domain/sportScoring';
import { createMockTournament, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { isStageCompleted, startFirstStage } from '@/services/mockPhaseLifecycle';
import {
  abortMockTournament, adminConfirmMockMatch, approveMockProgress,
  completeMockMatch, getMockStageMatches, getMockStoredResult, getPendingMockApproval,
  getMockAssignmentBlockReason,
} from '@/services/mockRuntime';
import type { MockPhaseInput } from '@/services/mockTournamentStore';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem(key: string) { return data.get(key) ?? null; },
      setItem(key: string, value: string) { data.set(key, String(value)); },
      removeItem(key: string) { data.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) {
      super(type);
      this.detail = options?.detail as T;
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

function create(type: MockPhaseInput['type'] = 'SWISS', sport = 'table_tennis', rounds = 2) {
  const tournament = createMockTournament({
    name: 'Abnahmetest Turnierleitung', sport, discipline: 'SINGLES', tables: 2,
    minimumMatches: 1, participantNames: ['Anna', 'Bernd', 'Clara', 'Dieter'],
    estimatedDurationMinutes: 90,
    phases: [{ type, label: 'Phase 1', entrantCount: 4, groupCount: 1,
      swissRounds: rounds, bestOf: 1, knockoutBestOf: [1, 1] }],
  });
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  return tournament;
}
const set = [{ number: 1, sideAScore: 11, sideBScore: 7 }];

describe('Verbindliche Kontrollen der Turnierleitung', () => {
  it('sperrt die naechste Schweizer Runde bis zur manuellen Freigabe', () => {
    const t = create();
    const first = getMockStageMatches(t, t.stages[0]);
    expect(first).toHaveLength(2);
    first.forEach((match) => completeMockMatch(match.id, set));
    expect(getMockStageMatches(t, t.stages[0]).filter((m) => m.round === 'Runde 2')).toHaveLength(0);
    expect(getPendingMockApproval(t)).toMatchObject({ kind: 'ROUND', round: 1 });
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    expect(getMockStageMatches(t, t.stages[0]).filter((m) => m.round === 'Runde 2')).toHaveLength(2);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
  });

  it('zieht nach einer Korrektur die Rundenfreigabe vor Beginn der Folgerunde zurueck', () => {
    const t = create();
    const first = getMockStageMatches(t, t.stages[0]);
    first.forEach((match) => completeMockMatch(match.id, set));
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    completeMockMatch(first[0].id, [{ number: 1, sideAScore: 7, sideBScore: 11 }]);
    expect(getMockStageMatches(t, t.stages[0]).filter((m) => m.round === 'Runde 2')).toHaveLength(0);
    expect(getPendingMockApproval(t)).toMatchObject({ kind: 'ROUND', round: 1 });
  });

  it('beendet ein Turnier erst nach Phasenfreigabe', () => {
    const t = create('ROUND_ROBIN');
    getMockStageMatches(t, t.stages[0]).forEach((match) => completeMockMatch(match.id, set));
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(getMockTournament(t.id).status).toBe('RUNNING');
    expect(getPendingMockApproval(t)?.kind).toBe('STAGE');
    expect(approveMockProgress(t)?.isLastStage).toBe(true);
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    expect(getMockTournament(t.id).status).toBe('FINISHED');
  });

  it('gibt der Turnierleitung Vorrang ohne vorgetaeuschte Spielerbestaetigungen', () => {
    const t = create('ROUND_ROBIN');
    const match = getMockStageMatches(t, t.stages[0])[0];
    completeMockMatch(match.id, set);
    expect(getMockStoredResult(match.id)?.confirmedA).toBeUndefined();
    expect(adminConfirmMockMatch(t, match.id)).toBe(true);
    expect(getMockStoredResult(match.id)).toMatchObject({ adminConfirmed: true });
    expect(getMockStoredResult(match.id)?.confirmedB).toBeUndefined();
  });

  it('bricht ein Turnier ohne kuenstlichen Sieger ab und erhaelt Resultate', () => {
    const t = create('ROUND_ROBIN');
    const matches = getMockStageMatches(t, t.stages[0]);
    completeMockMatch(matches[0].id, set);
    expect(abortMockTournament(t, 'Halle gesperrt')).toBe(true);
    expect(getMockTournament(t.id).status).toBe('ABORTED');
    expect(getMockStoredResult(matches[0].id)?.status).toBe('FINISHED');
    expect(getMockStageMatches(t, t.stages[0]).find((match) => match.id === matches[1].id)?.status).toBe('CANCELLED');
    expect(getMockAssignmentBlockReason(t, matches[1].id, 'Tisch 1')).not.toBeNull();
    expect(getPendingMockApproval(t)).toBeNull();
    expect(abortMockTournament(t, 'nochmal')).toBe(false);
  });

  it('ordnet Schweizer Ergebnissportarten nach angezeigten 3/1/0-Punkten vor SB', () => {
    const winner = { name: 'A', wins: 1, draws: 0, setsWon: 1, setsLost: 0, ballsWon: 2, ballsLost: 1, buchholz: 0 };
    const drawn = { name: 'B', wins: 0, draws: 2, setsWon: 0, setsLost: 0, ballsWon: 2, ballsLost: 2, buchholz: 100 };
    expect(compareRankingRows('football', winner, drawn, true)).toBeLessThan(0);
    const tied = { ...winner, name: 'C', buchholz: 2 };
    expect(compareRankingRows('football', winner, tied, true)).toBeGreaterThan(0);
  });
});
