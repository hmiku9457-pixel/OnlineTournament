import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { rankStandings } from '@/domain/standingRankings';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { isStageCompleted, getStageEntrants, startFirstStage } from '@/services/mockPhaseLifecycle';
import { buildSwissStandings, getSwissByeWinners, getSwissUnplayedWinWinners } from '@/services/mockCompetitionViews';
import { completeMockMatch, getMockStageBaseMatches, getMockStageMatches, withdrawMockParticipant } from '@/services/mockRuntime';

const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
};
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Schweizer Qualifikation folgt exakt der sichtbaren Tabelle', () => {
  it('rechnet ein Freilos als Sieg und verwendet Satz- und Ballunterschied beim Gleichstand', () => {
    const match = (sideA: string, sideB: string, sideAScore: number, sideBScore: number) => ({
      sideA, sideB, status: 'FINISHED',
      sets: [{ number: 1, sideAScore, sideBScore }],
    });
    const matches = [
      match('C', 'A', 11, 9),
      match('B', 'C', 11, 9),
      match('C', 'B', 11, 5),
      match('C', 'B', 11, 9),
      match('C', 'B', 11, 7),
    ];
    const withoutBye = rankStandings(['A', 'B', 'C'], matches, 'table_tennis');
    const withBye = rankStandings(['A', 'B', 'C'], matches, 'table_tennis', ['A']);
    expect(withoutBye.findIndex((row) => row.name === 'A')).toBeGreaterThan(withoutBye.findIndex((row) => row.name === 'B'));
    expect(withBye.findIndex((row) => row.name === 'A')).toBeLessThan(withBye.findIndex((row) => row.name === 'B'));
    expect(withBye.find((row) => row.name === 'A')).toMatchObject({ wins: 1, played: 2, setsWon: 0, setsLost: 1 });
  });

  it('übernimmt bei 19 Spielern, fünf Schweizer Runden und Top 8 exakt Rang 1 bis 8', () => {
    const tournament = createMockTournament({
      name: 'Schweizer Grenzfall', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 10, minimumMatches: 1,
      participantNames: Array.from({ length: 19 }, (_, index) => `Test Spieler ${String(index + 1).padStart(2, '0')}`),
      estimatedDurationMinutes: 180,
      phases: [
        { type: 'SWISS', label: 'Schweizer System', entrantCount: 19, groupCount: 1, swissRounds: 5, bestOf: 1, knockoutBestOf: [] },
        { type: 'KNOCKOUT', label: 'K.-o.', entrantCount: 8, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [1, 1, 1] },
      ],
    });
    const [swiss, knockout] = tournament.stages;
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');

    for (let round = 1; round <= 5; round += 1) {
      const matches = getMockStageMatches(tournament, swiss).filter((match) => match.round === `Runde ${round}`);
      expect(matches).toHaveLength(9);
      matches.forEach((match, index) => {
        const homeWins = (round + index) % 3 !== 0;
        completeMockMatch(match.id, [{
          number: 1, sideAScore: homeWins ? 11 : 7, sideBScore: homeWins ? 7 : 11,
        }]);
      });
    }

    expect(isStageCompleted(tournament, swiss)).toBe(true);
    const allByes = getMockStageBaseMatches(tournament, swiss).filter((match) => match.sideB === 'Freilos');
    expect(allByes).toHaveLength(5);
    const byeWinners = getSwissByeWinners(tournament, swiss);
    expect(byeWinners).toEqual(allByes.map((match) => match.autoWinner));
    const ranked = buildSwissStandings(tournament, swiss);
    for (const name of new Set(byeWinners)) {
      expect(ranked.find((row) => row.name === name)?.wins).toBeGreaterThanOrEqual(1);
    }
    expect(getStageEntrants(tournament, knockout)).toEqual(ranked.slice(0, 8).map((row) => row.name));
    expect(ranked.filter((row) => row.played === 5)).toHaveLength(19);
  });
  it('weist bei gerader Spielerzahl keine Freilos-Sieger für die Tabellenmarkierung aus', () => {
    const tournament = createMockTournament({
      name: 'Schweizer Tabelle ohne Freilos', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 2, minimumMatches: 1,
      participantNames: ['Anna', 'Ben', 'Clara', 'David'],
      estimatedDurationMinutes: 60,
      phases: [
        { type: 'SWISS', label: 'Schweizer System', entrantCount: 4, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      ],
    });
    expect(startFirstStage(tournament)).toBe(true);
    expect(getSwissByeWinners(tournament, tournament.stages[0])).toEqual([]);
  });

  it('markiert einen kampflosen Sieg und behält die Buchholz-Wertung nach Spieler-Rückzug bei', () => {
    const tournament = createMockTournament({
      name: 'Rückzug im Schweizer System', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 2, minimumMatches: 1,
      participantNames: ['Anna', 'Ben', 'Clara', 'David'],
      phases: [
        { type: 'SWISS', label: 'Schweizer System', entrantCount: 4, groupCount: 1, swissRounds: 2, bestOf: 1, knockoutBestOf: [] },
      ],
      estimatedDurationMinutes: 60,
    });
    expect(startFirstStage(tournament)).toBe(true);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const stage = running.stages[0];
    const game = getMockStageMatches(running, stage)[0];
    expect(withdrawMockParticipant(running, game.sideB)).toBe(true);
    expect(getSwissUnplayedWinWinners(running, stage)).toContain(game.sideA);
    const table = buildSwissStandings(running, stage);
    expect(table.find((row) => row.name === game.sideA)?.wins).toBeGreaterThanOrEqual(1);
    expect(table.find((row) => row.name === game.sideA)?.sets).toBe('0:0');
    expect(table.every((row) => Number.isFinite(row.buchholz))).toBe(true);
  });

});
