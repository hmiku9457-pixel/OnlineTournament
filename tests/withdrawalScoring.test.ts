import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWithdrawalAwardSets } from '@/domain/withdrawalScoring';
import { buildMockGroups } from '@/services/mockCompetitionViews';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockStageMatches, getMockStoredResult, withdrawMockParticipant } from '@/services/mockRuntime';

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, String(value)); },
  removeItem: (key: string) => { data.delete(key); },
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function makeTournament(sport: string, bestOf = 1) {
  const tournament = createMockTournament({
    name: 'Rückzugswertung', sport, discipline: 'SINGLES', tables: 2, minimumMatches: 1,
    participantNames: ['Anna', 'Ben', 'Clara', 'Dora'], estimatedDurationMinutes: 90,
    phases: [{ type: 'GROUPS', label: 'Gruppenphase', entrantCount: 4, groupCount: 1, swissRounds: 1, bestOf, knockoutBestOf: [] }],
  });
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  return tournament;
}

describe('Sportabhängige kampflose Wertungen', () => {
  it.each([
    ['Fußball', 3], ['Futsal', 5], ['Handball', 10], ['Basketball', 20],
    ['Hockey', 5], ['Eishockey', 5],
  ] as const)('wertet %s mit einem %i:0 Standardergebnis', (sport, points) => {
    expect(getWithdrawalAwardSets(sport, 1, 'B')).toEqual([{ number: 1, sideAScore: points, sideBScore: 0 }]);
    expect(getWithdrawalAwardSets(sport, 1, 'A')).toEqual([{ number: 1, sideAScore: 0, sideBScore: points }]);
  });

  it.each([
    ['Tischtennis', 3, [11, 11]],
    ['Volleyball', 5, [25, 25, 25]],
    ['Beachvolleyball', 3, [21, 21]],
    ['Badminton', 3, [21, 21]],
    ['Tennis', 3, [6, 6]],
    ['Padel', 3, [6, 6]],
    ['Squash', 3, [11, 11]],
  ] as const)('erzeugt für %s die erforderlichen Gewinnsätze', (sport, bestOf, expected) => {
    expect(getWithdrawalAwardSets(sport, bestOf, 'B').map((set) => set.sideAScore)).toEqual(expected);
    expect(getWithdrawalAwardSets(sport, bestOf, 'B').every((set) => set.sideBScore === 0)).toBe(true);
  });

  it('gibt bei zwei Rückzügen keine Punkte und keinen Sieger', () => {
    expect(getWithdrawalAwardSets('Basketball', 1, 'BOTH')).toEqual([]);
    expect(getWithdrawalAwardSets('Tischtennis', 5, 'BOTH')).toEqual([]);
  });

  it('überschreibt Basketball-Gruppenergebnisse sportgerecht und hält Tabelle und Ergebnis konsistent', () => {
    const tournament = makeTournament('Basketball');
    const [stage] = tournament.stages;
    const match = getMockStageMatches(tournament, stage).find((item) => item.sideA === 'Anna' || item.sideB === 'Anna');
    expect(match).toBeDefined();
    completeMockMatch(match!.id, [{ number: 1, sideAScore: 12, sideBScore: 10 }]);
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);

    const all = getMockStageMatches(tournament, stage).filter((item) => item.sideA === 'Anna' || item.sideB === 'Anna');
    expect(all).toHaveLength(3);
    expect(all.every((item) => item.status === 'FINISHED')).toBe(true);
    for (const item of all) {
      expect(getMockStoredResult(item.id)?.forcedWinner).toBe(item.sideA === 'Anna' ? item.sideB : item.sideA);
      expect(item.score).toBe(item.sideA === 'Anna' ? '0:20' : '20:0');
    }
    const rows = buildMockGroups(tournament, stage)[0].standings;
    expect(rows.find((row) => row.name === 'Anna')).toMatchObject({ losses: 3, balls: '0:60' });
  });

  it('wertet zwei Rückzüge innerhalb derselben Gruppenpartie als Doppelniederlage', () => {
    const tournament = makeTournament('Volleyball', 3);
    const [stage] = tournament.stages;
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);
    expect(withdrawMockParticipant(tournament, 'Ben')).toBe(true);
    const match = getMockStageMatches(tournament, stage).find((item) =>
      [item.sideA, item.sideB].includes('Anna') && [item.sideA, item.sideB].includes('Ben'));
    expect(match).toBeDefined();
    expect(match?.score).toBe('W.O.');
    expect(getMockStoredResult(match!.id)).toMatchObject({ forcedWinner: 'Freilos', sets: [], status: 'FINISHED' });
  });
});
