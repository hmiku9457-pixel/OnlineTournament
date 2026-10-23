import { describe, expect, it } from 'vitest';
import { summarizeParticipantStatuses } from '@/domain/participantStatistics';

describe('Teilnehmerstatistik', () => {
  it('zählt aktive, ausgeschiedene und zurückgezogene Teilnehmer ohne Doppelzählung', () => {
    expect(summarizeParticipantStatuses([
      'Aktiv', 'Aktiv', 'Aktiv', 'Ausgeschieden', 'Zurückgezogen',
    ])).toEqual({ total: 5, remaining: 3, eliminated: 1, withdrawn: 1 });
  });

  it('zählt Gewinner und regulär Beendete nicht als ausgeschieden', () => {
    expect(summarizeParticipantStatuses([
      'Turniersieger', 'Beendet', 'Ausgeschieden', 'Zurückgezogen',
    ])).toEqual({ total: 4, remaining: 2, eliminated: 1, withdrawn: 1 });
  });

  it('funktioniert bei leerer Teilnehmerliste', () => {
    expect(summarizeParticipantStatuses([])).toEqual({ total: 0, remaining: 0, eliminated: 0, withdrawn: 0 });
  });
});
