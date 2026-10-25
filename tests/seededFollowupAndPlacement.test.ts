import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededGroupAssignments, seededKnockoutSlotsAvoidingGroups } from '@/engine/seededDraws';
import { getMatchFinalization, requiresFinalApproval } from '@/domain/matchFinalization';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageEntrants, isStageCompleted, startFirstStage } from '@/services/mockPhaseLifecycle';
import { applySeededBracketSlots, applySeededGroupAssignments, getBracketSlots, getGroupAssignments } from '@/services/mockDrawStore';
import { buildMockGroups, buildSwissStandings } from '@/services/mockCompetitionViews';
import { getMockParticipantProgress } from '@/services/mockParticipantProgress';
import { completeMockMatch, getMockMatchConfirmation, getMockStageMatches } from '@/services/mockRuntime';

const store = new Map<string,string>();
const localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
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
const players = Array.from({ length: 16 }, (_, index) => `Test ${index + 1}`);
const oneSet = [{ number: 1, sideAScore: 11, sideBScore: 6 }];

function createTransition(from: 'GROUPS' | 'SWISS', to: 'GROUPS' | 'KNOCKOUT', count = 16) {
  return createMockTournament({
    name: 'Setzungs-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
    participantNames: players.slice(0, count), estimatedDurationMinutes: 100,
    phases: [
      { type: from, label: 'Qualifikation', entrantCount: count, groupCount: 4, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      { type: to, label: 'Finalphase', entrantCount: count, groupCount: 4, swissRounds: 2, bestOf: 1, knockoutBestOf: [1,1,1,1] },
    ],
  });
}
function finishOpeningStage(tournament: ReturnType<typeof createTransition>) {
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  getMockStageMatches(tournament, tournament.stages[0]).forEach((match) => completeMockMatch(match.id, oneSet));
  expect(isStageCompleted(tournament, tournament.stages[0])).toBe(true);
}

describe('Setzungen und Gruppenrangbereiche', () => {
  it('teilt die Schweizer Rangliste nach A-B-C-D / D-C-B-A ein', () => {
    const assignments = seededGroupAssignments(players, 4);
    expect(players.map((player) => assignments[player])).toEqual([0,1,2,3,3,2,1,0,0,1,2,3,3,2,1,0]);
  });
  it('zeigt die tatsächliche Schweizer Platzierung beim Setzen der Folgegruppen an', () => {
    const tournament = createTransition('SWISS', 'GROUPS');
    const next = tournament.stages[1];
    expect(applySeededGroupAssignments(tournament, next)).toBe(false);
    finishOpeningStage(tournament);
    expect(applySeededGroupAssignments(tournament, next)).toBe(true);
    const ranked = buildSwissStandings(tournament, tournament.stages[0]).map((row) => row.name);
    const qualified = new Set(getStageEntrants(tournament, next));
    const seeded = ranked.filter((name) => qualified.has(name));
    expect(seeded.map((name) => getGroupAssignments(tournament, next)[name]))
      .toEqual(seeded.map((name) => seededGroupAssignments(seeded, 4)[name]));
  });
  it('trennt Erst- und Zweitplatzierte derselben Gruppe in gegenüberliegende Baumhälften', () => {
    const names = ['A1','B1','C1','D1','A2','B2','C2','D2'];
    const origins = Object.fromEntries(names.map((name) => [name, name[0]]));
    const slots = seededKnockoutSlotsAvoidingGroups(names, origins);
    for (const group of ['A','B','C','D']) {
      expect(slots.indexOf(`${group}1`) < 4).not.toBe(slots.indexOf(`${group}2`) < 4);
    }
    expect(slots.indexOf('A1') < 4).toBe(true);
    expect(slots.indexOf('B1') >= 4).toBe(true);
  });
  it('erhält bei zwölf Spielern Freilose für P1 bis P4 auch mit Gruppenrematch-Schutz', () => {
    const twelve = players.slice(0, 12);
    const groupByPlayer = Object.fromEntries(twelve.map((player, index) => [player, `Gruppe ${index % 4}`]));
    const slots = seededKnockoutSlotsAvoidingGroups(twelve, groupByPlayer);
    const byeRecipients: string[] = [];
    for (let index = 0; index < slots.length; index += 2) {
      const pair = slots.slice(index, index + 2);
      expect(pair).not.toEqual(['Freilos', 'Freilos']);
      if (pair.includes('Freilos')) byeRecipients.push(pair.find((name) => name !== 'Freilos')!);
    }
    expect(new Set(byeRecipients)).toEqual(new Set(twelve.slice(0, 4)));
    expect(slots.indexOf(twelve[0]) < slots.length / 2).not.toBe(slots.indexOf(twelve[1]) < slots.length / 2);
    expect(slots.slice(0, slots.length / 2).filter((name) => name !== 'Freilos')).toHaveLength(6);
    expect(slots.slice(slots.length / 2).filter((name) => name !== 'Freilos')).toHaveLength(6);
  });
  it('setzt die tatsächlich qualifizierten Gruppenspieler gruppenschonend in K.-o.-Slots', () => {
    const tournament = createTransition('GROUPS', 'KNOCKOUT', 8);
    const next = tournament.stages[1];
    finishOpeningStage(tournament);
    expect(applySeededBracketSlots(tournament, next)).toBe(true);
    const slots = getBracketSlots(tournament, next);
    const grouped = buildMockGroups(tournament, tournament.stages[0]);
    for (const group of grouped) {
      const [first, second] = group.standings.map((row) => row.name);
      expect(slots.indexOf(first) < 4).not.toBe(slots.indexOf(second) < 4);
    }
  });
  it('zeigt bei identischer sportlicher Bilanz einen gemeinsamen Platzbereich', () => {
    const tournament = createMockTournament({
      name: 'Nur Gruppen', sport: 'table_tennis', discipline: 'SINGLES', tables: 8, minimumMatches: 1,
      participantNames: players, estimatedDurationMinutes: 100,
      phases: [{ type: 'GROUPS', label: 'Gruppenphase', entrantCount: 16, groupCount: 4, swissRounds: 1, bestOf: 1, knockoutBestOf: [] }],
    });
    expect(startFirstStage(tournament)).toBe(true);
    getMockStageMatches(tournament, tournament.stages[0]).forEach((match) => completeMockMatch(match.id, oneSet));
    expect(isStageCompleted(tournament, tournament.stages[0])).toBe(true);
    const groups = buildMockGroups(tournament, tournament.stages[0]);
    for (const group of groups) {
      expect(getMockParticipantProgress(tournament, group.standings[2].name).placement).toContain('Platz 5–16');
      expect(getMockParticipantProgress(tournament, group.standings[3].name).placement).toContain('Platz 5–16');
    }
  });
  it('erzwingt bei Admin-K.-o.-BO1 die zusätzliche Bestätigung', () => {
    expect(getMatchFinalization(1, oneSet)).toBe('AUTO_FINISH');
    expect(requiresFinalApproval(1, oneSet, true)).toBe(true);
    const tournament = createMockTournament({
      name: 'KO-Bestätigung', sport: 'table_tennis', discipline: 'SINGLES', tables: 1, minimumMatches: 1,
      participantNames: ['A Spieler', 'B Spieler'], estimatedDurationMinutes: 15,
      phases: [{ type: 'KNOCKOUT', label: 'Finale', entrantCount: 2, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [1] }],
    });
    expect(startFirstStage(tournament)).toBe(true);
    const match = getMockStageMatches(tournament, tournament.stages[0])[0];
    completeMockMatch(match.id, oneSet, 'FINISHED', true);
    expect(getMockMatchConfirmation(match.id)).toEqual(expect.objectContaining({ confirmedA: true, confirmedB: true }));
  });
});
