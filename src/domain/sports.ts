import type { Discipline } from '@/domain/types';

/** Zentrale Sportartenliste für die Turniererstellung und ihre Anzeige. */
export const sportOptions = [
  { id: 'table_tennis', label: 'Tischtennis', venueKind: 'table' },
  { id: 'football', label: 'Fußball', venueKind: 'pitch' },
  { id: 'handball', label: 'Handball', venueKind: 'field' },
  { id: 'basketball', label: 'Basketball', venueKind: 'field' },
  { id: 'volleyball', label: 'Volleyball', venueKind: 'field' },
  { id: 'beach_volleyball', label: 'Beachvolleyball', venueKind: 'field' },
  { id: 'tennis', label: 'Tennis', venueKind: 'pitch' },
  { id: 'badminton', label: 'Badminton', venueKind: 'field' },
  { id: 'padel', label: 'Padel', venueKind: 'pitch' },
  { id: 'squash', label: 'Squash', venueKind: 'pitch' },
  { id: 'futsal', label: 'Futsal', venueKind: 'field' },
  { id: 'hockey', label: 'Hockey', venueKind: 'field' },
  { id: 'ice_hockey', label: 'Eishockey', venueKind: 'field' },
] as const;

export function findSportOption(value: string) {
  // Alte lokale Turniere konnten den Regelhinweis noch als Klammerzusatz speichern.
  const normalized = value.trim().replace(/\s+\([^)]*\)$/, '').toLocaleLowerCase('de-DE');
  return sportOptions.find((option) => option.id === normalized || option.label.toLocaleLowerCase('de-DE') === normalized);
}

export function getSportLabel(value: string): string {
  return findSportOption(value)?.label ?? value;
}

export interface SportDisciplineOption {
  value: Discipline;
  label: string;
}

const singles: SportDisciplineOption = { value: 'SINGLES', label: 'Einzel' };
const doubles: SportDisciplineOption = { value: 'DOUBLES', label: 'Doppel' };
const teams: SportDisciplineOption = { value: 'TEAMS', label: 'Mannschaften' };

/** Only offer disciplines the tournament creator can represent for this sport. */
export function disciplineOptionsForSport(sport: string): SportDisciplineOption[] {
  const id = findSportOption(sport)?.id;
  if (!id) return [];
  if (id === 'table_tennis' || id === 'tennis' || id === 'badminton') return [singles, doubles];
  if (id === 'padel') return [doubles];
  if (id === 'squash') return [singles];
  return [teams];
}

export function disciplineLabel(discipline: Discipline): string {
  if (discipline === 'DOUBLES') return 'Doppel';
  if (discipline === 'TEAMS') return 'Mannschaften';
  return 'Einzel';
}

/** Upper end of the planning range supplied for a typical set (minutes).
 * Sports decided by a timed match do not use this value.
 */
export function planningMinutesPerSet(sport: string): number {
  switch (findSportOption(sport)?.id) {
    case 'table_tennis': return 5;
    case 'squash': return 12;
    case 'badminton': return 15;
    case 'beach_volleyball': return 22;
    case 'volleyball': return 25;
    case 'padel': return 45;
    case 'tennis': return 50;
    default: return 15;
  }
}
