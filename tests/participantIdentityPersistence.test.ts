import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMockParticipant, createMockTournament, getMockTournament, updateMockParticipantName } from '@/services/mockTournamentStore';
import { getBracketSlots, getGroupAssignments, randomizeBracketSlots, setParticipantGroup } from '@/services/mockDrawStore';
import { getMockStageBaseMatches } from '@/services/mockRuntime';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { inspectSnapshot } from '@/services/localTournamentStorage';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());
const names = ['Freilos', 'TBD', 'Team A', 'Team B', 'Team C'];
function make(type: 'KNOCKOUT' | 'SWISS' | 'GROUPS') {
  return createMockTournament({
    name: 'Identity Regression', sport: 'football', discipline: 'TEAMS', tables: 2,
    participantNames: names, minimumMatches: 1, estimatedDurationMinutes: 90,
    phases: [{ type, label: type, entrantCount: names.length, groupCount: 2,
      swissRounds: 2, bestOf: 1, knockoutBestOf: [1, 1, 1] }],
  });
}
function rename(t: ReturnType<typeof make>) {
  const code = t.participantCodes!['Freilos'];
  expect(updateMockParticipantName(t.id, 'Freilos', 'Freilos Neu', '', code)).toBe(true);
  return getMockTournament(t.id);
}

describe('persistent participant identities independent of names', () => {
  it('allows changing a double code without rewriting either person', () => {
    const t = createMockTournament({
      name: 'Doppel', sport: 'table_tennis', discipline: 'DOUBLES',
      tables: 2, minimumMatches: 1,
      participantNames: ['Ada Lovelace / Grace Hopper', 'Marie Curie / Lise Meitner'],
      phases: [{ type: 'ROUND_ROBIN', label: 'Doppel', entrantCount: 2,
        groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] }],
      estimatedDurationMinutes: 15,
    });
    const original = t.participantIds!['Ada Lovelace / Grace Hopper'];
    expect(updateMockParticipantName(t.id, 'Ada Lovelace / Grace Hopper',
      'Ada', 'Lovelace', '9876', 'Grace', 'Hopper')).toBe(true);
    const after = getMockTournament(t.id);
    expect(after.participantCodes!['Ada Lovelace / Grace Hopper']).toBe('9876');
    expect(after.participantIds!['Ada Lovelace / Grace Hopper']).toBe(original);
  });

  it('rejects whitespace-equivalent duplicate team names during registration', () => {
    const t = make('GROUPS');
    expect(addMockParticipant(t.id, 'Team  A', '').ok).toBe(false);
  });

  it('quarantines invalid current participant identities and malformed KO slot storage', () => {
    const t = make('KNOCKOUT');
    expect(randomizeBracketSlots(t, t.stages[0])).toBe(true);
    const snapshot = () => [...storage.entries()].map(([key, value]) => ({ key, value }));
    expect(inspectSnapshot(snapshot()).corrupt).toHaveLength(0);

    const tournamentKey = `online-tournament:local-prototype-tournaments:v1:record:${t.id}`;
    const original = storage.get(tournamentKey)!;
    const broken = JSON.parse(original);
    broken.tournament.participantIds['Freilos'] = broken.tournament.participantIds['TBD'];
    storage.set(tournamentKey, JSON.stringify(broken));
    expect(inspectSnapshot(snapshot()).corrupt.some((item) => item.key === tournamentKey)).toBe(true);

    storage.set(tournamentKey, original);
    const drawKey = 'online-tournament:mock-draw-config:v1';
    const malformedDraw = JSON.parse(storage.get(drawKey)!);
    malformedDraw[0].bracketSlots[0] = 'Freilos';
    storage.set(drawKey, JSON.stringify(malformedDraw));
    expect(inspectSnapshot(snapshot()).corrupt.some((item) => item.key === drawKey)).toBe(true);
  });

  it('keeps the same ID when a named team is renamed', () => {
    const t = make('KNOCKOUT');
    const id = t.participantIds!['Freilos'];
    expect(typeof id).toBe('string');
    expect(id).not.toBe('Freilos');
    const updated = rename(t);
    expect(updated.participantIds!['Freilos Neu']).toBe(id);
    expect(updated.participantIds!['Freilos']).toBeUndefined();
  });

  it('stores KO slots as discriminated participants/byes and resolves names only on read', () => {
    const t = make('KNOCKOUT');
    expect(randomizeBracketSlots(t, t.stages[0])).toBe(true);
    const raw = storage.get('online-tournament:mock-draw-config:v1') ?? '';
    expect(raw).not.toContain('"Freilos"');
    const record = JSON.parse(raw)[0];
    expect(record.bracketSlots.every((slot: { kind: string }) => ['participant', 'bye'].includes(slot.kind))).toBe(true);
    expect(record.bracketSlots.filter((slot: { kind: string }) => slot.kind === 'participant')
      .some((slot: { participantId: string }) => slot.participantId === t.participantIds!['Freilos'])).toBe(true);
    const updated = rename(t);
    expect(getBracketSlots(updated, updated.stages[0])).toContain('Freilos Neu');
    expect(getBracketSlots(updated, updated.stages[0])).not.toContain('Freilos');
  });

  it('persists group assignments under stable IDs across rename', () => {
    const t = make('GROUPS');
    const stage = t.stages[0];
    const original = getGroupAssignments(t, stage)['Freilos'];
    expect(setParticipantGroup(t, stage, 'Freilos', 1 - original)).toBe(true);
    expect(storage.get('online-tournament:mock-draw-config:v1')).not.toContain('"Freilos"');
    const updated = rename(t);
    expect(getGroupAssignments(updated, updated.stages[0])['Freilos Neu']).toBe(1 - original);
  });

  it('stores Swiss fixture pairs by identity and restores new display name', () => {
    const t = make('SWISS');
    const stage = t.stages[0];
    expect(startFirstStage(t)).toBe(true);
    const fixtures = getMockStageBaseMatches(t, stage);
    expect(fixtures.flatMap((m) => [m.sideA, m.sideB])).toContain('Freilos');
    const stored = storage.get('online-tournament:swiss-round-fixtures:v1') ?? '';
    expect(stored).not.toContain('"Freilos"');
    expect(stored).not.toContain('"TBD"');
    const updated = rename(t);
    const fixturesAfter = getMockStageBaseMatches(updated, updated.stages[0]);
    expect(fixturesAfter.flatMap((m) => [m.sideA, m.sideB])).toContain('Freilos Neu');
    expect(fixturesAfter.flatMap((m) => [m.sideA, m.sideB])).not.toContain('Freilos');
  });
});
