import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVenueLayout, layoutTableNumbers, resizeVenueLayout } from '@/domain/venueLayout';
import { createMockTournament, getMockTournament, addMockParticipant, updateMockTournamentStatus, type MockPhaseInput } from '@/services/mockTournamentStore';
import { getStageEntrants, startFirstStage } from '@/services/mockPhaseLifecycle';
import { getMockStageBaseMatches, isMockParticipantWithdrawn, withdrawMockParticipant } from '@/services/mockRuntime';
import { getBracketSlots, getGroupAssignments, getPinnedBracketSlots, setParticipantGroup, toggleBracketPin } from '@/services/mockDrawStore';

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, String(value)); },
  removeItem(key: string) { store.delete(key); },
};
const group: MockPhaseInput = { type: 'GROUPS', label: 'Gruppenphase', bestOf: 1, entrantCount: 5, groupCount: 2, swissRounds: 3, knockoutBestOf: [] };
const ko: MockPhaseInput = { type: 'KNOCKOUT', label: 'K.-o.', bestOf: 3, entrantCount: 4, groupCount: 1, swissRounds: 3, knockoutBestOf: [3, 5] };

function tournament(phases = [group, ko]) {
  return createMockTournament({
    name: 'Vorstart-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 5,
    minimumMatches: 1, estimatedDurationMinutes: 80,
    participantNames: ['Anna Eins', 'Bert Zwei', 'Carla Drei', 'Dario Vier', 'Emma Fünf'], phases,
  });
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Hallenlayout und Vorstartteilnehmer', () => {
  it('zeigt ein 10 x 3 Raster und erweitert bei mehr als 30 Platten nur die Höhe', () => {
    const layout = createVenueLayout(5);
    expect([layout.columns, layout.rows, layout.cells.length]).toEqual([10, 3, 30]);
    expect(createVenueLayout(31).rows).toBe(4);
    expect(layoutTableNumbers(resizeVenueLayout(layout, 10, 4, 31))).toHaveLength(31);
  });

  it('entfernt den Rückzug vor Start vollständig aus Gruppen, Folgerunden und Paarungen', () => {
    const cup = tournament();
    const first = cup.stages[0];
    const next = cup.stages[1];
    expect(setParticipantGroup(cup, first, 'Anna Eins', 1)).toBe(true);
    expect(withdrawMockParticipant(cup, 'Anna Eins')).toBe(true);
    expect(isMockParticipantWithdrawn(cup, 'Anna Eins')).toBe(true);
    expect(cup.participantNames).toContain('Anna Eins'); // bleibt dokumentiert
    expect(getStageEntrants(cup, first)).not.toContain('Anna Eins');
    expect(getStageEntrants(cup, next)).not.toContain('Anna Eins');
    expect(getGroupAssignments(cup, first)).not.toHaveProperty('Anna Eins');
    expect(getMockStageBaseMatches(cup, first).every((match) =>
      match.sideA !== 'Anna Eins' && match.sideB !== 'Anna Eins')).toBe(true);
    expect(getBracketSlots(cup, next)).not.toContain('Anna Eins');
    expect(store.get('online-tournament:mock-match-results:v2')).toBeUndefined();
    // Nach dem ersten Start bleibt die Vorstart-Auswahl fixiert.
    expect(startFirstStage(cup)).toBe(true);
    updateMockTournamentStatus(cup.id, 'RUNNING');
    expect(getStageEntrants(getMockTournament(cup.id), cup.stages[0])).not.toContain('Anna Eins');
  });

  it('nimmt Nachmeldungen auf, weist einen Code zu und verhindert Duplikate und Meldungen nach Start', () => {
    const cup = tournament();
    expect(addMockParticipant(cup.id, 'Nora', 'Neu').ok).toBe(true);
    const updated = getMockTournament(cup.id);
    expect(updated.participants).toBe(6);
    expect(updated.participantCodes?.['Nora Neu']).toMatch(/^\d{6}$/);
    expect(getStageEntrants(updated, updated.stages[0])).toContain('Nora Neu');
    expect(getMockStageBaseMatches(updated, updated.stages[0]).some((match) =>
      match.sideA === 'Nora Neu' || match.sideB === 'Nora Neu')).toBe(true);
    expect(addMockParticipant(cup.id, 'nora', 'neu').ok).toBe(false);
    expect(startFirstStage(updated)).toBe(true);
    updateMockTournamentStatus(cup.id, 'RUNNING');
    const live = getMockTournament(cup.id);
    expect(getStageEntrants(live, live.stages[0])).toContain('Nora Neu');
    expect(addMockParticipant(cup.id, 'Jens', 'Spät').ok).toBe(false);
  });

  it('unterstützt Nachmeldungen für Doppel, ohne Personen mehrfach einzutragen', () => {
    const cup = createMockTournament({
      name: 'Doppeltest', sport: 'table_tennis', discipline: 'DOUBLES', tables: 2,
      minimumMatches: 1, estimatedDurationMinutes: 60,
      participantNames: ['Lena A / Tom B', 'Mia C / Finn D'],
      phases: [{ ...group, entrantCount: 2, groupCount: 1 }],
    });
    expect(addMockParticipant(cup.id, 'Sarah', 'E', 'Mark', 'F').ok).toBe(true);
    expect(addMockParticipant(cup.id, 'Sarah', 'E', 'Neuer', 'G').ok).toBe(false);
    expect(addMockParticipant(cup.id, 'Mark', 'F', 'Mark', 'F').ok).toBe(false);
    const updated = getMockTournament(cup.id);
    expect(getStageEntrants(updated, updated.stages[0])).toContain('Sarah E / Mark F');
  });

  it('bereinigt bei einem KO-Rückzug ungültige Pins und aktualisiert Freilose', () => {
    const cup = tournament([{ ...ko, entrantCount: 5 }]);
    const stage = cup.stages[0];
    const slots = getBracketSlots(cup, stage);
    const pinnedSlot = slots.findIndex((entry) => entry !== 'Freilos');
    expect(toggleBracketPin(cup, stage, pinnedSlot)).toBe(true);
    expect(withdrawMockParticipant(cup, 'Anna Eins')).toBe(true);
    const changed = getBracketSlots(cup, stage);
    expect(changed).not.toContain('Anna Eins');
    expect(changed.filter((entry) => entry === 'Freilos')).toHaveLength(0);
    expect(getPinnedBracketSlots(cup, stage)).toEqual([]);
  });
});
