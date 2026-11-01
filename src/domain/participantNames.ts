/** User-facing tournament participant names allow Unicode letters (including
 * Ø/ø, accents and combining marks), spaces between words and hyphens.
 * Other punctuation, digits, slash separators and control chars are invalid.
 */
const validName = /^[\p{L}\p{M}]+(?:[ -][\p{L}\p{M}]+)*$/u;
export function isAllowedParticipantName(value: string): boolean {
  return validName.test(value.trim());
}

/** Preserve natural typing (including unfinished trailing hyphens/spaces)
 * while excluding characters which are never valid in a participant name. */
export function sanitizeParticipantName(value: string): string {
  return value.replace(/[^\p{L}\p{M} -]/gu, '');
}
