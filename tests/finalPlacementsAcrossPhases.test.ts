import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getActiveSwissRecordLookup } from '@/services/activeSwissRecords';
import { getStageEntrants, isStageCompleted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockStageMatches, withdrawMockParticipant } from '@/services/mockRuntime';
import { getMockFinalStandings } from '@/services/mockParticipantProgress';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const result = [{ number: 1, sideAScore: 11, sideBScore: 4 }];
const names = Array.from({ length: 20 }, (_, index) => `Spieler ${index + 1}`);
function tournament(phases: Array<{ type: 'SWISS' | 'GROUPS' | 'KNOCKOUT'; entrants: number; groups?: number }>) {
  return createMockTournament({
    name: 'Phasenrang-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
    participantNames: names, estimatedDurationMinutes: 100,
    phases: phases.map((p, index) => ({ type: p.type, label: `Phase ${index + 1}`, entrantCount: p.entrants,
      groupCount: p.groups ?? 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [1, 1, 1, 1],
    })),
  });
}
function finish(t: ReturnType<typeof tournament>, index: number) {
  const stage = t.stages[index];
  for (let attempt = 0; attempt < 15 && !isStageCompleted(t, stage); attempt += 1) {
    for (const match of getMockStageMatches(t, stage)) {
      if (match.status !== 'FINISHED' && !match.autoWinner && !['Freilos', 'TBD'].includes(match.sideA) && !['Freilos', 'TBD'].includes(match.sideB)) {
        completeMockMatch(match.id, result);
      }
    }
  }
  expect(isStageCompleted(t, stage)).toBe(true);
}

describe('Gesamtrangfolge über mehrere Phasen', () => {
  it('vergibt 1–10, 11–15 und 16–20 ohne Dopplungen; Rückzug behält einen sportlich passenden Rang', () => {
    const t = tournament([
      { type: 'SWISS', entrants: 20 },
      { type: 'GROUPS', entrants: 15, groups: 5 },
      { type: 'KNOCKOUT', entrants: 10 },
    ]);
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    const withdrawn = getMockStageMatches(t, t.stages[0])[0].sideA;
    expect(withdrawMockParticipant(t, withdrawn)).toBe(true);
    finish(t, 0);
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(15);
    expect(startStage(t, t.stages[1])).toBe(true);
    finish(t, 1);
    expect(getStageEntrants(t, t.stages[2])).toHaveLength(10);
    expect(startStage(t, t.stages[2])).toBe(true);
    finish(t, 2);

    const standings = getMockFinalStandings(getMockTournament(t.id));
    expect(standings).toHaveLength(20);
    expect(standings.map((row) => row.placementNumber)).toEqual([...standings.map((row) => row.placementNumber)].sort((a, b) => a - b));
    expect(standings.filter((row) => row.stageIndex === 2)).toHaveLength(10);
    expect(standings.filter((row) => row.stageIndex === 1)).toHaveLength(5);
    expect(standings.filter((row) => row.stageIndex === 0)).toHaveLength(5);
    expect(standings.filter((row) => row.stageIndex === 1).every((row) => /^Platz 11–15 · 3\. Platz Gruppe [A-E]$/.test(row.placement ?? ''))).toBe(true);
    expect(standings.filter((row) => row.stageIndex === 0).map((row) => row.placementNumber)).toEqual([16, 17, 18, 19, 20]);
    const withdrawnRow = standings.find((row) => row.name === withdrawn);
    expect(withdrawnRow).toMatchObject({ status: 'Zurückgezogen', stageIndex: 0 });
    expect(withdrawnRow?.placementNumber).toBeGreaterThanOrEqual(16);
    expect(withdrawnRow?.placement).toMatch(/^Platz (1[6-9]|20)$/);
  });

  it('zeigt das Schweizer Standing nur während der zugehörigen laufenden Schweizer Phase', () => {
    const t = tournament([{ type: 'SWISS', entrants: 20 }, { type: 'SWISS', entrants: 8 }]);
    expect(getActiveSwissRecordLookup(t)({ stageId: t.stages[0].id }, names[0])).toBeUndefined();
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    const first = getMockStageMatches(t, t.stages[0])[0];
    expect(getActiveSwissRecordLookup(t)(first, first.sideA)).toBe('0:0');
    finish(t, 0);
    expect(getActiveSwissRecordLookup(t)(first, first.sideA)).toBeUndefined();
    expect(startStage(t, t.stages[1])).toBe(true);
    const second = getMockStageMatches(t, t.stages[1])[0];
    const recordForCurrent = getActiveSwissRecordLookup(t);
    expect(recordForCurrent(first, first.sideA)).toBeUndefined();
    expect(recordForCurrent(second, second.sideA)).toBe('0:0');
  });

  it('vergibt bei reiner Vierergruppenphase geteilte Plätze 9–12 / 13–16 mit Gruppenbezug', () => {
    const t = createMockTournament({
      name: 'Vier Gruppen', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
      participantNames: names.slice(0, 16), estimatedDurationMinutes: 100,
      phases: [{ type: 'GROUPS', label: 'Gruppen', entrantCount: 16, groupCount: 4, swissRounds: 1, bestOf: 1, knockoutBestOf: [] }],
    });
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    finish(t, 0);
    const standings = getMockFinalStandings(getMockTournament(t.id));
    expect(standings.filter((r) => r.placement?.startsWith('Platz 9–12 · 3. Platz Gruppe'))).toHaveLength(4);
    expect(standings.filter((r) => r.placement?.startsWith('Platz 13–16 · 4. Platz Gruppe'))).toHaveLength(4);
  });
});
