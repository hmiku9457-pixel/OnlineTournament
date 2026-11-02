import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BYE_SLOT, PENDING_SLOT, decodeMatchSlot, displayMatchSlot, encodeMatchSlot } from '@/domain/matchSlots';
import { estimatePhaseMetrics } from '@/domain/tournamentCreation';
import { createMockTournament } from '@/services/mockTournamentStore';
import { getBracketSlots } from '@/services/mockDrawStore';
import { getMockStageBaseMatches, getMockStageMatches } from '@/services/mockRuntime';
import { startFirstStage } from '@/services/mockPhaseLifecycle';

const records = new Map<string, string>();
beforeEach(() => {
  records.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, String(value)); },
      removeItem: (key: string) => { records.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function make(kind: 'KNOCKOUT' | 'SWISS', names: string[]) {
  return createMockTournament({
    name: 'Technische Platzhalterprüfung', sport: 'football', discipline: 'TEAMS',
    tables: 2, minimumMatches: 1, participantNames: names,
    phases: [{ type: kind, label: kind, entrantCount: names.length, groupCount: 2,
      swissRounds: 2, bestOf: 1, knockoutBestOf: Array.from({ length: Math.ceil(Math.log2(names.length)) }, () => 1) }],
    estimatedDurationMinutes: 90,
  });
}

describe('internally tagged match identities', () => {
  it('never classifies a real participant named Freilos or TBD as a placeholder', () => {
    expect(decodeMatchSlot('Freilos')).toEqual({ kind: 'participant', name: 'Freilos' });
    expect(decodeMatchSlot('TBD')).toEqual({ kind: 'participant', name: 'TBD' });
    expect(decodeMatchSlot(BYE_SLOT)).toEqual({ kind: 'bye' });
    expect(decodeMatchSlot(PENDING_SLOT)).toEqual({ kind: 'pending' });
    expect(encodeMatchSlot(decodeMatchSlot(BYE_SLOT))).toBe(BYE_SLOT);
    expect(displayMatchSlot(BYE_SLOT)).toBe('Freilos');
    expect(displayMatchSlot(PENDING_SLOT)).toBe('TBD');
  });

  it('schedules teams named Freilos and TBD in KO matches, including a true bye', () => {
    const names = ['Freilos', 'TBD', 'Team A', 'Team B', 'Team C'];
    const tournament = make('KNOCKOUT', names);
    const stage = tournament.stages[0];
    const slots = getBracketSlots(tournament, stage);
    expect(slots.filter((name) => name === BYE_SLOT)).toHaveLength(3);
    expect(slots.filter((name) => name === 'Freilos')).toHaveLength(1);
    expect(slots.filter((name) => name === 'TBD')).toHaveLength(1);
    expect(startFirstStage(tournament)).toBe(true);
    const ready = getMockStageMatches(tournament, stage);
    expect(ready.some((match) => match.sideA === 'Freilos' || match.sideB === 'Freilos')).toBe(true);
    expect(ready.every((match) => match.sideA !== BYE_SLOT && match.sideB !== BYE_SLOT)).toBe(true);
  });

  it('keeps a real Freilos/TBD team in Swiss pairings and gives one separate bye', () => {
    const tournament = make('SWISS', ['Freilos', 'TBD', 'Team A', 'Team B', 'Team C']);
    const stage = tournament.stages[0];
    expect(startFirstStage(tournament)).toBe(true);
    const matches = getMockStageBaseMatches(tournament, stage);
    expect(matches.filter((match) => match.sideB === BYE_SLOT)).toHaveLength(1);
    expect(matches.flatMap((match) => [match.sideA, match.sideB])).toContain('Freilos');
    expect(matches.flatMap((match) => [match.sideA, match.sideB])).toContain('TBD');
    expect(getMockStageMatches(tournament, stage)).toHaveLength(2);
  });
});

describe('optional third place match is not part of creation estimate', () => {
  it('forecasts only the three mandatory matches of a four-player KO', () => {
    const estimate = estimatePhaseMetrics({ type: 'KNOCKOUT', entrantCount: 4,
      bestOf: 1, knockoutBestOf: [1, 1] }, 1, { minutesPerSet: 5 });
    expect(estimate.estimatedMatches).toBe(3);
    expect(estimate.estimatedDurationMinutes).toBe(15);
  });
});
