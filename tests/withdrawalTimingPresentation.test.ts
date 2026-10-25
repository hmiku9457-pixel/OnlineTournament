import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinalStandingsList } from '@/components/FinalStandingsList';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageWithdrawalLabel, getWithdrawalLabel, getWithdrawalTiming, saveParticipantWithdrawal } from '@/services/mockWithdrawals';
import { completeMockMatch, getMockStageMatches, restoreMockParticipant, withdrawMockParticipant } from '@/services/mockRuntime';
import { isStageCompleted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';

const data = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, String(value)); },
  removeItem: (key: string) => { data.delete(key); },
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function create() {
  return createMockTournament({
    name: 'Historische Rückzüge', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 4, minimumMatches: 1,
    participantNames: ['Anna', 'Ben', 'Clara', 'Dora'],
    estimatedDurationMinutes: 120,
    phases: [
      { type: 'GROUPS', label: 'Gruppenphase', entrantCount: 4, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      { type: 'GROUPS', label: 'Weitere Gruppenphase', entrantCount: 4, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
    ],
  });
}
function finishFirstStage(tournament: ReturnType<typeof create>) {
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  const [first] = tournament.stages;
  for (const match of getMockStageMatches(tournament, first)) {
    completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
  }
  expect(isStageCompleted(tournament, first)).toBe(true);
}

describe('Rückzugs-Tags im zeitlichen Turnierverlauf', () => {
  it('merkt den Rückzug während Phase 1', () => {
    const tournament = create();
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);
    expect(getWithdrawalLabel(tournament, 'Anna')).toBe('Zurückgezogen während Phase 1');
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[0].id)).toBe('Zurückgezogen während Phase 1');
    expect(getWithdrawalTiming(tournament, 'Anna')).toMatchObject({ kind: 'DURING_PHASE', stageId: tournament.stages[0].id });
  });

  it('markiert Rückzüge zwischen zwei Phasen erst ab der abgeschlossenen Phase', () => {
    const tournament = create();
    finishFirstStage(tournament);
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);
    expect(getWithdrawalLabel(tournament, 'Anna')).toBe('Zurückgezogen nach Phase 1');
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[0].id)).toBe('Zurückgezogen nach Phase 1');
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[1].id)).toBe('Zurückgezogen nach Phase 1');
    expect(getWithdrawalTiming(tournament, 'Anna')).toMatchObject({ kind: 'AFTER_PHASE', stageId: tournament.stages[0].id });
  });

  it('zeigt einen späteren Rückzug NICHT rückwirkend in Phase 1 an', () => {
    const tournament = create();
    finishFirstStage(tournament);
    expect(startStage(tournament, tournament.stages[1])).toBe(true);
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[0].id)).toBeNull();
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[1].id)).toBe('Zurückgezogen während Phase 2');
    expect(getWithdrawalLabel(tournament, 'Anna')).toBe('Zurückgezogen während Phase 2');
  });

  it('entfernt den Rückzugszeitpunkt bei Wiederaufnahme vor Turnierbeginn', () => {
    const tournament = create();
    expect(withdrawMockParticipant(tournament, 'Anna')).toBe(true);
    expect(getWithdrawalLabel(tournament, 'Anna')).toBe('Zurückgezogen vor Turnierstart');
    expect(restoreMockParticipant(tournament, 'Anna')).toBe(true);
    expect(getWithdrawalTiming(tournament, 'Anna')).toBeNull();
    expect(getWithdrawalLabel(tournament, 'Anna')).toBeNull();
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[0].id)).toBeNull();
  });

  it('kennzeichnet alte Rückzüge ohne nachvollziehbaren Zeitpunkt NICHT in früheren Phasentabellen', () => {
    const tournament = create();
    saveParticipantWithdrawal(tournament, 'Anna');
    expect(getWithdrawalLabel(tournament, 'Anna')).toBe('Zurückgezogen');
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[0].id)).toBeNull();
    expect(getStageWithdrawalLabel(tournament, 'Anna', tournament.stages[1].id)).toBeNull();
  });

  it('zeigt den Phasenzeitpunkt in der Endplatzierung ohne den Rang zu verändern', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [{ name: 'Anna', placement: 'Platz 4', status: 'Zurückgezogen', stageIndex: 1, placementNumber: 4 }],
      phaseNames: ['Gruppenphase', 'Weitere Gruppenphase'],
      withdrawalLabels: { Anna: 'Zurückgezogen nach Phase 1' },
    }));
    expect(html).toContain('Zurückgezogen nach Phase 1');
    expect(html).toContain('Platz 4');
  });
});
