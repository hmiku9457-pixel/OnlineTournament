import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededKnockoutSlots, snakeSeededGroupOrder } from '@/engine/seededDraws';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { buildMockGroups } from '@/services/mockCompetitionViews';
import { applySeededBracketSlots, applySeededSwissOrder, getBracketSlots, getPinnedBracketSlots, getSwissOrder, toggleBracketPin } from '@/services/mockDrawStore';
import { isStageCompleted, getStageEntrants, startFirstStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockStageMatches } from '@/services/mockRuntime';

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, value); },
  removeItem(key: string) { store.delete(key); },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const players = Array.from({ length: 16 }, (_, i) => `Spieler ${i + 1}`);
const set = [{ number: 1, sideAScore: 11, sideBScore: 7 }];

function createTwoStage(type: 'GROUPS' | 'SWISS', next: 'SWISS' | 'KNOCKOUT', count = 16) {
  return createMockTournament({
    name: 'Seeded Übergang', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
    participantNames: players.slice(0, count), estimatedDurationMinutes: 120,
    phases: [
      { type, label: 'Vorphase', entrantCount: count, groupCount: 4, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      { type: next, label: 'Folgephase', entrantCount: count, groupCount: 1, swissRounds: 3, bestOf: 1, knockoutBestOf: [1, 1, 1, 1] },
    ],
  });
}

function finishFirstStage(tournament: ReturnType<typeof createTwoStage>) {
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  const first = tournament.stages[0];
  // For BO1, a single set is sufficient to finish the match.
  getMockStageMatches(tournament, first).forEach((match) => completeMockMatch(match.id, set));
  expect(isStageCompleted(tournament, first)).toBe(true);
}

describe('Seeded-Zuteilung zwischen Phasen', () => {
  it('verteilt Gruppenplätze schlangenförmig A-B-C-D / D-C-B-A', () => {
    const groups = [
      ['A1','A2','A3','A4'], ['B1','B2','B3','B4'],
      ['C1','C2','C3','C4'], ['D1','D2','D3','D4'],
    ];
    expect(snakeSeededGroupOrder(groups, groups.flat())).toEqual([
      'A1','B1','C1','D1', 'D2','C2','B2','A2',
      'A3','B3','C3','D3', 'D4','C4','B4','A4',
    ]);
    expect(snakeSeededGroupOrder(groups, ['A1','B1','C1','D1','A2','B2','C2','D2'])).toEqual([
      'A1','B1','C1','D1','D2','C2','B2','A2',
    ]);
  });

  it('ordnet Seed 1 gegen den letzten Seed und Seed 2 in die andere Hälfte', () => {
    const slots = seededKnockoutSlots(players);
    expect(slots.slice(0, 2)).toEqual(['Spieler 1','Spieler 16']);
    expect(slots.slice(8, 10)).toEqual(['Spieler 2','Spieler 15']);
    expect(slots.indexOf('Spieler 1') < 8).toBe(true);
    expect(slots.indexOf('Spieler 2') >= 8).toBe(true);
  });

  it('gibt bei 12 Spielern ausschließlich P1-P4 die vier Freilose und verteilt sie auf beide Hälften', () => {
    const slots = seededKnockoutSlots(players.slice(0, 12));
    const byes: string[] = [];
    const byeMatchIndices: number[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const pair = slots.slice(i, i + 2);
      expect(pair).not.toEqual(['Freilos', 'Freilos']);
      if (pair.includes('Freilos')) {
        byes.push(pair.find((value) => value !== 'Freilos')!);
        byeMatchIndices.push(i / 2);
      }
    }
    expect(new Set(byes)).toEqual(new Set(players.slice(0, 4)));
    expect(new Set(byeMatchIndices.map((index) => Math.floor(index / 2))).size).toBe(4);
    expect(slots.slice(0, 8).filter((value) => value !== 'Freilos')).toHaveLength(6);
    expect(slots.slice(8).filter((value) => value !== 'Freilos')).toHaveLength(6);
  });

  it('aktiviert die Schweizer Setzung erst nach Gruppenabschluss und übernimmt die echten Gruppenplatzierungen', () => {
    const tournament = createTwoStage('GROUPS', 'SWISS');
    const [first, second] = tournament.stages;
    const groupRankings = buildMockGroups(tournament, first).map((group) => group.standings.map((row) => row.name));
    expect(applySeededSwissOrder(tournament, second, groupRankings)).toBe(false);
    finishFirstStage(tournament);
    const standings = buildMockGroups(tournament, first).map((group) => group.standings.map((row) => row.name));
    expect(applySeededSwissOrder(tournament, second, standings)).toBe(true);
    expect(getSwissOrder(tournament, second)).toEqual(snakeSeededGroupOrder(standings, getStageEntrants(tournament, second)));
  });

  it('übernimmt die Rangliste aus der Schweizer Vorphase für das K.-o. und löst alte Pins', () => {
    const tournament = createTwoStage('SWISS', 'KNOCKOUT', 12);
    const second = tournament.stages[1];
    expect(applySeededBracketSlots(tournament, second)).toBe(false);
    finishFirstStage(tournament);
    const entrants = getStageEntrants(tournament, second);
    expect(toggleBracketPin(tournament, second, 0)).toBe(true);
    expect(applySeededBracketSlots(tournament, second)).toBe(true);
    expect(getBracketSlots(tournament, second)).toEqual(seededKnockoutSlots(entrants));
    expect(getPinnedBracketSlots(tournament, second)).toEqual([]);
  });
});
