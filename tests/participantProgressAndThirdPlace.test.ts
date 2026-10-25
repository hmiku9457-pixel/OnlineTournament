import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockPhaseInput } from '@/services/mockTournamentStore';
import { createMockTournament, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { buildMockGroups } from '@/services/mockCompetitionViews';
import { getMockParticipantProgress } from '@/services/mockParticipantProgress';
import { completeMockMatch, getMockStageBaseMatches, getMockStageMatches, getMockStoredResult, skipMockThirdPlaceMatch } from '@/services/mockRuntime';
import { getStageEntrants, isStageCompleted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';

const storage = new Map<string, string>();
const fakeLocalStorage = {
  getItem(key: string) { return storage.get(key) ?? null; },
  setItem(key: string, value: string) { storage.set(key, String(value)); },
  removeItem(key: string) { storage.delete(key); },
};

const group: MockPhaseInput = { type: 'GROUPS', label: 'Gruppen', entrantCount: 4, groupCount: 1, bestOf: 1, swissRounds: 1, knockoutBestOf: [] };
const ko: MockPhaseInput = { type: 'KNOCKOUT', label: 'K.-o.', entrantCount: 4, groupCount: 1, bestOf: 1, swissRounds: 1, knockoutBestOf: [1, 1] };

function create(phases: MockPhaseInput[]) {
  return createMockTournament({ name: 'Regressions-Cup', sport: 'table_tennis', discipline: 'SINGLES', tables: 3, minimumMatches: 1,
    participantNames: ['Anna Muster', 'Berta Beispiel', 'Clara Test', 'Dora Demo'], phases, estimatedDurationMinutes: 120 });
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: fakeLocalStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Teilnehmerstatus und K.-o.-Spiel um Platz 3', () => {
  it('zeigt nach Phasenstart ausgeschiedene Gruppenspieler mit ihrer tatsächlichen Gruppenplatzierung', () => {
    const tournament = create([group, { ...ko, entrantCount: 2 }]);
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const first = tournament.stages[0];
    getMockStageMatches(tournament, first).forEach((match) => completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]));
    const standings = buildMockGroups(tournament, first)[0].standings;
    expect(isStageCompleted(tournament, first)).toBe(true);
    const second = tournament.stages[1];
    const qualified = getStageEntrants(tournament, second);
    const eliminated = standings.find((row) => !qualified.includes(row.name));
    expect(eliminated).toBeDefined();
    // Bis zum Beginn der Folgephase sind alle noch als aktive Teilnehmer geführt.
    expect(getMockParticipantProgress(tournament, eliminated!.name).status).toBe('Aktiv');
    expect(startStage(tournament, second)).toBe(true);
    expect(getMockParticipantProgress(tournament, eliminated!.name)).toEqual({
      status: 'Ausgeschieden', placement: 'Gruppe A · Platz 2–4',
    });
  });

  it('fordert vor Abschluss eines K.-o. mit vier Spielern ein Spiel um Platz 3 an', () => {
    const tournament = create([ko]);
    const stage = tournament.stages[0];
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    expect(getMockStageBaseMatches(tournament, stage).find((match) => match.id.endsWith('-third-place'))?.sideA).toBe('TBD');
    const semis = getMockStageMatches(tournament, stage).filter((match) => match.round === 'Halbfinale');
    expect(semis).toHaveLength(2);
    for (const match of semis) completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    const third = getMockStageMatches(tournament, stage).find((match) => match.round === 'Spiel um Platz 3');
    expect(third).toBeDefined();
    const final = getMockStageMatches(tournament, stage).find((match) => match.round === 'Finale');
    expect(final).toBeDefined();
    completeMockMatch(final!.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    expect(isStageCompleted(tournament, stage)).toBe(false);
    expect(skipMockThirdPlaceMatch(tournament, third!.id)).toBe(true);
    expect(getMockStoredResult(third!.id)?.thirdPlaceSkipped).toBe(true);
    expect(isStageCompleted(tournament, stage)).toBe(true);
    expect(getMockParticipantProgress(tournament, third!.sideA)).toEqual({ status: 'Ausgeschieden', placement: 'Platz 3' });
    expect(getMockParticipantProgress(tournament, third!.sideB)).toEqual({ status: 'Ausgeschieden', placement: 'Platz 3' });
    expect(getMockParticipantProgress(tournament, final!.sideA)).toEqual({ status: 'Turniersieger', placement: 'Platz 1' });
    expect(skipMockThirdPlaceMatch(getMockTournament(tournament.id), third!.id)).toBe(false);
  });

  it('ordnet nach ausgetragenem Spiel um Platz 3 Platz 3 und Platz 4 eindeutig zu', () => {
    const tournament = create([ko]);
    const stage = tournament.stages[0];
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    getMockStageMatches(tournament, stage).filter((match) => match.round === 'Halbfinale').forEach((match) => {
      completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    });
    const bronze = getMockStageMatches(tournament, stage).find((match) => match.round === 'Spiel um Platz 3')!;
    completeMockMatch(bronze.id, [{ number: 1, sideAScore: 7, sideBScore: 11 }]);
    expect(getMockParticipantProgress(tournament, bronze.sideA)).toEqual({ status: 'Ausgeschieden', placement: 'Platz 4' });
    expect(getMockParticipantProgress(tournament, bronze.sideB)).toEqual({ status: 'Ausgeschieden', placement: 'Platz 3' });
  });
});
