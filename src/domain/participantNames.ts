/** Unicode letters, numerals, dots and a parenthesized club qualifier are
 * permitted for individual players and teams. Slashes separate doubles. */
export const MAX_PARTICIPANT_NAME_LENGTH = 200;

const validName = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .()-]*$/u;

export function isAllowedParticipantName(value: string): boolean {
  const name = value.trim();
  if (name.length > MAX_PARTICIPANT_NAME_LENGTH || !validName.test(name)) return false;
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

/** Indices of entries that should be corrected or removed.
 * When two complete entries collide, retain the first valid entry so a
 * bulk cleanup cannot accidentally delete both of them. */
export function invalidParticipantRosterIndices(
  entries: readonly RosterEntry[], discipline: 'SINGLES' | 'DOUBLES' | 'TEAMS',
): Set<number> {
  const invalid = new Set<number>();
  const occupied = new Set<string>();
  const person = (first: string, last: string) => [first.trim(), last.trim()].filter(Boolean).join(' ');
  entries.forEach((entry, index) => {
    if (discipline === 'TEAMS') {
      const label = entry.teamName?.trim() || person(entry.firstName, entry.lastName);
      const key = participantNameKey(label);
      if (!key || !isAllowedParticipantName(label) || occupied.has(key)) invalid.add(index);
      else occupied.add(key);
      return;
    }
    if (!entry.firstName.trim() || !entry.lastName.trim()
      || !isAllowedParticipantName(entry.firstName) || !isAllowedParticipantName(entry.lastName)) {
      invalid.add(index);
      return;
    }
    const first = participantNameKey(person(entry.firstName, entry.lastName));
    if (discipline === 'SINGLES') {
      if (occupied.has(first)) invalid.add(index);
      else occupied.add(first);
      return;
    }
    if (!entry.partnerFirstName.trim() || !entry.partnerLastName.trim()
      || !isAllowedParticipantName(entry.partnerFirstName) || !isAllowedParticipantName(entry.partnerLastName)) {
      invalid.add(index);
      return;
    }
    const partner = participantNameKey(person(entry.partnerFirstName, entry.partnerLastName));
    if (first === partner || occupied.has(first) || occupied.has(partner)) {
      invalid.add(index);
      return;
    }
    occupied.add(first);
    occupied.add(partner);
  });
  return invalid;
}

export function sanitizeParticipantName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} .()-]/gu, '');
}
