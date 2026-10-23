import { describe, expect, it } from 'vitest';
import { describePlayerGameOutcome } from '@/domain/playerGameOutcome';
import { resultForParticipant } from '@/services/matchPresentation';

describe('Spielerpartien: einheitliche Ergebnis-Perspektive', () => {
  it('erkennt Siege und Niederlagen für Gastspieler korrekt', () => {
    const guestWins = resultForParticipant('0:2', undefined, true);
    const guestLoses = resultForParticipant('2:0', undefined, true);
    expect(describePlayerGameOutcome(guestWins.score, true)).toEqual({ label: 'Sieg', tone: 'win' });
    expect(describePlayerGameOutcome(guestLoses.score, true)).toEqual({ label: 'Niederlage', tone: 'loss' });
  });
  it('stellt offene Partien als blaues Tag dar und einen Kampflos-Status neutral', () => {
    expect(describePlayerGameOutcome('–', false)).toEqual({ label: 'Offen', tone: 'open' });
    expect(describePlayerGameOutcome('W.O.', true)).toEqual({ label: 'Kampflos', tone: 'neutral' });
  });
});
