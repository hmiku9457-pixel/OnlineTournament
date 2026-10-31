import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage, startStage, completeStage, getStageEntrants, getBreakResumeAt, computeBreakResumeAt, formatBreakCountdown, canFinishBreak, isStageCompleted, isStageEditable, getStageStartIssue } from '@/services/mockPhaseLifecycle';
import { getGroupAssignments, setParticipantGroup } from '@/services/mockDrawStore';
import { setMockTableBlocked } from '@/services/mockTableLocks';
import { approveMockProgress, abortMockTournament, completeMockMatch, getMockStageMatches, getMockStageBaseMatches, canEditMockMatch, saveMockMatchSets, withdrawMockParticipant } from '@/services/mockRuntime';
import { getMockConfirmedFinalStandings, getMockParticipantProgress } from '@/services/mockParticipantProgress';
import type { MockPhaseInput } from '@/services/mockTournamentStore';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, String(value)); },
    removeItem: (key: string) => { memory.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const phase = (type: MockPhaseInput['type'], n = 4): MockPhaseInput => ({
  type, label: type, entrantCount: n, groupCount: 2, swissRounds: 2,
  bestOf: 1, knockoutBestOf: [1, 1], breakKind: 'minutes', breakMinutes: 30,
});
const score = [{ number: 1, sideAScore: 11, sideBScore: 7 }];
function create(phases: MockPhaseInput[], count = 4) {
  return createMockTournament({ name: 'Pause & Sperren', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 2, minimumMatches: 1, estimatedDurationMinutes: 90,
    participantNames: Array.from({ length: count }, (_, i) => `Spieler ${i + 1}`), phases });
}
function approvedGroupsWithBreak() {
  const t = create([phase('GROUPS'), phase('BREAK'), phase('KNOCKOUT', 2)]);
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
  getMockStageMatches(t, t.stages[0]).forEach((match) => completeMockMatch(match.id, score));
  expect(approveMockProgress(t)?.kind).toBe('STAGE');
  return getMockTournament(t.id);
}

describe('turnierweite Sperren und verbindliche Platzierungen', () => {
  it('hält Nichtqualifizierte während Pausen für eventuelles Nachrücken offen', () => {
    const t = approvedGroupsWithBreak();
    const reserve = t.participantNames!.find((name) => !getStageEntrants(t, t.stages[2]).includes(name))!;
    expect(getMockParticipantProgress(t, reserve).status).toMatch(/^Nicht für Phase /);
    expect(getMockConfirmedFinalStandings(t)).toEqual([]);
    expect(startStage(t, t.stages[1])).toBe(true);
    expect(getMockConfirmedFinalStandings(t)).toEqual([]);
    expect(completeStage(t, t.stages[1], getStageEntrants(t, t.stages[1]), true)).toBe(true);
    expect(getMockConfirmedFinalStandings(t)).toEqual([]);
    expect(startStage(t, t.stages[2])).toBe(true);
    expect(getMockConfirmedFinalStandings(t)).toHaveLength(2);
  });

  it('sperrt Ergebnisdaten bis zum Start der betreffenden Phase', () => {
    const t = create([phase('ROUND_ROBIN')]);
    const match = getMockStageBaseMatches(t, t.stages[0])[0];
    expect(canEditMockMatch(t, match.id)).toBe(false);
    expect(() => saveMockMatchSets(match.id, score)).toThrow('gesperrt');
    expect(() => completeMockMatch(match.id, score)).toThrow('gesperrt');
    expect(startFirstStage(t)).toBe(true);
    expect(canEditMockMatch(t, match.id)).toBe(true);
  });

  it('lässt einen gültigen Vorstart-Rückzug ohne Neuanlage der Phasen zu', () => {
    const t = create([phase('GROUPS'), phase('KNOCKOUT', 2)], 4);
    expect(withdrawMockParticipant(t, t.participantNames![0])).toBe(true);
    expect(getStageEntrants(t, t.stages[0])).toHaveLength(3);
    // A single occupied group is invalid; moving everyone into one group
    // leaves the other group empty, which is explicitly permitted.
    const assignments = getGroupAssignments(t, t.stages[0]);
    const groupWithOne = [0, 1].find((group) => Object.values(assignments).filter((value) => value === group).length === 1)!;
    expect(getStageStartIssue(t, t.stages[0])).toContain('nur einen Teilnehmer');
    const lone = Object.keys(assignments).find((name) => assignments[name] === groupWithOne)!;
    expect(setParticipantGroup(t, t.stages[0], lone, 1 - groupWithOne)).toBe(true);
    expect(getStageStartIssue(t, t.stages[0])).toBeNull();
    expect(startFirstStage(t)).toBe(true);
  });

  it('unterbindet nach Abbruch das Beenden von Pausen und weitere Auslosungen', () => {
    const t = approvedGroupsWithBreak();
    expect(startStage(t, t.stages[1], { kind: 'minutes', minutes: 30 })).toBe(true);
    expect(abortMockTournament(t, 'Abgebrochen')).toBe(true);
    const stopped = getMockTournament(t.id);
    expect(canFinishBreak(stopped, stopped.stages[1], new Date(Date.now() + 3600000), true)).toBe(false);
    expect(completeStage(stopped, stopped.stages[1], [], true)).toBe(false);
    expect(isStageCompleted(stopped, stopped.stages[1])).toBe(false);
    expect(isStageEditable(stopped, stopped.stages[2])).toBe(false);
    expect(startStage(stopped, stopped.stages[2])).toBe(false);
    expect(setMockTableBlocked(stopped, 'Tisch 1', true)).toBe(false);
  });
});

describe('steuerbare Pause', () => {
  it('berechnet eine präzise lokale Uhrzeit und schiebt vergangene Uhrzeiten auf morgen', () => {
    const start = new Date(2026, 9, 31, 14, 5, 0);
    expect(computeBreakResumeAt(start, { kind: 'minutes', minutes: 25 })!.getTime() - start.getTime()).toBe(25 * 60000);
    expect(computeBreakResumeAt(start, { kind: 'minutes', minutes: 0 })).toBeNull();
    expect(computeBreakResumeAt(start, { kind: 'clock', time: '15:30' })?.getDate()).toBe(31);
    expect(computeBreakResumeAt(start, { kind: 'clock', time: '12:00' })?.getDate()).toBe(1);
    expect(computeBreakResumeAt(start, { kind: 'clock', time: '25:99' })).toBeNull();
  });

  it('behält die feste Uhrzeit bei und erlaubt vorzeitiges Beenden', () => {
    const t = approvedGroupsWithBreak();
    const started = Date.now();
    expect(startStage(t, t.stages[1], { kind: 'minutes', minutes: 25 })).toBe(true);
    const resume = getBreakResumeAt(t, t.stages[1])!;
    expect(resume.getTime() - started).toBeGreaterThanOrEqual(25 * 60000 - 10000);
    expect(resume.getTime() - started).toBeLessThanOrEqual(25 * 60000 + 10000);
    expect(formatBreakCountdown(resume, resume.getTime() - 61000)).toBe('000:00:01:01');
    expect(canFinishBreak(t, t.stages[1])).toBe(false);
    expect(completeStage(t, t.stages[1])).toBe(false);
    expect(getBreakResumeAt(t, t.stages[1])?.getTime()).toBe(resume.getTime());
    expect(canFinishBreak(t, t.stages[1], new Date(), true)).toBe(true);
    expect(completeStage(t, t.stages[1], getStageEntrants(t, t.stages[1]), true)).toBe(true);
    expect(isStageCompleted(t, t.stages[1])).toBe(true);
  });
});
