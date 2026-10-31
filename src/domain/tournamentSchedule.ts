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

/** Total planned wall-clock span including scheduled pauses and multi-day breaks. */
export function plannedTimelineDurationMinutes(start: string, end: string): number | null {
  const first = parseLocalDateTime(start);
  const last = parseLocalDateTime(end);
  if (!first || !last || last.getTime() < first.getTime()) return null;
  return Math.max(0, Math.round((last.getTime() - first.getTime()) / 60000));
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
  roundCount?: number;
  inlineBreakAfterRound?: number;
  inlineBreakKind?: 'minutes' | 'until';
  inlineBreakMinutes?: number;
  inlineBreakUntil?: string;
}

export interface PlannedTimeline {
  /** Scheduled start of every phase, in the same order as the phase editor. */
  items: PlannedScheduleItem[];
  /** Expected end of the last phase, useful for planning an awards ceremony. */
  estimatedEnd: string;
  /** Inconsistent clock pauses are kept on the same day and flagged, never silently shifted to tomorrow. */
  warnings: Array<{ phaseIndex: number; message: string }>;
}

function clockAt(current: Date, time: string, followingDay = false): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return new Date(current);
  const next = new Date(current);
  if (followingDay) next.setDate(next.getDate() + 1);
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return next;
}

/** Calculate the whole non-binding timetable, starting with the first tournament
 * phase. A "Pause bis" that would end before the theoretical pause begins
 * produces a warning instead of introducing an unexplained next-day delay.
 * Actual phase starts and game assignments never read these values.
 */
export function buildPlannedTimeline(start: string, phases: SchedulePhaseProposal[]): PlannedTimeline {
  const cursorStart = parseLocalDateTime(start);
  if (!cursorStart) return { items: [], estimatedEnd: '', warnings: [] };
  let cursor = cursorStart;
  const warnings: PlannedTimeline['warnings'] = [];
  const items: PlannedScheduleItem[] = [];
  phases.forEach((phase, index) => {
    const isBreak = phase.type === 'BREAK';
    items.push({
      id: `phase-${index + 1}`,
      at: toLocalDateTime(cursor),
      title: phase.label,
      type: isBreak ? 'break' : 'competition',
    });
    if (!isBreak) {
      const totalDuration = Math.max(0, phase.estimatedMinutes);
      const roundCount = Math.max(0, Math.trunc(phase.roundCount ?? 0));
      const afterRound = Number(phase.inlineBreakAfterRound) || 0;
      if (roundCount > 1 && afterRound >= 1 && afterRound < roundCount) {
        const before = Math.round(totalDuration * afterRound / roundCount);
        const after = Math.round(totalDuration) - before;
        const inlineStart = new Date(cursor.getTime() + before * 60000);
        items.push({ id: `inline-break-${index + 1}`, at: toLocalDateTime(inlineStart),
          title: `Pause nach Runde ${afterRound} · ${phase.label}`, type: 'break' });
        let resume = inlineStart;
        if (phase.inlineBreakKind === 'until') {
          const target = clockAt(inlineStart, phase.inlineBreakUntil ?? '13:00');
          if (target < inlineStart) {
            warnings.push({ phaseIndex: index, message: `„${phase.label}“: Die Zwischenpause nach Runde ${afterRound} beginnt voraussichtlich um ${formatPlannedDateTime(toLocalDateTime(inlineStart), false)}. „Pause bis ${phase.inlineBreakUntil ?? '13:00'} Uhr“ liegt davor. Bitte eine spätere Uhrzeit wählen.` });
          } else resume = target;
        } else resume = new Date(inlineStart.getTime() + Math.max(1, phase.inlineBreakMinutes ?? 15) * 60000);
        cursor = new Date(resume.getTime() + after * 60000);
      } else cursor = new Date(cursor.getTime() + totalDuration * 60000);
    } else if (phase.breakKind === 'overnight') {
      cursor = clockAt(cursor, phase.nextDayStart ?? '09:00', true);
    } else if (phase.breakKind === 'until') {
      const target = clockAt(cursor, phase.breakUntil ?? '12:00');
      if (target.getTime() < cursor.getTime()) {
        const planned = String(phase.breakUntil ?? '12:00');
        const earliest = formatPlannedDateTime(toLocalDateTime(cursor), false);
        warnings.push({
          phaseIndex: index,
          message: `„${phase.label}“: Pause bis ${planned} Uhr liegt vor dem voraussichtlichen Pausenbeginn um ${earliest}. Bitte eine spätere Uhrzeit wählen. Für die Vorschau wird die nächste Phase frühestens nach dem vorherigen Spielende angesetzt.`,
        });
      } else {
        cursor = target;
      }
    } else {
      cursor = new Date(cursor.getTime() + Math.max(1, phase.breakMinutes ?? 15) * 60000);
    }
  });
  return { items, estimatedEnd: toLocalDateTime(cursor), warnings };
}

/** Backwards-compatible helper for templates and external callers. */
export function suggestPlannedSchedule(start: string, phases: SchedulePhaseProposal[]): PlannedScheduleItem[] {
  return buildPlannedTimeline(start, phases).items;
}
