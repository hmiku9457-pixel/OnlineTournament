import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { addBreakMinutes, BREAK_MINUTE_STEPS, BreakStartSettings } from '@/components/BreakStartSettings';

const changeMode = () => {};
const changeMinutes = () => {};
const changeDate = () => {};
const changeTime = () => {};
const props = {
  mode: 'minutes' as const,
  minutes: 15,
  date: '2030-11-20',
  time: '13:00',
  onModeChange: changeMode,
  onMinutesChange: changeMinutes,
  onDateChange: changeDate,
  onTimeChange: changeTime,
};

describe('Pausenstart: kompakte Einstellungen', () => {
  it('bietet die bekannten vier Schnellschritte und einen manuell änderbaren Minutenwert', () => {
    const html = renderToStaticMarkup(<BreakStartSettings {...props} plannedHint="Bis 2030-11-20 um 13:00 Uhr" />);
    expect(BREAK_MINUTE_STEPS).toEqual([1, 5, 15, 60]);
    expect(html).toContain('Pausendauer');
    expect(html).toContain('value="15"');
    expect(html).toContain('+1 Min.');
    expect(html).toContain('+5 Min.');
    expect(html).toContain('+15 Min.');
    expect(html).toContain('+1 Std.');
    expect(html).toContain('−1 Min.');
    expect(html).toContain('−5 Min.');
    expect(html).toContain('−15 Min.');
    expect(html).toContain('−1 Std.');
    expect(html).toContain('Aus der Turnierplanung');
    expect(html).toContain('20.11.2030');
    expect(html).toContain('aria-pressed="true"');
  });

  it('hält die Dauer zwischen 1 und 1440 Minuten und sperrt nicht mehr passende Schnellschritte', () => {
    expect(addBreakMinutes(15, 60)).toBe(75);
    expect(addBreakMinutes(15, -5)).toBe(10);
    expect(addBreakMinutes(15, -60)).toBe(1);
    expect(addBreakMinutes(1435, 15)).toBe(1440);
    expect(addBreakMinutes(1440, 60)).toBe(1440);
    expect(addBreakMinutes(0, 5)).toBe(5);
    const html = renderToStaticMarkup(<BreakStartSettings {...props} minutes={1435} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('+15 Min.');
    const atMinimum = renderToStaticMarkup(<BreakStartSettings {...props} minutes={1} />);
    expect(atMinimum).toContain('aria-label="Pausendauer verkürzen"');
    expect(atMinimum).toContain('disabled=""');
  });

  it('zeigt für feste Pausenenden die vorhandenen Kalender- und Uhrzeitdialoge', () => {
    const html = renderToStaticMarkup(<BreakStartSettings {...props} mode="clock" error="Der Termin ist abgelaufen." />);
    expect(html).toContain('Datum auswählen');
    expect(html).toContain('Fortsetzung um einstellen');
    expect(html).toContain('Der Termin ist abgelaufen.');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('break-start-duration-quick-buttons');
  });
});
