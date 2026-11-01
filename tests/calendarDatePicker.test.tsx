import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CalendarDatePicker, calendarMonthDays, nextCalendarDate, parseCalendarDate, toCalendarDate,
} from '@/components/CalendarDatePicker';

describe('calendar date picker', () => {
  it('validates actual calendar days, including leap years', () => {
    expect(parseCalendarDate('2028-02-29')).not.toBeNull();
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('2026-11-31')).toBeNull();
    expect(parseCalendarDate('01.11.2026')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
  });

  it('advances calendar days across month, year and daylight-saving changes', () => {
    expect(nextCalendarDate('2026-10-31')).toBe('2026-11-01');
    expect(nextCalendarDate('2026-12-31')).toBe('2027-01-01');
    expect(nextCalendarDate('2028-02-28')).toBe('2028-02-29');
    expect(nextCalendarDate('2028-02-29')).toBe('2028-03-01');
    expect(nextCalendarDate('invalid')).toBe('');
    expect(toCalendarDate(parseCalendarDate('2027-04-03')!)).toBe('2027-04-03');
  });

  it('aligns months to Monday-first weeks', () => {
    const november = calendarMonthDays(2026, 10);
    expect(november.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(november[6]).toBe(1);
    expect(november.at(-1)).toBe(30);
    expect(calendarMonthDays(2028, 1).filter((day) => day !== null)).toHaveLength(29);
  });

  it('accepts the current day as the lower bound', () => {
    const markup = renderToStaticMarkup(createElement(CalendarDatePicker, {
      id: 'event', value: '2030-11-21', minDate: '2030-11-21', onChange: () => {},
    }));
    expect(markup).toContain('21.11.2030');
    expect(markup).not.toContain('calendar-picker-dialog');
  });

  it('renders a reusable dialog trigger with German date text and required metadata', () => {
    const markup = renderToStaticMarkup(createElement(CalendarDatePicker, {
      id: 'tournament-date', value: '2026-11-01', required: true, label: 'Turnierdatum', onChange: () => {},
    }));
    expect(markup).toContain('01.11.2026');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-required="true"');
    expect(markup).toContain('Turnierdatum auswählen');
    expect(markup).not.toContain('calendar-picker-backdrop');
  });
});
