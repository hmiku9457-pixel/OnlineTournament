import { findSportOption } from '@/domain/sports';

/** Sportartabhängige Anzeige. Gespeicherte IDs wie "Tisch 1" bleiben unverändert. */
export function getVenueTerminology(sport: string) {
  const kind = findSportOption(sport)?.venueKind;
  if (kind === 'table') {
    return { singular: 'Tisch', plural: 'Tische', dativePlural: 'Tischen', free: 'Freier Tisch', locked: 'Gesperrter Tisch' };
  }
  if (kind === 'field') {
    return { singular: 'Spielfeld', plural: 'Spielfelder', dativePlural: 'Spielfeldern', free: 'Freies Spielfeld', locked: 'Gesperrtes Spielfeld' };
  }
  // Auch für weitere Sportarten ist ein Platz der verständliche Standard.
  return { singular: 'Platz', plural: 'Plätze', dativePlural: 'Plätzen', free: 'Freier Platz', locked: 'Gesperrter Platz' };
}

export function displayVenueName(sport: string, storedName: string): string {
  const match = /^Tisch (\d+)$/.exec(storedName);
  return match ? `${getVenueTerminology(sport).singular} ${match[1]}` : storedName;
}

/** Texte aus älteren Tisch-basierten Laufzeitdaten an die Sportart anpassen. */
export function displayVenueMessage(sport: string, message: string): string {
  const terms = getVenueTerminology(sport);
  return message
    .replace(/Tischzuweisungen/g, `${terms.singular}zuweisungen`)
    .replace(/Tischzuweisung/g, `${terms.singular}zuweisung`)
    .replace(/Tischwechsel/g, `${terms.singular}wechsel`)
    .replace(/Tischbelegung/g, `${terms.singular}belegung`)
    .replace(/Tischen\b/g, terms.dativePlural)
    .replace(/Tische\b/g, terms.plural)
    .replace(/Tisch\b/g, terms.singular);
}
