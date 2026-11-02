/** Unicode letters, numerals, dots and a parenthesized club qualifier are
 * permitted for individual players and teams. Slashes separate doubles. */
const validName = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .()-]*$/u;

export function isAllowedParticipantName(value: string): boolean {
  const name = value.trim();
  if (!validName.test(name)) return false;
  let nesting = 0;
  for (const char of name) {
    if (char === '(') nesting += 1;
    if (char === ')') nesting -= 1;
    if (nesting < 0 || nesting > 1) return false;
  }
  return nesting === 0;
}

/** Keep club numbers, dots and distinguishing annotations while typing. */
/** One canonical comparison key for singles, doubles partners, and teams. */
export function participantNameKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('de-DE');
}
export type RosterEntry = {
  firstName: string; lastName: string; partnerFirstName: string; partnerLastName: string; teamName?: string;
};

/** Validate a complete saved roster in O(n), not by rescan for every entry. */
export function validParticipantRoster(entries: readonly RosterEntry[], discipline: 'SINGLES' | 'DOUBLES' | 'TEAMS'): boolean {
  const occupied = new Set<string>();
  const person = (first: string, last: string) => [first.trim(), last.trim()].filter(Boolean).join(' ');
  for (const entry of entries) {
    if (discipline === 'TEAMS') {
      const name = entry.teamName?.trim() || person(entry.firstName, entry.lastName);
      const key = participantNameKey(name);
      if (!key || !isAllowedParticipantName(name) || occupied.has(key)) return false;
      occupied.add(key);
      continue;
    }
    if (!entry.firstName.trim() || !entry.lastName.trim()
      || !isAllowedParticipantName(entry.firstName) || !isAllowedParticipantName(entry.lastName)) return false;
    const first = participantNameKey(person(entry.firstName, entry.lastName));
    if (occupied.has(first)) return false;
    occupied.add(first);
    if (discipline === 'DOUBLES') {
      if (!entry.partnerFirstName.trim() || !entry.partnerLastName.trim()
        || !isAllowedParticipantName(entry.partnerFirstName) || !isAllowedParticipantName(entry.partnerLastName)) return false;
      const partner = participantNameKey(person(entry.partnerFirstName, entry.partnerLastName));
      if (occupied.has(partner)) return false;
      occupied.add(partner);
    }
  }
  return true;
}

export function sanitizeParticipantName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} .()-]/gu, '');
}
