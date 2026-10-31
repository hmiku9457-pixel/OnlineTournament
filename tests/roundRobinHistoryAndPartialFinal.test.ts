import { approveMockProgress } from '@/services/mockRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageEntrants, isStageCompleted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockStageMatches } from '@/services/mockRuntime';
import { getMockConfirmedFinalStandings } from '@/services/mockParticipantProgress';
import { RegularRoundRobinView } from '@/components/RegularRoundRobinView';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const names = Array.from({ length: 8 }, (_, i) => `Spieler ${i + 1}`);
function create(phaseType: 'GROUPS' | 'ROUND_ROBIN' = 'ROUND_ROBIN') {
  return createMockTournament({
    name: 'RR & finale Zwischenstände', sport: 'table_tennis', discipline: 'SINGLES', tables: 4,
    participantNames: names, minimumMatches: 1, estimatedDurationMinutes: 120,
    phases: [
      { type: phaseType, label: 'Vorrunde', entrantCount: 8, groupCount: phaseType === 'GROUPS' ? 2 : 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      { type: 'KNOCKOUT', label: 'K.-o.-Phase', entrantCount: 4, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [1, 1] },
    ],
  });
}
function completeFirst(t: ReturnType<typeof create>) {
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
  getMockStageMatches(t, t.stages[0]).forEach((match) =>
    completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]));
  expect(approveMockProgress(t)?.kind).toBe('STAGE');
  expect(isStageCompleted(t, t.stages[0])).toBe(true);
}

describe('Reguläre Jeder-gegen-jeden-Ansicht', () => {
  it('zeigt Tabelle und Kreuztabelle nebeneinander sowie gewohnte Spieltage darunter', () => {
    const t = create();
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id, 'RUNNING');
    const html = renderToStaticMarkup(createElement(RegularRoundRobinView, {
      tournament: t, stage: t.stages[0],
    }));
    expect(html).toContain('swiss-intermediate-grid');
    expect(html).toContain('swiss-intermediate-matrix');
    expect(html).toContain('Kreuztabelle vergrößern');
    expect(html).toContain('swiss-intermediate-schedule');
    expect(html).toContain('group-match-row');
    expect(html).toContain('Spieltag 1');
    expect(html).toContain('standing-player-button');
    expect(html).not.toContain('>BHZ</span>');
    expect(html.indexOf('swiss-intermediate-matrix')).toBeLessThan(html.indexOf('swiss-intermediate-schedule'));
  });

  it('zeigt Ergebnisse der regulären BO1-Partien auch in der Kreuztabelle', () => {
    const t = create();
    completeFirst(t);
    const html = renderToStaticMarkup(createElement(RegularRoundRobinView, {
      tournament: t, stage: t.stages[0],
    }));
    expect(html).toContain('11:7');
    expect(html).toContain('Kreuztabelle');
    expect(html).toContain('Spieltag 7');
  });
});

describe('Endplatzierungen vor dem Turnierende', () => {
  for (const type of ['ROUND_ROBIN', 'GROUPS'] as const) {
    it(`zeigt ausgeschiedene Spieler aus abgeschlossener ${type}-Phase, ohne Qualifizierte zu platzieren`, () => {
      const t = create(type);
      expect(getMockConfirmedFinalStandings(t)).toEqual([]);
      completeFirst(t);
      expect(t.status).not.toBe('FINISHED');
      const survivors = new Set(getStageEntrants(t, t.stages[1]));
      expect(survivors.size).toBe(4);
      // Before the next competition starts, these players can still be promoted.
      expect(getMockConfirmedFinalStandings(t)).toEqual([]);
      expect(startStage(t, t.stages[1])).toBe(true);
      const placements = getMockConfirmedFinalStandings(t);
      expect(placements).toHaveLength(4);
      expect(placements.every((row) => !survivors.has(row.name))).toBe(true);
      expect(placements.every((row) => row.status === 'Ausgeschieden')).toBe(true);
      expect(placements[0].placementNumber).toBe(5);
      expect(placements.every((row) => /^Platz [5-8](?:–[5-8])?/.test(row.placement ?? ''))).toBe(true);
      expect(getMockConfirmedFinalStandings(t)).toEqual(placements);
    });
  }
});
