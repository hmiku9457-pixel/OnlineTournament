import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockAssignmentBlockReason, getMockStageMatches, approveMockProgress } from '@/services/mockRuntime';
import { blocksInlineBreakRound, finishInlineBreak, getInlineBreakConfigs, getInlineBreakStatus,
  startInlineBreak, isScheduledInlineBreakPending } from '@/services/mockInlineBreak';

const memory = new Map<string,string>();
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2031, 10, 20, 10, 0));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const score = [{ number:1, sideAScore:11, sideBScore:5 }];

function build(type: 'SWISS'|'KNOCKOUT'|'GROUPS'|'ROUND_ROBIN', breaks: number[]) {
  const count = type === 'KNOCKOUT' || type === 'GROUPS' ? 8 : 4;
  const tournament = createMockTournament({
    name: 'Mehrtägig', sport:'table_tennis', discipline:'SINGLES', tables:4, minimumMatches:1,
    estimatedDurationMinutes:150,
    participantNames: Array.from({length:count},(_,i)=>`Spieler ${i+1}`),
    phases:[{
      type, label:'Vorrunde', entrantCount:count, groupCount:2, swissRounds:3, bestOf:1,
      knockoutBestOf:[1,1,1], dayBreaks:breaks.map((afterRound,i)=>({
        afterRound,date:`2031-11-${String(21+i).padStart(2,'0')}`,time:'09:00',
      })),
    }],
  });
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  return { tournament, stage: tournament.stages[0] };
}

describe('live day transitions within a competition stage', () => {
  it('protects all future matchdays in a group stage until the director releases the day', () => {
    const { tournament, stage } = build('GROUPS',[1]);
    const matches = getMockStageMatches(tournament,stage);
    expect(getInlineBreakConfigs(stage)).toMatchObject([{afterRound:1,kind:'overnight'}]);
    const first = matches.filter(x=>x.matchDay===1);
    expect(first.length).toBeGreaterThan(0);
    const next = matches.find(x=>x.matchDay===2);
    expect(next).toBeDefined();
    expect(blocksInlineBreakRound(tournament,stage,next!.id)).toBe(true);
    first.forEach(x=>completeMockMatch(x.id,score));
    expect(getInlineBreakStatus(tournament,stage,getMockStageMatches(tournament,stage))?.state).toBe('ready');
    expect(startInlineBreak(tournament,stage,getMockStageMatches(tournament,stage),{kind:'minutes',minutes:15})).toBe(true);
    expect(finishInlineBreak(tournament,stage,true)).toBe(true);
    expect(blocksInlineBreakRound(tournament,stage,next!.id)).toBe(false);
  });

  it('keeps each later knockout round blocked until its own day boundary is released', () => {
    const { tournament, stage }=build('KNOCKOUT',[1,2]);
    expect(getInlineBreakConfigs(stage).map(x=>x.afterRound)).toEqual([1,2]);
    const first=getMockStageMatches(tournament,stage).filter(x=>x.id.includes('-r1-m'));
    expect(first).toHaveLength(4);
    first.forEach(x=>completeMockMatch(x.id,score));
    const next=getMockStageMatches(tournament,stage).find(x=>x.id.includes('-r2-m'));
    expect(next).toBeDefined();
    expect(blocksInlineBreakRound(tournament,stage,next!.id)).toBe(true);
    expect(getMockAssignmentBlockReason(tournament,next!.id,'Tisch 1')).toContain('Zwischenpause');
    expect(startInlineBreak(tournament,stage,getMockStageMatches(tournament,stage),{kind:'minutes',minutes:15})).toBe(true);
    expect(finishInlineBreak(tournament,stage,true)).toBe(true);
    expect(blocksInlineBreakRound(tournament,stage,next!.id)).toBe(false);
    expect(isScheduledInlineBreakPending(tournament,stage,2)).toBe(true);
    const second=getMockStageMatches(tournament,stage).filter(x=>x.id.includes('-r2-m'));
    second.forEach(x=>completeMockMatch(x.id,score));
    expect(getInlineBreakStatus(tournament,stage,getMockStageMatches(tournament,stage))?.config.afterRound).toBe(2);
    expect(getInlineBreakStatus(tournament,stage,getMockStageMatches(tournament,stage))?.state).toBe('ready');
    expect(startInlineBreak(tournament,stage,getMockStageMatches(tournament,stage),{kind:'minutes',minutes:15})).toBe(true);
    expect(finishInlineBreak(tournament,stage,true)).toBe(true);
    expect(isScheduledInlineBreakPending(tournament,stage,2)).toBe(false);
  });

  it('does not generate new Swiss pairings across an unreleased playing-day boundary', () => {
    const { tournament, stage }=build('SWISS',[1,2]);
    for(let round=1;round<=2;round++){
      const matches=getMockStageMatches(tournament,stage).filter(x=>x.round===`Runde ${round}`);
      expect(matches).toHaveLength(2);
      matches.forEach(x=>completeMockMatch(x.id,score));
      expect(approveMockProgress(tournament)?.kind).toBe('ROUND');
      expect(getMockStageMatches(tournament,stage).some(x=>x.round===`Runde ${round+1}`)).toBe(false);
      expect(getInlineBreakStatus(tournament,stage)?.config.afterRound).toBe(round);
      expect(startInlineBreak(tournament,stage,[],{kind:'minutes',minutes:15})).toBe(true);
      expect(finishInlineBreak(tournament,stage,true)).toBe(true);
    }
    expect(getMockStageMatches(tournament,stage).filter(x=>x.round==='Runde 3')).toHaveLength(2);
  });
});
