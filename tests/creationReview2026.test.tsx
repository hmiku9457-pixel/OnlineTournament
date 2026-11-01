import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CreateTournamentPage } from '@/pages/CreateTournamentPage';
import { createVenueLayout } from '@/domain/venueLayout';
import { createMockTournament, findTournamentNameConflict, getAllMockTournaments, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { initialPrestartPhases } from '@/domain/prestartPhasePlanning';

const data = new Map<string, string>();
const store = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, String(value)); },
  removeItem: (key: string) => { data.delete(key); },
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: store }));
});
afterEach(() => vi.unstubAllGlobals());

const input = {
  name: 'Vereinsturnier', sport: 'table_tennis', discipline: 'SINGLES' as const,
  tables: 4, minimumMatches: 4, scheduledStart: '2030-11-21T09:00',
  requireFutureStart: true, participantNames: ['Anna A', 'Bert B', 'Carla C', 'Dora D'],
  estimatedDurationMinutes: 35,
  phases: [
    { type: 'SWISS' as const, label: 'Schweizer', bestOf: 5, entrantCount: 4,
      groupCount: 2, swissRounds: 3, knockoutBestOf: [] },
    { type: 'KNOCKOUT' as const, label: 'K.-o.', bestOf: 5, entrantCount: 2,
      groupCount: 2, swissRounds: 2, knockoutBestOf: [7] },
  ],
};

describe('creation review regressions', () => {
  it('always suggests a square grid for a wide range of venue counts', () => {
    for (const count of [1, 5, 8, 19, 40, 41, 80, 81, 200, 350]) {
      const layout = createVenueLayout(count);
      const side = Math.ceil(Math.sqrt(count));
      expect(layout.columns).toBe(side);
      expect(layout.rows).toBe(side);
      expect(layout.cells.filter((cell) => cell.startsWith('table:'))).toHaveLength(count);
    }
  });

  it('persists minimum matches and original best-ofs for prestart editing', () => {
    const t = createMockTournament(input);
    expect(t.minimumMatches).toBe(4);
    const phases = initialPrestartPhases(t);
    expect(phases[0].bestOf).toBe(5);
    expect(phases[1].bestOf).toBe(5);
    expect(phases[1].knockoutBestOf).toEqual([7]);

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CreateTournamentPage prestart={{
          tournament: t, activeParticipants: 4, withdrawnParticipants: 0,
          onSaved: () => {}, onCancel: () => {},
        }} />
      </MemoryRouter>);
    expect(markup).toContain('Phasen vor Turnierstart bearbeiten');
    expect(markup).toContain('phase-wizard-step');
    expect(markup).not.toContain('wizard-side-summary');
    expect(markup).not.toContain('Erstellungsschritte');
  });

  it('demands an explicit replacement decision for the same unstarted name', () => {
    const original = createMockTournament(input);
    expect(findTournamentNameConflict(' vereinsturnier ')?.id).toBe(original.id);
    expect(() => createMockTournament({ ...input, estimatedDurationMinutes: 50 })).toThrow('Überschreiben bestätigen');
    const replacement = createMockTournament({ ...input, estimatedDurationMinutes: 50, overwriteTournamentId: original.id });
    expect(replacement.id).not.toBe(original.id);
    expect(getAllMockTournaments().map((t) => t.id)).toEqual([replacement.id]);
  });

  it('cleans replaced tournament snapshots but preserves all other events', () => {
    const first = createMockTournament(input);
    const second = createMockTournament({ ...input, name: 'Anderes Turnier' });
    const fixturesKey = 'online-tournament:mock-draw-config:v1';
    const resultsKey = 'online-tournament:mock-match-results:v2';
    const withdrawKey = 'online-tournament:withdrawn-participants:v1';
    data.set(fixturesKey, JSON.stringify([
      { tournamentId: first.id, stageId: first.stages[0].id },
      { tournamentId: second.id, stageId: second.stages[0].id },
    ]));
    data.set(resultsKey, JSON.stringify([
      { matchId: `${first.stages[0].id}-sw-r1-m1`, status: 'FINISHED' },
      { matchId: `${second.stages[0].id}-sw-r1-m1`, status: 'WAITING' },
    ]));
    data.set(withdrawKey, JSON.stringify({ [first.id]: ['Anna A'], [second.id]: ['Bert B'] }));
    createMockTournament({ ...input, overwriteTournamentId: first.id });
    expect(JSON.parse(data.get(fixturesKey) ?? '[]')).toEqual([{ tournamentId: second.id, stageId: second.stages[0].id }]);
    expect(JSON.parse(data.get(resultsKey) ?? '[]')).toEqual([
      { matchId: `${second.stages[0].id}-sw-r1-m1`, status: 'WAITING' },
    ]);
    expect(JSON.parse(data.get(withdrawKey) ?? '{}')).toEqual({ [second.id]: ['Bert B'] });
    expect(getAllMockTournaments()).toHaveLength(2);
  });

  it('never overwrites a started tournament, even when an overwrite ID was confirmed earlier', () => {
    const original = createMockTournament(input);
    updateMockTournamentStatus(original.id, 'RUNNING');
    expect(() => createMockTournament({ ...input })).toThrow('bereits gestartetes');
    expect(() => createMockTournament({ ...input, overwriteTournamentId: original.id })).toThrow('bereits gestartetes');
    expect(getAllMockTournaments()).toHaveLength(1);
  });
});
