import { describe, expect, it } from 'vitest';
import { availableDayBreakRounds, convertToSingleDay, countConfiguredDayTransitions, countCreationScheduleEntries, reconcileRoundDependentBreaks, phaseBreakLosses, earliestRoundContinuationDate, proposePlayingDayInsertion, proposePlayingDayMove } from '@/domain/creationPlanTransitions';
import { assessRecommendationTime, creationPlanScheduleSignature, distributePlayingDays, type DayDistributionPhase } from '@/domain/creationPlanRecommendations';
import type { FormatRecommendation } from '@/engine/recommendations';
import { invalidParticipantRosterIndices } from '@/domain/participantNames';
import { suggestDaySplit, validPlayingDayBreaks } from '@/domain/playingDays';
import { validateTournamentCreation } from '@/domain/validateTournamentCreation';

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

  it('preserves names and notes when overnight phases become standard breaks', () => {
    const phases = [
      { ...phase(), id: 'a', label: 'Vorrunde', note: '' },
      { ...phase(), id: 'break', label: 'Abendprogramm', note: 'Gemeinsames Essen',
        type: 'BREAK' as const, breakKind: 'overnight', breakMinutes: 30, dayBreaks: [], inlineBreakAfterRound: 0 },
    ];
    const converted = convertToSingleDay(phases, 'convert');
    expect(converted).toHaveLength(2);
    expect(converted[1]).toMatchObject({
      label: 'Abendprogramm', note: 'Gemeinsames Essen', type: 'BREAK', breakKind: 'minutes', breakMinutes: 15,
    });
    expect(countConfiguredDayTransitions(converted)).toBe(0);
  });

  it('identifies dependent losses in later phases rather than just the phase edited', () => {
    const before = [
      { ...phase(), id: 'a', label: 'Vorrunde' },
      { ...phase(), id: 'b', label: 'Endrunde' },
    ];
    const after = [
      before[0],
      { ...phase(3), id: 'b', label: 'Endrunde', dayBreaks: [before[1].dayBreaks[0]], inlineBreakAfterRound: 0 },
    ];
    expect(phaseBreakLosses(before, after)).toEqual([
      { id: 'b', label: 'Endrunde', removedRounds: [4], removedInlineBreak: true },
    ]);
  });

  it('inserts an early playing day in order and offers affected date shifts', () => {
    const current = [{ afterRound: 4, date: '2030-11-11', time: '09:00' }];
    const insertion = proposePlayingDayInsertion(current, 1, '2030-11-10');
    expect(insertion.dayBreaks).toEqual([
      { afterRound: 1, date: '2030-11-11', time: '09:00' },
      { afterRound: 4, date: '2030-11-12', time: '09:00' },
    ]);
    expect(insertion.shifted).toEqual([
      { afterRound: 4, previousDate: '2030-11-11', nextDate: '2030-11-12' },
    ]);
    const later = proposePlayingDayInsertion(current, 5, '2030-11-10');
    expect(later.shifted).toHaveLength(0);
    expect(later.dayBreaks[1].date).toBe('2030-11-12');
  });

  it('moves existing day breaks chronologically and reports rescheduled following dates', () => {
    const breaks = [
      { afterRound: 2, date: '2030-11-11', time: '09:00' },
      { afterRound: 4, date: '2030-11-12', time: '09:00' },
    ];
    const moved = proposePlayingDayMove(breaks, 4, 1, '2030-11-10');
    expect(moved.dayBreaks).toEqual([
      { afterRound: 1, date: '2030-11-12', time: '09:00' },
      { afterRound: 2, date: '2030-11-13', time: '09:00' },
    ]);
    expect(moved.shifted).toEqual([
      { afterRound: 2, previousDate: '2030-11-11', nextDate: '2030-11-13' },
    ]);
    expect(availableDayBreakRounds(2, [], 1)).toEqual([]);
    expect(availableDayBreakRounds(4, breaks.slice(0, 1), 1)).toEqual([3]);
    expect(validPlayingDayBreaks(moved.dayBreaks, 5)).toBe(true);
  });

  it('distributes existing phases without losing participant, best-of or break notes', () => {
    const make = (type: DayDistributionPhase['type'], label: string, entrants: number): DayDistributionPhase => ({
      type, label, entrantCount: entrants, bestOf: 5, groupCount: 2,
      swissRounds: 2, knockoutBestOf: [5],
      dayBreaks: [], breakKind: 'minutes', breakMinutes: 30,
      nextDayStart: '09:00', nextDayDate: '', breakUntil: '12:00',
      breakUntilDate: '', inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
      inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
    });
    const stages = [make('ROUND_ROBIN', 'Vorrunde', 2),
      { ...make('BREAK', 'Mittagspause', 2), note: 'Treffen im Foyer' },
      make('KNOCKOUT', 'Finale', 2)];
    const distribution = distributePlayingDays(stages, 2, '2030-11-10', 2,
      { minutesPerSet: 15 }, (entrants) => make('BREAK', 'Spieltagsende', entrants));
    expect(distribution.possible).toBe(true);
    expect(distribution.phases).toHaveLength(3);
    expect(distribution.phases[1]).toMatchObject({
      label: 'Mittagspause', note: 'Treffen im Foyer',
      breakKind: 'overnight', nextDayDate: '2030-11-11',
    });
    expect(distribution.phases[0].bestOf).toBe(5);
    expect(distribution.phases[2].knockoutBestOf).toEqual([5]);
    expect(distribution.convertedExistingBreaks).toBe(1);
    expect(distribution.insertedOvernightBreaks).toBe(0);
  });

  it('checks actual daily duration before offering a multi-day recommendation', () => {
    const recommendation: FormatRecommendation = {
      id: 'round-robin', label: 'Jeder gegen jeden', description: '',
      estimatedMatches: 6, estimatedDurationMinutes: 90,
      minimumGuaranteedMatches: 3, score: 1, requiredSystems: ['round-robin'],
      phases: [{ key: 'rr', label: 'Jeder gegen jeden', type: 'ROUND_ROBIN',
        defaultBestOf: 1, entrantCount: 4 }],
    };
    const common = { start: '2030-11-10T09:00', days: 2, participants: 4,
      tableCount: 2, bestOfFor: () => 1 };
    expect(assessRecommendationTime(recommendation, {
      ...common, timing: { matchDurationMinutes: 15, venueTurnoverMinutes: 0 },
    }).feasible).toBe(true);
    const overrun = assessRecommendationTime(recommendation, {
      ...common, tableCount: 1, timing: { matchDurationMinutes: 600, venueTurnoverMinutes: 0 },
    });
    expect(overrun.daySplitPossible).toBe(true);
    expect(overrun.feasible).toBe(false);
    expect(overrun.reason).toMatch(/Mitternacht|Spieltagswechsel|Fortsetzung/);
  });

  it('avoids a configured Swiss inline pause when distributing days', () => {
    const swiss: DayDistributionPhase = {
      type: 'SWISS', label: 'Schweizer Runde', entrantCount: 8, bestOf: 3,
      groupCount: 2, swissRounds: 4, knockoutBestOf: [],
      dayBreaks: [], inlineBreakAfterRound: 2, inlineBreakKind: 'minutes',
      inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
      breakKind: 'minutes', breakMinutes: 15, breakUntil: '12:00', breakUntilDate: '',
      nextDayDate: '', nextDayStart: '09:00',
    };
    const result = distributePlayingDays([swiss], 2, '2030-11-10', 4,
      { minutesPerSet: 15 }, (entrants) => ({ ...swiss, type: 'BREAK', entrantCount: entrants }));
    expect(result.possible).toBe(true);
    expect(result.phases[0].dayBreaks).toHaveLength(1);
    expect(result.phases[0].dayBreaks[0].afterRound).not.toBe(2);
  });

  it('searches alternative round cutoffs instead of rejecting a feasible late-start plan', () => {
    const swiss: DayDistributionPhase = {
      type: 'SWISS', label: 'Späte Schweizer Runde', entrantCount: 8, bestOf: 1,
      groupCount: 2, swissRounds: 6, knockoutBestOf: [], dayBreaks: [],
      inlineBreakAfterRound: 0, inlineBreakKind: 'minutes', inlineBreakMinutes: 15,
      inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
      breakKind: 'minutes', breakMinutes: 15, breakUntil: '12:00',
      breakUntilDate: '', nextDayStart: '09:00', nextDayDate: '',
    };
    const result = distributePlayingDays([swiss], 2, '2030-11-10', 4,
      { matchDurationMinutes: 120, venueTurnoverMinutes: 0 },
      (entrants) => ({ ...swiss, type: 'BREAK', entrantCount: entrants }),
      { scheduledStart: '2030-11-10T19:00' });
    expect(result.possible).toBe(true);
    expect(result.phases[0].dayBreaks).toEqual([
      { afterRound: 2, date: '2030-11-11', time: '09:00' },
    ]);
  });

  it('reports conversion of fixed clock pauses before accepting an automatic split', () => {
    const base: DayDistributionPhase = {
      type: 'ROUND_ROBIN', label: 'Vorrunde', entrantCount: 2, bestOf: 3,
      groupCount: 2, swissRounds: 2, knockoutBestOf: [],
      dayBreaks: [], inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
      inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
      breakKind: 'minutes', breakMinutes: 15, breakUntil: '12:00', breakUntilDate: '',
      nextDayDate: '', nextDayStart: '09:00',
    };
    const stages = [
      { ...base, id: 'first', label: 'Vorrunde' },
      { ...base, id: 'pause', type: 'BREAK' as const, label: 'Essen',
        breakKind: 'until' as const, breakUntil: '13:00', breakUntilDate: '2030-11-10',
        note: 'Verpflegung im Vereinsheim' },
      { ...base, id: 'last', type: 'KNOCKOUT' as const, label: 'Finale', knockoutBestOf: [3] },
    ];
    const result = distributePlayingDays(stages, 2, '2030-11-10', 2,
      { minutesPerSet: 15 }, (entrants) => ({ ...base, id: 'new', type: 'BREAK',
        entrantCount: entrants }), { scheduledStart: '2030-11-10T09:00' });
    expect(result.possible).toBe(true);
    expect(result.phases[1]).toMatchObject({
      id: 'pause', label: 'Essen', note: 'Verpflegung im Vereinsheim',
      breakKind: 'overnight',
    });
    expect(result.changes?.join(' ')).toContain('Pause bis 2030-11-10 13:00');
  });

  it('detects lost individual KO settings before reducing entrants', () => {
    const original = {
      ...phase(4), id: 'ko', label: 'Finale', type: 'KNOCKOUT' as const,
      entrantCount: 16, knockoutBestOf: [1, 3, 5, 7],
      dayBreaks: [], inlineBreakAfterRound: 0,
    };
    const after = { ...original, entrantCount: 8, knockoutBestOf: [3, 5, 7] };
    expect(phaseBreakLosses([original], [after])).toMatchObject([
      { id: 'ko', removedKnockoutBestOf: [1] },
    ]);
  });

  it('uses predicted round finish to avoid an already elapsed continuation date', () => {
    const proposed = [{
      type: 'SWISS', label: 'Späte Runde', estimatedMinutes: 240,
      roundCount: 2, dayBreaks: [], inlineBreakAfterRound: 0,
    }];
    expect(earliestRoundContinuationDate('2030-11-10T23:30', proposed, 0, 1))
      .toBe('2030-11-12');
  });

  it('checks one-day recommendations and separates structure from schedule agreement', () => {
    const rec: FormatRecommendation = {
      id: 'rr', label: 'Jeder gegen jeden', description: '',
      estimatedMatches: 6, estimatedDurationMinutes: 90,
      minimumGuaranteedMatches: 3, score: 1, requiredSystems: ['round-robin'],
      phases: [{ key: 'rr', label: 'Jeder gegen jeden',
        type: 'ROUND_ROBIN', defaultBestOf: 1, entrantCount: 4 }],
    };
    const assessment = assessRecommendationTime(rec, {
      start: '2030-11-10T23:00', days: 1, participants: 4, tableCount: 1,
      timing: { matchDurationMinutes: 60 }, bestOfFor: () => 1,
    });
    expect(assessment.feasible).toBe(false);
    const base: DayDistributionPhase = {
      type: 'SWISS', label: 'Schweizer Runde', entrantCount: 8,
      groupCount: 2, swissRounds: 5, bestOf: 3, knockoutBestOf: [],
      dayBreaks: [], inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
      inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
      breakKind: 'minutes', breakMinutes: 15, breakUntil: '12:00', breakUntilDate: '',
      nextDayDate: '', nextDayStart: '09:00',
    };
    const old = creationPlanScheduleSignature([base]);
    const changed = creationPlanScheduleSignature([{ ...base, dayBreaks: [{ afterRound: 1,
      date: '2030-11-11', time: '09:00' }] }]);
    expect(old).not.toBe(changed);
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

  it('blocks an oversized generated schedule before creation', () => {
    const phases = Array.from({ length: 20 }, (_, i) => ({
      type: 'SWISS' as const, label: `Schweizer ${i + 1}`, entrantCount: 8, groupCount: 2,
      swissRounds: 5, bestOf: 3, knockoutBestOf: [],
      inlineBreakAfterRound: 2, inlineBreakKind: 'minutes' as const, inlineBreakMinutes: 15,
      dayBreaks: [{ afterRound: 4, date: '2030-11-02', time: '09:00' }],
    }));
    const errors = validateTournamentCreation({
      name: 'Vereinsturnier', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 4, minimumMatches: 2,
      participantNames: Array.from({ length: 8 }, (_, i) => `Spieler ${i + 1}`),
      phases,
    });
    expect(errors.join(' ')).toContain('mehr als 80 Zeitplaneinträge');
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
