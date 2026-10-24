import { describe, expect, it } from 'vitest';
import { displayVenueMessage, displayVenueName, getVenueTerminology } from '../src/domain/venueTerminology';
import { getControlGuide } from '../src/domain/controlGuide';
import { getSportLabel, sportOptions } from '../src/domain/sports';

describe('Sportabhängige Bezeichnungen von Spielorten', () => {
  it('behält Tischtennis-Tische in neuen und bestehenden Turnieren bei', () => {
    expect(getVenueTerminology('Tischtennis').plural).toBe('Tische');
    expect(getVenueTerminology('table_tennis').singular).toBe('Tisch');
    expect(displayVenueName('Tischtennis', 'Tisch 3')).toBe('Tisch 3');
  });

  it('zeigt Fußballplätze und Spielfelder für Handball und Basketball', () => {
    expect(getVenueTerminology('football').plural).toBe('Plätze');
    expect(displayVenueName('Fußball', 'Tisch 3')).toBe('Platz 3');
    expect(displayVenueName('Handball', 'Tisch 3')).toBe('Spielfeld 3');
    expect(displayVenueName('Basketball', 'Tisch 3')).toBe('Spielfeld 3');
    expect(displayVenueName('Lacrosse', 'Tisch 3')).toBe('Platz 3');
  });

  it('bietet weitere gängige Sportarten mit neutralen Namen und den passenden Spielflächen an', () => {
    expect(sportOptions.map(({ id }) => id).length).toBe(new Set(sportOptions.map(({ id }) => id)).size);
    expect(sportOptions.every(({ label }) => !label.includes('('))).toBe(true);
    expect(getSportLabel('beach_volleyball')).toBe('Beachvolleyball');
    expect(getSportLabel('ice_hockey')).toBe('Eishockey');
    expect(displayVenueName('Volleyball', 'Tisch 1')).toBe('Spielfeld 1');
    expect(displayVenueName('Badminton', 'Tisch 2')).toBe('Spielfeld 2');
    expect(displayVenueName('Tennis', 'Tisch 3')).toBe('Platz 3');
    expect(displayVenueName('Padel', 'Tisch 4')).toBe('Platz 4');
  });

  it('übersetzt gespeicherte Hinweise, ohne die internen Tischkennungen zu verändern', () => {
    const stored = 'Tisch 4';
    expect(displayVenueMessage('Fußball', 'Wartet auf Tischzuweisung')).toBe('Wartet auf Platzzuweisung');
    expect(displayVenueMessage('Handball', 'An Tischen 1 und 2')).toBe('An Spielfeldern 1 und 2');
    expect(displayVenueMessage('Fußball', 'Tisch 4 ist gesperrt')).toBe('Platz 4 ist gesperrt');
    expect(displayVenueMessage('Tischtennis', 'Tisch 4 ist gesperrt')).toBe('Tisch 4 ist gesperrt');
    expect(stored).toBe('Tisch 4');
  });

  it('passt die kontextuelle Hilfe ebenfalls der Sportart an', () => {
    const state = { status: 'RUNNING' as const, sport: 'Fußball', hasStarted: true, hasActiveStage: true, hasNextStage: false, waitingMatches: 2, freeTables: 1, activeMatches: 1 };
    expect(getControlGuide(state).text).toContain('freie Plätze');
    expect(getControlGuide({ ...state, status: 'PAUSED' }).text).toContain('Platzzuweisungen');
  });
});
