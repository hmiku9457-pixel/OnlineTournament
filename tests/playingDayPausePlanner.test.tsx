import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayingDayPausePlanner } from '@/components/PlayingDayPausePlanner';
import { buildPlannedTimeline, plannedActiveBreakMinutes } from '@/domain/tournamentSchedule';
import { countCreationScheduleEntries, reconcileRoundDependentBreaks } from '@/domain/creationPlanTransitions';
import { validPlayingRoundPauses, type PlayingRoundPause } from '@/domain/playingDays';
import { createMockTournament } from '@/services/mockTournamentStore';
import { getInlineBreakConfigs } from '@/services/mockInlineBreak';

const boundaries = [
  { afterRound: 2, date: '2031-11-21', time: '09:00' },
  { afterRound: 4, date: '2031-11-22', time: '09:00' },
];
const pauses: PlayingRoundPause[] = [
  { afterRound: 1, kind: 'minutes', minutes: 15, until: '12:00', untilDate: '' },
  { afterRound: 3, kind: 'minutes', minutes: 20, until: '12:00', untilDate: '' },
];
const phase = {
  type: 'SWISS' as const, label: 'Vorrunde', entrantCount: 8,
  groupCount: 2, swissRounds: 6, bestOf: 1, knockoutBestOf: [] as number[],
  dayBreaks: boundaries, inlineBreakAfterRound: 0, extraInlineBreaks: pauses,
};

describe('Spieltage und Zwischenpausen in einer Phase', () => {
  it('zeigt Spieltag 1, den automatisch folgenden Spieltag und je eigene Zwischenpausen', () => {
    const timeline = buildPlannedTimeline('2031-11-20T10:00', [{
      type: 'SWISS', label: 'Vorrunde', estimatedMinutes: 180, roundCount: 6,
      dayBreaks: boundaries, extraInlineBreaks: pauses,
    }]);
    const markup = renderToStaticMarkup(createElement(PlayingDayPausePlanner, {
      phaseId: 'test', phaseIndex: 0, roundCount: 6, scheduledStart: '2031-11-20T10:00',
      phaseStart: '2031-11-20T10:00', dayBreaks: boundaries,
      pauses: pauses.map((pause, index) => ({ ...pause, index, source: 'extra' as const })),
      timeline, maximumDaysReached: false, maximumScheduleReached: false,
      onDayEndChange: () => {}, onDayRemove: () => {}, onDayChange: () => {},
      onAddPause: () => {}, onPauseChange: () => {}, onPauseRemove: () => {},
    }));
    expect(markup).toContain('Spieltag 1');
    expect(markup).toContain('Spieltag 2');
    expect(markup).toContain('Spieltag 3');
    expect(markup).toContain('Beginnt am');
    expect(markup).toContain('Bis Runde');
    expect(markup.match(/Zwischenpause einfügen/g)).toHaveLength(3);
    expect(markup.match(/Zwischenpause<\/strong>/g)).toHaveLength(2);
    expect(markup).toContain('Bis Datum/Uhrzeit');
    expect(markup).toContain('day-end-round-test-0');
  });

  it('berechnet zwei Pausen und zwei Spieltagswechsel chronologisch', () => {
    const timeline = buildPlannedTimeline('2031-11-20T10:00', [{
      type: 'SWISS', label: 'Vorrunde', estimatedMinutes: 180, roundCount: 6,
      dayBreaks: boundaries, extraInlineBreaks: pauses,
    }]);
    expect(timeline.warnings).toEqual([]);
    expect(timeline.items.find((item) => item.id === 'inline-break-1-1')?.at).toBe('2031-11-20T10:30');
    expect(timeline.items.find((item) => item.id === 'day-break-1-2')?.at).toBe('2031-11-20T11:15');
    expect(timeline.items.find((item) => item.id === 'inline-break-1-3')?.at).toBe('2031-11-21T09:30');
    expect(timeline.items.find((item) => item.id === 'day-break-1-4')?.at).toBe('2031-11-21T10:20');
    expect(timeline.estimatedEnd).toBe('2031-11-22T10:00');
    expect(plannedActiveBreakMinutes(timeline)).toBe(35);
    expect(countCreationScheduleEntries([phase])).toBe(9);
  });

  it('erkennt doppelt belegte Rundengrenzen und entfernt ungültige Pausen bei einer Rundenkürzung', () => {
    expect(validPlayingRoundPauses(pauses, 6, [2, 4])).toBe(true);
    expect(validPlayingRoundPauses(pauses, 6, [1])).toBe(false);
    expect(validPlayingRoundPauses([pauses[0], { ...pauses[1], afterRound: 1 }], 6)).toBe(false);
    const result = reconcileRoundDependentBreaks({ ...phase, swissRounds: 3 });
    expect(result.phase.dayBreaks.map((item) => item.afterRound)).toEqual([2]);
    expect(result.phase.extraInlineBreaks?.map((item) => item.afterRound)).toEqual([1]);
  });

  it('speichert mehrere separate Pausen für die spätere Turnierleitung', () => {
    const tournament = createMockTournament({
      name: 'Mehrtagestest', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 4, minimumMatches: 1, estimatedDurationMinutes: 215,
      scheduledStart: '2031-11-20T10:00',
      tournamentMode: 'multi', plannedDays: 3,
      participantNames: Array.from({ length: 8 }, (_, index) => `Spieler ${index + 1}`),
      phases: [{ ...phase, breakKind: 'minutes', breakMinutes: 15 }],
    });
    expect(getInlineBreakConfigs(tournament.stages[0]).map(({ afterRound, kind }) => [afterRound, kind]))
      .toEqual([[1, 'minutes'], [2, 'overnight'], [3, 'minutes'], [4, 'overnight']]);
  });
});
