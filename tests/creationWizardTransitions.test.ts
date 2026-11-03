import { describe, expect, it } from 'vitest';
import { convertToSingleDay, countConfiguredDayTransitions, countCreationScheduleEntries, reconcileRoundDependentBreaks } from '@/domain/creationPlanTransitions';
import { invalidParticipantRosterIndices } from '@/domain/participantNames';
import { suggestDaySplit, validPlayingDayBreaks } from '@/domain/playingDays';

const phase = (rounds = 5) => ({
  type: 'SWISS' as const, entrantCount: 8, groupCount: 2, swissRounds: rounds,
  inlineBreakAfterRound: 4, breakKind: 'minutes',
  dayBreaks: [
    { afterRound: 2, date: '2030-11-02', time: '09:00' },
    { afterRound: 4, date: '2030-11-03', time: '09:00' },
  ],
});

describe('creation wizard transitions', () => {
  it('removes overnight transitions but preserves ordinary pauses', () => {
    const phases = [phase(), { ...phase(), type: 'BREAK' as const, breakKind: 'minutes', dayBreaks: [], inlineBreakAfterRound: 0 },
      { ...phase(), type: 'BREAK' as const, breakKind: 'overnight', dayBreaks: [], inlineBreakAfterRound: 0 }];
    expect(countConfiguredDayTransitions(phases)).toBe(3);
    const single = convertToSingleDay(phases);
    expect(single).toHaveLength(2);
    expect(single[0].dayBreaks).toEqual([]);
    expect(single[1].breakKind).toBe('minutes');
  });

  it('removes breaks beyond a reduced round count and sorts the rest', () => {
    const result = reconcileRoundDependentBreaks(phase(3));
    expect(result.impact).toEqual({ removedDayBreaks: 1, removedInlineBreak: true });
    expect(result.phase.dayBreaks.map((x) => x.afterRound)).toEqual([2]);
    expect(result.phase.inlineBreakAfterRound).toBe(0);
    const reversed = reconcileRoundDependentBreaks({ ...phase(), inlineBreakAfterRound: 3, dayBreaks: [...phase().dayBreaks].reverse() });
    expect(reversed.phase.dayBreaks.map((x) => x.afterRound)).toEqual([2, 4]);
  });

  it('rejects chronologically inverted playing days', () => {
    expect(validPlayingDayBreaks([
      { afterRound: 4, date: '2030-11-02', time: '09:00' },
      { afterRound: 2, date: '2030-11-03', time: '09:00' },
    ], 5)).toBe(false);
  });

  it('accounts for extra break and resume entries', () => {
    expect(countCreationScheduleEntries([phase()])).toBe(7);
    expect(countCreationScheduleEntries([phase()], true)).toBe(8);
    expect(countCreationScheduleEntries([{ ...phase(), dayBreaks: [], inlineBreakAfterRound: 0 }])).toBe(1);
  });

  it('identifies non-feasible multi-day suggestions', () => {
    expect(suggestDaySplit([{ type: 'SWISS', entrantCount: 4, swissRounds: 3 }], 5).possible).toBe(false);
  });

  it('retains the first valid duplicate when cleaning a roster', () => {
    const person = (firstName: string, lastName: string) =>
      ({ firstName, lastName, partnerFirstName: '', partnerLastName: '' });
    const participants = [person('Ada', 'Lovelace'), person('Ada', 'Lovelace'), person('Grace', 'Hopper')];
    expect([...invalidParticipantRosterIndices(participants, 'SINGLES')]).toEqual([1]);
    const clean = participants.filter((_, i) => i !== 1);
    expect(invalidParticipantRosterIndices(clean, 'SINGLES').size).toBe(0);
    expect(invalidParticipantRosterIndices([...clean, participants[1]], 'SINGLES').size).toBe(1);
  });
});
