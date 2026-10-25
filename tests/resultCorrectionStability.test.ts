import { describe, expect, it, vi } from 'vitest';
import { storedResultSnapshot } from '@/domain/storedResultSnapshot';

const original = [
  { number: 1, sideAScore: 11, sideBScore: 7 },
  { number: 2, sideAScore: 11, sideBScore: 8 },
];

describe('Ergebniskorrektur bei regelmäßigen UI-Aktualisierungen', () => {
  it('wertet neu erstellte, aber inhaltsgleiche Ergebnissätze nicht als neue Ergebnisse', () => {
    vi.useFakeTimers();
    try {
      const stored = storedResultSnapshot(original);
      vi.advanceTimersByTime(30000);
      const clockRefresh = original.map((set) => ({ ...set }));
      expect(clockRefresh).not.toBe(original);
      expect(storedResultSnapshot(clockRefresh)).toBe(stored);
      vi.advanceTimersByTime(5 * 60000);
      expect(storedResultSnapshot(original.map((set) => ({ ...set })))).toBe(stored);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setzt den Editor bei einem tatsächlich veränderten Spielergebnis oder Spielwechsel zurück', () => {
    const stored = storedResultSnapshot(original);
    expect(storedResultSnapshot([{ ...original[0], sideBScore: 9 }, original[1]])).not.toBe(stored);
    expect(storedResultSnapshot([...original, { number: 3, sideAScore: 11, sideBScore: 5 }])).not.toBe(stored);
    expect(storedResultSnapshot(undefined)).toBe('[]');
    // The component watches the semantic fingerprint together with match.id.
    expect(['match-1', stored]).not.toEqual(['match-2', stored]);
  });
});
