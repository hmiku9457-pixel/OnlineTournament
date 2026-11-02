import { describe, expect, it } from 'vitest';
import { configuredPlayingDays, followingPlayingDate, parseSavedPlayingDayBreaks,
  playingRounds, suggestDaySplit, validPlayingDayBreaks } from '@/domain/playingDays';
import { buildPlannedTimeline, plannedActiveBreakMinutes, playingDayOverflowWarnings } from '@/domain/tournamentSchedule';

describe('explicit playing-day planning', () => {
  it('defines real round boundaries for every supported competition system', () => {
    expect(playingRounds({ type: 'ROUND_ROBIN', entrantCount: 20 })).toBe(19);
    expect(playingRounds({ type: 'ROUND_ROBIN', entrantCount: 7 })).toBe(7);
    expect(playingRounds({ type: 'GROUPS', entrantCount: 20, groupCount: 4 })).toBe(5);
    expect(playingRounds({ type: 'GROUPS', entrantCount: 16, groupCount: 4 })).toBe(3);
    expect(playingRounds({ type: 'SWISS', entrantCount: 10, swissRounds: 4 })).toBe(4);
    expect(playingRounds({ type: 'KNOCKOUT', entrantCount: 13 })).toBe(4);
  });

  it('splits at whole-round or phase boundaries without inventing impossible days', () => {
    const phases = [{type: 'GROUPS' as const, entrantCount: 20, groupCount: 4, estimatedMinutes: 150},
      {type: 'SWISS' as const, entrantCount: 8, swissRounds: 4, estimatedMinutes: 120},
      {type: 'KNOCKOUT' as const, entrantCount: 4, estimatedMinutes: 60}];
    const split = suggestDaySplit(phases, 3);
    expect(split.possible).toBe(true);
    expect(split.betweenPhases.length + split.insidePhases.length).toBe(2);
    expect(split.insidePhases.every((item) => item.afterRound < playingRounds(phases[item.phaseIndex]))).toBe(true);
    expect(suggestDaySplit([{type:'KNOCKOUT', entrantCount:2}],3).possible).toBe(false);
    expect(suggestDaySplit(phases,1)).toEqual({betweenPhases:[],insidePhases:[],possible:true});
  });

  it('preserves calendar days independently from active playing hours', () => {
    expect(followingPlayingDate('2030-12-31',2)).toBe('2031-01-02');
    const phases = [{ type:'SWISS', dayBreaks: [
      {afterRound:1,date:'2031-11-21',time:'09:00'},
      {afterRound:3,date:'2031-11-23',time:'09:00'},
    ] }];
    expect(configuredPlayingDays(phases)).toBe(3);
    const timeline = buildPlannedTimeline('2031-11-20T10:00', [{
      type: 'SWISS', label:'Schweizer System', estimatedMinutes:120, roundCount:4,
      dayBreaks: phases[0].dayBreaks,
    }]);
    expect(timeline.warnings).toEqual([]);
    expect(timeline.items.filter(x=>x.breakKind === 'overnight')).toHaveLength(2);
    expect(timeline.items.find(x=>x.id === 'day-break-1-1')?.at).toBe('2031-11-20T10:30');
    expect(timeline.items.find(x=>x.id === 'day-resume-1-3')?.at).toBe('2031-11-23T09:00');
    expect(timeline.estimatedEnd).toBe('2031-11-23T09:30');
    expect(plannedActiveBreakMinutes(timeline)).toBe(0);
    expect(playingDayOverflowWarnings(timeline)).toEqual([]);
  });

  it('rejects invalid dates, duplicated round markers and implicit midnight overflow', () => {
    const marker = { afterRound:2, date:'2031-11-21', time:'09:00' };
    expect(validPlayingDayBreaks([marker],4)).toBe(true);
    expect(validPlayingDayBreaks([marker,marker],4)).toBe(false);
    expect(validPlayingDayBreaks([{...marker,afterRound:4}],4)).toBe(false);
    expect(parseSavedPlayingDayBreaks(JSON.stringify([marker]))).toEqual([marker]);
    expect(parseSavedPlayingDayBreaks('{broken')).toEqual([]);
    const spill = buildPlannedTimeline('2031-11-20T23:00', [
      { type:'GROUPS', label:'Gruppen', estimatedMinutes:120 },
    ]);
    expect(playingDayOverflowWarnings(spill).join(' ')).toContain('Mitternacht');
    const impossible = buildPlannedTimeline('2031-11-20T23:40', [{
      type:'SWISS', label:'Schweizer System', estimatedMinutes:120, roundCount:4,
      dayBreaks:[{afterRound:1,date:'2031-11-22',time:'09:00'}],
    }]);
    expect(impossible.warnings).toEqual([]);
    expect(playingDayOverflowWarnings(impossible).join(' ')).toContain('Mitternacht');
  });
});
