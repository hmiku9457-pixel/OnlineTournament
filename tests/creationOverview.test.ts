import { describe, expect, it } from 'vitest';
import { formatPhaseOverview, phaseQualificationPlaces, type CreationOverviewPhase } from '@/domain/creationOverview';

const phases: CreationOverviewPhase[] = [
  { type: 'GROUPS', entrantCount: 19, groupCount: 3 },
  { type: 'BREAK', entrantCount: 19 },
  { type: 'SWISS', entrantCount: 9, swissRounds: 4 },
  { type: 'BREAK', entrantCount: 9 },
  { type: 'KNOCKOUT', entrantCount: 4 },
];

describe('Kurzbeschreibung der Wettkampfphasen in der Turnierzusammenfassung', () => {
  it('berücksichtigt Qualifikationsplätze auch bei Pausen zwischen Phasen', () => {
    expect(phaseQualificationPlaces(phases, 0)).toBe(9);
    expect(phaseQualificationPlaces(phases, 1)).toBeNull();
    expect(phaseQualificationPlaces(phases, 2)).toBe(4);
    expect(phaseQualificationPlaces(phases, 3)).toBeNull();
    expect(phaseQualificationPlaces(phases, 4)).toBeNull();
    expect(formatPhaseOverview(phases, 0, 'SINGLES')).toBe('3 Gruppen · 9 Qualifikationsplätze');
    expect(formatPhaseOverview(phases, 2, 'SINGLES')).toBe('9 Spieler · 4 Runden · 4 Qualifikationsplätze');
    expect(formatPhaseOverview(phases, 4, 'SINGLES')).toBe('4 Spieler · 2 Runden');
    expect(formatPhaseOverview(phases, 1, 'SINGLES')).toBe('');
  });

  it('erfindet keine Qualifikationsplätze bei unverändertem oder letztem Feld', () => {
    const unchanged: CreationOverviewPhase[] = [
      { type: 'GROUPS', entrantCount: 8, groupCount: 2 },
      { type: 'SWISS', entrantCount: 8, swissRounds: 3 },
    ];
    expect(phaseQualificationPlaces(unchanged, 0)).toBeNull();
    expect(formatPhaseOverview(unchanged, 0, 'SINGLES')).toBe('2 Gruppen');
    expect(formatPhaseOverview(unchanged, 1, 'SINGLES')).toBe('8 Spieler · 3 Runden');
  });

  it('verwendet die richtige Teilnehmenden-Bezeichnung für Doppel und Mannschaften', () => {
    const input: CreationOverviewPhase[] = [
      { type: 'SWISS', entrantCount: 8, swissRounds: 3 },
      { type: 'KNOCKOUT', entrantCount: 4 },
    ];
    expect(formatPhaseOverview(input, 0, 'DOUBLES')).toBe('8 Doppel · 3 Runden · 4 Qualifikationsplätze');
    expect(formatPhaseOverview(input, 0, 'TEAMS')).toBe('8 Mannschaften · 3 Runden · 4 Qualifikationsplätze');
  });
});
