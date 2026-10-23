import { describe, expect, it } from 'vitest';
import { resultForParticipant } from '@/services/matchPresentation';

const sets = [
  { number: 1, sideAScore: 8, sideBScore: 11 },
  { number: 2, sideAScore: 7, sideBScore: 11 },
];

describe('Spielerperspektive in Spielübersichten', () => {
  it('zeigt ein Heimsieg-Ergebnis unverändert an', () => {
    const homeWinSets = sets.map((set) => ({
      ...set,
      sideAScore: set.sideBScore,
      sideBScore: set.sideAScore,
    }));
    expect(resultForParticipant('2:0', homeWinSets, false)).toEqual({ score: '2:0', sets: homeWinSets });
  });

  it('nutzt die Satzergebnisse, wenn der angezeigte Ergebnistext veraltet ist', () => {
    expect(resultForParticipant('2:0', sets, false)).toEqual({ score: '0:2', sets });
  });

  it('dreht Gast-Ergebnis und Satzergebnisse korrekt um', () => {
    expect(resultForParticipant('0:2', sets, true)).toEqual({
      score: '2:0',
      sets: [
        { number: 1, sideAScore: 11, sideBScore: 8 },
        { number: 2, sideAScore: 11, sideBScore: 7 },
      ],
    });
  });

  it('belässt offene und kampflose Resultate unverändert', () => {
    expect(resultForParticipant('–', undefined, true)).toEqual({ score: '–', sets: undefined });
    expect(resultForParticipant('W.O.', [], true)).toEqual({ score: 'W.O.', sets: [] });
  });
});
