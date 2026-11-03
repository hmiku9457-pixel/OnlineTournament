import { describe, expect, it } from 'vitest';
import {
  earliestLinkedEnd, finalPlayingDayStart, initialEarlierDaysMinutes,
  linkedDuration, linkedEndTime, rebalanceEarlierDays, maximumLinkedDuration,
} from '@/domain/linkedCreationTime';

describe('linked preferred duration and end time', () => {
  it('converts single-day targets both ways, minute for minute', () => {
    const settings = { scheduledStart: '2030-11-21T09:00', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(210, settings)).toBe('12:30');
    expect(linkedEndTime(211, settings)).toBe('12:31');
    expect(linkedDuration('16:00', settings)).toBe(420);
    expect(linkedEndTime(linkedDuration('16:00', settings)!, settings)).toBe('16:00');
    expect(earliestLinkedEnd(settings)).toBe('09:15');
    expect(maximumLinkedDuration(settings)).toBe(899);
    expect(linkedEndTime(900, settings)).toBeNull();
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

  it('respects Berlin DST when deriving the end clock from actual elapsed minutes', () => {
    const settings = { scheduledStart: '2027-03-28T01:30', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(60, settings)).toBe('03:30');
    expect(linkedDuration('03:30', settings)).toBe(60);
    expect(linkedDuration('02:30', settings)).toBeNull();
  });

  it('refuses an end that crosses midnight and an invalid start', () => {
    const late = { scheduledStart: '2030-11-21T23:50', days: 1, earlierDaysMinutes: 0 };
    expect(linkedEndTime(15, late)).toBeNull();
    expect(linkedDuration('23:59', late)).toBeNull();
    expect(linkedEndTime(210, { ...late, scheduledStart: 'bad' })).toBeNull();
  });
});
