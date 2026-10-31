import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClockTimeDial, ClockTimePicker, clockDialPosition, formatClockTime, parseClockTime } from '@/components/ClockTimePicker';

describe('Uhr mit Zifferblatt für die geplante Turnierzeit', () => {
  it('verarbeitet 24-Stunden-Zeiten ohne Zeitzonenänderung', () => {
    expect(parseClockTime('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseClockTime('00:59')).toEqual({ hour: 0, minute: 59 });
    expect(parseClockTime('23:58')).toEqual({ hour: 23, minute: 58 });
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('9:00')).toBeNull();
    expect(parseClockTime('10:60')).toBeNull();
    expect(formatClockTime(9, 4)).toBe('09:04');
    expect(formatClockTime(23, 59)).toBe('23:59');
    expect(formatClockTime(24, 0)).toBeNull();
    expect(formatClockTime(12, -1)).toBeNull();
    expect(formatClockTime(12.5, 30)).toBeNull();
  });

  it('ordnet Stunden korrekt auf inneren und äußeren Kreis zu', () => {
    expect(clockDialPosition(0, 41).left).toBeCloseTo(50);
    expect(clockDialPosition(0, 41).top).toBeCloseTo(9);
    expect(clockDialPosition(3, 41).left).toBeCloseTo(91);
    expect(clockDialPosition(6, 41).top).toBeCloseTo(91);
    const dial = renderToStaticMarkup(createElement(ClockTimeDial, {
      mode: 'hours', hour: 23, minute: 0, onPickHour: () => {}, onPickMinute: () => {},
    }));
    expect(dial).toContain('aria-label="0 Uhr"');
    expect(dial).toContain('aria-label="12 Uhr"');
    expect(dial).toContain('aria-label="13 Uhr"');
    expect(dial).toContain('aria-label="23 Uhr"');
    expect((dial.match(/class="clock-picker-mark/g) ?? [])).toHaveLength(24);
    expect(dial).toContain('aria-pressed="true"');
  });

  it('zeigt ein analoges Minuten-Zifferblatt in Fünferschritten', () => {
    const dial = renderToStaticMarkup(createElement(ClockTimeDial, {
      mode: 'minutes', hour: 9, minute: 35, onPickHour: () => {}, onPickMinute: () => {},
    }));
    expect((dial.match(/class="clock-picker-mark/g) ?? [])).toHaveLength(12);
    expect(dial).toContain('aria-label="0 Minuten"');
    expect(dial).toContain('aria-label="35 Minuten"');
    expect(dial).toContain('aria-label="55 Minuten"');
  });

  it('zeigt statt der Dropdown-Auswahl den Dialog-Auslöser', () => {
    const markup = renderToStaticMarkup(createElement(ClockTimePicker, {
      id: 'tournament-start-time', value: '09:00', onChange: () => {},
    }));
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('id="tournament-start-time"');
    expect(markup).toContain('09:00');
    expect(markup).not.toContain('type="time"');
  });
});
