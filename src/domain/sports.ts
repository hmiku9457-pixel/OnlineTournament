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
