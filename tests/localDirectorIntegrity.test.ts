import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus, getMockTournament, updateMockParticipantName } from '@/services/mockTournamentStore';
import { startFirstStage, startStage, isStageCompleted, getStageEntrants, getStageStartIssue } from '@/services/mockPhaseLifecycle';
import { approveMockProgress, getPendingMockApproval, getMockStageMatches, canEditMockMatch, completeMockMatch, assignMockMatchToTable, getMockStoredResult, withdrawMockParticipant, restoreMockParticipant, canRestoreMockParticipant, saveMockMatchSets, abortMockTournament, canWithdrawMockParticipant } from '@/services/mockRuntime';
import { getGroupAssignments, setParticipantGroup, toggleBracketPin, getPinnedBracketSlots, getBracketSlots } from '@/services/mockDrawStore';
import { getMockAudit } from '@/services/mockAudit';
import { setMockTableBlocked } from '@/services/mockTableLocks';
import type { MockPhaseInput } from '@/services/mockTournamentStore';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
  }}));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());
const win = [{ number: 1, sideAScore: 11, sideBScore: 7 }];
const lose = [{ number: 1, sideAScore: 7, sideBScore: 11 }];
function phase(type: MockPhaseInput['type'], n: number): MockPhaseInput {
  return { type, label: type, entrantCount: n, bestOf: 1, swissRounds: 2, groupCount: 2,
    knockoutBestOf: [1, 1, 1], breakKind: 'minutes', breakMinutes: 30 };
}
function create(types: MockPhaseInput[], prefix = 'P', count = 4) {
  return createMockTournament({ name: prefix, sport: 'table_tennis', discipline: 'SINGLES',
    tables: 3, minimumMatches: 1, estimatedDurationMinutes: 90,
    participantNames: Array.from({ length: count }, (_, i) => `${prefix} Spieler${i}`), phases: types });
}
function start(t: ReturnType<typeof create>) {
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
}

describe('local director integrity', () => {
  it('never uses another tournament to lock or clear future rounds', () => {
    const a = create([phase('KNOCKOUT', 8)], 'A', 8);
    const b = create([phase('KNOCKOUT', 8)], 'B', 8);
    start(a); start(b);
    const quartersA = getMockStageMatches(a, a.stages[0]);
    const quartersB = getMockStageMatches(b, b.stages[0]);
    quartersA.forEach(m => completeMockMatch(m.id, win));
    quartersB.forEach(m => completeMockMatch(m.id, win));
    const semifinalB = getMockStageMatches(b, b.stages[0]).find(m => m.round === 'Halbfinale')!;
    expect(assignMockMatchToTable(b, semifinalB.id, 'Tisch 1')).toBe(true);
    expect(canEditMockMatch(a, quartersA[0].id)).toBe(true);
    completeMockMatch(quartersA[0].id, lose, 'FINISHED', true);
    expect(getMockStoredResult(quartersB[0].id)?.sets).toEqual(win);
    expect(getMockStageMatches(b, b.stages[0]).find(m => m.id === semifinalB.id)?.table).toBe('Tisch 1');
  });

  it('isolates Swiss pairing approval from another tournament already in its next round', () => {
    const a = create([phase('SWISS', 4)], 'SwissA');
    const b = create([phase('SWISS', 4)], 'SwissB');
    start(a); start(b);
    const firstA = getMockStageMatches(a, a.stages[0]);
    const firstB = getMockStageMatches(b, b.stages[0]);
    firstA.forEach(m => completeMockMatch(m.id, win));
    firstB.forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(a)?.kind).toBe('ROUND');
    expect(approveMockProgress(b)?.kind).toBe('ROUND');
    const bNext = getMockStageMatches(b, b.stages[0]).find(m => m.round === 'Runde 2')!;
    expect(assignMockMatchToTable(b, bNext.id, 'Tisch 2')).toBe(true);
    expect(canEditMockMatch(a, firstA[0].id)).toBe(true);
    completeMockMatch(firstA[0].id, lose, 'FINISHED', true);
    expect(getMockStageMatches(b, b.stages[0]).find(m => m.id === bNext.id)?.table).toBe('Tisch 2');
  });

  it('reapproves a correction during a break and updates next phase entrants', () => {
    const t = create([phase('GROUPS', 4), phase('BREAK', 2), phase('KNOCKOUT', 2)]);
    start(t);
    const [group, pause, ko] = t.stages;
    const games = getMockStageMatches(t, group);
    games.forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(startStage(t, pause)).toBe(true);
    updateMockTournamentStatus(t.id, 'PAUSED');
    completeMockMatch(games[0].id, lose, 'FINISHED', true);
    expect(isStageCompleted(t, group)).toBe(false);
    expect(getMockTournament(t.id).status).toBe('PAUSED');
    expect(getPendingMockApproval(t)?.stageId).toBe(group.id);
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(getStageEntrants(t, ko)).toContain(games[0].sideB);
    expect(getStageEntrants(t, ko)).not.toContain(games[0].sideA);
    expect(getStageEntrants(t, pause)).toEqual(getStageEntrants(t, ko));
  });

  it('replaces and restores withdrawn qualifiers during a scheduled break', () => {
    const t = create([phase('GROUPS', 4), phase('BREAK', 2), phase('KNOCKOUT', 2)]);
    start(t);
    getMockStageMatches(t, t.stages[0]).forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)).not.toBeNull();
    expect(startStage(t, t.stages[1])).toBe(true);
    const selected = getStageEntrants(t, t.stages[2])[0];
    expect(withdrawMockParticipant(t, selected)).toBe(true);
    expect(getStageEntrants(t, t.stages[2])).toHaveLength(2);
    expect(getStageEntrants(t, t.stages[2])).not.toContain(selected);
    expect(canRestoreMockParticipant(t, selected)).toBe(true);
    expect(restoreMockParticipant(t, selected)).toBe(true);
    expect(getStageEntrants(t, t.stages[2])).toContain(selected);
  });

  it('approves bye-only Swiss rounds without fabricating a normal match', () => {
    const t = create([phase('SWISS', 3)], 'S', 3);
    start(t);
    const match = getMockStageMatches(t, t.stages[0])[0];
    expect(match).toBeDefined();
    const remaining = match.sideA;
    for (const p of t.participantNames!.filter(p => p !== remaining)) {
      expect(withdrawMockParticipant(t, p)).toBe(true);
    }
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    expect(getMockStageMatches(t, t.stages[0]).filter(m => m.round === 'Runde 2')).toHaveLength(0);
    expect(getPendingMockApproval(t)).toMatchObject({ kind: 'STAGE', round: 2 });
  });

  it('audits table locks and in-progress corrections and rejects unknown IDs', () => {
    const t = create([phase('ROUND_ROBIN', 4)]);
    start(t);
    setMockTableBlocked(t, 'Tisch 1', true);
    setMockTableBlocked(t, 'Tisch 1', false);
    const m = getMockStageMatches(t, t.stages[0])[0];
    saveMockMatchSets(m.id, win); saveMockMatchSets(m.id, lose);
    const audit = getMockAudit(t.id);
    expect(audit.filter(e => e.action === 'SET_SAVED')).toHaveLength(2);
    expect(audit.some(e => e.action === 'TABLE_BLOCKED')).toBe(true);
    expect(audit.some(e => e.action === 'TABLE_UNBLOCKED')).toBe(true);
    expect(getMockTournament('absent').stages).toHaveLength(0);
  });

  it('allows empty groups but rejects singleton groups until moved', () => {
    const t = create([phase('GROUPS', 4)]);
    const stage = t.stages[0];
    const assignments = getGroupAssignments(t, stage);
    const membersB = t.participantNames!.filter(name => assignments[name] === 1);
    expect(membersB).toHaveLength(2);
    expect(setParticipantGroup(t, stage, membersB[0], 0)).toBe(true);
    expect(getStageStartIssue(t, stage)).toContain('nur einen Teilnehmer');
    expect(startFirstStage(t)).toBe(false);
    expect(setParticipantGroup(t, stage, membersB[1], 0)).toBe(true);
    expect(getStageStartIssue(t, stage)).toBeNull();
    expect(startFirstStage(t)).toBe(true);
  });

  it('rejects a next phase when only one eligible participant remains', () => {
    const t = create([phase('ROUND_ROBIN', 2), phase('KNOCKOUT', 2)], 'Small', 2);
    start(t);
    getMockStageMatches(t, t.stages[0]).forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    const qualified = getStageEntrants(t, t.stages[1])[0];
    expect(withdrawMockParticipant(t, qualified)).toBe(true);
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(1);
    expect(getStageStartIssue(t, t.stages[1])).toContain('mindestens zwei');
    expect(startStage(t, t.stages[1])).toBe(false);
  });

  it('prevents withdrawals after abort without changing completed group results', () => {
    const t = create([phase('GROUPS', 4)]);
    start(t);
    const match = getMockStageMatches(t, t.stages[0])[0];
    completeMockMatch(match.id, win);
    expect(abortMockTournament(t, 'Test')).toBe(true);
    const snapshot = getMockStoredResult(match.id);
    expect(canWithdrawMockParticipant(t, match.sideA)).toBe(false);
    expect(withdrawMockParticipant(t, match.sideA)).toBe(false);
    expect(getMockStoredResult(match.id)).toEqual(snapshot);
  });

  it('rebuilds a pinned knockout draw when a qualifier withdraws', () => {
    const t = create([phase('GROUPS', 4), phase('KNOCKOUT', 2)]);
    start(t);
    getMockStageMatches(t, t.stages[0]).forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    const ko = t.stages[1];
    const originallyQualified = getStageEntrants(t, ko);
    expect(toggleBracketPin(t, ko, 0)).toBe(true);
    expect(getPinnedBracketSlots(t, ko)).toEqual([0]);
    expect(withdrawMockParticipant(t, originallyQualified[0])).toBe(true);
    expect(getStageEntrants(t, ko)).not.toContain(originallyQualified[0]);
    expect(getPinnedBracketSlots(t, ko)).toEqual([]);
    expect(getBracketSlots(t, ko)).toEqual(expect.arrayContaining(getStageEntrants(t, ko)));
    expect(getMockAudit(t.id).some(e => e.action === 'KNOCKOUT_DRAW_REBUILT')).toBe(true);
  });

  it('rechecks pinned knockout positions after a corrected phase is reapproved', () => {
    const t = create([phase('GROUPS', 4), phase('KNOCKOUT', 2)]);
    start(t);
    const matches = getMockStageMatches(t, t.stages[0]);
    matches.forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(toggleBracketPin(t, t.stages[1], 0)).toBe(true);
    expect(getPinnedBracketSlots(t, t.stages[1])).toEqual([0]);
    const previous = getStageEntrants(t, t.stages[1]);
    completeMockMatch(matches[0].id, lose, 'FINISHED', true);
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    expect(getStageEntrants(t, t.stages[1])).not.toEqual(previous);
    expect(getPinnedBracketSlots(t, t.stages[1])).toEqual([]);
    expect(getMockAudit(t.id).some(e => e.action === 'KNOCKOUT_DRAW_REBUILT')).toBe(true);
  });

  it('keeps a manually paused tournament paused after correcting an approved stage', () => {
    const t = create([phase('ROUND_ROBIN', 4), phase('KNOCKOUT', 2)]);
    start(t);
    const first = getMockStageMatches(t, t.stages[0])[0];
    getMockStageMatches(t, t.stages[0]).forEach(m => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('STAGE');
    updateMockTournamentStatus(t.id, 'RUNNING');
    updateMockTournamentStatus(t.id, 'PAUSED');
    completeMockMatch(first.id, lose, 'FINISHED', true);
    expect(getMockTournament(t.id).status).toBe('PAUSED');
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
  });

  it('updates Swiss decisions and walkover references after a participant rename', () => {
    const t = create([phase('SWISS', 4)]);
    const old = t.participantNames![0];
    const key = `${t.id}:${t.stages[0].id}`;
    values.set('online-tournament:swiss-cutoff-decisions:v1',
      JSON.stringify({ [key]: { signature: JSON.stringify({ names: [old] }), winners: [old] } }));
    const matchId = `${t.stages[0].id}-sw-r1-m1`;
    values.set('online-tournament:mock-match-results:v2',
      JSON.stringify([{ matchId, status: 'FINISHED', sets: [], forcedWinner: old }]));
    expect(updateMockParticipantName(t.id, old, 'Neu', 'Spieler', '4567')).toBe(true);
    const saved = JSON.parse(values.get('online-tournament:swiss-cutoff-decisions:v1')!)[key];
    expect(saved.winners).toEqual(['Neu Spieler']);
    expect(JSON.parse(saved.signature).names).toEqual(['Neu Spieler']);
    expect(getMockStoredResult(matchId)?.forcedWinner).toBe('Neu Spieler');
    expect(getMockAudit(t.id)[0].action).toBe('PARTICIPANT_UPDATED');
  });
});
