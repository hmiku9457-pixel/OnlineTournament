import { describe, expect, it } from 'vitest';
import { applySetCorrections, formatShortSet, parseShortSet } from '@/domain/shortSetNotation';

describe('Kurznotation der Sätze', () => {
  it('formatiert reguläre und verlängerte Sätze inklusive -0 aus Sicht von Seite A', () => {
    const sample = (sideAScore: number, sideBScore: number) => formatShortSet({ number: 1, sideAScore, sideBScore });
    expect([sample(11, 7), sample(7, 11), sample(12, 10), sample(10, 12), sample(11, 0), sample(0, 11)])
      .toEqual(['7', '-7', '10', '-10', '0', '-0']);
    expect(sample(11, 10)).toBe('11:10');
  });

  it('interpretiert -0 als 0:11 und +0 bzw. 0 als 11:0', () => {
    expect(parseShortSet('-0', 1)).toEqual({ number: 1, sideAScore: 0, sideBScore: 11 });
    expect(parseShortSet('0', 2)).toEqual({ number: 2, sideAScore: 11, sideBScore: 0 });
    expect(parseShortSet('+0', 3)).toEqual({ number: 3, sideAScore: 11, sideBScore: 0 });
  });
  it('erhält die bisherige Kurznotation auch bei Verlängerung', () => {
    expect(parseShortSet('-10', 1)).toEqual({ number: 1, sideAScore: 10, sideBScore: 12 });
    expect(parseShortSet('7', 1)).toEqual({ number: 1, sideAScore: 11, sideBScore: 7 });
  });
});


describe('Satzkorrektur im Modal', () => {
  const previousSets = [
    { number: 1, sideAScore: 11, sideBScore: 7 },
    { number: 2, sideAScore: 8, sideBScore: 11 },
    { number: 3, sideAScore: 12, sideBScore: 10 },
  ];

  it('übernimmt nicht ausgefüllte Eingabefelder unverändert', () => {
    expect(applySetCorrections(previousSets, ['', '7', ''])).toEqual([
      previousSets[0],
      { number: 2, sideAScore: 11, sideBScore: 7 },
      previousSets[2],
    ]);
  });

  it('erkennt -0 und invalidiert ungültige Korrekturfelder', () => {
    expect(applySetCorrections(previousSets, ['-0', '', ''])?.[0]).toEqual({ number: 1, sideAScore: 0, sideBScore: 11 });
    expect(applySetCorrections(previousSets, ['', 'abc', ''])).toBeNull();
  });

  it('kann den zuletzt gespielten Satz aus dem Entwurf entfernen', () => {
    expect(applySetCorrections(previousSets, ['', ''])).toEqual(previousSets.slice(0, 2));
  });
});
