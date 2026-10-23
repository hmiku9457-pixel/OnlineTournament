import { describe, expect, it } from 'vitest';
import { describePlayerGameOutcome } from '@/domain/playerGameOutcome';
import { resultForMatchParticipant, resultForParticipant } from '@/services/matchPresentation';

const completed = {
  sideA: 'Spieler A',
  sideB: 'Spieler B',
  score: '1 : 2',
  sets: [
    { number: 1, sideAScore: 11, sideBScore: 8 },
    { number: 2, sideAScore: 6, sideBScore: 11 },
    { number: 3, sideAScore: 7, sideBScore: 11 },
  ],
};

describe('Schweizer Spielerverlauf aus ausgewählter Perspektive', () => {
  it('zeigt der linken Seite die Niederlage 1:2 und die richtigen Satzpunkte', () => {
    const view = resultForMatchParticipant(completed, 'Spieler A');
    expect(view.score).toBe('1:2');
    expect(view.sets?.[1]).toMatchObject({ sideAScore: 6, sideBScore: 11 });
    expect(describePlayerGameOutcome(view.score, true)).toEqual({ label: 'Niederlage', tone: 'loss' });
  });

  it('zeigt der rechten Seite den Sieg 2:1 und vertauschte Satzpunkte', () => {
    const view = resultForMatchParticipant(completed, 'Spieler B');
    expect(view.score).toBe('2:1');
    expect(view.sets?.[1]).toMatchObject({ sideAScore: 11, sideBScore: 6 });
    expect(describePlayerGameOutcome(view.score, true)).toEqual({ label: 'Sieg', tone: 'win' });
  });

  it('berechnet den Endstand aus den bestätigten Sätzen statt aus einem veralteten Score-Text', () => {
    const view = resultForParticipant('2:0', completed.sets, true);
    expect(view.score).toBe('2:1');
    expect(describePlayerGameOutcome(view.score, true)).toEqual({ label: 'Sieg', tone: 'win' });
  });

  it('lässt unvollständige Partien offen, auch wenn bereits Satzpunkte gespeichert sind', () => {
    expect(resultForMatchParticipant({ ...completed, score: '–' }, 'Spieler B').score).toBe('–');
  });

  it('interpretiert ein Ergebnis ohne gespeicherte Sätze weiterhin korrekt aus Gastperspektive', () => {
    expect(resultForMatchParticipant({ sideA: 'A', sideB: 'B', score: '0 : 1' }, 'B').score).toBe('1:0');
  });
});
