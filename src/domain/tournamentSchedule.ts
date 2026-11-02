/** Public, explicitly non-binding timetable. No competition lifecycle uses it. */
export interface PlannedScheduleItem {
  id: string;
  at: string; // Tournament-local wall-clock date/time: YYYY-MM-DDTHH:mm
  title: string;
  type: 'competition' | 'break' | 'other';
  /** Ceremony follows the projected finish unless explicitly rescheduled. */
  autoTime?: boolean;
  note?: string;
  /** Estimated pause length; set only for breaks. Kept separate from 'at',
   * which is still required internally to calculate later phase starts. */
  durationMinutes?: number;
  /** Clock-target breaks are only approximate because real rounds can end later. */
  durationApproximate?: boolean;
  /** Preserves the kind of interruption for appropriate display in the timetable. */
  breakKind?: 'minutes' | 'until' | 'overnight';
}

/** A local clock hour can repeat when DST ends. The current draft format does not
 * preserve a UTC offset, so never guess which occurrence the director intended. */
export function isAmbiguousLocalDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number);
  const first = new Date(y, mo - 1, d, h, mi);
  if (first.getFullYear() !== y || first.getMonth() + 1 !== mo || first.getDate() !== d
    || first.getHours() !== h || first.getMinutes() !== mi) return false;
  const laterOffset = new Date(first.getTime() + 3 * 60 * 60000).getTimezoneOffset();
  const extraMinutes = laterOffset - first.getTimezoneOffset();
  if (extraMinutes <= 0) return false;
  const repeated = new Date(first.getTime() + extraMinutes * 60000);
  return repeated.getFullYear() === y && repeated.getMonth() + 1 === mo && repeated.getDate() === d
    && repeated.getHours() === h && repeated.getMinutes() === mi;
}

/** The browser's local wall clock is used intentionally, not Date.toISOString(). */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (date.getFullYear() !== Number(y) || date.getMonth() + 1 !== Number(mo)
    || date.getDate() !== Number(d) || date.getHours() !== Number(h)
    || date.getMinutes() !== Number(mi) || isAmbiguousLocalDateTime(value)) return null;
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

/** Creation accepts the current calendar minute (seconds are not editable)
 * or a future minute. Compare Date values to respect DST boundaries. */
export function isStartAtOrAfterNow(start: string, now = new Date()): boolean {
  const scheduled = parseLocalDateTime(start);
  if (!scheduled || Number.isNaN(now.getTime())) return false;
  const thisMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  return scheduled.getTime() >= thisMinute.getTime();
}

export function formatPlannedDateTime(value: string, withDate = true): string {
  const date = parseLocalDateTime(value);
  if (!date) return 'Termin nicht festgelegt';
  return date.toLocaleString('de-DE', withDate
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { timeStyle: 'short' }) + ' Uhr';
}

/** Display break length rather than a fictitious exact pause-start time.
 * "Pause bis" and overnight pauses depend on when play actually finishes.
 */
export function formatPlannedBreakDuration(item: PlannedScheduleItem): string {
  if (item.type !== 'break' || item.durationMinutes === undefined
    || !Number.isFinite(item.durationMinutes) || item.durationMinutes < 0) {
    return 'Dauer noch offen';
  }
  const minutes = Math.max(0, Math.round(item.durationMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const duration = hours === 0 ? `${rest} Min.`
    : rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
  return item.durationApproximate ? `ca. ${duration}` : duration;
}

/** Day grouping for informational timetables. Pause durations stay relative,
 * while all actual phase times are displayed without redundant dates.
 */
export interface PlannedDayGroup {
  date: string;
  label: string;
  items: PlannedScheduleItem[];
}
export interface PlannedDayGroups {
  multipleDays: boolean;
  days: PlannedDayGroup[];
}
export function formatPlannedClockTime(value: string): string {
  return formatPlannedDateTime(value, false);
}
export function groupPlannedScheduleDays(items: PlannedScheduleItem[], scheduledStart?: string): PlannedDayGroups {
  const dayMap = new Map<string, PlannedScheduleItem[]>();
  const dates = new Set<string>();
  if (scheduledStart && isValidLocalDateTime(scheduledStart)) dates.add(scheduledStart.slice(0, 10));
  for (const item of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    const date = isValidLocalDateTime(item.at) ? item.at.slice(0, 10) : 'unknown';
    if (date !== 'unknown') dates.add(date);
    const dayItems = dayMap.get(date) ?? [];
    dayItems.push(item);
    dayMap.set(date, dayItems);
  }
  return {
    multipleDays: dates.size > 1,
    days: [...dayMap.entries()].map(([date, entries]) => ({
      date,
      label: date === 'unknown' ? 'Datum noch offen'
        : parseLocalDateTime(`${date}T12:00`)!.toLocaleDateString('de-DE', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }),
      items: entries,
    })),
  };
}

/** Pauses specified as absolute clock times must not precede their
 * estimated start. Otherwise the live scheduler may interpret them as
 * a next-day break while the planning preview silently omits them. */
export function plannedTimelineConflicts(timeline: PlannedTimeline): string[] {
  return timeline.warnings.map((warning) => warning.message);
}

export function validatePlannedSchedule(items: PlannedScheduleItem[]): string[] {
  if (items.length > 80) return ['Der Zeitplan darf höchstens 80 Einträge enthalten.'];
  const issues: string[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const label = `Zeitplan-Eintrag ${index + 1}`;
    if (!item.id || seen.has(item.id)) issues.push(`${label}: ID fehlt oder ist doppelt.`);
    seen.add(item.id);
    if (!isValidLocalDateTime(item.at)) issues.push(isAmbiguousLocalDateTime(item.at)
      ? `${label}: Die Uhrzeit kommt bei der Winterzeitumstellung zweimal vor. Bitte eine eindeutige Uhrzeit wählen.`
      : `${label}: Gültiges Datum und Uhrzeit erforderlich.`);
    if (!item.title.trim() || item.title.trim().length > 80) issues.push(`${label}: Bezeichnung muss 1 bis 80 Zeichen enthalten.`);
    if ((item.note?.length ?? 0) > 600) issues.push(`${label}: Hinweis darf höchstens 600 Zeichen enthalten.`);
    if (!['competition', 'break', 'other'].includes(item.type)) issues.push(`${label}: Unbekannter Eintragstyp.`);
  });
  return issues;
}

export interface SchedulePhaseProposal {
  label: string;
  note?: string;
  type: 'BREAK' | string;
  estimatedMinutes: number;
  breakKind?: 'minutes' | 'until' | 'overnight';
  breakMinutes?: number;
  breakUntil?: string;
  /** Immutable local day originally chosen for a fixed deadline. */
  breakUntilDate?: string;
  nextDayStart?: string;
  /** Optional explicit return date; absent means the calendar day after the previous phase. */
  nextDayDate?: string;
  roundCount?: number;
  /** Durations in the actual round order, including any first-round byes. */
  roundDurationsMinutes?: number[];
  inlineBreakAfterRound?: number;
  inlineBreakKind?: 'minutes' | 'until';
  inlineBreakMinutes?: number;
  inlineBreakUntil?: string;
  inlineBreakUntilDate?: string;
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
      note: isBreak ? phase.note?.trim() : undefined,
      type: isBreak ? 'break' : 'competition',
      ...(isBreak ? { breakKind: phase.breakKind ?? 'minutes' } : {}),
    });
    if (!isBreak) {
      const totalDuration = Math.max(0, phase.estimatedMinutes);
      const roundCount = Math.max(0, Math.trunc(phase.roundCount ?? 0));
      const afterRound = Number(phase.inlineBreakAfterRound) || 0;
      if (roundCount > 1 && afterRound >= 1 && afterRound < roundCount) {
        const roundMinutes = phase.roundDurationsMinutes;
        const validBreakdown = roundMinutes?.length === roundCount
          && roundMinutes.every((value) => Number.isFinite(value) && value >= 0);
        const before = validBreakdown
          ? roundMinutes.slice(0, afterRound).reduce((sum, value) => sum + value, 0)
          : Math.round(totalDuration * afterRound / roundCount);
        const after = Math.round(totalDuration) - before;
        const inlineStart = new Date(cursor.getTime() + before * 60000);
        const inlinePause: PlannedScheduleItem = { id: `inline-break-${index + 1}`, at: toLocalDateTime(inlineStart),
          title: `Pause nach Runde ${afterRound} · ${phase.label}`, type: 'break',
          durationApproximate: phase.inlineBreakKind === 'until' };
        items.push(inlinePause);
        let resume = inlineStart;
        let validDuration = true;
        if (phase.inlineBreakKind === 'until') {
          const target = phase.inlineBreakUntilDate
            ? parseLocalDateTime(`${phase.inlineBreakUntilDate}T${phase.inlineBreakUntil ?? '13:00'}`)
              ?? new Date(NaN)
            : clockAt(inlineStart, phase.inlineBreakUntil ?? '13:00');
          if (Number.isNaN(target.getTime()) || target < inlineStart) {
            const requestedDate = phase.inlineBreakUntilDate || toLocalDateTime(inlineStart).slice(0, 10);
            const targetLabel = `${requestedDate} ${phase.inlineBreakUntil ?? '13:00'} Uhr`;
            warnings.push({ phaseIndex: index, message: `„${phase.label}“: Die Zwischenpause nach Runde ${afterRound} beginnt voraussichtlich am ${formatPlannedDateTime(toLocalDateTime(inlineStart))}. Das feste Pausenziel am ${targetLabel} liegt davor. Bitte Datum und Uhrzeit korrigieren.` });
            validDuration = false;
          } else resume = target;
        } else resume = new Date(inlineStart.getTime() + Math.max(1, phase.inlineBreakMinutes ?? 15) * 60000);
        if (validDuration) inlinePause.durationMinutes = Math.max(0, Math.round((resume.getTime() - inlineStart.getTime()) / 60000));
        items.push({ id: `inline-resume-${index + 1}`, at: toLocalDateTime(resume),
          title: `Fortsetzung Runde ${afterRound + 1} · ${phase.label}`, type: 'competition' });
        cursor = new Date(resume.getTime() + after * 60000);
      } else cursor = new Date(cursor.getTime() + totalDuration * 60000);
    } else if (phase.breakKind === 'overnight') {
      const pauseStart = cursor;
      const explicit = phase.nextDayDate ? parseLocalDateTime(phase.nextDayDate + 'T' + (phase.nextDayStart ?? '09:00')) : null;
      const tomorrow = clockAt(cursor, phase.nextDayStart ?? '09:00', true);
      if (phase.nextDayDate && (!explicit || phase.nextDayDate <= toLocalDateTime(cursor).slice(0, 10))) {
        warnings.push({ phaseIndex: index,
          message: '„' + phase.label + '“: Das Fortsetzungsdatum muss nach dem Ende der vorherigen Phase liegen. Bitte ein späteres Datum wählen.' });
      }
      cursor = explicit && phase.nextDayDate! > toLocalDateTime(pauseStart).slice(0, 10) ? explicit : tomorrow;
      const pause = items[items.length - 1];
      pause.durationMinutes = Math.max(0, Math.round((cursor.getTime() - pauseStart.getTime()) / 60000));
      pause.durationApproximate = true;
    } else if (phase.breakKind === 'until') {
      const target = phase.breakUntilDate
        ? parseLocalDateTime(`${phase.breakUntilDate}T${phase.breakUntil ?? '12:00'}`) ?? new Date(NaN)
        : clockAt(cursor, phase.breakUntil ?? '12:00');
      const pause = items[items.length - 1];
      pause.durationApproximate = true;
      if (Number.isNaN(target.getTime()) || target.getTime() < cursor.getTime()) {
        const planned = String(phase.breakUntil ?? '12:00');
        const earliest = formatPlannedDateTime(toLocalDateTime(cursor));
        const plannedDate = phase.breakUntilDate || toLocalDateTime(cursor).slice(0, 10);
        const targetLabel = `${plannedDate} ${planned} Uhr`;
        const wrongDay = plannedDate < toLocalDateTime(cursor).slice(0, 10);
        warnings.push({
          phaseIndex: index,
          message: `„${phase.label}“: Pause bis ${planned} Uhr liegt vor dem voraussichtlichen Pausenbeginn um ${formatPlannedDateTime(toLocalDateTime(cursor), false)}. Gewähltes Ziel: ${targetLabel}; voraussichtlicher Pausenbeginn: ${earliest}. ${wrongDay ? 'Das gewählte Datum liegt vor dem Pausentag.' : 'Die Uhrzeit liegt am selben Tag zu früh.'} Bitte Datum und Uhrzeit korrigieren. Für die Vorschau wird die nächste Phase frühestens nach dem vorherigen Spielende angesetzt.`,
        });
      } else {
        pause.durationMinutes = Math.max(0, Math.round((target.getTime() - cursor.getTime()) / 60000));
        cursor = target;
      }
    } else {
      const pauseMinutes = Math.max(1, phase.breakMinutes ?? 15);
      items[items.length - 1].durationMinutes = pauseMinutes;
      items[items.length - 1].durationApproximate = false;
      cursor = new Date(cursor.getTime() + pauseMinutes * 60000);
    }
  });
  return { items, estimatedEnd: toLocalDateTime(cursor), warnings };
}

/**
 * Pause time that occupies a scheduled tournament day.
 * Overnight/day-change gaps only separate calendar days; they do not count
 * toward the planned tournament duration or its break total.
 * Includes both standalone breaks and breaks between rounds.
 */
export function plannedActiveBreakMinutes(timeline: PlannedTimeline): number {
  return timeline.items.reduce((total, item) => {
    if (item.type !== 'break' || item.breakKind === 'overnight'
      || item.durationMinutes === undefined || !Number.isFinite(item.durationMinutes)) return total;
    return total + Math.max(0, Math.round(item.durationMinutes));
  }, 0);
}

/** Backwards-compatible helper for templates and external callers. */
export function suggestPlannedSchedule(start: string, phases: SchedulePhaseProposal[]): PlannedScheduleItem[] {
  return buildPlannedTimeline(start, phases).items;
}
