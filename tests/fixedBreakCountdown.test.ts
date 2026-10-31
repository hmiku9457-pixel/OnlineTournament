import { formatBreakCountdown } from '@/services/mockPhaseLifecycle';
import { describe, expect, it } from 'vitest';

describe('Countdown mit festen Stellen', () => {
  const target = new Date(2026, 9, 31, 16, 0, 0);
  const countdown = (seconds: number) => formatBreakCountdown(target, target.getTime() - seconds * 1000);

  it('behält unabhängig von der Dauer exakt DDD:HH:MM:SS bei', () => {
    expect(countdown(0)).toBe('000:00:00:00');
    expect(countdown(9)).toBe('000:00:00:09');
    expect(countdown(61)).toBe('000:00:01:01');
    expect(countdown(3601)).toBe('000:01:00:01');
    expect(countdown(86400 + 3600 + 61)).toBe('001:01:01:01');
    expect(countdown(19 * 3600 + 21 * 60 + 38)).toBe('000:19:21:38');
    for (const seconds of [0, 9, 59, 60, 3599, 3600, 86399, 86400, 999 * 86400]) {
      expect(countdown(seconds)).toMatch(/^\d{3}:\d{2}:\d{2}:\d{2}$/);
      expect(countdown(seconds)).toHaveLength(12);
    }
  });

  it('zeigt bei fehlender Zeit eine platzhaltende Anzeige und kein wanderndes Label', () => {
    expect(formatBreakCountdown(null)).toBe('---:--:--:--');
    expect(formatBreakCountdown(new Date(NaN))).toBe('---:--:--:--');
    expect(countdown(-12)).toBe('000:00:00:00');
  });
});
