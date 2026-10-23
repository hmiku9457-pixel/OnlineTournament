/** Local UI prototype codes. Server-side issuance and rate limits are required before go-live. */
function randomSixDigitCode(): string {
  const bytes = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return String(100000 + (bytes[0] % 900000));
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function generateUniquePlayerCode(usedCodes: ReadonlySet<string>): string {
  if (usedCodes.size >= 900000) throw new Error('Keine freien sechsstelligen Spielercodes verfügbar.');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomSixDigitCode();
    if (!usedCodes.has(code)) return code;
  }
  // Fallback also guarantees termination when random values repeatedly collide.
  const offset = Math.floor(Math.random() * 900000);
  for (let index = 0; index < 900000; index += 1) {
    const code = String(100000 + ((offset + index) % 900000));
    if (!usedCodes.has(code)) return code;
  }
  throw new Error('Keine freien sechsstelligen Spielercodes verfügbar.');
}

export function generatePlayerCodes(names: readonly string[]): Record<string, string> {
  const used = new Set<string>();
  const result: Record<string, string> = {};
  for (const name of names) {
    const code = generateUniquePlayerCode(used);
    used.add(code);
    result[name] = code;
  }
  return result;
}
