/** Public, explicitly non-binding timetable. No competition lifecycle uses it. */
export interface PlannedScheduleItem {
  id: string;
  at: string; // Tournament-local wall-clock date/time: YYYY-MM-DDTHH:mm
  title: string;
  type: 'competition' | 'break' | 'other';
  note?: string;
}

/** The browser's local wall clock is used intentionally, not Date.toISOString(). */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (date.getFullYear() !== Number(y) || date.getMonth() + 1 !== Number(mo)
    || date.getDate() !== Number(d) || date.getHours() !== Number(h)
    || date.getMinutes() !== Number(mi)) return null;
  return date;
}

export function isValidLocalDateTime(value: string): boolean {
  return parseLocalDateTime(value) !== null;
}

export function toLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatPlannedDateTime(value: string, withDate = true): string {
  const date = parseLocalDateTime(value);
  if (!date) return 'Termin nicht festgelegt';
  return date.toLocaleString('de-DE', withDate
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { timeStyle: 'short' }) + ' Uhr';
}

export function validatePlannedSchedule(items: PlannedScheduleItem[]): string[] {
  if (items.length > 80) return ['Der Zeitplan darf höchstens 80 Einträge enthalten.'];
  const issues: string[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const label = `Zeitplan-Eintrag ${index + 1}`;
    if (!item.id || seen.has(item.id)) issues.push(`${label}: ID fehlt oder ist doppelt.`);
    seen.add(item.id);
    if (!isValidLocalDateTime(item.at)) issues.push(`${label}: Gültiges Datum und Uhrzeit erforderlich.`);
    if (!item.title.trim() || item.title.trim().length > 80) issues.push(`${label}: Bezeichnung muss 1 bis 80 Zeichen enthalten.`);
    if ((item.note?.length ?? 0) > 400) issues.push(`${label}: Hinweis darf höchstens 400 Zeichen enthalten.`);
    if (!['competition', 'break', 'other'].includes(item.type)) issues.push(`${label}: Unbekannter Eintragstyp.`);
  });
  return issues;
}

export interface SchedulePhaseProposal {
  label: string;
  type: 'BREAK' | string;
  estimatedMinutes: number;
  breakKind?: 'minutes' | 'until' | 'overnight';
  breakMinutes?: number;
  breakUntil?: string;
  nextDayStart?: string;
}

function nextClockTarget(current: Date, time: string, followingDay = false): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return new Date(current);
  const next = new Date(current);
  if (followingDay) next.setDate(next.getDate() + 1);
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (!followingDay && next.getTime() <= current.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

/** Suggest phase START times from a rough estimate; user can freely edit them.
 * No fixtures are scheduled and none of these timestamps control tournament flow.
 */
export function suggestPlannedSchedule(start: string, phases: SchedulePhaseProposal[]): PlannedScheduleItem[] {
  const parsed = parseLocalDateTime(start);
  if (!parsed) return [];
  let cursor = parsed;
  return phases.map((phase, index) => {
    const isBreak = phase.type === 'BREAK';
    const item: PlannedScheduleItem = {
      id: `phase-${index + 1}`,
      at: toLocalDateTime(cursor),
      title: phase.label,
      type: isBreak ? 'break' : 'competition',
    };
    if (!isBreak) {
      cursor = new Date(cursor.getTime() + Math.max(0, phase.estimatedMinutes) * 60000);
    } else if (phase.breakKind === 'overnight') {
      cursor = nextClockTarget(cursor, phase.nextDayStart ?? '09:00', true);
    } else if (phase.breakKind === 'until') {
      cursor = nextClockTarget(cursor, phase.breakUntil ?? '12:00');
    } else {
      cursor = new Date(cursor.getTime() + Math.max(1, phase.breakMinutes ?? 15) * 60000);
    }
    return item;
  });
}
