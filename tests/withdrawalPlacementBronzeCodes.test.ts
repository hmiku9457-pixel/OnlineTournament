import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus, getMockTournament } from '@/services/mockTournamentStore';
import type { MockPhaseInput } from '@/services/mockTournamentStore';
import { buildMockGroups, buildSwissStandings } from '@/services/mockCompetitionViews';
import { getMockFinalStandings, getMockParticipantProgress } from '@/services/mockParticipantProgress';
import { completeMockMatch, getMockStageBaseMatches, getMockStageMatches, withdrawMockParticipant } from '@/services/mockRuntime';
import { isStageCompleted, startFirstStage } from '@/services/mockPhaseLifecycle';

const data = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return data.get(key) ?? null; },
  setItem(key: string, value: string) { data.set(key, String(value)); },
  removeItem(key: string) { data.delete(key); },
};

beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const names = ['Anna Eins', 'Ben Zwei', 'Clara Drei', 'Dora Vier'];
const swiss: MockPhaseInput = { type: 'SWISS', label: 'Schweizer System', entrantCount: 4, groupCount: 1, swissRounds: 3, bestOf: 1, knockoutBestOf: [] };
const groups: MockPhaseInput = { type: 'GROUPS', label: 'Gruppenphase', entrantCount: 4, groupCount: 1, swissRounds: 3, bestOf: 1, knockoutBestOf: [] };
const knockout: MockPhaseInput = { type: 'KNOCKOUT', label: 'Finalrunde', entrantCount: 4, groupCount: 1, swissRounds: 3, bestOf: 5, knockoutBestOf: [1, 7] };

function create(phases: MockPhaseInput[], playerNames = names) {
  return createMockTournament({ name: 'Abnahmetest', sport: 'table_tennis', discipline: 'SINGLES', tables: 4,
    minimumMatches: 1, participantNames: playerNames, phases, estimatedDurationMinutes: 120 });
}
function start(tournament: ReturnType<typeof create>) {
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
}

const winA = [{ number: 1, sideAScore: 11, sideBScore: 7 }];

describe('Abnahme: Spielercodes, Bronze, Rückzugsplatzierungen', () => {
  it('erzeugt beim erstmaligen Erstellen für alle Spieler unterschiedliche zufällige sechsstellige Codes', () => {
    const t = create([groups], Array.from({ length: 70 }, (_, i) => `Test Spieler ${i + 1}`));
    const codes = t.participantCodes ?? {};
    expect(Object.keys(codes)).toHaveLength(70);
    expect(Object.values(codes).every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(Object.values(codes)).size).toBe(70);
    expect(getMockTournament(t.id).participantCodes).toEqual(codes);
    // Independently created tournaments also receive valid codes. Avoid flaky
    // assertions comparing two random numbers that may legitimately coincide.
    expect(create([groups], ['Test Spieler 1']).participantCodes?.['Test Spieler 1']).toMatch(/^\d{6}$/);
  });

  it('verwendet für das Spiel um Platz 3 genau das BO des Finales', () => {
    const t = create([knockout]);
    start(t);
    const stage = t.stages[0];
    const semis = getMockStageMatches(t, stage).filter((m) => m.round === 'Halbfinale');
    expect(semis).toHaveLength(2);
    expect(semis.every((m) => m.bestOf === 1)).toBe(true);
    semis.forEach((m) => completeMockMatch(m.id, winA));
    const matches = getMockStageBaseMatches(t, stage);
    expect(matches.find((m) => m.round === 'Finale')?.bestOf).toBe(7);
    expect(matches.find((m) => m.round === 'Spiel um Platz 3')?.bestOf).toBe(7);
  });

  it('zeigt einem zurückgezogenen Schweizer Spieler weiterhin seinen Rang statt ihn automatisch ans Ende zu setzen', () => {
    const t = create([swiss]);
    start(t);
    const firstRound = getMockStageMatches(t, t.stages[0]);
    firstRound.forEach((m) => completeMockMatch(m.id, winA));
    const player = firstRound[0].sideA;
    expect(withdrawMockParticipant(t, player)).toBe(true);
    const actualRank = buildSwissStandings(t, t.stages[0]).find((row) => row.name === player)?.rank;
    expect(actualRank).toBeDefined();
    expect(getMockParticipantProgress(t, player)).toEqual({ status: 'Zurückgezogen', placement: `Platz ${actualRank}` });
    expect(getMockFinalStandings(t).find((row) => row.name === player)?.placement).toBe(`Platz ${actualRank}`);
    // Complete the remaining Swiss rounds: the withdrawal remains a status,
    // and the player's final place tracks the final Swiss ranking.
    for (let attempt = 0; attempt < 10 && !isStageCompleted(t, t.stages[0]); attempt += 1) {
      const open = getMockStageMatches(t, t.stages[0]).filter((match) => match.status !== 'FINISHED');
      open.forEach((match) => completeMockMatch(match.id, winA));
    }
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    const completed = getMockTournament(t.id);
    expect(completed.status).toBe('FINISHED');
    const finalRank = buildSwissStandings(completed, completed.stages[0]).find((row) => row.name === player)?.rank;
    expect(getMockFinalStandings(completed).find((row) => row.name === player)).toMatchObject({
      status: 'Zurückgezogen', placement: `Platz ${finalRank}`,
    });
  });

  it('behält auch beim Rückzug in einer Gruppenphase die berechnete Gruppenplatzierung', () => {
    const t = create([groups]);
    start(t);
    expect(withdrawMockParticipant(t, names[0])).toBe(true);
    const row = buildMockGroups(t, t.stages[0])[0].standings.find((item) => item.name === names[0]);
    expect(row).toBeDefined();
    expect(getMockParticipantProgress(t, names[0])).toEqual({ status: 'Zurückgezogen', placement: `Gruppe A · Platz ${row!.rank}` });
  });
});
