/** Tournament planning is consistently interpreted in Germany, even when the
 * director edits the event from a browser configured for a different zone. */
export const TOURNAMENT_TIME_ZONE = 'Europe/Berlin';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TOURNAMENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function asParts(date: Date): [number, number, number, number, number] {
  const value = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return [value.year, value.month, value.day, value.hour, value.minute];
}

function naiveUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

export function tournamentWallClock(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const [year, month, day, hour, minute] = asParts(date);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** Enumerate matching real instants to distinguish missing summer hours from
 * duplicated winter hours. No machine-local Date constructor or getTimezoneOffset. */
export function tournamentWallClockCandidates(value: string): Date[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return [];
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const naive = naiveUtc(year, month, day, hour, minute);
  if (naive.getUTCFullYear() !== year || naive.getUTCMonth() + 1 !== month
    || naive.getUTCDate() !== day || naive.getUTCHours() !== hour
    || naive.getUTCMinutes() !== minute) return [];
  const offsets = new Set<number>();
  for (const deltaHours of [-24, -3, 0, 3, 24]) {
    const probe = new Date(naive.getTime() + deltaHours * 3600000);
    const [y, mo, d, h, mi] = asParts(probe);
    const zoneAsUtc = naiveUtc(y, mo, d, h, mi);
    offsets.add(Math.round((zoneAsUtc.getTime() - probe.getTime()) / 60000));
  }
  const candidates = [...offsets].map((offset) => new Date(naive.getTime() - offset * 60000))
    .filter((date) => tournamentWallClock(date) === value);
  return [...new Map(candidates.map((date) => [date.getTime(), date])).values()]
    .sort((a, b) => a.getTime() - b.getTime());
}

export function nextTournamentCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  const date = naiveUtc(Number(match[1]), Number(match[2]), Number(match[3]) + 1, 12, 0);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
