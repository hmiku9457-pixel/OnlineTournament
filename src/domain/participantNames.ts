/** Unicode letters, numerals, dots and a parenthesized club qualifier are
 * permitted for individual players and teams. Slashes separate doubles. */
const validName = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .()\-]*$/u;

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
export function sanitizeParticipantName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} .()\-]/gu, '');
}
