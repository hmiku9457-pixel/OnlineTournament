import type { Discipline, StageType } from './types';
import type { TournamentSystemId } from './tournamentCreation';
import { MAX_VENUE_GRID_CELLS, MAX_VENUE_GRID_DIMENSION, type VenueLayout } from './venueLayout';

export const CREATION_DRAFT_KEY = 'online-tournament:creation-draft:v1';

export interface CreationDraftParticipant {
  id: string;
  firstName: string;
  lastName: string;
  partnerFirstName: string;
  partnerLastName: string;
  teamName?: string;
}

export interface CreationDraftPhase {
  id: string;
  type: StageType;
  label: string;
  bestOf: number;
  groupCount: number;
  swissRounds: number;
  entrantCount: number;
  knockoutBestOf: number[];
  customEntrants: boolean;
  breakKind: 'minutes' | 'until' | 'overnight';
  breakMinutes: number;
  nextDayStart: string;
  nextDayDate: string;
  breakUntil: string;
  breakUntilDate?: string;
  note: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number;
  inlineBreakUntil: string;
  inlineBreakUntilDate?: string;
  dayBreaks?: import('./playingDays').PlayingDayBreak[];
}

export interface CreationDraft {
  step: number;
  maxReachedStep: number;
  hasVisitedPhaseStep: boolean;
  name: string;
  scheduledDate: string;
  scheduledTime: string;
  useCurrentTime: boolean;
  sport: string;
  discipline: Discipline;
  timedMatchMinutes: string;
  venueTurnoverMinutes: string;
  tables: number;
  customTables: boolean;
  venueLayoutEnabled: boolean;
  venueLayoutCustomized?: boolean;
  venueLayout: VenueLayout;
  participants: CreationDraftParticipant[];
  participantForm: Omit<CreationDraftParticipant, 'id'>;
  editingParticipantId: string | null;
  /** Require acknowledgement after reinterpreting names for a new discipline. */
  rosterReviewRequired?: boolean;
  minimumMatches: number;
  customMinimumMatches: boolean;
  phaseDrafts: CreationDraftPhase[];
  /** Phase settings automatically reduced after roster changes, awaiting review. */
  reviewRequiredPhaseIds?: string[];
  selectedRecommendationId: string | null;
  enabledSystems: Record<TournamentSystemId, boolean>;
  maxGroups: number | null;
  maxSwissRounds: number | null;
  knockoutQualifierCount: number | null;
  preferredDurationMinutes: number;
  /** Frozen active-time allocation for all but the final playing day.
   * Both duration and end clock are derived from the same editable target. */
  preferredEarlierDaysMinutes?: number;
  /** Which of the linked planning targets remains fixed when the live start time advances. */
  preferredTimePriority?: 'duration' | 'end';
  /** Absolute local date/time, deliberately not just an HH:mm clock. */
  preferredFixedEndAt?: string | null;
  tournamentMode?: 'single' | 'multi';
  plannedDays?: number;
  awardsEnabled: boolean;
  awardsAtOverride: string | null;
  /** A dependent roster/phase decision survives refresh with its exact rollback. */
  pendingDependentChange?: {
    next: CreationDraftPhase[];
    losses: Array<{ id: string; label: string; removedRounds: number[];
      removedInlineBreak: boolean; removedKnockoutBestOf?: number[] }>;
    manuallyEditedId?: string;
    source: 'manual' | 'roster';
    previousRoster?: CreationDraftParticipant[];
    previousDiscipline?: Discipline;
    previousSport?: string;
    previousRosterReviewRequired?: boolean;
  } | null;
  /** Values retained across a switch between two timed sports until acknowledged. */
  timeValuesReviewRequired?: boolean;
}

export function validDraft(value: unknown): value is CreationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<CreationDraft>;
  const allowedTypes = ['ROUND_ROBIN', 'GROUPS', 'SWISS', 'KNOCKOUT', 'BREAK'];
  return typeof data.step === 'number' && Number.isInteger(data.step) && data.step >= 1 && data.step <= 5
    && typeof data.maxReachedStep === 'number' && Number.isInteger(data.maxReachedStep) && data.maxReachedStep >= data.step
    && data.maxReachedStep <= 5
    && typeof data.name === 'string' && typeof data.scheduledDate === 'string'
    && typeof data.scheduledTime === 'string'
    && typeof data.useCurrentTime === 'boolean'
    && typeof data.sport === 'string'
    && ['SINGLES', 'DOUBLES', 'TEAMS'].includes(String(data.discipline))
    && typeof data.timedMatchMinutes === 'string' && typeof data.venueTurnoverMinutes === 'string'
    && typeof data.tables === 'number' && Number.isInteger(data.tables) && data.tables >= 1 && data.tables <= 9999
    && typeof data.customTables === 'boolean' && typeof data.venueLayoutEnabled === 'boolean'
    && (data.venueLayoutCustomized === undefined || typeof data.venueLayoutCustomized === 'boolean')
    && Boolean(data.venueLayout && Number.isInteger(data.venueLayout.columns)
      && data.venueLayout.columns > 0 && data.venueLayout.columns <= MAX_VENUE_GRID_DIMENSION
      && Number.isInteger(data.venueLayout.rows)
      && data.venueLayout.rows > 0 && data.venueLayout.rows <= MAX_VENUE_GRID_DIMENSION
      && data.venueLayout.columns * data.venueLayout.rows <= MAX_VENUE_GRID_CELLS
      && Array.isArray(data.venueLayout.cells)
      && data.venueLayout.cells.length === data.venueLayout.columns * data.venueLayout.rows
      && data.venueLayout.cells.every((cell) => typeof cell === 'string')
      && ['none', 'top', 'right', 'bottom', 'left'].includes(data.venueLayout.deskDock))
    && Array.isArray(data.participants) && data.participants.length <= 10000
    && new Set(data.participants.map((entry) => entry?.id)).size === data.participants.length
    && data.participants.every((entry) => entry && typeof entry.id === 'string'
      && ['firstName', 'lastName', 'partnerFirstName', 'partnerLastName']
        .every((key) => typeof (entry as unknown as Record<string, unknown>)[key] === 'string')
      && (entry.teamName === undefined || typeof entry.teamName === 'string'))
    && (data.reviewRequiredPhaseIds === undefined || (Array.isArray(data.reviewRequiredPhaseIds) && data.reviewRequiredPhaseIds.every((id) => typeof id === 'string')))
    && Array.isArray(data.phaseDrafts) && data.phaseDrafts.length <= 80
    && new Set(data.phaseDrafts.map((entry) => entry?.id)).size === data.phaseDrafts.length
    && data.phaseDrafts.every((entry) => entry && typeof entry.id === 'string'
      && allowedTypes.includes(entry.type) && Number.isInteger(entry.entrantCount)
      && Number.isInteger(entry.groupCount) && Number.isInteger(entry.swissRounds)
      && Number.isInteger(entry.bestOf) && entry.bestOf >= 1
      && Array.isArray(entry.knockoutBestOf) && entry.knockoutBestOf.every((best) => Number.isInteger(best) && best >= 1)
      && typeof entry.label === 'string' && typeof entry.customEntrants === 'boolean'
      && ['minutes', 'until', 'overnight'].includes(entry.breakKind)
      && Number.isInteger(entry.breakMinutes)
      && typeof entry.nextDayStart === 'string' && typeof entry.nextDayDate === 'string'
      && typeof entry.breakUntil === 'string' && (entry.breakUntilDate === undefined || typeof entry.breakUntilDate === 'string') && typeof entry.note === 'string'
      && Number.isInteger(entry.inlineBreakAfterRound) && entry.inlineBreakAfterRound >= 0
      && ['minutes', 'until'].includes(entry.inlineBreakKind)
      && Number.isInteger(entry.inlineBreakMinutes)
      && typeof entry.inlineBreakUntil === 'string' && (entry.inlineBreakUntilDate === undefined || typeof entry.inlineBreakUntilDate === 'string')
      && (entry.dayBreaks === undefined || (Array.isArray(entry.dayBreaks) && entry.dayBreaks.length <= 13
        && entry.dayBreaks.every((item) => item && Number.isInteger(item.afterRound) && typeof item.date === 'string' && typeof item.time === 'string'))))
    && data.participantForm !== null && typeof data.participantForm === 'object'
    && ['firstName', 'lastName', 'partnerFirstName', 'partnerLastName']
      .every((key) => typeof (data.participantForm as unknown as Record<string, unknown>)[key] === 'string')
    && (data.participantForm.teamName === undefined || typeof data.participantForm.teamName === 'string')
    && (data.rosterReviewRequired === undefined || typeof data.rosterReviewRequired === 'boolean')
    && (data.editingParticipantId === null || (typeof data.editingParticipantId === 'string'
      && data.participants.some((entry) => entry.id === data.editingParticipantId)))
    && typeof data.hasVisitedPhaseStep === 'boolean' && typeof data.customMinimumMatches === 'boolean'
    && typeof data.minimumMatches === 'number' && Number.isInteger(data.minimumMatches) && data.minimumMatches >= 1
    && data.enabledSystems !== null && typeof data.enabledSystems === 'object'
    && ['round-robin', 'groups', 'swiss', 'knockout'].every((key) =>
      typeof (data.enabledSystems as unknown as Record<string, unknown>)[key] === 'boolean')
    && [data.maxGroups, data.maxSwissRounds, data.knockoutQualifierCount]
      .every((v) => v === null || (typeof v === 'number' && Number.isInteger(v)))
    && (data.tournamentMode === undefined || data.tournamentMode === 'single' || data.tournamentMode === 'multi')
    && (data.plannedDays === undefined || (Number.isInteger(data.plannedDays) && data.plannedDays >= 1 && data.plannedDays <= 14))
    && typeof data.preferredDurationMinutes === 'number'
    && Number.isInteger(data.preferredDurationMinutes) && data.preferredDurationMinutes >= 15
    && data.preferredDurationMinutes <= (data.tournamentMode === 'multi' ? 14 * 24 * 60 - 1 : 1440)
    && (data.preferredEarlierDaysMinutes === undefined
      || (Number.isInteger(data.preferredEarlierDaysMinutes) && data.preferredEarlierDaysMinutes >= 0
        && data.preferredEarlierDaysMinutes < Number.MAX_SAFE_INTEGER))
    && (data.preferredTimePriority === undefined || ['duration', 'end'].includes(data.preferredTimePriority))
    && (data.preferredFixedEndAt === undefined || data.preferredFixedEndAt === null
      || (typeof data.preferredFixedEndAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.preferredFixedEndAt)))
    && (data.selectedRecommendationId === null || typeof data.selectedRecommendationId === 'string')
    && typeof data.awardsEnabled === 'boolean'
    && (data.awardsAtOverride === null || typeof data.awardsAtOverride === 'string')
    && (data.timeValuesReviewRequired === undefined || typeof data.timeValuesReviewRequired === 'boolean')
    && (data.pendingDependentChange === undefined || data.pendingDependentChange === null
      || (Array.isArray(data.pendingDependentChange.next)
        && data.pendingDependentChange.next.length <= 80
        && data.pendingDependentChange.next.every((entry) => entry && typeof entry.id === 'string'
          && Array.isArray(entry.dayBreaks) && Array.isArray(entry.knockoutBestOf))
        && Array.isArray(data.pendingDependentChange.losses)
        && data.pendingDependentChange.losses.length <= 80
        && data.pendingDependentChange.losses.every((loss) => loss && typeof loss.id === 'string'
          && typeof loss.label === 'string' && Array.isArray(loss.removedRounds)
          && typeof loss.removedInlineBreak === 'boolean')
        && ['manual','roster'].includes(data.pendingDependentChange.source)
        && (data.pendingDependentChange.previousDiscipline === undefined
          || ['SINGLES', 'DOUBLES', 'TEAMS'].includes(data.pendingDependentChange.previousDiscipline))
        && (data.pendingDependentChange.previousSport === undefined || typeof data.pendingDependentChange.previousSport === 'string')
        && (data.pendingDependentChange.previousRosterReviewRequired === undefined || typeof data.pendingDependentChange.previousRosterReviewRequired === 'boolean')
        && (data.pendingDependentChange.previousRoster === undefined
          || (Array.isArray(data.pendingDependentChange.previousRoster)
            && data.pendingDependentChange.previousRoster.length <= 10000
            && data.pendingDependentChange.previousRoster.every((entry) =>
              entry && typeof entry.id === 'string' && typeof entry.firstName === 'string'
              && typeof entry.lastName === 'string')))));
}

/** Restored numeric IDs must not collide with newly created entries. */
export function highestDraftSequence(items: readonly { id: string }[], prefix: string): number {
  return items.reduce((highest, item) => {
    const numeric = item.id.startsWith(prefix + '-') ? Number(item.id.slice(prefix.length + 1)) : NaN;
    return Number.isSafeInteger(numeric) && numeric > highest ? numeric : highest;
  }, 0);
}

export function loadCreationDraft(storage?: Pick<Storage, 'getItem'>, key = CREATION_DRAFT_KEY): CreationDraft | null {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = store?.getItem(key);
    if (!raw) return null;
    const decoded: unknown = JSON.parse(raw);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const payload = decoded as { version?: unknown; draft?: unknown };
    return payload.version === 1 && validDraft(payload.draft) ? payload.draft : null;
  } catch { return null; }
}

export function saveCreationDraft(draft: CreationDraft, storage?: Pick<Storage, 'setItem'>, key = CREATION_DRAFT_KEY): boolean {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return false;
    store.setItem(key, JSON.stringify({ version: 1, draft }));
    return true;
  } catch { return false; }
}

export function clearCreationDraft(storage?: Pick<Storage, 'removeItem'>, key = CREATION_DRAFT_KEY): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.removeItem(key);
  } catch { /* No storage access; creation can still proceed. */ }
}

/** Explicitly saved drafts are independent of the per-tab temporary autosave.
 * This permits multiple drafts and prevents two browser tabs from silently
 * overwriting one shared unfinished creation. */
export interface SavedCreationDraft {
  id: string;
  savedAt: string;
  /** Monotonically increasing version used for edit conflict detection. */
  revision: number;
  draft: CreationDraft;
}

