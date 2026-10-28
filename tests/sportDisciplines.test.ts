import { describe, expect, it } from 'vitest';
import { disciplineLabel, disciplineOptionsForSport, sportOptions } from '@/domain/sports';

describe('Disziplinen nach Sportart', () => {
  it('fordert vor der Sportartauswahl eine Entscheidung', () => {
    expect(disciplineOptionsForSport('')).toEqual([]);
  });

  it('bietet Einzel und Doppel für Tischtennis, Tennis und Badminton', () => {
    for (const sport of ['table_tennis', 'tennis', 'badminton']) {
      expect(disciplineOptionsForSport(sport).map(({ value }) => value)).toEqual(['SINGLES', 'DOUBLES']);
    }
  });

  it('begrenzt Padel auf Doppel und Squash auf Einzel', () => {
    expect(disciplineOptionsForSport('padel').map(({ value }) => value)).toEqual(['DOUBLES']);
    expect(disciplineOptionsForSport('squash').map(({ value }) => value)).toEqual(['SINGLES']);
  });

  it('stellt für Mannschaftssportarten die Mannschaftserfassung bereit', () => {
    const teamSports = ['football', 'futsal', 'handball', 'basketball', 'volleyball',
      'beach_volleyball', 'hockey', 'ice_hockey'];
    for (const sport of teamSports) {
      expect(disciplineOptionsForSport(sport)).toEqual([{ value: 'TEAMS', label: 'Mannschaften' }]);
    }
  });

  it('bietet für jede registrierte Sportart mindestens eine passende Disziplin', () => {
    for (const sport of sportOptions) {
      expect(disciplineOptionsForSport(sport.id).length).toBeGreaterThan(0);
      expect(disciplineOptionsForSport(sport.label).length).toBeGreaterThan(0);
    }
    expect(disciplineLabel('SINGLES')).toBe('Einzel');
    expect(disciplineLabel('DOUBLES')).toBe('Doppel');
    expect(disciplineLabel('TEAMS')).toBe('Mannschaften');
  });
});
