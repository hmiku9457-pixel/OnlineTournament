import { approveMockProgress } from '@/services/mockRuntime';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { getMockAudit } from '@/services/mockAudit';
import {
  adminConfirmMockMatch,
  assignMockMatchToTable,
  completeMockMatch,
  confirmMockMatchSide,
  countMockOpenConfirmations,
  getMockAssignmentBlockReason,
  getMockParticipantTableConflicts,
  getMockQueueAssignableTables,
  getMockMatchCode,
  getMockParticipantCode,
  getMockRuntimeMatches,
  getMockStageMatches,
  getMockStoredResult,
  getSwissRecordBeforeRound,
  moveMockMatchToTable,
  restoreMockCorrectedResult,
  saveMockMatchSets,
  unassignMockMatch,
  verifyMockMatchCode,
} from '@/services/mockRuntime';

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, String(value)); },
  removeItem(key: string) { store.delete(key); },
};

function setup() {
  const tournament = createMockTournament({
    name: 'Betriebstest', sport: 'table_tennis', discipline: 'SINGLES', tables: 3, minimumMatches: 1,
    participantNames: ['Anna A', 'Ben B', 'Cora C', 'Dora D'],
    phases: [{ type: 'ROUND_ROBIN', label: 'Liga', bestOf: 3, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [] }],
    estimatedDurationMinutes: 120,
  });
  expect(startFirstStage(tournament)).toBe(true);
  const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
  return running;
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Turnierleitung: Zuweisung, Pause, Codes, Audit', () => {
  it('meldet keine zuweisbaren Partien, solange alle Spieler belegt sind – trotz freiem Tisch', () => {
    const tournament = setup();
    const matches = getMockRuntimeMatches(tournament);
    const first = matches[0];
    const disjoint = matches.find((match) => match.id !== first.id && ![match.sideA, match.sideB].some((name) => name === first.sideA || name === first.sideB));
    expect(disjoint).toBeDefined();
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);
    expect(assignMockMatchToTable(tournament, disjoint!.id, 'Tisch 2')).toBe(true);
    const waiting = getMockRuntimeMatches(tournament).filter((match) => match.status === 'WAITING');
    expect(waiting.length).toBeGreaterThan(0);
    const options = getMockQueueAssignableTables(tournament);
    expect(waiting.every((match) => options.get(match.id)?.length === 0)).toBe(true);
    // Tisch 3 ist frei, aber kein weiterer Spieler.
    expect(getMockAssignmentBlockReason(tournament, waiting[0].id, 'Tisch 3')).toContain('bereits Tisch');

    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 9 }]);
    // Solange Tisch 2 noch läuft, können die Begegnungen weiterhin blockiert sein.
    completeMockMatch(disjoint!.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 9 }]);
    const after = getMockQueueAssignableTables(tournament);
    expect(waiting.some((match) => (after.get(match.id)?.length ?? 0) > 0)).toBe(true);
  });

  it('lässt ein späteres Wartespiel mit freien Spielern direkt an einen freien Tisch zuweisen', () => {
    const tournament = createMockTournament({
      name: 'Neunzehner-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
      participantNames: Array.from({ length: 19 }, (_, index) => `Spieler ${index + 1}`),
      phases: [{ type: 'GROUPS', label: 'Gruppenphase', entrantCount: 19, groupCount: 4, bestOf: 3, swissRounds: 1, knockoutBestOf: [] }],
      estimatedDurationMinutes: 240,
    });
    expect(startFirstStage(tournament)).toBe(true);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const matches = getMockRuntimeMatches(running);
    const later = matches[9];
    expect(later).toBeDefined();

    // Andere Spiele laufen bereits, die beiden Spieler aus Platz 10 bleiben frei.
    let assigned = 0;
    for (const match of matches) {
      if (match.id === later.id || [match.sideA, match.sideB].some((name) => name === later.sideA || name === later.sideB)) continue;
      const table = getMockQueueAssignableTables(running).get(match.id)?.find((entry) => entry !== 'Tisch 8');
      if (table && assignMockMatchToTable(running, match.id, table)) assigned += 1;
      if (assigned === 5) break;
    }
    expect(assigned).toBeGreaterThan(0);
    expect(getMockQueueAssignableTables(running).get(later.id)).toContain('Tisch 8');
    expect(getMockAssignmentBlockReason(running, later.id, 'Tisch 8')).toBeNull();
    expect(assignMockMatchToTable(running, later.id, 'Tisch 8')).toBe(true);
  });

  it('zeigt belegte Teilnehmer an und gibt die wartende Partie erst nach Spielende frei', () => {
    const tournament = setup();
    const matches = getMockRuntimeMatches(tournament);
    const first = matches[0];
    const waiting = matches.find((match) => match.id !== first.id && [match.sideA, match.sideB].some((name) => name === first.sideA || name === first.sideB));
    expect(waiting).toBeDefined();
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);

    const current = getMockRuntimeMatches(tournament);
    const conflicts = getMockParticipantTableConflicts(waiting!, current);
    expect(conflicts).toContainEqual({ participant: [first.sideA, first.sideB].find((name) => name === waiting!.sideA || name === waiting!.sideB), table: 'Tisch 1' });
    expect(getMockAssignmentBlockReason(tournament, waiting!.id, 'Tisch 2')).toContain('bereits Tisch 1 zugewiesen');
    expect(assignMockMatchToTable(tournament, waiting!.id, 'Tisch 2')).toBe(false);

    // Auch ein nur zugewiesenes, noch nicht begonnenes Spiel blockiert die Person.
    const active = current.find((match) => match.id === first.id)!;
    expect(getMockParticipantTableConflicts(waiting!, [{ ...active, status: 'READY' }])).toHaveLength(1);

    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 8 }]);
    expect(getMockParticipantTableConflicts(waiting!, getMockRuntimeMatches(tournament))).toEqual([]);
    expect(getMockAssignmentBlockReason(tournament, waiting!.id, 'Tisch 2')).toBeNull();
  });

  it('sperrt neue Zuordnungen während einer Pause, lässt laufende Partie zu Ende spielen', () => {
    const tournament = setup();
    const [first, next] = getMockRuntimeMatches(tournament);
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);
    updateMockTournamentStatus(tournament.id, 'PAUSED');
    expect(getMockAssignmentBlockReason(tournament, next.id, 'Tisch 2')).toContain('Pause');
    expect(assignMockMatchToTable(tournament, next.id, 'Tisch 2')).toBe(false);
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 9 }]);
    expect(getMockRuntimeMatches(tournament).find((game) => game.id === first.id)?.status).toBe('FINISHED');
    expect(getMockAudit(tournament.id).some((entry) => entry.action === 'TOURNAMENT_PAUSED')).toBe(true);
  });

  it('kann eine laufende Partie verlegen/zurückstellen, ohne gespeicherte Sätze oder Pausenzeit zu verlieren', () => {
    const tournament = setup();
    const first = getMockRuntimeMatches(tournament)[0];
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);
    saveMockMatchSets(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    const before = getMockRuntimeMatches(tournament).find((game) => game.id === first.id)!;
    expect(moveMockMatchToTable(tournament, first.id, 'Tisch 2')).toBe(true);
    const moved = getMockRuntimeMatches(tournament).find((game) => game.id === first.id)!;
    expect(moved.table).toBe('Tisch 2');
    expect(moved.sets).toEqual(before.sets);
    expect(moved.startedAt).toEqual(before.startedAt);
    expect(unassignMockMatch(tournament, first.id)).toBe(true);
    const unassigned = getMockRuntimeMatches(tournament).find((game) => game.id === first.id)!;
    expect(unassigned.status).toBe('WAITING');
    expect(unassigned.sets).toHaveLength(1);
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 3')).toBe(true);
    const restarted = getMockRuntimeMatches(tournament).find((game) => game.id === first.id)!;
    expect(restarted.sets).toHaveLength(1);
    expect(restarted.startedAt).toBe(before.startedAt);
  });

  it('speichert die Pausenminuten beim Start, statt sie bei abgeschlossenen Spielen weiterzuzählen', () => {
    const tournament = setup();
    const first = getMockRuntimeMatches(tournament)[0];
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }, { number: 2, sideAScore: 11, sideBScore: 8 }]);
    vi.advanceTimersByTime(7 * 60_000 + 1500);
    const following = getMockRuntimeMatches(tournament).find((game) => game.status === 'WAITING' && [game.sideA, game.sideB].includes(first.sideA))!;
    expect(following).toBeTruthy();
    const pause = following.sideA === first.sideA ? following.pauseA : following.pauseB;
    expect(pause).toBe(7);
    expect(assignMockMatchToTable(tournament, following.id, 'Tisch 2')).toBe(true);
    vi.advanceTimersByTime(15 * 60_000);
    const active = getMockRuntimeMatches(tournament).find((game) => game.id === following.id)!;
    expect(active.sideA === first.sideA ? active.pauseA : active.pauseB).toBe(7);
    completeMockMatch(following.id, [{ number: 1, sideAScore: 11, sideBScore: 6 }, { number: 2, sideAScore: 11, sideBScore: 5 }]);
    vi.advanceTimersByTime(20 * 60_000);
    const finished = getMockRuntimeMatches(tournament).find((game) => game.id === following.id)!;
    expect(finished.sideA === first.sideA ? finished.pauseA : finished.pauseB).toBe(7);
  });

  it('prüft tatsächliche Spieler- und Matchcodes, zeigt offene Bestätigungen und protokolliert Korrekturen', () => {
    const tournament = setup();
    const first = getMockRuntimeMatches(tournament)[0];
    expect(verifyMockMatchCode(first.id, 'beliebig')).toBe(false);
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);
    expect(verifyMockMatchCode(first.id, getMockMatchCode(first.id))).toBe(true);
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 5 }, { number: 2, sideAScore: 11, sideBScore: 7 }]);
    expect(countMockOpenConfirmations(tournament)).toBe(1);
    expect(confirmMockMatchSide(first.id, 'A', 'FALSCH')).toBe(false);
    expect(confirmMockMatchSide(first.id, 'A', getMockParticipantCode(tournament, first.sideA)!)).toBe(true);
    expect(countMockOpenConfirmations(tournament)).toBe(1);
    expect(adminConfirmMockMatch(tournament, first.id)).toBe(true);
    expect(countMockOpenConfirmations(tournament)).toBe(0);
    completeMockMatch(first.id, [{ number: 1, sideAScore: 7, sideBScore: 11 }, { number: 2, sideAScore: 7, sideBScore: 11 }], 'FINISHED', true);
    expect(countMockOpenConfirmations(tournament)).toBe(0);
    const corrected = getMockAudit(tournament.id).find((entry) => entry.action === 'RESULT_CORRECTED')!;
    expect(corrected.before).toContain('11:5');
    expect(corrected.after).toContain('7:11');
    expect(restoreMockCorrectedResult(tournament, corrected.id)).toBe(true);
    expect(getMockStoredResult(first.id)?.sets[0].sideAScore).toBe(11);
    expect(restoreMockCorrectedResult(tournament, corrected.id)).toBe(false);
  });
});

describe('Schweizer Matchup-Historie', () => {
  it('zeigt beim Gegner dessen Bilanz vor dem jeweiligen Durchgang', () => {
    const tournament = createMockTournament({
      name: 'Swiss', sport: 'table_tennis', discipline: 'SINGLES', tables: 2, minimumMatches: 1,
      participantNames: ['Anna A', 'Ben B', 'Cora C', 'Dora D'],
      phases: [{ type: 'SWISS', label: 'Schweizer', bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 2, knockoutBestOf: [] }], estimatedDurationMinutes: 60,
    });
    startFirstStage(tournament); updateMockTournamentStatus(tournament.id, 'RUNNING');
    const stage = tournament.stages[0];
    const firstRound = getMockStageMatches(tournament, stage);
    expect(firstRound).toHaveLength(2);
    expect(getSwissRecordBeforeRound(tournament, stage, firstRound[0].sideA, 1)).toBe('0:0');
    firstRound.forEach((game) => completeMockMatch(game.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]));
    expect(approveMockProgress(tournament)?.kind).toBe('ROUND');
    const secondRound = getMockStageMatches(tournament, stage).filter((game) => game.round === 'Runde 2');
    expect(secondRound.length).toBeGreaterThan(0);
    expect(secondRound.every((game) => ['1:0', '0:1'].includes(getSwissRecordBeforeRound(tournament, stage, game.sideB, 2)))).toBe(true);
  });
});
