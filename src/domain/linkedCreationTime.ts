import { followingPlayingDate } from './playingDays';
import { parseLocalDateTime, toLocalDateTime } from './tournamentSchedule';
import { MAX_RECOMMENDATION_DURATION, MAX_SINGLE_DAY_DURATION, MIN_RECOMMENDATION_DURATION }
  from '../components/RecommendationDurationPicker';

export interface LinkedTournamentTime {
  /** Local Berlin start (YYYY-MM-DDTHH:mm). */
  scheduledStart: string;
  days: number;
  /** Active minutes allocated to all days except the last. */
  earlierDaysMinutes: number;
}

/** For a multi-day target, initially distribute active time evenly. That
 * allocation is subsequently held constant while either linked control is
 * edited, giving a reliable one-minute-to-one-minute relationship.
 * This is a planning assumption, not an automatic change to actual day breaks. */
export function initialEarlierDaysMinutes(duration: number, days: number): number {
  return days <= 1 ? 0 : Math.floor(duration * (days - 1) / days);
}

export function finalPlayingDayStart(settings: LinkedTournamentTime): string {
  const startDay = settings.scheduledStart.slice(0, 10);
  if (settings.days <= 1) return settings.scheduledStart;
  return `${followingPlayingDate(startDay, settings.days - 1)}T09:00`;
}

function playableMinutesUntilMidnight(startWallClock: string): number {
  const start = parseLocalDateTime(startWallClock);
  const date = start ? toLocalDateTime(start).slice(0, 10) : '';
  const end = date ? parseLocalDateTime(`${date}T23:59`) : null;
  return start && end ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000)) : 0;
}

/** Maximum total active minutes on all playing days, excluding overnight gaps. */
export function maximumLinkedActiveDuration(settings: LinkedTournamentTime): number {
  if (settings.days <= 1) return Math.min(MAX_SINGLE_DAY_DURATION,
    playableMinutesUntilMidnight(settings.scheduledStart));
  let total = playableMinutesUntilMidnight(settings.scheduledStart);
  const first = settings.scheduledStart.slice(0, 10);
  for (let day = 1; day < settings.days; day++) {
    total += playableMinutesUntilMidnight(`${followingPlayingDate(first, day)}T09:00`);
  }
  return Math.min(MAX_RECOMMENDATION_DURATION, total);
}

function previousDaysCapacity(settings: LinkedTournamentTime): number {
  if (settings.days <= 1) return 0;
  const final = playableMinutesUntilMidnight(finalPlayingDayStart(settings));
  return Math.max(0, maximumLinkedActiveDuration(settings) - final);
}

export function maximumLinkedDuration(settings: LinkedTournamentTime): number {
  const start = parseLocalDateTime(finalPlayingDayStart(settings));
  if (!start) return settings.days <= 1 ? MAX_SINGLE_DAY_DURATION : MAX_RECOMMENDATION_DURATION;
  const date = toLocalDateTime(start).slice(0, 10);
  const last = parseLocalDateTime(`${date}T23:59`);
  if (!last) return 0;
  const dailyLimit = Math.max(0, Math.floor((last.getTime() - start.getTime()) / 60_000));
  return Math.min(settings.days <= 1 ? MAX_SINGLE_DAY_DURATION : MAX_RECOMMENDATION_DURATION,
    (settings.days <= 1 ? 0 : settings.earlierDaysMinutes) + dailyLimit);
}

export function linkedEndTime(duration: number, settings: LinkedTournamentTime): string | null {
  const finalStart = parseLocalDateTime(finalPlayingDayStart(settings));
  if (!finalStart || !Number.isInteger(duration) || duration < MIN_RECOMMENDATION_DURATION
    || duration > maximumLinkedDuration(settings)) return null;
  const activeFinal = duration - (settings.days <= 1 ? 0 : settings.earlierDaysMinutes);
  if (activeFinal < 1) return null;
  const actualEnd = new Date(finalStart.getTime() + activeFinal * 60_000);
  return toLocalDateTime(actualEnd).slice(0, 10) === toLocalDateTime(finalStart).slice(0, 10)
    ? toLocalDateTime(actualEnd).slice(11, 16) : null;
}

export function linkedDuration(endClock: string, settings: LinkedTournamentTime): number | null {
  const start = parseLocalDateTime(finalPlayingDayStart(settings));
  if (!start) return null;
  const date = toLocalDateTime(start).slice(0, 10);
  const end = parseLocalDateTime(`${date}T${endClock}`);
  if (!end) return null;
  const dailyMinutes = Math.floor((end.getTime() - start.getTime()) / 60_000);
  const duration = dailyMinutes + (settings.days <= 1 ? 0 : settings.earlierDaysMinutes);
  if (dailyMinutes < 1 || duration < MIN_RECOMMENDATION_DURATION
    || duration > maximumLinkedDuration(settings)) return null;
  return duration;
}

/** When a director chooses an unusually long duration, rebalance the unedited
 * earlier days rather than allowing an invalid, unsynchronised end clock. */
export function rebalanceEarlierDays(duration: number, settings: LinkedTournamentTime): number {
  if (settings.days <= 1) return 0;
  const finalCapacity = playableMinutesUntilMidnight(finalPlayingDayStart(settings));
  const minEarlier = Math.max(0, duration - finalCapacity);
  const maxEarlier = Math.min(duration - 1, previousDaysCapacity(settings));
  return Math.max(minEarlier, Math.min(maxEarlier, settings.earlierDaysMinutes));
}

export function earliestLinkedEnd(settings: LinkedTournamentTime): string | undefined {
  const start = parseLocalDateTime(finalPlayingDayStart(settings));
  if (!start) return undefined;
  const needed = settings.days <= 1
    ? MIN_RECOMMENDATION_DURATION : Math.max(1, MIN_RECOMMENDATION_DURATION - settings.earlierDaysMinutes);
  return toLocalDateTime(new Date(start.getTime() + needed * 60_000)).slice(11, 16);
}
