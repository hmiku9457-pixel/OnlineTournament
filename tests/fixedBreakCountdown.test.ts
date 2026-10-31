import { formatBreakCountdown } from '@/services/mockPhaseLifecycle';
import { describe, expect, it } from 'vitest';

describe('Countdown ohne überflüssige Null-Blöcke', () => {
  const target = new Date(2026, 9, 31, 16, 0, 0);
  const countdown = (seconds: number) => formatBreakCountdown(target, target.getTime() - seconds * 1000);

  it('zeigt unter einer Stunde nur MM:SS', () => {
    expect(countdown(0)).toBe('00:00');
    expect(countdown(9)).toBe('00:09');
    expect(countdown(61)).toBe('01:01');
    expect(countdown(14 * 60 + 4)).toBe('14:04');
    expect(countdown(3599)).toBe('59:59');
  });

  it('ergänzt Stunden beziehungsweise Tage nur bei Bedarf', () => {
    expect(countdown(3600)).toBe('1:00:00');
    expect(countdown(3601)).toBe('1:00:01');
    expect(countdown(3600 + 14 * 60 + 4)).toBe('1:14:04');
    expect(countdown(19 * 3600 + 21 * 60 + 38)).toBe('19:21:38');
    expect(countdown(86399)).toBe('23:59:59');
    expect(countdown(86400)).toBe('1:00:00:00');
    expect(countdown(86400 + 3600 + 61)).toBe('1:01:01:01');
    expect(countdown(86400 + 2 * 3600 + 14 * 60 + 4)).toBe('1:02:14:04');
    expect(countdown(10 * 86400 + 23 * 3600 + 59 * 60 + 59)).toBe('10:23:59:59');
    expect(countdown(999 * 86400)).toBe('999:00:00:00');
  });

  it('hält nur nachfolgende Segmente zweistellig und die maximale Breite unverändert', () => {
    for (const seconds of [0, 9, 59, 60, 3599, 3600, 86399, 86400, 999 * 86400]) {
      const formatted = countdown(seconds);
      expect(formatted).toMatch(/^(?:[1-9]\d{0,2}:\d{2}:|[1-9]\d?:)?\d{2}:\d{2}$/);
      expect(formatted.length).toBeLessThanOrEqual(12);
    }
  });

  it('zeigt fehlende oder abgelaufene Zeiten ohne führende Null-Blöcke', () => {
    expect(formatBreakCountdown(null)).toBe('--:--');
    expect(formatBreakCountdown(new Date(NaN))).toBe('--:--');
    expect(countdown(-12)).toBe('00:00');
  });
});
