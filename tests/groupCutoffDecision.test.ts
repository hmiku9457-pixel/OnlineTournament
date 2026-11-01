import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage, getStageEntrants } from '@/services/mockPhaseLifecycle';
import { approveMockProgress, completeMockMatch, getMockStageMatches,
  getPendingGroupCutoff, getPendingMockApproval, resolveGroupCutoff } from '@/services/mockRuntime';
import { getMockAudit } from '@/services/mockAudit';
import type { MockPhaseInput } from '@/services/mockTournamentStore';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
  }}));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function groupTournament() {
  const phases: MockPhaseInput[] = [
    { type: 'GROUPS', label: 'Gruppen', bestOf: 1, entrantCount: 4, groupCount: 2,
      swissRounds: 2, knockoutBestOf: [] },
    { type: 'KNOCKOUT', label: 'Finalrunde', bestOf: 1, entrantCount: 3, groupCount: 2,
      swissRounds: 2, knockoutBestOf: [1, 1] },
  ];
  const t = createMockTournament({ name: 'Gruppen-Stichentscheid', sport: 'table_tennis',
    discipline: 'SINGLES', tables: 4, minimumMatches: 1, participantNames:
      ['Anna Schmidt', 'Berit Müller', 'Clara Weber', 'Dora Sørensen'],
    phases, estimatedDurationMinutes: 45 });
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
  getMockStageMatches(t, t.stages[0]).forEach((match) =>
    completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]));
  return t;
}

describe('mandatory group qualification decision at an exact sporting tie', () => {
  it('blocks director approval and forbids alphabetical qualification until a logged tiebreak', () => {
    const t = groupTournament();
    const status = getPendingGroupCutoff(t);
    expect(status).not.toBeNull();
    expect(status!.tie.players).toHaveLength(2);
    expect(status!.tie.slots).toBe(1);
    expect(getPendingMockApproval(t)).toBeNull();
    expect(approveMockProgress(t)).toBeNull();

    const chosen = status!.tie.players.at(-1)!;
    expect(resolveGroupCutoff(t, [chosen, chosen], 'PLAYOFF', '11:7')).toContain('genau');
    expect(resolveGroupCutoff(t, [chosen], 'PLAYOFF', '')).toContain('dokumentieren');
    expect(resolveGroupCutoff(t, [chosen], 'PLAYOFF',
      'Separates Entscheidungsspiel: 11:7')).toBeNull();

    expect(getPendingGroupCutoff(t)).toBeNull();
    expect(getPendingMockApproval(t)?.kind).toBe('STAGE');
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(getStageEntrants(t, t.stages[1])).toContain(chosen);
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(3);
    expect(getMockAudit(t.id).some((entry) => entry.action === 'GROUP_TIE_RESOLVED'
      && entry.description.includes(chosen))).toBe(true);
  });

  it('restores an unresolved tie when a saved decision has a stale result signature', () => {
    const t = groupTournament();
    const status = getPendingGroupCutoff(t)!;
    expect(resolveGroupCutoff(t, [status.tie.players[0]], 'LOT',
      'Losziehung mit Zeugen')).toBeNull();
    expect(getPendingGroupCutoff(t)).toBeNull();
    // A stored decision for different group results or group allocations is
    // not accepted as permission to award qualification in the new context.
    const key = 'online-tournament:group-cutoff-decisions:v1';
    const decisions = JSON.parse(values.get(key)!) as Array<{ signature: string }>;
    decisions[0].signature = 'old-incorrect-signature';
    values.set(key, JSON.stringify(decisions));
    expect(getPendingGroupCutoff(t)).not.toBeNull();
    expect(approveMockProgress(t)).toBeNull();
  });
});
