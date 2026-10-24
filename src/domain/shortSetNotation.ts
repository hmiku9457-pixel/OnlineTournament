import type { MatchSet } from '@/domain/types';

export function parseShortSet(value: string, number: number): MatchSet | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [leftRaw, rightRaw] = trimmed.split(':');
    const left = Number(leftRaw?.trim());
    const right = Number(rightRaw?.trim());
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right || left < 0 || right < 0) return null;
    return { number, sideAScore: Math.trunc(left), sideBScore: Math.trunc(right) };
  }

  // Die Zeichenfolge -0 ist numerisch -0, und -0 >= 0 ist in JS wahr.
  // Deshalb das Vorzeichen aus dem Originaltext lesen, nicht aus Number().
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  const loser = Math.abs(Math.trunc(numeric));
  const winner = Math.max(11, loser + 2);

  return !trimmed.startsWith('-')
    ? { number, sideAScore: winner, sideBScore: loser }
    : { number, sideAScore: loser, sideBScore: winner };
}

/** Leere Felder sind keine Änderung; nur explizite Eingaben ersetzen bestehende Sätze. */
export function applySetCorrections(playedSets: MatchSet[], corrections: string[]): MatchSet[] | null {
  const updated = corrections.map((value, index) =>
    value.trim() === '' ? playedSets[index] : parseShortSet(value, index + 1),
  );
  if (updated.some((set) => !set)) return null;
  return updated.filter((set): set is MatchSet => set !== null && set !== undefined);
}

