import { describe, expect, it } from 'vitest';
import {
  earliestLinkedEnd, finalPlayingDayStart, initialEarlierDaysMinutes,
  linkedDuration, linkedDurationAt, linkedEndDateTime, linkedEndTime, rebalanceEarlierDays, maximumLinkedDuration,
  maximumLinkedActiveDuration,
} from '@/domain/linkedCreationTime';

describe('linked preferred duration and end time', () => {
  it('converts single-day targets both ways, minute for minute', () => {
    const settings = { scheduledStart: '2030-11-21T09:00', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(210, settings)).toBe('12:30');
    expect(linkedEndTime(211, settings)).toBe('12:31');
    expect(linkedDuration('16:00', settings)).toBe(420);
    expect(linkedEndTime(linkedDuration('16:00', settings)!, settings)).toBe('16:00');
    expect(earliestLinkedEnd(settings)).toBe('09:15');
    expect(maximumLinkedDuration(settings)).toBe(1440);
    expect(linkedEndTime(900, settings)).toBe('00:00');
    expect(linkedEndDateTime(900, settings)).toBe('2030-11-22T00:00');
    expect(linkedDuration('08:30', settings)).toBeNull();
  });

  it('keeps earlier playing-day active time fixed while editing the last day', () => {
    const earlier = initialEarlierDaysMinutes(210, 2);
    const settings = { scheduledStart: '2030-11-21T09:00', days: 2, earlierDaysMinutes: earlier };
    expect(earlier).toBe(105);
    expect(finalPlayingDayStart(settings)).toBe('2030-11-22T09:00');
    expect(linkedEndTime(210, settings)).toBe('10:45');
    expect(linkedEndTime(211, settings)).toBe('10:46');
    expect(linkedDuration('16:30', settings)).toBe(555);
    expect(linkedEndTime(linkedDuration('16:30', settings)!, settings)).toBe('16:30');
    expect(rebalanceEarlierDays(211, settings)).toBe(earlier);
  });

  it('reallocates exceptionally long durations across previous playing days', () => {
    const settings = { scheduledStart: '2030-11-21T09:00', days: 2, earlierDaysMinutes: 105 };
    expect(maximumLinkedActiveDuration(settings)).toBe(1798);
    const earlier = rebalanceEarlierDays(1200, settings);
    expect(earlier).toBe(301);
    const adjusted = { ...settings, earlierDaysMinutes: earlier };
    expect(linkedEndTime(1200, adjusted)).toBe('23:59');
    expect(linkedDuration('23:59', adjusted)).toBe(1200);
    expect(maximumLinkedActiveDuration({ ...settings, days: 3 })).toBe(2697);
  });

  it('respects Berlin DST when deriving the end clock from actual elapsed minutes', () => {
    const settings = { scheduledStart: '2027-03-28T01:30', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(60, settings)).toBe('03:30');
    expect(linkedDuration('03:30', settings)).toBe(60);
    expect(linkedDuration('02:30', settings)).toBeNull();
  });

  it('allows next-day 01:00 and 24 hours exactly, but never 24 hours plus a minute', () => {
    const settings = { scheduledStart: '2030-11-21T20:00', days: 1, earlierDaysMinutes: 0 };
    expect(linkedDurationAt('2030-11-22T01:00', settings)).toBe(300);
    expect(linkedEndDateTime(300, settings)).toBe('2030-11-22T01:00');
    expect(linkedDuration('01:00', settings, true)).toBe(300);
    expect(linkedDuration('01:00', settings)).toBeNull();
    expect(linkedEndDateTime(1440, settings)).toBe('2030-11-22T20:00');
    expect(linkedDurationAt('2030-11-22T20:00', settings)).toBe(1440);
    expect(linkedDurationAt('2030-11-22T20:01', settings)).toBeNull();
    expect(linkedEndDateTime(1441, settings)).toBeNull();
  });

  it('keeps an absolute end fixed while its corresponding duration decreases as the start advances', () => {
    const original = { scheduledStart: '2030-11-21T20:00', days: 1, earlierDaysMinutes: 0 };
    const nextMinute = { ...original, scheduledStart: '2030-11-21T20:01' };
    const end = linkedEndDateTime(300, original)!;
    expect(end).toBe('2030-11-22T01:00');
    expect(linkedDurationAt(end, nextMinute)).toBe(299);
    expect(linkedEndDateTime(300, nextMinute)).toBe('2030-11-22T01:01');
  });

  it('allows a late start crossing midnight and rejects invalid input', () => {
    const late = { scheduledStart: '2030-11-21T23:50', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(15, late)).toBe('00:05');
    expect(linkedDuration('23:59', late)).toBeNull();
    expect(linkedEndTime(210, { ...late, scheduledStart: 'bad' })).toBeNull();
  });
});
