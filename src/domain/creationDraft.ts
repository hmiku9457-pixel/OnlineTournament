import type { Discipline, StageType } from './types';
import type { TournamentSystemId } from './tournamentCreation';
import type { VenueLayout } from './venueLayout';

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
  note: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number;
  inlineBreakUntil: string;
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
  awardsEnabled: boolean;
  awardsAtOverride: string | null;
}

export function validDraft(value: unknown): value is CreationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<CreationDraft>;
  const allowedTypes = ['ROUND_ROBIN', 'GROUPS', 'SWISS', 'KNOCKOUT', 'BREAK'];
  return Number.isInteger(Number(data.step)) && Number(data.step) >= 1 && Number(data.step) <= 5
    && Number.isInteger(Number(data.maxReachedStep)) && Number(data.maxReachedStep) >= Number(data.step)
    && Number(data.maxReachedStep) <= 5
    && typeof data.name === 'string' && typeof data.scheduledDate === 'string'
    && typeof data.scheduledTime === 'string'
    && typeof data.useCurrentTime === 'boolean'
    && typeof data.sport === 'string'
    && ['SINGLES', 'DOUBLES', 'TEAMS'].includes(String(data.discipline))
    && typeof data.timedMatchMinutes === 'string' && typeof data.venueTurnoverMinutes === 'string'
    && Number.isInteger(Number(data.tables)) && Number(data.tables) >= 1 && Number(data.tables) <= 9999
    && typeof data.customTables === 'boolean' && typeof data.venueLayoutEnabled === 'boolean'
    && (data.venueLayoutCustomized === undefined || typeof data.venueLayoutCustomized === 'boolean')
    && Boolean(data.venueLayout && Number.isInteger(data.venueLayout.columns)
      && data.venueLayout.columns > 0 && Number.isInteger(data.venueLayout.rows)
      && data.venueLayout.rows > 0 && Array.isArray(data.venueLayout.cells)
      && data.venueLayout.cells.length === data.venueLayout.columns * data.venueLayout.rows
      && data.venueLayout.cells.every((cell) => typeof cell === 'string')
      && ['none', 'top', 'right', 'bottom', 'left'].includes(data.venueLayout.deskDock))
    && Array.isArray(data.participants) && data.participants.length <= 10000
    && data.participants.every((entry) => entry && typeof entry.id === 'string'
      && ['firstName', 'lastName', 'partnerFirstName', 'partnerLastName']
        .every((key) => typeof (entry as unknown as Record<string, unknown>)[key] === 'string'))
    && (data.reviewRequiredPhaseIds === undefined || (Array.isArray(data.reviewRequiredPhaseIds) && data.reviewRequiredPhaseIds.every((id) => typeof id === 'string')))
    && Array.isArray(data.phaseDrafts) && data.phaseDrafts.length <= 80
    && data.phaseDrafts.every((entry) => entry && typeof entry.id === 'string'
      && allowedTypes.includes(entry.type) && Number.isInteger(entry.entrantCount)
      && Number.isInteger(entry.groupCount) && Number.isInteger(entry.swissRounds)
      && Array.isArray(entry.knockoutBestOf) && typeof entry.label === 'string'
      && typeof entry.breakKind === 'string' && typeof entry.nextDayDate === 'string')
    && data.participantForm !== null && typeof data.participantForm === 'object'
    && ['firstName', 'lastName', 'partnerFirstName', 'partnerLastName']
      .every((key) => typeof (data.participantForm as unknown as Record<string, unknown>)[key] === 'string')
    && (data.editingParticipantId === null || typeof data.editingParticipantId === 'string')
    && typeof data.hasVisitedPhaseStep === 'boolean' && typeof data.customMinimumMatches === 'boolean'
    && Number.isInteger(Number(data.minimumMatches)) && Number(data.minimumMatches) >= 1
    && data.enabledSystems !== null && typeof data.enabledSystems === 'object'
    && ['round-robin', 'groups', 'swiss', 'knockout'].every((key) =>
      typeof (data.enabledSystems as unknown as Record<string, unknown>)[key] === 'boolean')
    && [data.maxGroups, data.maxSwissRounds, data.knockoutQualifierCount]
      .every((v) => v === null || (typeof v === 'number' && Number.isInteger(v)))
    && typeof data.preferredDurationMinutes === 'number'
    && Number.isInteger(data.preferredDurationMinutes) && data.preferredDurationMinutes >= 15
    && data.preferredDurationMinutes <= 1439
    && (data.selectedRecommendationId === null || typeof data.selectedRecommendationId === 'string')
    && typeof data.awardsEnabled === 'boolean'
    && (data.awardsAtOverride === null || typeof data.awardsAtOverride === 'string');
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

