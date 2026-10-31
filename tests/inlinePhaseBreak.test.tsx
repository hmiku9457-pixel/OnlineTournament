import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMockTournament, getMockTournament, updateMockTournamentStatus, updatePrestartTournamentPhases } from '@/services/mockTournamentStore';
import { initialPrestartPhases } from '@/domain/prestartPhasePlanning';
import { buildPlannedTimeline, plannedTimelineDurationMinutes } from '@/domain/tournamentSchedule';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { approveMockProgress, completeMockMatch, getMockStageMatches, getMockAssignmentBlockReason } from '@/services/mockRuntime';
import { getInlineBreakConfig, getInlineBreakStatus, startInlineBreak, finishInlineBreak, canFinishInlineBreak, blocksInlineBreakRound } from '@/services/mockInlineBreak';
import { PlannedScheduleEditor } from '@/components/PlannedScheduleEditor';

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
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const score = [{ number: 1, sideAScore: 11, sideBScore: 7 }];
const phase = (type: 'SWISS' | 'KNOCKOUT', afterRound: number) => ({
  type, label: type === 'SWISS' ? 'Schweizer System' : 'K.-o.-Phase',
  entrantCount: type === 'SWISS' ? 4 : 8, groupCount: 2, swissRounds: 3,
  bestOf: 1, knockoutBestOf: [1,1,1],
  inlineBreakAfterRound: afterRound, inlineBreakKind: 'until' as const, inlineBreakUntil: '13:00', inlineBreakMinutes: 30,
});
function create(type: 'SWISS' | 'KNOCKOUT', afterRound = 2) {
  const count = type === 'SWISS' ? 4 : 8;
  return createMockTournament({
    name: 'Rundenpause', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 4, minimumMatches: 1, estimatedDurationMinutes: 200,
    participantNames: Array.from({length:count},(_,i)=>`Spieler ${i+1}`),
    phases: [phase(type,afterRound)],
  });
}

describe('Zwischenpause innerhalb einer Wettkampfphase', () => {
  it('plant die Pause nach Runde 2 ein, statt eine zusätzliche Wettkampfphase zu erstellen', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [{
      label: 'Schweizer System', type: 'SWISS', estimatedMinutes: 240, roundCount: 4,
      inlineBreakAfterRound: 2, inlineBreakKind: 'until', inlineBreakUntil: '13:00',
    }]);
    expect(timeline.items.map(row=>[row.title,row.at])).toEqual([
      ['Schweizer System','2026-11-01T10:00'],
      ['Pause nach Runde 2 · Schweizer System','2026-11-01T12:00'],
      ['Fortsetzung Runde 3 · Schweizer System','2026-11-01T13:00'],
    ]);
    expect(timeline.estimatedEnd).toBe('2026-11-01T15:00');
    expect(plannedTimelineDurationMinutes('2026-11-01T10:00',timeline.estimatedEnd)).toBe(300);
    expect(timeline.warnings).toEqual([]);
    expect(timeline.items[1]).toMatchObject({ durationMinutes: 60, durationApproximate: true });
    const markup=renderToStaticMarkup(createElement(PlannedScheduleEditor,{
      scheduledStart:'2026-11-01T10:00',timeline,awardsEnabled:false,awardsAt:timeline.estimatedEnd,
      onToggleAwards:()=>{},onAwardsAtChange:()=>{},
    }));
    expect(markup).toContain('Pause nach Runde 2 · Schweizer System');
    expect(markup).toContain('Fortsetzung Runde 3 · Schweizer System');
    expect(markup).toContain('ca. 1 Std.');
    expect(markup).not.toContain('Geplanter Pausenbeginn');
    expect(markup).toContain('Siegerehrung hinzufügen');
  });

  it('warnt, falls Pause bis vor dem voraussichtlichen Ende der zweiten Runde liegt', () => {
    const timeline=buildPlannedTimeline('2026-11-01T10:00',[{
      label:'Schweizer System',type:'SWISS',estimatedMinutes:240,roundCount:4,
      inlineBreakAfterRound:2,inlineBreakKind:'until',inlineBreakUntil:'11:00',
    }]);
    expect(timeline.warnings).toHaveLength(1);
    expect(timeline.warnings[0]).toMatchObject({phaseIndex:0});
    expect(timeline.warnings[0].message).toContain('12:00 Uhr');
    expect(timeline.items[1].durationMinutes).toBeUndefined();
    expect(timeline.estimatedEnd).toBe('2026-11-01T14:00');
  });

  it('speichert die Zwischenpause mit der Phase und übernimmt Änderungen vor Turnierstart', () => {
    const t=create('SWISS');
    const stored=getMockTournament(t.id);
    expect(stored.stages).toHaveLength(1);
    expect(stored.stages[0].settings).toMatchObject({
      inlineBreakAfterRound:2, inlineBreakKind:'until', inlineBreakUntil:'13:00',
    });
    const draft=initialPrestartPhases(stored);
    expect(draft[0].inlineBreakAfterRound).toBe(2);
    draft[0].inlineBreakUntil='14:15';
    expect(updatePrestartTournamentPhases(t.id,draft).ok).toBe(true);
    expect(getMockTournament(t.id).stages[0].settings.inlineBreakUntil).toBe('14:15');
  });

  it('hält nach freigegebener Schweizer Runde 2 die Paarungen für Runde 3 zurück', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026,10,1,12,30,0));
    const t=create('SWISS');
    const stage=t.stages[0];
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id,'RUNNING');
    for (let round=1;round<=2;round++) {
      const matches=getMockStageMatches(t,stage).filter(m=>m.round===`Runde ${round}`);
      expect(matches).toHaveLength(2);
      matches.forEach(m=>completeMockMatch(m.id,score));
      expect(approveMockProgress(t)?.kind).toBe('ROUND');
    }
    expect(getInlineBreakStatus(t,stage)?.state).toBe('ready');
    expect(getMockStageMatches(t,stage).some(m=>m.round==='Runde 3')).toBe(false);
    expect(startInlineBreak(t,stage)).toBe(true);
    expect(getInlineBreakStatus(t,stage)?.state).toBe('running');
    expect(canFinishInlineBreak(t,stage)).toBe(false);
    expect(finishInlineBreak(t,stage)).toBe(false);
    expect(finishInlineBreak(t,stage,true)).toBe(true);
    expect(getInlineBreakStatus(t,stage)?.state).toBe('completed');
    expect(getMockStageMatches(t,stage).filter(m=>m.round==='Runde 3')).toHaveLength(2);
  });

  it('blockiert spätere K.-o.-Runden bis zur Freigabe der Zwischenpause', () => {
    const t=create('KNOCKOUT',1);
    const stage=t.stages[0];
    expect(getInlineBreakConfig(stage)?.afterRound).toBe(1);
    expect(startFirstStage(t)).toBe(true);
    updateMockTournamentStatus(t.id,'RUNNING');
    const first=getMockStageMatches(t,stage).filter(m=>m.id.includes('-r1-m'));
    expect(first).toHaveLength(4);
    first.forEach(m=>completeMockMatch(m.id,score));
    const next=getMockStageMatches(t,stage).find(m=>m.id.includes('-r2-m'));
    expect(next).toBeDefined();
    expect(blocksInlineBreakRound(t,stage,next!.id)).toBe(true);
    expect(getMockAssignmentBlockReason(t,next!.id,'Tisch 1')).toContain('Zwischenpause');
    expect(getInlineBreakStatus(t,stage,getMockStageMatches(t,stage))?.state).toBe('ready');
    expect(startInlineBreak(t,stage,getMockStageMatches(t,stage))).toBe(true);
    expect(finishInlineBreak(t,stage,true)).toBe(true);
    expect(blocksInlineBreakRound(t,stage,next!.id)).toBe(false);
    expect(getMockAssignmentBlockReason(t,next!.id,'Tisch 1')).toBeNull();
  });
});
