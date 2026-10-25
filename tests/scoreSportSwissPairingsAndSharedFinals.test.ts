import { approveMockProgress } from '@/services/mockRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage, getStageEntrants, isStageCompleted } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockStageMatches } from '@/services/mockRuntime';
import { buildRoundRobinStandings } from '@/services/mockCompetitionViews';
import { getMockConfirmedFinalStandings, getMockFinalStandings } from '@/services/mockParticipantProgress';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const score = (sideAScore: number, sideBScore: number) => [{ number: 1, sideAScore, sideBScore }];
function tournament(type: 'SWISS' | 'ROUND_ROBIN', count: number, next: boolean) {
  const t = createMockTournament({
    name: 'Punkte und Ranggleichheit', sport: 'football', discipline: 'SINGLES', tables: 5,
    minimumMatches: 1, estimatedDurationMinutes: 120,
    participantNames: Array.from({ length: count }, (_, i) => `Spieler ${String(i+1).padStart(2, '0')}`),
    phases: [
      { type, label: 'Erste Phase', entrantCount: count, groupCount: 1, swissRounds: 2, bestOf: 1, knockoutBestOf: [] },
      ...(next ? [{ type: 'KNOCKOUT' as const, label: 'KO', entrantCount: 2, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [1] }] : []),
    ],
  });
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
  return t;
}

describe('3/1/0-Paarungsgruppen für Ergebnissportarten', () => {
  it('gruppiert Sieger mit 3, Remis-Spieler mit 1 und Verlierer mit 0 Punkten', () => {
    const t = tournament('SWISS', 8, false);
    const first = getMockStageMatches(t, t.stages[0]).filter((m) => m.round === 'Runde 1');
    expect(first).toHaveLength(4);
    completeMockMatch(first[0].id, score(2, 1));
    completeMockMatch(first[1].id, score(3, 0));
    completeMockMatch(first[2].id, score(1, 1));
    completeMockMatch(first[3].id, score(2, 2));
    const winners = new Set([first[0].sideA, first[1].sideA]);
    const losers = new Set([first[0].sideB, first[1].sideB]);
    const drawn = new Set([first[2].sideA, first[2].sideB, first[3].sideA, first[3].sideB]);
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    const second = getMockStageMatches(t, t.stages[0]).filter((m) => m.round === 'Runde 2');
    expect(second).toHaveLength(4);
    const scoreGroup = (name: string) => winners.has(name) ? 3 : drawn.has(name) ? 1 : losers.has(name) ? 0 : -1;
    expect(second.every((m) => scoreGroup(m.sideA) === scoreGroup(m.sideB))).toBe(true);
    expect(second.some((m) => winners.has(m.sideA) && winners.has(m.sideB))).toBe(true);
    expect(second.some((m) => losers.has(m.sideA) && losers.has(m.sideB))).toBe(true);
  });
});

describe('Geteilte Endplatzierung, aber alphabetische Qualifikation', () => {
  it('wählt an einer nicht-schweizerischen Grenze alphabetisch und teilt die Endplätze der Ausgeschiedenen', () => {
    const t = tournament('ROUND_ROBIN', 4, true);
    const stage = t.stages[0];
    getMockStageMatches(t, stage).forEach((m) => completeMockMatch(m.id, score(1, 1)));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(isStageCompleted(t, stage)).toBe(true);
    const names = getStageEntrants(t, stage).sort((a, b) => a.localeCompare(b, 'de'));
    expect(getStageEntrants(t, t.stages[1])).toEqual(names.slice(0, 2));
    expect(buildRoundRobinStandings(t, stage).map((row) => row.rank)).toEqual([1, 1, 1, 1]);
    const eliminated = getMockConfirmedFinalStandings(t);
    expect(eliminated).toHaveLength(2);
    expect(eliminated.every((row) => row.placement === 'Platz 3–4')).toBe(true);
    expect(eliminated.map((row) => row.name).sort()).toEqual(names.slice(2));
  });

  it('vergibt auch bei abschließendem Jeder gegen Jeden denselben Endplatz bei absoluten Gleichstand', () => {
    const t = tournament('ROUND_ROBIN', 4, false);
    getMockStageMatches(t, t.stages[0]).forEach((m) => completeMockMatch(m.id, score(1, 1)));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    const final = getMockFinalStandings(t);
    expect(final).toHaveLength(4);
    expect(final.every((row) => row.placement === 'Platz 1–4' && row.placementNumber === 1)).toBe(true);
  });
});
