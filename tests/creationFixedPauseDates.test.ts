import { describe, expect, it } from 'vitest';
import { anchorFixedPauseDates, clearInlinePauseOnTypeChange, type DateAnchoredPausePhase } from '@/domain/fixedPauseDates';
import { buildPlannedTimeline } from '@/domain/tournamentSchedule';

const phase = (patch: Partial<DateAnchoredPausePhase>): DateAnchoredPausePhase => ({
  type: 'SWISS', breakKind: 'minutes', breakUntilDate: '', inlineBreakAfterRound: 0,
  inlineBreakKind: 'minutes', inlineBreakUntilDate: '', ...patch,
});

describe('fixed pause dates are persisted rather than relative to a future forecast', () => {
  it('anchors a visible standalone pause date once and detects a later conflicting phase', () => {
    const phases = [phase({}), phase({ type: 'BREAK', breakKind: 'until' }), phase({type:'KNOCKOUT'})];
    const firstTimeline = buildPlannedTimeline('2030-11-20T09:00', [
      { type:'SWISS', label:'Vorrunde', estimatedMinutes: 60 },
      { type:'BREAK', label:'Mittagspause', estimatedMinutes: 0, breakKind:'until', breakUntil:'12:00' },
      { type:'KNOCKOUT', label:'Finale', estimatedMinutes: 30 },
    ]);
    const fixed = anchorFixedPauseDates(phases, firstTimeline);
    expect(fixed[1].breakUntilDate).toBe('2030-11-20');
    const updated = buildPlannedTimeline('2030-11-21T09:00', [
      { type:'SWISS', label:'Vorrunde', estimatedMinutes: 60 },
      { type:'BREAK', label:'Mittagspause', estimatedMinutes: 0,
        breakKind:'until', breakUntil:'12:00', breakUntilDate:fixed[1].breakUntilDate },
      { type:'KNOCKOUT', label:'Finale', estimatedMinutes: 30 },
    ]);
    expect(anchorFixedPauseDates(fixed, updated)).toBe(fixed);
    expect(updated.warnings).toHaveLength(1);
    expect(updated.warnings[0].message).toContain('2030-11-20');
  });
  it('anchors an inline pause and resets all stale settings on a type switch', () => {
    const inputs = [phase({ inlineBreakAfterRound: 2, inlineBreakKind: 'until' })];
    const schedule = buildPlannedTimeline('2030-11-20T09:00', [
      { type:'SWISS', label:'Schweizer System', estimatedMinutes: 120,
        roundCount:4, inlineBreakAfterRound:2, inlineBreakKind:'until', inlineBreakUntil:'12:00' },
    ]);
    const fixed = anchorFixedPauseDates(inputs, schedule);
    expect(fixed[0].inlineBreakUntilDate).toBe('2030-11-20');
    const cleared = clearInlinePauseOnTypeChange({ ...fixed[0], inlineBreakUntil:'12:00', inlineBreakMinutes:100 });
    expect(cleared).toMatchObject({
      inlineBreakAfterRound:0, inlineBreakKind:'minutes', inlineBreakMinutes:15,
      inlineBreakUntil:'13:00', inlineBreakUntilDate:'',
    });
  });
});
