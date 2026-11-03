import { VenueLayoutEditor } from '@/components/VenueLayout';
import { createVenueLayout, resizeVenueLayoutForTableCount, validateVenueLayout } from '@/domain/venueLayout';
import { getVenueTerminology } from '@/domain/venueTerminology';
import { validateTournamentCreation } from '@/domain/validateTournamentCreation';
import { disciplineLabel, disciplineOptionsForSport, planningMinutesPerSet, sportOptions } from '@/domain/sports';
import { sportScoring } from '@/domain/sportScoring';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  bestOfOptions,
  createPhaseTemplate,
  defaultBestOfForStage,
  estimatePhaseMetrics,
  estimateKnockoutRoundMinutes,
  minimumPlayedMatches,
  formatGroupDistribution,
  hasValidTerminalStageOrder,
  hasValidBreakStageOrder,
  isValidSwissRoundCount,
  isTerminalStage,
  knockoutEntrantPresets,
  knockoutRoundLabels,
  recommendGroupCount,
  changedGroupRecommendationMessage,
  recommendedSwissRounds,
  stageLabel,
  tournamentSystemOptions,
  type CreationPhaseTemplate,
  type TournamentSystemId,
} from '@/domain/tournamentCreation';
import type { Discipline, StageType } from '@/domain/types';
import { recommendTournamentFormats, type FormatRecommendation } from '@/engine/recommendations';
import { createMockTournamentAtomic, findTournamentNameConflict, prestartPlanningFingerprint, updatePrestartTournamentPhasesSafely } from '@/services/mockTournamentStore';
import { hasStartedAnyStage } from '@/domain/prestartPhasePlanning';
import { getPhaseLifecycle } from '@/services/mockPhaseLifecycle';
import type { DemoTournament } from '@/data/demoTournaments';
import { initialPrestartPhases, validatePrestartPhases, type PrestartPhaseDraft } from '@/domain/prestartPhasePlanning';
import { findSportOption } from '@/domain/sports';
import { PlannedScheduleEditor } from '@/components/PlannedScheduleEditor';
import { formatPhaseOverview } from '@/domain/creationOverview';
import { changedPhaseEntrantIds, needsRosterPhaseReview } from '@/domain/phaseReview';
import { CREATION_DRAFT_KEY, loadCreationDraft, saveCreationDraft, clearCreationDraft, highestDraftSequence, type CreationDraft, type SavedCreationDraft } from '@/domain/creationDraft';
import { saveNamedCreationDraftAtomic, removeSavedCreationDraftAtomic } from '@/domain/savedCreationDraftStore';
import { ClockTimePicker, parseClockTime } from '@/components/ClockTimePicker';
import { RecommendationDurationPicker, DEFAULT_RECOMMENDATION_DURATION, MIN_RECOMMENDATION_DURATION, MAX_RECOMMENDATION_DURATION, formatRecommendationDuration } from '@/components/RecommendationDurationPicker';
import { RecommendationNumberStepper } from '@/components/RecommendationNumberStepper';
import { SportChangeDialog } from '@/components/SportChangeDialog';
import { DisciplineChangeDialog } from '@/components/DisciplineChangeDialog';
import { TestParticipantsDialog } from '@/components/TestParticipantsDialog';
import { DiscardDraftDialog } from '@/components/DiscardDraftDialog';
import { UnsavedParticipantDialog } from '@/components/UnsavedParticipantDialog';
import { QualificationRuleDialog } from '@/components/QualificationRuleDialog';
import { needsGroupStreichungsregel, recommendedEqualGroupQualifiers } from '@/domain/groupQualification';
import { isAllowedParticipantName, participantNameKey, sanitizeParticipantName, invalidParticipantRosterIndices, MAX_PARTICIPANT_NAME_LENGTH } from '@/domain/participantNames';
import { convertToSingleDay, countConfiguredDayTransitions, countCreationScheduleEntries, MAX_CREATION_SCHEDULE_ENTRIES, reconcileRoundDependentBreaks } from '@/domain/creationPlanTransitions';
import { anchorFixedPauseDates, clearInlinePauseOnTypeChange } from '@/domain/fixedPauseDates';
import { configuredPlayingDays, followingPlayingDate, playingRounds, suggestDaySplit, type PlayingDayBreak } from '@/domain/playingDays';
import { CalendarDatePicker, nextCalendarDate, parseCalendarDate } from '@/components/CalendarDatePicker';
import { buildPlannedTimeline, formatPlannedDateTime, isAmbiguousLocalDateTime, isValidLocalDateTime, isStartAtOrAfterNow, plannedActiveBreakMinutes, plannedTimelineConflicts, playingDayOverflowWarnings, toLocalDateTime, validatePlannedSchedule, type PlannedScheduleItem } from '@/domain/tournamentSchedule';

type WizardStep = 1 | 2 | 3 | 4 | 5;

type ParticipantFields = {
  firstName: string;
  lastName: string;
  partnerFirstName: string;
  partnerLastName: string;
  /** Team label lives separately from the person's first and last names. */
  teamName?: string;
};

type ParticipantDraft = ParticipantFields & {
  id: string;
};

type ParticipantField = keyof ParticipantFields;
type ParticipantErrors = Partial<Record<ParticipantField, string>>;

type PhaseDraft = {
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
  breakUntilDate: string;
  note: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number;
  inlineBreakUntil: string;
  inlineBreakUntilDate: string;
  dayBreaks: PlayingDayBreak[];
};

const stepLabels = ['Grunddaten', 'Teilnehmer', 'Turnierform', 'Phasen', 'Zusammenfassung'];
const initialEnabledSystems = Object.fromEntries(
  tournamentSystemOptions.map((option) => [option.id, true]),
) as Record<TournamentSystemId, boolean>;

let participantSequence = 0;
let phaseSequence = 0;

function emptyParticipantFields(): ParticipantFields {
  return {
    firstName: '',
    lastName: '',
    partnerFirstName: '',
    partnerLastName: '',
    teamName: '',
  };
}

function newParticipant(fields: ParticipantFields): ParticipantDraft {
  participantSequence += 1;
  return { id: `participant-${participantSequence}`, ...fields };
}

function participantIsComplete(participant: ParticipantFields, discipline: Discipline): boolean {
  if (discipline === 'TEAMS') return Boolean(participant.teamName?.trim() || displayPersonName(participant.firstName, participant.lastName));
  if (!participant.firstName.trim() || !participant.lastName.trim()) return false;
  if (discipline === 'DOUBLES') {
    return Boolean(participant.partnerFirstName.trim() && participant.partnerLastName.trim());
  }
  return true;
}

function normalizePersonName(firstName: string, lastName: string): string {
  return participantNameKey(displayPersonName(firstName, lastName));
}

function displayPersonName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim();
}

function participantDisplayName(participant: ParticipantFields, discipline: Discipline): string {
  if (discipline === 'TEAMS') return participant.teamName?.trim() || displayPersonName(participant.firstName, participant.lastName);
  const firstPlayer = displayPersonName(participant.firstName, participant.lastName);
  if (discipline === 'SINGLES') return firstPlayer;
  const secondPlayer = displayPersonName(participant.partnerFirstName, participant.partnerLastName);
  return `${firstPlayer} / ${secondPlayer}`;
}

function collectSavedPersonNames(
  participants: ParticipantDraft[],
  discipline: Discipline,
  excludedParticipantId: string | null,
): Set<string> {
  const names = new Set<string>();
  for (const participant of participants) {
    if (participant.id === excludedParticipantId) continue;
    if (discipline === 'TEAMS') {
      const name = participant.teamName?.trim() || displayPersonName(participant.firstName, participant.lastName);
      if (name) names.add(participantNameKey(name));
      continue;
    }
    if (participant.firstName.trim() && participant.lastName.trim()) {
      names.add(normalizePersonName(participant.firstName, participant.lastName));
    }
    if (
      discipline === 'DOUBLES'
      && participant.partnerFirstName.trim()
      && participant.partnerLastName.trim()
    ) {
      names.add(normalizePersonName(participant.partnerFirstName, participant.partnerLastName));
    }
  }
  return names;
}

function validateParticipant(
  participant: ParticipantFields,
  discipline: Discipline,
  participants: ParticipantDraft[],
  editingParticipantId: string | null,
): ParticipantErrors {
  const errors: ParticipantErrors = {};
  if (discipline === 'TEAMS') {
    const teamName = participant.teamName?.trim() || displayPersonName(participant.firstName, participant.lastName);
    if (!teamName) return { firstName: 'Bitte einen Mannschaftsnamen eingeben.' };
    if (teamName.length > MAX_PARTICIPANT_NAME_LENGTH) return { firstName: `Ein Name darf höchstens ${MAX_PARTICIPANT_NAME_LENGTH} Zeichen enthalten.` };
    if (!isAllowedParticipantName(teamName)) return { firstName: 'Buchstaben, Zahlen, Punkte, Klammern, Leerzeichen und Bindestriche sind erlaubt.' };
    const occupied = collectSavedPersonNames(participants, discipline, editingParticipantId);
    return occupied.has(participantNameKey(teamName))
      ? { firstName: 'Diese Mannschaft ist bereits eingetragen.' } : errors;
  }
  if (!participant.firstName.trim()) errors.firstName = 'Vorname fehlt.';
  if (!participant.lastName.trim()) errors.lastName = 'Nachname fehlt.';
  if (discipline === 'DOUBLES') {
    if (!participant.partnerFirstName.trim()) errors.partnerFirstName = 'Vorname von Spieler 2 fehlt.';
    if (!participant.partnerLastName.trim()) errors.partnerLastName = 'Nachname von Spieler 2 fehlt.';
  }

  for (const field of ['firstName', 'lastName', ...(discipline === 'DOUBLES' ? ['partnerFirstName', 'partnerLastName'] : [])] as ParticipantField[]) {
    if ((participant[field] ?? '').trim() && (participant[field] ?? '').trim().length > MAX_PARTICIPANT_NAME_LENGTH) {
      errors[field] = `Ein Name darf höchstens ${MAX_PARTICIPANT_NAME_LENGTH} Zeichen enthalten.`;
    } else if ((participant[field] ?? '').trim() && !isAllowedParticipantName(participant[field] ?? '')) {
      errors[field] = 'Buchstaben, Zahlen, Punkte, Klammern, Leerzeichen und Bindestriche sind erlaubt.';
    }
  }
  if (Object.keys(errors).length > 0) return errors;

  const existingNames = collectSavedPersonNames(participants, discipline, editingParticipantId);
  const playerOneKey = normalizePersonName(participant.firstName, participant.lastName);
  const playerOneDisplay = displayPersonName(participant.firstName, participant.lastName);
  if (existingNames.has(playerOneKey)) {
    const message = `Spieler „${playerOneDisplay}“ ist bereits eingetragen.`;
    errors.firstName = message;
    errors.lastName = message;
  }

  if (discipline === 'DOUBLES') {
    const playerTwoKey = normalizePersonName(participant.partnerFirstName, participant.partnerLastName);
    const playerTwoDisplay = displayPersonName(participant.partnerFirstName, participant.partnerLastName);
    if (playerOneKey === playerTwoKey) {
      const message = 'Ein Doppel kann nicht zweimal aus demselben Spieler bestehen.';
      errors.partnerFirstName = message;
      errors.partnerLastName = message;
    } else if (existingNames.has(playerTwoKey)) {
      const message = `Spieler „${playerTwoDisplay}“ ist bereits eingetragen.`;
      errors.partnerFirstName = message;
      errors.partnerLastName = message;
    }
  }

  return errors;
}

function uniqueErrorMessages(errors: ParticipantErrors): string[] {
  return [...new Set(Object.values(errors).filter((message): message is string => Boolean(message)))];
}

function resizeKnockoutBestOf(current: number[], nextLength: number, fallback: number): number[] {
  const next = Array.from({ length: nextLength }, () => fallback);
  const copyCount = Math.min(current.length, nextLength);
  for (let offset = 1; offset <= copyCount; offset += 1) {
    next[nextLength - offset] = current[current.length - offset];
  }
  return next;
}

function highestKnockoutPreset(maxParticipants: number): number {
  const presets = knockoutEntrantPresets(maxParticipants);
  return presets[presets.length - 1] ?? 2;
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder} Min.`;
  if (remainder === 0) return `${hours} Std.`;
  return `${hours} Std. ${remainder} Min.`;
}

function formatCompactDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder}min`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}min`;
}

function phaseBestOfForSport(sport: string, type: StageType) {
  const rules = sportScoring(sport);
  return rules.mode === 'score' ? 1 : rules.shortSetEntry ? defaultBestOfForStage(type) : rules.recommendedBestOf;
}

function phaseDraftFromTemplate(template: CreationPhaseTemplate, participantCount: number, sport = 'table_tennis'): PhaseDraft {
  phaseSequence += 1;
  const entrantCount = Math.max(2, Math.min(participantCount, template.entrantCount ?? participantCount));
  const knockoutRounds = template.type === 'KNOCKOUT' ? knockoutRoundLabels(entrantCount).length : 0;
  return {
    id: `phase-${phaseSequence}`,
    type: template.type,
    label: template.label,
    bestOf: phaseBestOfForSport(sport, template.type),
    groupCount: Math.max(2, template.groupCount ?? Math.min(4, Math.max(2, Math.ceil(participantCount / 4)))),
    swissRounds: Math.max(2, template.swissRounds ?? Math.ceil(Math.log2(Math.max(2, participantCount)))),
    entrantCount,
    knockoutBestOf: Array.from({ length: knockoutRounds }, () => phaseBestOfForSport(sport, template.type)),
    customEntrants: isTerminalStage(template.type) && !knockoutEntrantPresets(participantCount).includes(entrantCount),
    breakKind: 'minutes',
    breakMinutes: 15,
    nextDayStart: '09:00',
    nextDayDate: '',
    breakUntil: '12:00',
    breakUntilDate: '',
    note: '',
    inlineBreakAfterRound: 0, inlineBreakKind: 'until', inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '', dayBreaks: [],
  };
}

/** Keep an editable numeric text draft until the field loses focus. */
/** Fixed-height marquee for overlong names; short names remain stationary. */
function ScrollingParticipantName({ name }: { name: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const measure = () => setOverflows(Boolean(viewport.current && text.current
      && text.current.scrollWidth > viewport.current.clientWidth + 1));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (viewport.current) observer?.observe(viewport.current);
    return () => observer?.disconnect();
  }, [name]);
  return <div ref={viewport} className="participant-name-marquee-viewport" title={name}>
    <div className={overflows ? 'participant-name-marquee is-running' : 'participant-name-marquee'}
      style={overflows ? { animationDuration: `${Math.max(9, Math.ceil(name.length / 4))}s` } : undefined}>
      <strong ref={text}>{name}</strong>
      {overflows && <strong aria-hidden="true">{name}</strong>}
    </div>
  </div>;
}

function BufferedNumberInput({ id, value, min, max, onCommit }: {
  id?: string; value: number; min: number; max: number; onCommit: (value: number) => void;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  function commit() {
    const parsed = Number(raw);
    const next = raw.trim() !== '' && Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, Math.trunc(parsed))) : value;
    setRaw(String(next));
    if (next !== value) onCommit(next);
  }
  return <input id={id} type="number" min={min} max={max} step="1"
    value={raw} onChange={(event) => setRaw(event.target.value)}
    onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

function NumberChoice({
  value,
  presets,
  custom,
  customMinimum,
  customMaximum,
  onPreset,
  onCustom,
  onCustomValue,
  ariaLabel,
}: {
  value: number;
  presets: number[];
  custom: boolean;
  customMinimum: number;
  customMaximum?: number;
  onPreset: (value: number) => void;
  onCustom: () => void;
  onCustomValue: (value: number) => void;
  ariaLabel: string;
}) {
  const [rawValue, setRawValue] = useState(String(value));
  useEffect(() => { setRawValue(String(value)); }, [value, custom]);
  // Do not clamp on each keystroke: clearing the field and typing a
  // multi-digit number must remain possible.
  function commitCustomValue() {
    const parsed = Number(rawValue);
    const proposed = rawValue.trim() !== '' && Number.isFinite(parsed) ? Math.trunc(parsed) : value;
    const normalized = Math.max(customMinimum, customMaximum === undefined
      ? proposed : Math.min(customMaximum, proposed));
    setRawValue(String(normalized));
    if (normalized !== value) onCustomValue(normalized);
  }

  return (
    <div className="number-choice" role="group" aria-label={ariaLabel}>
      <div className="number-choice-buttons">
        {presets.map((preset) => (
          <button
            className={`number-choice-button ${!custom && value === preset ? 'active' : ''}`}
            key={preset}
            type="button"
            aria-pressed={!custom && value === preset}
            title={`${ariaLabel}: ${preset} auswählen`}
            onClick={() => onPreset(preset)}
          >
            {preset}
          </button>
        ))}
        <button
          className={`number-choice-button custom ${custom ? 'active' : ''}`}
          type="button"
          aria-pressed={custom}
          title={`${ariaLabel}: eigenen Wert eingeben`}
          onClick={onCustom}
        >
          Eigene
        </button>
        {custom && (
          <input
            className="custom-number-input"
            type="number"
            min={customMinimum}
            max={customMaximum}
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            onBlur={commitCustomValue}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            aria-label={`${ariaLabel} benutzerdefiniert`}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

function prestartPhaseSignature(phase: PrestartPhaseDraft): unknown[] {
  return [phase.id, phase.type, phase.label, phase.entrantCount, phase.bestOf,
    phase.groupCount, phase.swissRounds, phase.knockoutBestOf, phase.breakKind,
    phase.breakMinutes, phase.nextDayStart, phase.nextDayDate ?? '', phase.breakUntil, phase.breakUntilDate,
    phase.note, phase.inlineBreakAfterRound, phase.inlineBreakKind,
    phase.inlineBreakMinutes, phase.inlineBreakUntil, phase.inlineBreakUntilDate, phase.dayBreaks];
}

export interface PrestartPhaseMode {
  tournament: DemoTournament;
  activeParticipants: number;
  withdrawnParticipants: number;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** The same creation phase editor is used by the pre-start director.
 * Its surrounding wizard and summary card are hidden in pre-start mode. */
export function CreateTournamentPage({ prestart, initialNamedDraft }: { prestart?: PrestartPhaseMode; initialNamedDraft?: SavedCreationDraft } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const savedDraftId = new URLSearchParams(location.search).get('draft');
  const sessionDraftKey = `${CREATION_DRAFT_KEY}:${savedDraftId ?? 'new'}`;
  const [restoredDraft] = useState(() => {
    if (prestart) {
      const t = prestart.tournament;
      const recovered = typeof window !== 'undefined'
        ? loadCreationDraft(window.sessionStorage, `online-tournament:prestart-recovery:${t.id}`) : null;
      if (recovered?.name === t.name && recovered.step === 4) return recovered;
      const phases = initialPrestartPhases(t);
      const sportId = findSportOption(t.sport)?.id ?? 'table_tennis';
      const players = Array.from({ length: prestart.activeParticipants }, (_, index) => ({
        id: `participant-${index + 1}`, firstName: 'Teilnehmer',
        lastName: String(index + 1), partnerFirstName: 'Partner', partnerLastName: String(index + 1),
        teamName: `Mannschaft ${index + 1}`,
      }));
      phaseSequence = Math.max(phaseSequence, phases.length);
      const initial: CreationDraft = {
        step: 4, maxReachedStep: 5, hasVisitedPhaseStep: true,
        name: t.name, scheduledDate: t.scheduledStart?.slice(0, 10) ?? '',
        scheduledTime: t.scheduledStart?.slice(11, 16) ?? '09:00',
        useCurrentTime: false, sport: sportId, discipline: t.discipline,
        timedMatchMinutes: String(t.matchDurationMinutes ?? 15),
        venueTurnoverMinutes: String(t.venueTurnoverMinutes ?? 0),
        tables: t.tables, customTables: true, venueLayoutEnabled: Boolean(t.venueLayout),
        venueLayout: t.venueLayout ?? createVenueLayout(t.tables),
        participants: players, participantForm: emptyParticipantFields(), editingParticipantId: null,
        minimumMatches: t.minimumMatches ?? 1, customMinimumMatches: true,
        reviewRequiredPhaseIds: [],
        phaseDrafts: phases.map((phase, index) => ({
          ...phase, nextDayDate: phase.nextDayDate ?? '',
          customEntrants: index > 0 && !knockoutEntrantPresets(phases[index - 1].entrantCount).includes(phase.entrantCount),
        })),
        selectedRecommendationId: null, enabledSystems: initialEnabledSystems,
        maxGroups: null, maxSwissRounds: null, knockoutQualifierCount: null,
        preferredDurationMinutes: DEFAULT_RECOMMENDATION_DURATION,
        tournamentMode: t.tournamentMode ?? 'single', plannedDays: Math.max(2, t.plannedDays ?? 2),
        awardsEnabled: false, awardsAtOverride: null,
      };
      return initial;
    }
    const draft = loadCreationDraft(typeof window !== 'undefined' ? window.sessionStorage : undefined, sessionDraftKey)
      ?? (savedDraftId ? initialNamedDraft?.draft ?? null : null);
    if (draft) {
      participantSequence = Math.max(participantSequence, highestDraftSequence(draft.participants, 'participant'));
      phaseSequence = Math.max(phaseSequence, highestDraftSequence(draft.phaseDrafts, 'phase'));
    }
    return draft;
  });
  const [prestartRecovered] = useState(() => {
    if (!prestart || typeof window === 'undefined') return false;
    return Boolean(loadCreationDraft(window.sessionStorage, `online-tournament:prestart-recovery:${prestart.tournament.id}`));
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [namedDraftMessage, setNamedDraftMessage] = useState('');
  const [savingNamedDraft, setSavingNamedDraft] = useState(false);
  // An unsaved recovery snapshot belongs to the revision originally opened,
  // NOT the newest revision fetched after reloading this browser tab. Otherwise
  // choosing "recover" could overwrite changes saved by another tab.
  const savedDraftRevision = useRef<number | null>((() => {
    if (!savedDraftId) return null;
    const fallback = initialNamedDraft?.revision ?? 1;
    const recovery = loadCreationDraft(window.sessionStorage, sessionDraftKey);
    if (!recovery) return fallback;
    const stored = Number(window.sessionStorage.getItem(`${sessionDraftKey}:base-revision`));
    return Number.isSafeInteger(stored) && stored >= 1 ? stored : fallback;
  })());
  useEffect(() => {
    if (!savedDraftId || savedDraftRevision.current === null) return;
    try { window.sessionStorage.setItem(`${sessionDraftKey}:base-revision`, String(savedDraftRevision.current)); }
    catch { /* Recoverability is best-effort if browser storage is blocked. */ }
  }, [savedDraftId, sessionDraftKey]);
  const [draftConflictOpen, setDraftConflictOpen] = useState(false);
  const [recoveryChoiceOpen, setRecoveryChoiceOpen] = useState(() => {
    if (prestart || !savedDraftId || typeof window === 'undefined') return false;
    const recovery = loadCreationDraft(window.sessionStorage, sessionDraftKey);
    const saved = initialNamedDraft?.draft;
    return Boolean(recovery && saved && JSON.stringify(recovery) !== JSON.stringify(saved));
  });
  const [confirmPrestartSave, setConfirmPrestartSave] = useState(false);
  const prestartConfirmationSignature = useRef<string | null>(null);
  const [confirmPrestartDiscard, setConfirmPrestartDiscard] = useState(false);
  const [overwriteTournamentId, setOverwriteTournamentId] = useState<string | null>(null);
  const [createdTournamentWithDraftNotice, setCreatedTournamentWithDraftNotice] = useState<{ id: string; message: string } | null>(null);
  const [submittingTournament, setSubmittingTournament] = useState(false);
  const [prestartSaveError, setPrestartSaveError] = useState('');
  const [prestartSaveBusy, setPrestartSaveBusy] = useState(false);
  const prestartManualCeremony = prestart?.tournament.plannedSchedule?.find((item) =>
    item.id === 'award-ceremony' && item.autoTime === false);
  const [prestartCeremonyAt, setPrestartCeremonyAt] = useState(
    restoredDraft?.awardsAtOverride ?? prestartManualCeremony?.at ?? '');
  const [step, setStep] = useState<WizardStep>((restoredDraft?.step ?? 1) as WizardStep);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>((restoredDraft?.maxReachedStep ?? 1) as WizardStep);
  const [hasVisitedPhaseStep, setHasVisitedPhaseStep] = useState(restoredDraft?.hasVisitedPhaseStep ?? false);
  const [name, setName] = useState(restoredDraft?.name ?? '');
  // Keep the local time in sync while the wizard is open. Date and time are
  // minute-precise; a live "Jetzt" selection follows minute and day rollovers.
  const [currentLocalMinute, setCurrentLocalMinute] = useState(() => toLocalDateTime(new Date()));
  const [useCurrentTime, setUseCurrentTime] = useState(restoredDraft?.useCurrentTime ?? false);
  const [fixedDate, setFixedDate] = useState(restoredDraft?.scheduledDate ?? '');
  const [fixedTime, setFixedTime] = useState(restoredDraft?.scheduledTime ?? '09:00');
  const scheduledDate = useCurrentTime ? currentLocalMinute.slice(0, 10) : fixedDate;
  const scheduledTime = useCurrentTime ? currentLocalMinute.slice(11, 16) : fixedTime;
  const scheduledStart = `${scheduledDate}T${scheduledTime}`;
  useEffect(() => {
    const refreshClock = () => {
      const minute = toLocalDateTime(new Date());
      setCurrentLocalMinute((old) => old === minute ? old : minute);
    };
    refreshClock();
    const timer = window.setInterval(refreshClock, 1000);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);
  function setScheduledDate(value: string) {
    const clock = toLocalDateTime(new Date());
    setFixedDate(value);
    if (value === clock.slice(0, 10)) {
      // Selecting "Heute" (via the shortcut or its calendar day) means
      // using the live current minute until a fixed time is chosen.
      setCurrentLocalMinute(clock);
      setFixedTime(clock.slice(11, 16));
      setUseCurrentTime(true);
      return;
    }
    // Future dates retain a fixed start time and must not follow the clock.
    setFixedTime(scheduledTime);
    setUseCurrentTime(false);
  }
  function setScheduledTime(value: string) {
    setFixedDate(scheduledDate);
    setFixedTime(value);
    setUseCurrentTime(false);
  }
  function selectCurrentTime() {
    setCurrentLocalMinute(toLocalDateTime(new Date()));
    setUseCurrentTime(true);
  }
  const [awardsEnabled, setAwardsEnabled] = useState(restoredDraft?.awardsEnabled ?? false);
  const [awardsAtOverride, setAwardsAtOverride] = useState<string | null>(restoredDraft?.awardsAtOverride ?? null);
  const [sport, setSport] = useState(restoredDraft?.sport ?? '');
  const [pendingSport, setPendingSport] = useState<string | null>(null);
  const [pendingDiscipline, setPendingDiscipline] = useState<Discipline | null>(null);
  const [testParticipantsDialogOpen, setTestParticipantsDialogOpen] = useState(false);
  const [discardDraftDialogOpen, setDiscardDraftDialogOpen] = useState(false);
  const [pendingStepNavigation, setPendingStepNavigation] = useState<{ target: WizardStep; focusDate: boolean; advance: boolean } | null>(null);
  const [pendingParticipantAction, setPendingParticipantAction] = useState<{ kind: 'edit'; id: string } | { kind: 'test-players' } | null>(null);
  const [pendingRecommendationId, setPendingRecommendationId] = useState<string | null>(null);
  const [qualificationRulePhaseId, setQualificationRulePhaseId] = useState<string | null>(null);
  const [focusStartSettings, setFocusStartSettings] = useState(false);
  const discardDraftButtonRef = useRef<HTMLButtonElement>(null);
  const testParticipantsButtonRef = useRef<HTMLButtonElement>(null);
  const sportSelectRef = useRef<HTMLSelectElement>(null);
  const availableDisciplines = disciplineOptionsForSport(sport);
  const venue = getVenueTerminology(sport);
  const timedSport = sportScoring(sport).mode === 'score';
  const [timedMatchMinutes, setTimedMatchMinutes] = useState(restoredDraft?.timedMatchMinutes ?? '');
  const [venueTurnoverMinutes, setVenueTurnoverMinutes] = useState(restoredDraft?.venueTurnoverMinutes ?? '');
  const validMatchDuration = !timedSport || (timedMatchMinutes.trim() !== '' && Number.isInteger(Number(timedMatchMinutes)) && Number(timedMatchMinutes) > 0 && Number(timedMatchMinutes) <= 1440);
  const validTurnover = venueTurnoverMinutes.trim() === '' || (Number.isInteger(Number(venueTurnoverMinutes)) && Number(venueTurnoverMinutes) >= 0 && Number(venueTurnoverMinutes) <= 240);
  const matchDurationMinutes = timedSport ? Number(timedMatchMinutes) || 15 : planningMinutesPerSet(sport);
  const breakMinutes = timedSport ? Number(venueTurnoverMinutes) || 0 : 0;
  const [discipline, setDiscipline] = useState<Discipline>(restoredDraft?.discipline ?? 'SINGLES');
  const selectedDisciplineValid = availableDisciplines.some((option) => option.value === discipline);
  const [tables, setTables] = useState(restoredDraft?.tables ?? 8);
  const [customTables, setCustomTables] = useState(restoredDraft?.customTables ?? false);
  const [venueLayoutEnabled, setVenueLayoutEnabled] = useState(restoredDraft?.venueLayoutEnabled ?? false);
  const [venueLayoutEditorOpen, setVenueLayoutEditorOpen] = useState(false);
  const [venueLayout, setVenueLayout] = useState(() => restoredDraft?.venueLayout ?? createVenueLayout(8));
  const [venueLayoutCustomized, setVenueLayoutCustomized] = useState(() =>
    restoredDraft?.venueLayoutCustomized ?? Boolean(restoredDraft
      && JSON.stringify(restoredDraft.venueLayout) !== JSON.stringify(createVenueLayout(restoredDraft.tables))));
  useEffect(() => {
    setVenueLayout((current) => venueLayoutCustomized
      ? resizeVenueLayoutForTableCount(current, tables)
      : createVenueLayout(tables));
  }, [tables, venueLayoutCustomized]);
  const [participants, setParticipants] = useState<ParticipantDraft[]>(restoredDraft?.participants ?? []);
  const [rosterReviewRequired, setRosterReviewRequired] = useState(restoredDraft?.rosterReviewRequired ?? false);
  // Page size is derived from the available viewport, so the roster itself
  // never adds a vertical scrollbar to the creation page.
  const rosterRef = useRef<HTMLElement | null>(null);
  // Absolute start offset remains stable when real card heights change the page size.
  const [rosterFirstIndex, setRosterFirstIndex] = useState(0);
  const [rosterBackStack, setRosterBackStack] = useState<number[]>([]);
  const [rosterPageSize, setRosterPageSize] = useState(8);
  useEffect(() => {
    if (step !== 2 || prestart) return;
    const updatePageSize = () => {
      const rect = rosterRef.current?.getBoundingClientRect();
      // Each rendered row may hold 1, 2, or 3 cards depending on the real
      // available width. The page budget must count GRID ROWS, not entries.
      const list = rosterRef.current?.querySelector<HTMLElement>('.participant-roster-multi');
      // Use the actually rendered CSS grid rather than guessing 1/2/3 columns
      // from fixed pixel thresholds (which disregard padding and grid gaps).
      const columns = list ? Math.max(1, getComputedStyle(list).gridTemplateColumns.split(/\s+/).filter((track) => parseFloat(track) > 0).length) : 1;
      // Measure ALL actually rendered cards. A long doubles/team name can
      // make cards taller than the first entry and must limit page capacity.
      const cards = list ? Array.from(list.querySelectorAll<HTMLElement>('.participant-roster-row')) : [];
      const height = cards.length
        ? Math.max(...cards.map((card) => card.getBoundingClientRect().height))
        : list?.querySelector<HTMLElement>('.participant-empty')?.getBoundingClientRect().height ?? 56;
      const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 8 : 8;
      const listBounds = list?.getBoundingClientRect();
      const workspaceBounds = rosterRef.current?.closest<HTMLElement>('.wizard-workspace')?.getBoundingClientRect();
      // Reserve actual content beneath the roster rather than a fixed 155 px.
      const below = listBounds && workspaceBounds ? Math.max(0, workspaceBounds.bottom - listBounds.bottom) : 155;
      const available = Math.max(height, window.innerHeight - Math.max(0, listBounds?.top ?? rect?.top ?? 0) - below - 12);
      const rows = Math.max(1, Math.floor((available + gap) / (height + gap)));
      setRosterPageSize(Math.max(1, Math.min(48, rows * columns)));
    };
    updatePageSize();
    window.addEventListener('resize', updatePageSize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePageSize);
    if (rosterRef.current && observer) {
      observer.observe(rosterRef.current);
      const list = rosterRef.current.querySelector('.participant-roster-multi');
      if (list) observer.observe(list);
    }
    return () => { window.removeEventListener('resize', updatePageSize); observer?.disconnect(); };
  }, [step, prestart, discipline]);
  useEffect(() => {
    setRosterFirstIndex((start) => start >= participants.length
      ? Math.max(0, Math.floor(Math.max(0, participants.length - 1) / rosterPageSize) * rosterPageSize) : start);
  }, [participants.length, rosterPageSize]);
  const visibleRosterStart = Math.min(rosterFirstIndex, Math.max(0, participants.length - 1));
  function rosterNextPage() {
    setRosterBackStack((history) => [...history, visibleRosterStart]);
    setRosterFirstIndex(visibleRosterStart + rosterPageSize);
  }
  function rosterPreviousPage() {
    const previous = rosterBackStack.at(-1) ?? 0;
    setRosterBackStack((history) => history.slice(0, -1));
    setRosterFirstIndex(previous);
  }
  const visibleRoster = participants.slice(visibleRosterStart, visibleRosterStart + rosterPageSize);
  // Keep controls mounted at a stable height even when all entries fit.
  const showRosterNavigation = participants.length > 0;
  const [recentlyRemovedParticipant, setRecentlyRemovedParticipant] = useState<{ participant: ParticipantDraft; index: number } | null>(null);
  const [undoRemoveError, setUndoRemoveError] = useState('');
  const [groupRecommendationNotice, setGroupRecommendationNotice] = useState<string | null>(null);
  const previousRosterCount = useRef<number>(restoredDraft?.participants.length ?? 0);
  const [participantForm, setParticipantForm] = useState<ParticipantFields>(restoredDraft?.participantForm ?? emptyParticipantFields());
  // Registration may change in another director tab while this editor stays
  // mounted. Reconcile the field size without discarding its unsaved plan.
  useEffect(() => {
    if (!prestart) return;
    setParticipants((current) => current.length === prestart.activeParticipants
      ? current : Array.from({ length: prestart.activeParticipants }, (_, index) => ({
        id: `participant-${index + 1}`, firstName: 'Teilnehmer', lastName: String(index + 1),
        partnerFirstName: 'Partner', partnerLastName: String(index + 1),
        teamName: `Mannschaft ${index + 1}`,
      })));
  }, [prestart?.activeParticipants]);
  const [participantErrors, setParticipantErrors] = useState<ParticipantErrors>({});
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(restoredDraft?.editingParticipantId ?? null);
  const [minimumMatches, setMinimumMatches] = useState(restoredDraft?.minimumMatches ?? 4);
  const [customMinimumMatches, setCustomMinimumMatches] = useState(restoredDraft?.customMinimumMatches ?? false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(restoredDraft?.selectedRecommendationId ?? null);
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDraft[]>(restoredDraft?.phaseDrafts.map((phase) => ({
    ...phase, breakUntilDate: phase.breakUntilDate ?? '', inlineBreakUntilDate: phase.inlineBreakUntilDate ?? '', dayBreaks: phase.dayBreaks ?? [],
  })) ?? []);
  const [reviewRequiredPhaseIds, setReviewRequiredPhaseIds] = useState<string[]>(restoredDraft?.reviewRequiredPhaseIds ?? []);
  const [pendingRoundAdjustment, setPendingRoundAdjustment] = useState<
    | { kind: 'rounds'; id: string; patch: Partial<PhaseDraft>; removedDays: number; removedInline: boolean }
    | { kind: 'entrants'; index: number; entrants: number; custom: boolean; removedDays: number; removedInline: boolean }
    | { kind: 'type'; index: number; type: StageType; removedDays: number; removedInline: boolean }
    | null
  >(null);
  const [phaseLimitError, setPhaseLimitError] = useState('');
  const [editingPhaseTypeId, setEditingPhaseTypeId] = useState<string | null>(null);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [expandedInlineBreakIds, setExpandedInlineBreakIds] = useState<string[]>([]);
  const [phaseInsertIndex, setPhaseInsertIndex] = useState<number | null>(null);
  const [draggingPhaseId, setDraggingPhaseId] = useState<string | null>(null);
  const [dropTargetPhaseId, setDropTargetPhaseId] = useState<string | null>(null);
  const [enabledSystems, setEnabledSystems] = useState<Record<TournamentSystemId, boolean>>(restoredDraft?.enabledSystems ?? initialEnabledSystems);
  const [maxGroups, setMaxGroups] = useState<number | null>(restoredDraft?.maxGroups ?? null);
  const [maxSwissRounds, setMaxSwissRounds] = useState<number | null>(restoredDraft?.maxSwissRounds ?? null);
  const [knockoutQualifierCount, setKnockoutQualifierCount] = useState<number | null>(restoredDraft?.knockoutQualifierCount ?? null);
  const [preferredDurationMinutes, setPreferredDurationMinutes] = useState(restoredDraft?.preferredDurationMinutes ?? DEFAULT_RECOMMENDATION_DURATION);
  const [tournamentMode, setTournamentMode] = useState<'single' | 'multi'>(restoredDraft?.tournamentMode ?? (restoredDraft?.phaseDrafts.some((phase) => (phase.dayBreaks?.length ?? 0) > 0 || (phase.type === 'BREAK' && phase.breakKind === 'overnight')) ? 'multi' : 'single'));
  const [plannedDays, setPlannedDays] = useState(restoredDraft?.plannedDays ?? 2);
  const [pendingTournamentMode, setPendingTournamentMode] = useState<'single' | null>(null);
  function adjustPreferredDuration(delta: number) {
    setPreferredDurationMinutes((value) => Math.min(MAX_RECOMMENDATION_DURATION,
      Math.max(MIN_RECOMMENDATION_DURATION, value + delta)));
  }

  // Temporary recovery stays per tab. Saved, named drafts live separately.
  const draftSnapshot = useMemo<CreationDraft>(() => ({
    step, maxReachedStep, hasVisitedPhaseStep, name, scheduledDate, scheduledTime, useCurrentTime,
    sport, discipline, timedMatchMinutes, venueTurnoverMinutes, tables,
    customTables, venueLayoutEnabled, venueLayout, venueLayoutCustomized, participants, participantForm,
    editingParticipantId, rosterReviewRequired, minimumMatches, customMinimumMatches, phaseDrafts, reviewRequiredPhaseIds,
    selectedRecommendationId, enabledSystems, maxGroups, maxSwissRounds,
    knockoutQualifierCount, preferredDurationMinutes, tournamentMode, plannedDays, awardsEnabled,
    awardsAtOverride: prestartManualCeremony ? prestartCeremonyAt : awardsAtOverride,
  }), [
    step, maxReachedStep, hasVisitedPhaseStep, name, scheduledDate, scheduledTime, useCurrentTime,
    sport, discipline, timedMatchMinutes, venueTurnoverMinutes, tables,
    customTables, venueLayoutEnabled, venueLayout, participants, participantForm,
    editingParticipantId, rosterReviewRequired, minimumMatches, customMinimumMatches, phaseDrafts, reviewRequiredPhaseIds,
    selectedRecommendationId, enabledSystems, maxGroups, maxSwissRounds,
    knockoutQualifierCount, preferredDurationMinutes, tournamentMode, plannedDays, awardsEnabled, awardsAtOverride,
    prestartCeremonyAt, prestartManualCeremony?.at,
  ]);
  useEffect(() => {
    if (prestart) return; // Never save a director's prestart edits as a new tournament draft.
    setDraftSaveFailed(!saveCreationDraft(draftSnapshot, window.sessionStorage, sessionDraftKey));
  }, [draftSnapshot, sessionDraftKey, prestart]);

  const originalPrestartPhases = useRef(prestart ? initialPrestartPhases(prestart.tournament) : []);
  // Recovery is based on the version that was originally edited, never on
  // the latest tournament loaded after a browser refresh.
  const prestartRecoveryKey = prestart ? `online-tournament:prestart-recovery:${prestart.tournament.id}` : '';
  const originalPrestartFingerprint = useRef((() => {
    if (!prestart) return '';
    if (prestartRecovered) {
      try { return window.sessionStorage.getItem(`${prestartRecoveryKey}:fingerprint`) ?? ''; }
      catch { return ''; }
    }
    return prestartPlanningFingerprint(prestart.tournament);
  })());
  const prestartRecoveryConflict = Boolean(prestart && prestartRecovered
    && (!originalPrestartFingerprint.current
      || originalPrestartFingerprint.current !== prestartPlanningFingerprint(prestart.tournament)));
  const prestartPhaseDrafts: PrestartPhaseDraft[] = phaseDrafts.map((phase) => ({
    id: phase.id, type: phase.type, label: phase.label, entrantCount: phase.entrantCount,
    bestOf: phase.bestOf, groupCount: phase.groupCount, swissRounds: phase.swissRounds,
    knockoutBestOf: phase.knockoutBestOf, breakKind: phase.breakKind, breakMinutes: phase.breakMinutes,
    nextDayDate: phase.nextDayDate, nextDayStart: phase.nextDayStart, breakUntil: phase.breakUntil,
    breakUntilDate: phase.breakUntilDate, note: phase.note, inlineBreakAfterRound: phase.inlineBreakAfterRound,
    inlineBreakKind: phase.inlineBreakKind, inlineBreakMinutes: phase.inlineBreakMinutes,
    inlineBreakUntil: phase.inlineBreakUntil, inlineBreakUntilDate: phase.inlineBreakUntilDate,
    dayBreaks: phase.dayBreaks,
  }));
  const currentPrestartSignature = JSON.stringify([
    prestartPhaseDrafts.map(prestartPhaseSignature),
    prestartManualCeremony && prestartCeremonyAt !== prestartManualCeremony.at ? prestartCeremonyAt : null,
  ]);
  const prestartDirty = Boolean(prestart && currentPrestartSignature
    !== JSON.stringify([originalPrestartPhases.current.map(prestartPhaseSignature), null]));
  useEffect(() => {
    if (!confirmPrestartSave) return;
    if (prestartConfirmationSignature.current !== currentPrestartSignature) {
      prestartConfirmationSignature.current = null;
      setConfirmPrestartSave(false);
      setPrestartSaveError('Die Planung wurde nach dem Prüfen geändert. Bitte die Änderungen erneut bestätigen.');
    }
  }, [confirmPrestartSave, currentPrestartSignature]);
  useEffect(() => {
    prestart?.onDirtyChange?.(prestartDirty);
  }, [prestartDirty, prestart?.onDirtyChange]);
  // Keep a recoverable snapshot across reloads. A deliberate discard or a
  // successful save removes it; navigating within the director does not.
  useEffect(() => {
    if (!prestart) return;
    const key = `online-tournament:prestart-recovery:${prestart.tournament.id}`;
    if (prestartDirty) {
      saveCreationDraft(draftSnapshot, window.sessionStorage, key);
      if (!prestartRecovered && originalPrestartFingerprint.current) {
        try { window.sessionStorage.setItem(`${key}:fingerprint`, originalPrestartFingerprint.current); }
        catch { /* storage unavailable: a later recovery fails safely */ }
      }
    } else {
      clearCreationDraft(window.sessionStorage, key);
      try { window.sessionStorage.removeItem(`${key}:fingerprint`); } catch { /* ignore */ }
    }
  }, [prestartDirty, prestart?.tournament.id, draftSnapshot]);
  function discardPrestartEditing() {
    if (prestart) {
      try {
        window.sessionStorage.removeItem(prestartRecoveryKey);
        window.sessionStorage.removeItem(`${prestartRecoveryKey}:fingerprint`);
      } catch { /* storage disabled */ }
      prestart.onCancel();
    }
  }

  async function savePrestartPhases() {
    if (!prestart || prestartRecoveryConflict || prestartIssues.length || !prestartDirty || prestartSaveBusy) return;
    if (!confirmPrestartSave) {
      prestartConfirmationSignature.current = currentPrestartSignature;
      setConfirmPrestartSave(true);
      return;
    }
    if (prestartConfirmationSignature.current !== currentPrestartSignature) {
      setConfirmPrestartSave(false);
      return;
    }
    setPrestartSaveBusy(true);
    let result: Awaited<ReturnType<typeof updatePrestartTournamentPhasesSafely>>;
    try {
      result = await updatePrestartTournamentPhasesSafely(prestart.tournament.id, prestartPhaseDrafts,
        originalPrestartFingerprint.current,
        prestartManualCeremony && prestartCeremonyAt !== prestartManualCeremony.at ? prestartCeremonyAt : undefined);
    } catch (error) {
      setPrestartSaveError(error instanceof Error ? error.message : 'Der Speichervorgang ist fehlgeschlagen.');
      setConfirmPrestartSave(false);
      return;
    } finally { setPrestartSaveBusy(false); }
    if (!result.ok) {
      setPrestartSaveError(result.error ?? 'Die Phasen konnten nicht gespeichert werden.');
      setConfirmPrestartSave(false);
      return;
    }
    try {
      window.sessionStorage.removeItem(prestartRecoveryKey);
      window.sessionStorage.removeItem(`${prestartRecoveryKey}:fingerprint`);
    } catch { /* storage disabled */ }
    prestart.onSaved();
  }

  async function saveNamedDraft(copy = false) {
    if (savingNamedDraft) return;
    setSavingNamedDraft(true);
    try {
      const data = copy
        ? { ...draftSnapshot, name: draftSnapshot.name.trim() ? `${draftSnapshot.name.trim()} (Kopie)` : 'Turnierentwurf (Kopie)' }
        : draftSnapshot;
      const entry = await saveNamedCreationDraftAtomic(data, copy ? null : savedDraftId,
        copy ? undefined : (savedDraftRevision.current ?? undefined));
      if (!copy) {
        savedDraftRevision.current = entry.revision ?? 1;
        try { window.sessionStorage.setItem(`${sessionDraftKey}:base-revision`, String(savedDraftRevision.current)); }
        catch { /* Best-effort recovery metadata. */ }
      }
      setNamedDraftMessage(copy ? 'Kopie als neuer Entwurf gespeichert.' : 'Entwurf gespeichert.');
      if (copy || entry.id !== savedDraftId) {
        clearCreationDraft(window.sessionStorage, sessionDraftKey);
        navigate(`/tournaments/new?draft=${encodeURIComponent(entry.id)}`, { replace: !copy });
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DRAFT_CONFLICT') {
        setDraftConflictOpen(true);
      } else {
        setNamedDraftMessage(error instanceof Error ? error.message : 'Entwurf konnte nicht gespeichert werden.');
      }
    } finally { setSavingNamedDraft(false); }
  }

  const editingSavedParticipant = participants.find((participant) => participant.id === editingParticipantId);
  const participantEditorDirty = Object.keys(emptyParticipantFields()).some((field) => {
    const key = field as ParticipantField;
    return participantForm[key] !== (editingSavedParticipant?.[key] ?? '');
  });

  const participantCount = participants.filter((participant) => participantIsComplete(participant, discipline)).length;
  const incompleteSavedParticipants = participants.length - participantCount;
  const invalidRosterIndices = useMemo(
    () => invalidParticipantRosterIndices(participants, discipline), [participants, discipline]);
  const savedParticipantNamesValid = invalidRosterIndices.size === 0;
  const participantsValid = participantCount >= 2 && savedParticipantNamesValid && !rosterReviewRequired;
  const participantErrorMessages = uniqueErrorMessages(participantErrors);

  const defaultMaxGroups = Math.max(2, Math.ceil(participantCount / (participantCount >= 20 ? 5 : 4)));
  const defaultMaxSwissRounds = Math.max(minimumMatches + (participantCount % 2), Math.ceil(Math.log2(Math.max(2, participantCount))));
  const defaultKnockoutQualifierCount = Math.max(
    2,
    Math.min(participantCount, participantCount >= 16 ? 8 : 4),
  );
  const effectiveMaxGroups = Math.min(Math.max(2, Math.floor(participantCount / 2)), maxGroups ?? defaultMaxGroups);
  const effectiveMaxSwissRounds = Math.min(Math.max(2, participantCount - 1), Math.max(2, maxSwissRounds ?? defaultMaxSwissRounds));
  const effectiveKnockoutQualifierCount = Math.min(Math.max(2, participantCount), Math.max(2, knockoutQualifierCount ?? defaultKnockoutQualifierCount));

  const recommendations = useMemo(
    () => recommendTournamentFormats(
      { playerCount: participantCount, tableCount: tables, minimumMatches, sport, matchDurationMinutes, venueTurnoverMinutes: breakMinutes },
      {
        enabledSystems,
        maxGroups: effectiveMaxGroups,
        maxSwissRounds: effectiveMaxSwissRounds,
        knockoutQualifierCount: effectiveKnockoutQualifierCount,
        preferredDurationMinutes,
      },
    ),
    [
      participantCount,
      tables,
      minimumMatches,
      tournamentMode, plannedDays,
      matchDurationMinutes,
      breakMinutes,
      sport,
      enabledSystems,
      effectiveMaxGroups,
      effectiveMaxSwissRounds,
      effectiveKnockoutQualifierCount,
      preferredDurationMinutes,
    ],
  );

  const selectedRecommendation = useMemo(
    () => recommendations.find((recommendation) => recommendation.id === selectedRecommendationId) ?? null,
    [recommendations, selectedRecommendationId],
  );

  /** The editable phase plan is authoritative even when inputs change. */
  const recommendationPlanMatches = Boolean(selectedRecommendation
    && phaseDrafts.filter((phase) => phase.type !== 'BREAK').length === selectedRecommendation.phases.length
    && phaseDrafts.filter((phase) => phase.type !== 'BREAK').every((phase, index) => {
      const original = selectedRecommendation.phases[index];
      return original && phase.type === original.type
        && phase.entrantCount === (original.entrantCount ?? participantCount)
        && (phase.type !== 'GROUPS' || phase.groupCount === (original.groupCount ?? 2))
        && (phase.type !== 'SWISS' || phase.swissRounds === (original.swissRounds ?? 1));
    }));
  // Frühere Einstellungen dürfen vorhandene manuell angepasste Phasen nicht
  // unbemerkt löschen oder eine Empfehlung erneut über die Änderungen legen.
  useEffect(() => {
    if (selectedRecommendationId && !selectedRecommendation) setSelectedRecommendationId(null);
  }, [selectedRecommendationId, selectedRecommendation]);

  const phaseOrderValid = hasValidTerminalStageOrder(phaseDrafts.map((phase) => phase.type))
    && hasValidBreakStageOrder(phaseDrafts.map((phase) => phase.type));
  const phaseConfigurationValid = phaseDrafts.some((phase) => phase.type !== 'BREAK') && phaseOrderValid
    && phaseDrafts.every((phase) => {
      if (!phase.label.trim() || phase.label.length > 80) return false;
      if (phase.type === 'SWISS' && !isValidSwissRoundCount(phase.swissRounds, phase.entrantCount)) return false;
      if ((phase.type === 'SWISS' || phase.type === 'KNOCKOUT') && phase.inlineBreakAfterRound > 0) {
        const rounds = phase.type === 'SWISS' ? phase.swissRounds : knockoutRoundLabels(phase.entrantCount).length;
        if (phase.inlineBreakAfterRound >= rounds || phase.inlineBreakAfterRound < 1
          || (phase.inlineBreakKind === 'until'
            ? !/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.inlineBreakUntil)
            : !Number.isInteger(phase.inlineBreakMinutes) || phase.inlineBreakMinutes < 1 || phase.inlineBreakMinutes > 1440)) return false;
      }
      return phase.type !== 'BREAK'
      || (phase.label.trim().length > 0 && phase.note.length <= 600
        && (phase.breakKind === 'minutes'
          ? Number.isInteger(phase.breakMinutes) && phase.breakMinutes >= 1 && phase.breakMinutes <= 1440
          : phase.breakKind === 'until'
            ? /^([01]\d|2[0-3]):[0-5]\d$/.test(phase.breakUntil)
            : phase.breakKind === 'overnight' && /^([01]\d|2[0-3]):[0-5]\d$/.test(phase.nextDayStart)));
    });
  const gameSettingsValid = Number.isInteger(minimumMatches) && minimumMatches >= 1 && minimumMatches <= 100 && validMatchDuration && validTurnover;
  const invalidLocalClock = Boolean(parseCalendarDate(scheduledDate) && parseClockTime(scheduledTime)
    && !isValidLocalDateTime(scheduledStart));
  const ambiguousLocalClock = isAmbiguousLocalDateTime(scheduledStart);
  const startTimeIsAllowed = isStartAtOrAfterNow(scheduledStart, new Date(currentLocalMinute));
  const basicsValid = Boolean(name.trim()) && name.trim().length <= 120 && Boolean(sport) && selectedDisciplineValid && startTimeIsAllowed && Number.isSafeInteger(tables) && tables >= 1 && tables <= 9999 && gameSettingsValid;
  const venueLayoutValid = !venueLayoutEnabled || validateVenueLayout(venueLayout, tables).length === 0;
  const phaseEntrantsValid = phaseDrafts.every((phase, index) => {
    const maximum = index === 0 ? participantCount : phaseDrafts[index - 1].entrantCount;
    return phase.entrantCount >= 2 && phase.entrantCount <= maximum
      && (index !== 0 || phase.entrantCount === participantCount)
      && (phase.type !== 'GROUPS' || (phase.groupCount >= 2 && phase.groupCount <= Math.floor(phase.entrantCount / 2)));
  });

  function updateParticipantForm(field: ParticipantField, value: string) {
    setParticipantForm((current) => ({
      ...current,
      [field]: sanitizeParticipantName(value),
    }));
    setParticipantErrors((current) => {
      const next = { ...current };
      if (field === 'firstName' || field === 'lastName' || field === 'teamName') {
        delete next.teamName;
        delete next.firstName;
        delete next.lastName;
      } else {
        delete next.partnerFirstName;
        delete next.partnerLastName;
      }
      return next;
    });
  }

  function resetParticipantEditor() {
    setParticipantForm(emptyParticipantFields());
    setParticipantErrors({});
    setEditingParticipantId(null);
  }

  function saveParticipant() {
    const errors = validateParticipant(participantForm, discipline, participants, editingParticipantId);
    setParticipantErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (editingParticipantId) {
      setParticipants((current) => current.map((participant) => (
        participant.id === editingParticipantId ? { ...participant, ...participantForm } : participant
      )));
    } else {
      setRecentlyRemovedParticipant(null);
      setUndoRemoveError('');
      setRosterBackStack([]);
      setRosterFirstIndex(Math.floor(participants.length / rosterPageSize) * rosterPageSize);
      setParticipants((current) => [...current, newParticipant(participantForm)]);
    }
    resetParticipantEditor();
  }

  function editParticipant(participant: ParticipantDraft) {
    if (participantEditorDirty) {
      setPendingParticipantAction({ kind: 'edit', id: participant.id });
      return;
    }
    openParticipantEditor(participant);
  }

  function openParticipantEditor(participant: ParticipantDraft) {
    setParticipantForm({
      firstName: participant.firstName,
      lastName: participant.lastName,
      partnerFirstName: participant.partnerFirstName,
      partnerLastName: participant.partnerLastName,
      teamName: participant.teamName ?? '',
    });
    setParticipantErrors({});
    setEditingParticipantId(participant.id);
  }

  function removeParticipant(id: string) {
    const index = participants.findIndex((participant) => participant.id === id);
    if (index < 0) return;
    setRecentlyRemovedParticipant({ participant: participants[index], index });
    setUndoRemoveError('');
    setParticipants((current) => current.filter((participant) => participant.id !== id));
    if (editingParticipantId === id) resetParticipantEditor();
  }

  function undoRemoveParticipant() {
    if (!recentlyRemovedParticipant) return;
    const { participant, index } = recentlyRemovedParticipant;
    const restored = [...participants.slice(0, index), participant, ...participants.slice(index)];
    if (participants.some((item) => item.id === participant.id)
      || invalidParticipantRosterIndices(restored, discipline).size > invalidRosterIndices.size) {
      setUndoRemoveError('Wiederherstellung nicht möglich: Der Eintrag würde die Teilnehmerliste ungültig machen.');
      setRecentlyRemovedParticipant(null);
      return;
    }
    setParticipants(restored);
    setRecentlyRemovedParticipant(null);
    setUndoRemoveError('');
  }

  function removeInvalidParticipants() {
    const invalidIds = new Set(participants.filter((_, index) => invalidRosterIndices.has(index)).map((entry) => entry.id));
    setParticipants((current) => current.filter((entry) => !invalidIds.has(entry.id)));
    if (editingParticipantId && invalidIds.has(editingParticipantId)) resetParticipantEditor();
    setRecentlyRemovedParticipant(null);
    setUndoRemoveError('');
    setRosterBackStack([]);
    setRosterFirstIndex(0);
  }

  function generateTestParticipants() {
    const targetCount = 19;
    setParticipants((current) => {
      const next = [...current];
      let sequence = 1;
      let completed = next.filter((entry) => participantIsComplete(entry, discipline)
        && Object.keys(validateParticipant(entry, discipline, next, entry.id)).length === 0).length;
      while (completed < targetCount && sequence <= 10000) {
        // A...Z, AA...AZ, BA...: letters-only and no invalid ASCII after Z.
        let ordinal = sequence;
        let suffix = '';
        while (ordinal > 0) {
          ordinal -= 1;
          suffix = String.fromCharCode(65 + (ordinal % 26)) + suffix;
          ordinal = Math.floor(ordinal / 26);
        }
        const candidate: ParticipantFields = {
          firstName: discipline === 'TEAMS' ? '' : 'Test',
          lastName: discipline === 'TEAMS' ? '' : `Spieler ${suffix}`,
          partnerFirstName: discipline === 'DOUBLES' ? 'Test' : '',
          partnerLastName: discipline === 'DOUBLES' ? `Partner ${suffix}` : '',
          teamName: discipline === 'TEAMS' ? `Test Mannschaft ${suffix}` : '',
        };
        if (Object.keys(validateParticipant(candidate, discipline, next, null)).length === 0) {
          next.push(newParticipant(candidate));
          completed += 1;
        }
        sequence += 1;
      }
      return next;
    });
    resetParticipantEditor();
  }

  function toggleSystem(systemId: TournamentSystemId) {
    // Filters affect recommendations only, never an existing customized phase plan.
    setEnabledSystems((current) => ({ ...current, [systemId]: !current[systemId] }));
    setSelectedRecommendationId(null);
  }

  function recommendedPhaseDrafts(recommendation: FormatRecommendation): PhaseDraft[] {
    const created = recommendation.phases.map((phase) => phaseDraftFromTemplate(phase, participantCount, sport));
    if (tournamentMode !== 'multi') return created;
    const timing = timedSport
      ? { matchDurationMinutes, venueTurnoverMinutes: breakMinutes }
      : { minutesPerSet: planningMinutesPerSet(sport) };
    const split = suggestDaySplit(created.map((phase) => ({
      ...phase, estimatedMinutes: estimatePhaseMetrics(phase, tables, timing).estimatedDurationMinutes,
    })), plannedDays);
    if (!split.possible) return created;
    const withBreaks: PhaseDraft[] = [];
    let day = 0;
    for (let index = 0; index < created.length; index++) {
      const phase = created[index];
      phase.dayBreaks = split.insidePhases.filter((item) => item.phaseIndex === index).map((item) => ({
        afterRound: item.afterRound, date: followingPlayingDate(scheduledDate, ++day), time: '09:00',
      }));
      withBreaks.push(phase);
      if (split.betweenPhases.includes(index)) {
        const pause = phaseDraftFromTemplate(createPhaseTemplate('BREAK', index + 1, { entrantCount: phase.entrantCount }), participantCount, sport);
        pause.label = 'Spieltagsende';
        pause.breakKind = 'overnight';
        pause.nextDayDate = followingPlayingDate(scheduledDate, ++day);
        withBreaks.push(pause);
      }
    }
    return withBreaks;
  }

  function applyRecommendation(recommendation: FormatRecommendation) {
    setSelectedRecommendationId(recommendation.id);
    setPhaseDrafts(recommendedPhaseDrafts(recommendation));
    setReviewRequiredPhaseIds([]);
    setExpandedPhaseId(null);
    setPhaseInsertIndex(null);
  }

  function selectRecommendation(recommendation: FormatRecommendation) {
    if (selectedRecommendationId === recommendation.id && recommendationPlanMatches) return;
    if (phaseDrafts.length > 0) {
      setPendingRecommendationId(recommendation.id);
      return;
    }
    applyRecommendation(recommendation);
  }

  function normalizePhaseEntrants(phases: PhaseDraft[]): PhaseDraft[] {
    const next = phases.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
    for (let index = 0; index < next.length; index += 1) {
      const maximum = index === 0 ? participantCount : next[index - 1].entrantCount;
      const minimum = Math.min(2, maximum);
      const entrants = index === 0
        ? participantCount
        : Math.max(minimum, Math.min(maximum, next[index].entrantCount));
      next[index].entrantCount = next[index].type === 'BREAK' ? maximum : entrants;
      if (next[index].type === 'GROUPS') {
        next[index].groupCount = Math.max(2, Math.min(next[index].groupCount, Math.floor(entrants / 2)));
      }
      if (next[index].type === 'KNOCKOUT') {
        next[index].knockoutBestOf = resizeKnockoutBestOf(
          next[index].knockoutBestOf,
          knockoutRoundLabels(entrants).length,
          next[index].bestOf,
        );
      }
      if (isTerminalStage(next[index].type) && index > 0) {
        // Once Custom was explicitly selected, keep that mode even if the entered
        // value happens to equal one of the preset buttons (2/4/8/...).
        next[index].customEntrants = next[index].customEntrants
          || !knockoutEntrantPresets(maximum).includes(entrants);
      }
      next[index] = reconcileRoundDependentBreaks(next[index]).phase;
    }
    return next;
  }

  useEffect(() => {
    if (!phaseDrafts.length) return;
    const normalized = normalizePhaseEntrants(phaseDrafts);
    const needsReview = phaseDrafts.flatMap((oldPhase, index) => {
      const nextPhase = normalized[index];
      if (!nextPhase) return [];
      // Also mark invalid unchanged Swiss rounds and group counts.
      const altered = needsRosterPhaseReview(oldPhase, nextPhase, index);
      return altered ? [oldPhase.id] : [];
    });
    if (needsReview.length) setReviewRequiredPhaseIds((ids) => [...new Set([...ids, ...needsReview])]);
    if (JSON.stringify(normalized) !== JSON.stringify(phaseDrafts)) setPhaseDrafts(normalized);
  // Die Teilnehmerzahl ist die Quelle für das Startfeld aller Phasen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantCount]);

  // Reuse the same recommendation logic as the director's pre-start editor.
  // Existing manual group plans remain untouched after roster changes.
  useEffect(() => {
    const previous = previousRosterCount.current;
    previousRosterCount.current = participantCount;
    if (previous === participantCount) return;
    const groupIndex = phaseDrafts.findIndex((phase) => phase.type === 'GROUPS');
    if (groupIndex < 0 || participantCount < 4) {
      setGroupRecommendationNotice(null);
      return;
    }
    const phase = phaseDrafts[groupIndex];
    const entrants = groupIndex === 0 ? participantCount : phase.entrantCount;
    const following = phaseDrafts.slice(groupIndex + 1).find((item) => item.type !== 'BREAK');
    setGroupRecommendationNotice(changedGroupRecommendationMessage(entrants, phase.groupCount, following?.entrantCount));
  // Group-change hints should appear when roster size changes, not every edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantCount]);

  /** Explicitly acknowledge every participant count changed as a consequence
   * of inserting, removing or reordering phases (not just roster changes). */
  function normalizeAndTrackPhaseChanges(previous: PhaseDraft[], proposed: PhaseDraft[], manuallyEditedId?: string): PhaseDraft[] {
    const normalized = normalizePhaseEntrants(proposed);
    const changed = changedPhaseEntrantIds(previous, normalized, manuallyEditedId);
    if (changed.length) setReviewRequiredPhaseIds((current) => [...new Set([...current, ...changed])]);
    return normalized;
  }

  function insertPhase(insertIndex: number, type: StageType) {
    if (insertIndex < 0 || insertIndex > phaseDrafts.length) return;
    if (type === 'GROUPS' && (insertIndex === 0 ? participantCount : phaseDrafts[insertIndex - 1].entrantCount) < 4) return;
    if (type === 'SWISS' && (insertIndex === 0 ? participantCount : phaseDrafts[insertIndex - 1].entrantCount) < 3) return;
    if (type === 'BREAK' && (insertIndex === 0 || insertIndex === phaseDrafts.length || phaseDrafts[insertIndex - 1]?.type === 'BREAK' || phaseDrafts[insertIndex]?.type === 'BREAK')) return;
    if (isTerminalStage(type) && insertIndex !== phaseDrafts.length) return;
    if (insertIndex === phaseDrafts.length && phaseDrafts.some((phase) => isTerminalStage(phase.type))) return;
    const previousEntrants = insertIndex === 0 ? participantCount : phaseDrafts[insertIndex - 1].entrantCount;
    const entrants = isTerminalStage(type) ? highestKnockoutPreset(previousEntrants) : previousEntrants;
    const template = createPhaseTemplate(type, insertIndex + 1, {
      entrantCount: entrants,
      groupCount: effectiveMaxGroups,
      swissRounds: effectiveMaxSwissRounds,
    });
    const phase = phaseDraftFromTemplate(template, participantCount, sport);
    if (type === 'BREAK') phase.label = 'Pause';
    const following = phaseDrafts.slice(insertIndex).find((candidate) => candidate.type !== 'BREAK');
    if (type === 'GROUPS') {
      phase.groupCount = recommendGroupCount(phase.entrantCount, following?.entrantCount);
    }
    if (type === 'SWISS') {
      phase.swissRounds = recommendedSwissRounds(phase.entrantCount, minimumMatches);
    }
    const candidate = [...phaseDrafts.slice(0, insertIndex), phase, ...phaseDrafts.slice(insertIndex)];
    if (!hasValidTerminalStageOrder(candidate.map((item) => item.type)) || !hasValidBreakStageOrder(candidate.map((item) => item.type))) return;
    if (countCreationScheduleEntries(candidate, awardsEnabled) > MAX_CREATION_SCHEDULE_ENTRIES) {
      setPhaseLimitError(`Maximal ${MAX_CREATION_SCHEDULE_ENTRIES} Zeitplaneinträge möglich. Bitte zuerst eine Phase oder Unterbrechung entfernen.`);
      return;
    }
    setPhaseLimitError('');
    setPhaseDrafts(normalizeAndTrackPhaseChanges(phaseDrafts, candidate));
    setSelectedRecommendationId(null);
    setPhaseInsertIndex(null);
    setExpandedPhaseId(phase.id);
  }

  function removePhase(id: string) {
    setSelectedRecommendationId(null);
    setReviewRequiredPhaseIds((ids) => ids.filter((candidate) => candidate !== id));
    if (editingPhaseTypeId === id) setEditingPhaseTypeId(null);
    if (expandedPhaseId === id) setExpandedPhaseId(null);
    setPhaseDrafts(normalizeAndTrackPhaseChanges(phaseDrafts, phaseDrafts.filter((phase) => phase.id !== id)));
  }

  function reorderedPhases(fromIndex: number, toIndex: number): PhaseDraft[] | null {
    if (fromIndex < 0 || fromIndex >= phaseDrafts.length || toIndex < 0 || toIndex >= phaseDrafts.length) return null;
    if (fromIndex === toIndex) return null;
    const candidate = [...phaseDrafts];
    const [moved] = candidate.splice(fromIndex, 1);
    candidate.splice(toIndex, 0, moved);
    return hasValidTerminalStageOrder(candidate.map((phase) => phase.type)) && hasValidBreakStageOrder(candidate.map((phase) => phase.type)) ? candidate : null;
  }

  function canMovePhase(index: number, direction: -1 | 1): boolean {
    return reorderedPhases(index, index + direction) !== null;
  }

  function reorderPhase(fromIndex: number, toIndex: number) {
    const candidate = reorderedPhases(fromIndex, toIndex);
    if (!candidate) return;
    setSelectedRecommendationId(null);
    setPhaseDrafts(normalizeAndTrackPhaseChanges(phaseDrafts, candidate));
    setPhaseInsertIndex(null);
  }

  function movePhase(index: number, direction: -1 | 1) {
    reorderPhase(index, index + direction);
  }

  function onPhaseDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingPhaseId(id);
    setDropTargetPhaseId(null);
  }

  function onPhaseDragOver(event: DragEvent<HTMLDivElement>, targetIndex: number) {
    if (!draggingPhaseId) return;
    const sourceIndex = phaseDrafts.findIndex((phase) => phase.id === draggingPhaseId);
    if (reorderedPhases(sourceIndex, targetIndex)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTargetPhaseId(phaseDrafts[targetIndex].id);
    } else {
      setDropTargetPhaseId(null);
    }
  }

  function onPhaseDrop(event: DragEvent<HTMLDivElement>, targetIndex: number) {
    if (!draggingPhaseId) return;
    event.preventDefault();
    const sourceIndex = phaseDrafts.findIndex((phase) => phase.id === draggingPhaseId);
    reorderPhase(sourceIndex, targetIndex);
    setDraggingPhaseId(null);
    setDropTargetPhaseId(null);
  }

  function onPhaseDragEnd() {
    setDraggingPhaseId(null);
    setDropTargetPhaseId(null);
  }


  function updatePhase(id: string, patch: Partial<PhaseDraft>, confirmedRoundChange = false) {
    const previous = phaseDrafts.find((phase) => phase.id === id);
    if (!previous) return;
    let adjusted = { ...previous, ...patch };
    if (patch.dayBreaks) {
      adjusted = { ...adjusted, dayBreaks: [...patch.dayBreaks].sort((a, b) => a.afterRound - b.afterRound) };
    }
    const result = reconcileRoundDependentBreaks(adjusted);
    if (!confirmedRoundChange && (result.impact.removedDayBreaks > 0 || result.impact.removedInlineBreak)) {
      setPendingRoundAdjustment({ kind: 'rounds', id, patch, removedDays: result.impact.removedDayBreaks,
        removedInline: result.impact.removedInlineBreak });
      return;
    }
    const candidate = phaseDrafts.map((phase) => phase.id === id ? result.phase : phase);
    if (countCreationScheduleEntries(candidate, awardsEnabled) > MAX_CREATION_SCHEDULE_ENTRIES) {
      setPhaseLimitError(`Maximal ${MAX_CREATION_SCHEDULE_ENTRIES} Zeitplaneinträge möglich. Bitte zuerst eine andere Unterbrechung entfernen.`);
      return;
    }
    setPhaseLimitError('');
    setSelectedRecommendationId(null);
    setPhaseDrafts(candidate);
  }

  function togglePhaseInlineBreak(phase: PhaseDraft, totalRounds: number) {
    if (totalRounds < 2) return;
    const enable = phase.inlineBreakAfterRound <= 0;
    updatePhase(phase.id, { inlineBreakAfterRound: enable ? Math.min(2, totalRounds - 1) : 0 });
    setExpandedInlineBreakIds((current) => enable
      ? [...new Set([...current, phase.id])]
      : current.filter((id) => id !== phase.id));
    if (enable) {
      setExpandedPhaseId(phase.id);
      setEditingPhaseTypeId(null);
    }
  }

  function changePhaseType(index: number, type: StageType, confirmed = false) {
    const current = phaseDrafts;
    if (!current[index]) return;
    if (current[index].type === type) return;
    if (type === 'SWISS' && current[index].entrantCount < 3) return;
    if (type === 'GROUPS' && current[index].entrantCount < 4) return;
    if (isTerminalStage(type) && index !== current.length - 1) return;
    if (type === 'BREAK' && (index === 0 || index === current.length - 1 || current[index - 1]?.type === 'BREAK' || current[index + 1]?.type === 'BREAK')) return;
    if (!confirmed && (current[index].dayBreaks.length > 0 || current[index].inlineBreakAfterRound > 0)) {
      setPendingRoundAdjustment({ kind: 'type', index, type,
        removedDays: current[index].dayBreaks.length, removedInline: current[index].inlineBreakAfterRound > 0 });
      return;
    }
    setSelectedRecommendationId(null);
    const next = current.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
    const phase = { ...clearInlinePauseOnTypeChange(next[index]), dayBreaks: [] };
    next[index] = phase;
    const bestOf = phaseBestOfForSport(sport, type);
    phase.type = type;
    phase.label = stageLabel(type);
    phase.bestOf = bestOf;
    if (type === 'GROUPS') {
      phase.groupCount = recommendGroupCount(phase.entrantCount, next.slice(index + 1).find((candidate) => candidate.type !== 'BREAK')?.entrantCount);
    }
    if (type === 'SWISS') {
      phase.swissRounds = recommendedSwissRounds(phase.entrantCount, minimumMatches);
    }
    phase.customEntrants = isTerminalStage(type)
      ? phase.customEntrants || !knockoutEntrantPresets(index === 0 ? participantCount : next[index - 1].entrantCount).includes(phase.entrantCount)
      : false;
    phase.knockoutBestOf = type === 'KNOCKOUT'
      ? resizeKnockoutBestOf(phase.knockoutBestOf, knockoutRoundLabels(phase.entrantCount).length, bestOf)
      : [];

    setPhaseDrafts(normalizeAndTrackPhaseChanges(current, next));
    setEditingPhaseTypeId(null);
  }

  function updatePhaseEntrants(index: number, entrantCount: number, customEntrants = false, confirmed = false) {
    setSelectedRecommendationId(null);
    const next = phaseDrafts.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
    if (!next[index] || index === 0) return;
    const maximum = next[index - 1].entrantCount;
    const nextEntrants = Math.max(2, Math.min(maximum, entrantCount));
    next[index].entrantCount = nextEntrants;
    next[index].customEntrants = customEntrants;
    const impact = reconcileRoundDependentBreaks(next[index]).impact;
    if (!confirmed && (impact.removedDayBreaks > 0 || impact.removedInlineBreak)) {
      setPendingRoundAdjustment({ kind: 'entrants', index, entrants: nextEntrants, custom: customEntrants,
        removedDays: impact.removedDayBreaks, removedInline: impact.removedInlineBreak });
      return;
    }
    if (next[index].type === 'KNOCKOUT') {
      next[index].knockoutBestOf = resizeKnockoutBestOf(next[index].knockoutBestOf,
        knockoutRoundLabels(nextEntrants).length, next[index].bestOf);
    }
    setPhaseDrafts(normalizeAndTrackPhaseChanges(phaseDrafts, next, next[index].id));
  }

  function updateKnockoutRoundBestOf(phase: PhaseDraft, roundIndex: number, bestOf: number) {
    const next = [...phase.knockoutBestOf];
    next[roundIndex] = bestOf;
    updatePhase(phase.id, { knockoutBestOf: next });
  }

  function applyStepNavigation(target: WizardStep, focusDate = false, advance = false) {
    if (step === 3 && advance) {
      if (phaseDrafts.length === 0 && selectedRecommendation) {
        setPhaseDrafts(recommendedPhaseDrafts(selectedRecommendation));
      }
      setHasVisitedPhaseStep(true);
    }
    if (advance) setMaxReachedStep((current) => Math.max(current, target) as WizardStep);
    setStep(target);
    if (focusDate) setFocusStartSettings(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function navigateToStep(target: WizardStep, focusDate = false, advance = false) {
    if ((!advance && target > maxReachedStep) || target === step) return;
    if (step === 2 && participantEditorDirty) {
      setPendingStepNavigation({ target, focusDate, advance });
      return;
    }
    applyStepNavigation(target, focusDate, advance);
  }

  function goNext() {
    if (!canContinue) return;
    navigateToStep((step + 1) as WizardStep, false, true);
  }

  function goBack() {
    if (step > 1) navigateToStep((step - 1) as WizardStep);
  }

  function goToDateTimeSettings() {
    navigateToStep(1, true);
  }

  useEffect(() => {
    if (!focusStartSettings || step !== 1) return;
    const dateField = document.getElementById('tournament-date');
    dateField?.scrollIntoView({ behavior: 'auto', block: 'center' });
    dateField?.focus({ preventScroll: true });
    setFocusStartSettings(false);
  }, [step, focusStartSettings]);

  function confirmDisciplineChange() {
    if (!pendingDiscipline) return;
    if (participants.length > 0) setRosterReviewRequired(true);
    setDiscipline(pendingDiscipline);
    resetParticipantEditor();
    setPendingDiscipline(null);
  }

  function applySportChange(nextSport: string) {
    const allowed = disciplineOptionsForSport(nextSport);
    const nextDiscipline = allowed.some((option) => option.value === discipline)
      ? discipline : allowed[0]?.value ?? 'SINGLES';
    if (nextDiscipline !== discipline) {
      if (participants.length > 0) setRosterReviewRequired(true);
      setDiscipline(nextDiscipline);
      resetParticipantEditor();
      // Keep first name, surname, and both partner fields intact.
    }
    setSport(nextSport);
    setPhaseDrafts((current) => current.map((phase) => ({
      ...phase,
      bestOf: phaseBestOfForSport(nextSport, phase.type),
      knockoutBestOf: phase.knockoutBestOf.map(() => phaseBestOfForSport(nextSport, phase.type)),
    })));
  }

  function cancelSportChange() {
    setPendingSport(null);
    sportSelectRef.current?.focus();
  }

  function confirmSportChange() {
    if (!pendingSport) return;
    applySportChange(pendingSport);
    setPendingSport(null);
    sportSelectRef.current?.focus();
  }

  async function discardCreationDraft() {
    try {
      if (savedDraftId) await removeSavedCreationDraftAtomic(savedDraftId, savedDraftRevision.current ?? undefined);
      clearCreationDraft(window.sessionStorage, sessionDraftKey);
      if (savedDraftId) navigate('/tournaments/new', { replace: true });
      else window.location.reload();
    } catch (error) {
      setDiscardDraftDialogOpen(false);
      if (error instanceof Error && error.message === 'DRAFT_CONFLICT') setDraftConflictOpen(true);
      else setNamedDraftMessage(error instanceof Error ? error.message : 'Entwurf konnte nicht verworfen werden.');
    }
  }

  async function submitTournament(overwriteExistingId?: string) {
    if (step !== 5 || !canCreate || scheduleIssues.length > 0 || submittingTournament || createdTournamentWithDraftNotice) return;
    const collision = findTournamentNameConflict(name);
    if (collision && !overwriteExistingId) {
      if (hasStartedAnyStage(collision, getPhaseLifecycle(collision).startedStageIds)) {
        setCreationError('Ein bereits gestartetes Turnier trägt diesen Namen. Bitte einen anderen Namen wählen.');
        return;
      }
      setOverwriteTournamentId(collision.id);
      return;
    }
    const submitStart = useCurrentTime ? toLocalDateTime(new Date()) : scheduledStart;
    const finalTimeline = buildPlannedTimeline(submitStart, phaseScheduleProposals);
    const finalAwardsAt = awardsAtOverride ?? finalTimeline.estimatedEnd;
    const finalSchedule: PlannedScheduleItem[] = [
      ...finalTimeline.items,
      ...(awardsEnabled ? [{ id: 'award-ceremony', at: finalAwardsAt, title: 'Siegerehrung',
        type: 'other' as const, autoTime: awardsAtOverride === null }] : []),
    ];
    if (finalTimeline.warnings.length || validatePlannedSchedule(finalSchedule).length
      || (awardsEnabled && finalAwardsAt < finalTimeline.estimatedEnd)) {
      setCreationError('Der Zeitplan ist zum tatsächlichen Speicherzeitpunkt nicht mehr gültig. Bitte Pausen und Siegerehrung prüfen.');
      return;
    }
    if (!isStartAtOrAfterNow(submitStart)) {
      setCreationError('Der geplante Turnierstart muss jetzt oder in der Zukunft liegen. Bitte Datum und Uhrzeit korrigieren.');
      return;
    }
    setCreationError(null);
    setSubmittingTournament(true);
    try {
    const tournament = await createMockTournamentAtomic({
      name,
      sport,
      discipline,
      scheduledStart: submitStart,
      requireFutureStart: true,
      overwriteTournamentId: overwriteExistingId,
      plannedSchedule: finalSchedule.map((entry) => ({ ...entry, title: entry.title.trim(), note: entry.note?.trim() })),
      tables,
      minimumMatches,
      matchDurationMinutes,
      venueTurnoverMinutes: breakMinutes,
      participantNames: participants.map((participant) => participantDisplayName(participant, discipline)),
      phases: phaseDrafts.map((phase, index) => ({
        type: phase.type,
        label: phase.label,
        bestOf: timedSport ? 1 : phase.bestOf,
        entrantCount: phase.entrantCount,
        groupCount: phase.groupCount,
        swissRounds: phase.swissRounds,
        knockoutBestOf: timedSport ? phase.knockoutBestOf.map(() => 1) : phase.knockoutBestOf,
        breakKind: phase.breakKind,
        breakMinutes: phase.breakMinutes,
        nextDayStart: phase.nextDayStart,
        nextDayDate: phase.nextDayDate,
        breakUntil: phase.breakUntil,
        breakUntilDate: phase.breakUntilDate || finalTimeline.items.find((item) => item.id === `phase-${index + 1}`)?.at.slice(0, 10),
        note: phase.note,
        inlineBreakAfterRound: phase.inlineBreakAfterRound,
        inlineBreakKind: phase.inlineBreakKind,
        inlineBreakMinutes: phase.inlineBreakMinutes,
        inlineBreakUntil: phase.inlineBreakUntil,
        inlineBreakUntilDate: phase.inlineBreakUntilDate || finalTimeline.items.find((item) => item.id === `inline-break-${index + 1}`)?.at.slice(0, 10),
        dayBreaks: phase.dayBreaks,
      })),
      estimatedDurationMinutes: estimatedPlayingMinutes + plannedActiveBreakMinutes(finalTimeline),
      venueLayout: venueLayoutEnabled ? venueLayout : undefined,
    });
    clearCreationDraft(window.sessionStorage, sessionDraftKey);
    if (savedDraftId) {
      try {
        await removeSavedCreationDraftAtomic(savedDraftId, savedDraftRevision.current ?? undefined);
      } catch (error) {
        const conflict = error instanceof Error && error.message === 'DRAFT_CONFLICT';
        setCreatedTournamentWithDraftNotice({
          id: tournament.id,
          message: conflict
            ? 'Der gespeicherte Entwurf wurde in einem anderen Tab geändert. Deine neue Turniererstellung war erfolgreich, aber der neuere Entwurf wurde zur Sicherheit nicht gelöscht.'
            : 'Das Turnier wurde erstellt. Der bisherige Entwurf konnte jedoch nicht gelöscht werden und bleibt vorerst in deiner Entwurfsliste erhalten.',
        });
        return;
      }
    }
    navigate(`/tournaments/${tournament.id}/control`, { replace: true });
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : 'Das Turnier konnte nicht gespeichert werden. Bitte Speicherplatz prüfen und erneut versuchen.');
    } finally {
      setSubmittingTournament(false);
    }
  }

  const phaseEstimates = useMemo(
    () => phaseDrafts.map((phase) => estimatePhaseMetrics({
      type: phase.type,
      entrantCount: phase.entrantCount,
      bestOf: phase.bestOf,
      groupCount: phase.groupCount,
      swissRounds: phase.swissRounds,
      knockoutBestOf: phase.knockoutBestOf,
      breakKind: phase.breakKind,
      breakMinutes: phase.breakMinutes,
    }, tables, timedSport
      ? { matchDurationMinutes, venueTurnoverMinutes: breakMinutes }
      : { minutesPerSet: planningMinutesPerSet(sport) })),
    [phaseDrafts, tables, timedSport, matchDurationMinutes, breakMinutes, sport],
  );

  // The timetable is derived on every phase/date edit. No manual "generate"
  // action or stale copy of the phases can remain in the wizard.
  const phaseScheduleProposals = useMemo(() => phaseDrafts.map((phase, index) => ({
    label: phase.label,
    note: phase.type === 'BREAK' ? phase.note : undefined,
    type: phase.type,
    estimatedMinutes: phaseEstimates[index]?.estimatedDurationMinutes ?? 0,
    breakKind: phase.breakKind,
    breakMinutes: phase.breakMinutes,
    breakUntil: phase.breakUntil,
    breakUntilDate: phase.breakUntilDate || undefined,
    nextDayStart: phase.nextDayStart,
    nextDayDate: phase.nextDayDate,
    roundCount: playingRounds(phase) || undefined,
    roundDurationsMinutes: phase.type === 'KNOCKOUT'
      ? estimateKnockoutRoundMinutes(phase.entrantCount, tables, phase.bestOf, phase.knockoutBestOf,
        timedSport ? { matchDurationMinutes, venueTurnoverMinutes: breakMinutes } : { minutesPerSet: planningMinutesPerSet(sport) })
      : undefined,
    inlineBreakAfterRound: phase.inlineBreakAfterRound,
    inlineBreakKind: phase.inlineBreakKind,
    inlineBreakMinutes: phase.inlineBreakMinutes,
    inlineBreakUntil: phase.inlineBreakUntil,
    inlineBreakUntilDate: phase.inlineBreakUntilDate || undefined,
    dayBreaks: phase.dayBreaks,
  })), [phaseDrafts, phaseEstimates, tables, timedSport, matchDurationMinutes, breakMinutes, sport]);
  const plannedTimeline = useMemo(() => buildPlannedTimeline(scheduledStart, phaseScheduleProposals),
    [scheduledStart, phaseScheduleProposals]);
  useEffect(() => {
    setPhaseDrafts((current) => anchorFixedPauseDates(current, plannedTimeline));
  }, [plannedTimeline]);
  // Only active competition and pauses during tournament days count toward
  // estimated duration. Overnight gaps still shift the preview calendar.
  const estimatedPlayingMinutes = phaseEstimates.reduce((total, estimate, index) =>
    total + (phaseDrafts[index]?.type === 'BREAK' ? 0 : estimate.estimatedDurationMinutes), 0);
  const estimatedBreakMinutes = plannedActiveBreakMinutes(plannedTimeline);
  const estimatedTournamentDurationMinutes = estimatedPlayingMinutes + estimatedBreakMinutes;
  const awardsAt = awardsAtOverride ?? plannedTimeline.estimatedEnd;
  const plannedSchedule: PlannedScheduleItem[] = [
    ...plannedTimeline.items,
    ...(awardsEnabled ? [{ id: 'award-ceremony', at: awardsAt, title: 'Siegerehrung', type: 'other' as const, autoTime: awardsAtOverride === null }] : []),
  ];
  const ceremonyIssue = awardsEnabled && (!isValidLocalDateTime(awardsAt)
    || (plannedTimeline.estimatedEnd && awardsAt < plannedTimeline.estimatedEnd))
    ? 'Die Siegerehrung muss am oder nach dem voraussichtlichen Turnierende liegen.' : null;
  const scheduleIssues = [...validatePlannedSchedule(plannedSchedule), ...plannedTimelineConflicts(plannedTimeline), ...playingDayOverflowWarnings(plannedTimeline), ...(ceremonyIssue ? [ceremonyIssue] : [])];
  const prestartIssues = prestart
    ? [...validatePrestartPhases(prestartPhaseDrafts, prestart.activeParticipants), ...validatePlannedSchedule(plannedTimeline.items), ...plannedTimelineConflicts(plannedTimeline),
      ...(prestartManualCeremony && prestartCeremonyAt < plannedTimeline.estimatedEnd
        ? ['Die manuelle Siegerehrung liegt vor dem neuen Turnierende. Bitte einen späteren Termin angeben.'] : []),
      ...(reviewRequiredPhaseIds.length ? ['Bitte alle automatisch veränderten Phasen als geprüft markieren.'] : [])]
    : [];
  const overnightDatesValid = phaseDrafts.every((phase, index) => {
    if (phase.type !== 'BREAK' || phase.breakKind !== 'overnight') return true;
    const plannedStart = plannedTimeline.items.find((item) => item.id === 'phase-' + (index + 1))?.at;
    return !phase.nextDayDate || (Boolean(parseCalendarDate(phase.nextDayDate)) && Boolean(plannedStart)
      && phase.nextDayDate > plannedStart!.slice(0, 10));
  });
  const centralCreationIssues = !prestart && phaseDrafts.length ? validateTournamentCreation({
    name, sport, discipline, tables, minimumMatches,
    participantNames: participants.map((participant) => participantDisplayName(participant, discipline)),
    phases: phaseDrafts, plannedSchedule, scheduledStart, venueLayout: venueLayoutEnabled ? venueLayout : undefined,
    matchDurationMinutes, venueTurnoverMinutes: breakMinutes, tournamentMode, plannedDays,
  }) : [];
  const canCreate = centralCreationIssues.length === 0 && reviewRequiredPhaseIds.length === 0 && basicsValid && participantsValid && venueLayoutValid && gameSettingsValid
    && phaseConfigurationValid && phaseEntrantsValid && overnightDatesValid && hasVisitedPhaseStep
    && scheduleIssues.length === 0;
  const firstCompetition = phaseDrafts.find((phase) => phase.type !== 'BREAK');
  const actualMinimumMatches = firstCompetition ? minimumPlayedMatches(firstCompetition.type, firstCompetition.entrantCount, firstCompetition.groupCount, firstCompetition.swissRounds) : 0;
  const minimumMatchesShortfall = firstCompetition ? Math.max(0, minimumMatches - actualMinimumMatches) : 0;
  const dateIsPast = isValidLocalDateTime(scheduledStart) && !startTimeIsAllowed;
  const canContinue =
    (step === 1 && basicsValid) ||
    (step === 2 && participantsValid) ||
    step === 3 ||
    (step === 4 && canCreate);

  return (
    <>
      <div className={prestart ? 'creation-page-container is-prestart-phase-editor' : 'creation-page-container'}>
      {!prestart ? <header className="page-head creation-page-head">
        <div className="creation-page-heading">
          <h1>{savedDraftId ? 'Turnierentwurf bearbeiten' : 'Turnier erstellen'}</h1>
          <p className="muted">Schritt {step} von 5 · Einstellungen bleiben erhalten und können jederzeit über die bereits erreichten Schritte geändert werden.</p>
          {draftSaveFailed && (
            <p className="creation-draft-error" role="alert">
              Temporäre Wiederherstellung im aktuellen Tab fehlgeschlagen. Bitte Browser-Speicher prüfen.
            </p>
          )}
        </div>
        <div className="creation-draft-actions">
          <div className="creation-draft-buttons">
            <button className="btn primary" type="button" disabled={savingNamedDraft} onClick={() => { void saveNamedDraft(); }}>{savingNamedDraft ? "Speichere …" : "Entwurf speichern"}</button>
            {savedDraftId && <button className="btn" type="button" disabled={savingNamedDraft} onClick={() => { void saveNamedDraft(true); }}>Entwurf kopieren</button>}
            <button ref={discardDraftButtonRef} className="btn danger creation-discard-button" type="button" onClick={() => setDiscardDraftDialogOpen(true)}>Entwurf verwerfen</button>
          </div>
          {namedDraftMessage && <span className="field-hint" role="status">{namedDraftMessage}</span>}
        </div>
      </header> : <header className="page-head creation-page-head">
        <div className="creation-page-heading">
          <h1>Phasen vor Turnierstart bearbeiten</h1>
          <p className="muted">Dieselben Einstellungen wie bei der Turniererstellung. Die neue Planung übernimmt alle {prestart.activeParticipants} aktiven Teilnehmer.</p>
          {prestartRecovered && <p className="callout" role="status">Deine zuvor ungespeicherte Phasenplanung wurde aus dieser Browsersitzung wiederhergestellt. Sie ist noch nicht endgültig gespeichert.</p>}
          {prestartRecoveryConflict && <div className="callout" role="alert">
            <strong>Konflikt beim Wiederherstellen:</strong> Die Turnierplanung oder Auslosung wurde seit dem letzten Bearbeiten verändert, oder ihre ursprüngliche Version ist unbekannt.
            Deine ungespeicherten Änderungen bleiben zur Kontrolle sichtbar, dürfen aber die neuere Planung nicht überschreiben.
            <button className="btn small" type="button" onClick={discardPrestartEditing}>Arbeitsfassung verwerfen und aktuelle Planung öffnen</button>
          </div>}
        </div>
        <button className="btn" type="button" onClick={() => prestartDirty
          ? setConfirmPrestartDiscard(true) : discardPrestartEditing()}>Bearbeitung schließen</button>
      </header>}

      {!prestart && <nav className="wizard-steps" aria-label="Erstellungsschritte">
        {stepLabels.map((label, index) => {
          const stepNumber = (index + 1) as WizardStep;
          const reached = stepNumber <= maxReachedStep;
          const stepValid = [basicsValid, participantsValid, maxReachedStep >= 4 && phaseDrafts.length > 0 && phaseConfigurationValid,
            phaseConfigurationValid && phaseEntrantsValid && scheduleIssues.length === 0, canCreate][index];
          const current = step === stepNumber;
          const complete = reached && !current && stepValid;
          const needsReview = reached && !current && !stepValid;
          const stateLabel = current ? 'Aktuell' : complete ? 'Erledigt' : needsReview ? 'Prüfen' : 'Offen';
          return (
            <button
              className={`wizard-step ${current ? 'active' : complete ? 'completed' : needsReview ? 'needs-attention' : 'upcoming'}`}
              key={label}
              type="button"
              aria-current={step === stepNumber ? 'step' : undefined}
              disabled={stepNumber > maxReachedStep}
              title={stepNumber > maxReachedStep ? 'Diesen Schritt erreichst du über Weiter.' : `Zu ${label} wechseln`}
              onClick={() => navigateToStep(stepNumber)}
            >
              <span className="wizard-step-number">{complete ? '✓' : needsReview ? '!' : stepNumber}</span>
              <span className="wizard-step-content"><strong>{label}</strong><small>{stateLabel}</small></span>
            </button>
          );
        })}
      </nav>}

      {!prestart && dateIsPast && (
        <div className="wizard-start-past-banner" role="alert">
          <span className="wizard-start-past-banner-icon" aria-hidden="true">!</span>
          <div className="wizard-start-past-banner-copy">
            <strong>Der geplante Turnierstart liegt in der Vergangenheit.</strong>
            <p>Bitte wähle einen zukünftigen Termin oder verwende die aktuelle Uhrzeit.</p>
          </div>
          <div className="wizard-start-past-banner-actions">
            <button type="button" className="btn small" onClick={selectCurrentTime}>Stattdessen das aktuelle Datum und Uhrzeit verwenden</button>
            <button type="button" className="btn small" onClick={goToDateTimeSettings}>Zur Datums und Uhrzeiteinstellung</button>
          </div>
        </div>
      )}

      <div className={`wizard-workspace ${step === 5 ? 'wizard-workspace-review' : ''}`}>
      <div className="card wizard-card">
        {step === 1 && (
          <section>
            <h2>Grunddaten</h2>
            <p className="muted">Lege die Eckdaten für dein Turnier fest. Mit <span className="wizard-required-mark" aria-hidden="true">*</span> gekennzeichnete Felder sind Pflichtfelder.</p>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Turniername <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <input id="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Turniername eingeben" autoFocus />
              </div>
              <div className="field">
                <label htmlFor="tournament-date">Turnierdatum <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <CalendarDatePicker id="tournament-date" label="Turnierdatum" required value={scheduledDate} minDate={currentLocalMinute.slice(0, 10)} onChange={setScheduledDate} />
                <span className="field-hint wizard-date-hint">Geplantes Datum für die Ankündigung und den Zeitplan. Den tatsächlichen Turnierstart legt die Turnierleitung fest.</span>
              </div>
              <div className="field">
                <label htmlFor="tournament-start-time">Geplanter Turnierbeginn <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <ClockTimePicker id="tournament-start-time" value={scheduledTime} onChange={setScheduledTime}
                  label="Geplanter Turnierbeginn" minTime={scheduledDate === currentLocalMinute.slice(0, 10) ? currentLocalMinute.slice(11, 16) : undefined}
                  nowTime={currentLocalMinute.slice(11, 16)} nowActive={useCurrentTime} onNow={selectCurrentTime} />
                <span className="field-hint wizard-start-hint">Frühere Uhrzeiten sind am heutigen Tag gesperrt. „Jetzt“ übernimmt die aktuelle Uhrzeit und aktualisiert sie fortlaufend. Den tatsächlichen Spielstart löst später die Turnierleitung aus.</span>
                {invalidLocalClock && <span className="field-error" role="alert">{ambiguousLocalClock
                  ? 'Diese Uhrzeit kommt bei der Winterzeitumstellung zweimal vor. Da der Entwurf noch keine eindeutige Zeitzonenkennzeichnung speichert, bitte eine Uhrzeit außerhalb der doppelten Stunde wählen.'
                  : 'Diese Uhrzeit existiert an diesem Datum aufgrund der Zeitumstellung nicht. Bitte eine andere Uhrzeit auswählen.'}</span>}
              </div>
              <div className="field">
                <label htmlFor="sport">Sportart <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <select id="sport" ref={sportSelectRef} required value={sport} onChange={(event) => {
                  const selectedSport = event.target.value;
                  if (selectedSport === sport) return;
                  if (participants.length > 0 || phaseDrafts.length > 0) {
                    setPendingSport(selectedSport);
                    return;
                  }
                  applySportChange(selectedSport);
                }}>
                  <option value="" disabled>Sportart auswählen</option>
                  {sportOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <span className="field-hint">Bestimmt die verfügbaren Wettbewerbsarten und die Planungswerte für die Turnierdauer.</span>
              </div>
              <div className="field">
                <label htmlFor="discipline">Wettbewerbsart <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <select id="discipline" required={availableDisciplines.length > 1} aria-describedby="competition-type-hint" value={sport ? discipline : ''} disabled={availableDisciplines.length <= 1}
                  onChange={(event) => {
                    const nextDiscipline = event.target.value as Discipline;
                    if (nextDiscipline === discipline) return;
                    if (participants.length > 0) {
                      setPendingDiscipline(nextDiscipline);
                      return;
                    }
                    setDiscipline(nextDiscipline);
                    resetParticipantEditor();
                  }}>
                  {!sport && <option value="">Zuerst Sportart auswählen</option>}
                  {availableDisciplines.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span id="competition-type-hint" className="field-hint">
                  {!sport
                    ? 'Wähle zuerst eine Sportart aus. Danach kannst du die Wettbewerbsart festlegen.'
                    : availableDisciplines.length === 1
                      ? `Für diese Sportart ist nur „${availableDisciplines[0].label}“ verfügbar. Die Auswahl erfolgt automatisch.`
                      : 'Wähle zwischen Einzel und Doppel. Die Wettbewerbsart bestimmt, wie du Teilnehmer erfasst.'}
                </span>
              </div>
              <div className="field full">
                <label>Anzahl {sport ? venue.plural : 'Spielflächen'} <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <NumberChoice
                  ariaLabel={`Anzahl ${sport ? venue.plural : 'Spielflächen'} (Pflichtfeld)`}
                  value={tables}
                  presets={Array.from({ length: 12 }, (_, index) => index + 1)}
                  custom={customTables}
                  customMinimum={13}
                  customMaximum={9999}
                  onPreset={(value) => { setTables(value); setCustomTables(false); }}
                  onCustom={() => { setCustomTables(true); setTables((current) => current > 12 ? current : 13); }}
                  onCustomValue={setTables}
                />
                <span className="field-hint">Wie viele Spielflächen können gleichzeitig genutzt werden? Die Anzahl beeinflusst die geschätzte Turnierdauer.</span>
              </div>
            </div>
            <div className="venue-optional wizard-venue-choice">
              <div className="wizard-venue-choice-head">
                <div>
                  <h3>Spielflächenplan <span className="wizard-optional-tag">Optional</span></h3>
                  <p className="muted">Ohne eigenen Plan werden die {venue.plural} automatisch nummeriert und den Spielen zugewiesen. Aktiviere den Plan, wenn du ihre Anordnung festlegen möchtest.</p>
                </div>
                <label className="format-toggle wizard-venue-toggle" title={venueLayoutEnabled ? 'Individuellen Spielflächenplan deaktivieren' : 'Individuellen Spielflächenplan aktivieren'}>
                  <strong>{venueLayoutEnabled ? 'Aktiviert' : 'Aktivieren'}</strong>
                  <input type="checkbox" role="switch" aria-label="Individueller Spielflächenplan" checked={venueLayoutEnabled} onChange={(event) => { setVenueLayoutEnabled(event.target.checked); if (event.target.checked) setVenueLayoutEditorOpen(true); }} />
                </label>
              </div>
              {venueLayoutEnabled && (
                <>
                  <div className="wizard-venue-choice-actions">
                    <span className="muted">{venue.plural}: {tables} · Raster: {venueLayout.columns} × {venueLayout.rows}</span>
                    <button className="btn small" type="button" aria-expanded={venueLayoutEditorOpen}
                      onClick={() => setVenueLayoutEditorOpen((current) => !current)}>
                      {venueLayoutEditorOpen ? 'Plan einklappen' : 'Plan bearbeiten'}
                    </button>
                  </div>
                  {venueLayoutEnabled && !venueLayoutValid && <p role="alert" className="field-error">{validateVenueLayout(venueLayout, tables).join(' ')}</p>}
                  {venueLayoutEditorOpen && <VenueLayoutEditor layout={venueLayout} tableCount={tables} sport={sport} onChange={(next) => { setVenueLayout(next); setVenueLayoutCustomized(JSON.stringify(next) !== JSON.stringify(createVenueLayout(tables))); }} />}
                </>
              )}
            </div>
            <div className="wizard-game-settings">
              <div className="wizard-game-settings-heading">
                <h3>Spieldaten</h3>
                <p className="muted">Die gewünschte Spielanzahl hilft bei der Turnierempfehlung. Das Best-of-Format legst du später für jede Phase fest.</p>
              </div>
            <div className="spieldaten-layout">
              <div className="field">
                <label>Gewünschte Mindestspiele pro Teilnehmer <span className="wizard-required-mark" aria-hidden="true">*</span></label>
                <NumberChoice
                  ariaLabel="Gewünschte Mindestspiele pro Teilnehmer (Pflichtfeld)"
                  value={minimumMatches}
                  presets={[1, 2, 3, 4, 5]}
                  custom={customMinimumMatches}
                  customMinimum={6}
                  customMaximum={100}
                  onPreset={(value) => { setMinimumMatches(value); setCustomMinimumMatches(false); }}
                  onCustom={() => { setCustomMinimumMatches(true); setMinimumMatches((current) => current > 5 ? current : 6); }}
                  onCustomValue={setMinimumMatches}
                />
                <span className="field-hint">Zielwert für tatsächlich gespielte Begegnungen. Freilose zählen nicht als gespieltes Match. Abweichungen werden in den Empfehlungen angezeigt.</span>
              </div>
              <div className="field match-timing-fields">
                <label htmlFor="match-duration">{timedSport ? <>Spieldauer (Minuten) <span className="wizard-required-mark" aria-hidden="true">*</span></> : 'Satzdauer (Minuten)'}</label>
                <input id="match-duration" type="number" min="1" step="1" required={timedSport} value={timedSport ? timedMatchMinutes : planningMinutesPerSet(sport)} disabled={!timedSport} placeholder={timedSport ? 'Pflichtfeld – z. B. 12' : undefined} onChange={(event) => setTimedMatchMinutes(event.target.value)} />
                {!timedSport && <span className="field-hint">Automatischer Planungswert: {planningMinutesPerSet(sport)} Minuten pro Satz. Dieser Wert wird für die Dauerprognose verwendet.</span>}
                {timedSport && <>
                  <span className="field-hint">Geplante Dauer eines Spiels in vollen Minuten. Sie wird für die Zeitprognose verwendet.</span>
                  <label htmlFor="venue-turnover">Zeitpuffer zwischen Spielen (Minuten) <span className="wizard-optional-tag">Optional</span></label>
                  <input id="venue-turnover" type="number" min="0" step="1" placeholder="Optional – z. B. 5" value={venueTurnoverMinutes} onChange={(event) => setVenueTurnoverMinutes(event.target.value)} />
                  <span className="field-hint">Zusätzliche Zeit zwischen zwei Spielen auf derselben Spielfläche. Ein leeres Feld entspricht 0 Minuten.</span>
                  {(Number(timedMatchMinutes) > 240 || Number(venueTurnoverMinutes) > 60) && validMatchDuration && validTurnover && <span className="field-hint" role="status">Ungewöhnlich lange Spieldauer oder Wechselpause – bitte kontrolliere die Zeitangabe.</span>}
                  {(!validMatchDuration || !validTurnover) && <span className="field-error">Die Spieldauer muss zwischen 1 und 1440 Minuten liegen; der Zeitpuffer zwischen 0 und 240 Minuten.</span>}
                </>}
              </div>
            </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="participant-step">
            <div className="section-head compact-head participant-step-head">
              <div>
                <h2>Teilnehmer eintragen</h2>
                <p className="muted">
                  {discipline === 'TEAMS' ? `${participantCount} Mannschaften gespeichert.`
                    : discipline === 'SINGLES' ? `${participantCount} Einzelspieler gespeichert.`
                      : `${participantCount} Doppel gespeichert.`}
                </p>
              </div>
            </div>

            {rosterReviewRequired && (
              <div className="callout participant-review-warning" role="alert">
                <strong>Teilnehmer nach Wechsel der Wettbewerbsart prüfen</strong>
                <p>Die bisherigen Einträge werden jetzt als {discipline === 'TEAMS' ? 'Mannschaften' : discipline === 'DOUBLES' ? 'Doppel' : 'Einzelspieler'} interpretiert. Prüfe Namen und Zuordnungen, bevor du fortfährst.</p>
                <button className="btn small" type="button" disabled={!savedParticipantNamesValid || incompleteSavedParticipants > 0}
                  onClick={() => setRosterReviewRequired(false)}>Teilnehmerliste geprüft</button>
              </div>
            )}
            <div className="participant-entry-layout">
              <div className="participant-editor">
                <div className="participant-editor-head">
                  <div className="participant-editor-title">
                    <h3>{discipline === 'TEAMS' ? 'Mannschaft' : discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} erfassen</h3>
                    <span className="badge">{editingParticipantId ? 'Bearbeiten' : 'Neuer Eintrag'}</span>
                  </div>
                  <div className="participant-editor-head-actions">
                    {editingParticipantId && (
                      <button className="btn small danger-outline" type="button" onClick={resetParticipantEditor}>Abbrechen</button>
                    )}
                    <button className="btn small wizard-test-player-button" type="button" ref={testParticipantsButtonRef}
                      onClick={() => setTestParticipantsDialogOpen(true)}
                      disabled={participantCount >= 19}
                      title={participantCount >= 19 ? 'Bereits mindestens 19 Teilnehmer gespeichert.' : 'Nur für Testturniere: Teilnehmerliste mit Testeinträgen auf 19 ergänzen'}>
                      {discipline === 'TEAMS' ? '19 Testmannschaften erzeugen' : discipline === 'SINGLES' ? '19 Testspieler erzeugen' : '19 Testdoppel erzeugen'}
                    </button>
                  </div>
                </div>

                <div className="participant-editor-fields-row">
                  <div className="participant-mask">
                    <div className="field">
                      <label htmlFor="participant-first">{discipline === 'TEAMS' ? 'Mannschaftsname' : discipline === 'DOUBLES' ? 'Spieler 1 · Vorname' : 'Vorname'}</label>
                      <input
                        id="participant-first"
                        className={participantErrors.firstName || participantErrors.teamName ? 'input-error' : ''}
                        value={discipline === 'TEAMS' ? (participantForm.teamName || displayPersonName(participantForm.firstName, participantForm.lastName)) : participantForm.firstName}
                        onChange={(event) => updateParticipantForm(discipline === 'TEAMS' ? 'teamName' : 'firstName', event.target.value)}
                        aria-invalid={Boolean(participantErrors.firstName || participantErrors.teamName)}
                        maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                        autoFocus
                      />
                    </div>
                    {discipline !== 'TEAMS' && <div className="field">
                      <label htmlFor="participant-last">{discipline === 'DOUBLES' ? 'Spieler 1 · Nachname' : 'Nachname'}</label>
                      <input
                        id="participant-last"
                        className={participantErrors.lastName ? 'input-error' : ''}
                        value={participantForm.lastName}
                        maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                        onChange={(event) => updateParticipantForm('lastName', event.target.value)}
                        aria-invalid={Boolean(participantErrors.lastName)}
                      />
                    </div>}
                    {discipline === 'DOUBLES' && (
                      <>
                        <div className="field">
                          <label htmlFor="participant-partner-first">Spieler 2 · Vorname</label>
                          <input
                            id="participant-partner-first"
                            className={participantErrors.partnerFirstName ? 'input-error' : ''}
                            value={participantForm.partnerFirstName}
                            maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                            onChange={(event) => updateParticipantForm('partnerFirstName', event.target.value)}
                            aria-invalid={Boolean(participantErrors.partnerFirstName)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="participant-partner-last">Spieler 2 · Nachname</label>
                          <input
                            id="participant-partner-last"
                            className={participantErrors.partnerLastName ? 'input-error' : ''}
                            value={participantForm.partnerLastName}
                            maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                            onChange={(event) => updateParticipantForm('partnerLastName', event.target.value)}
                            aria-invalid={Boolean(participantErrors.partnerLastName)}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="participant-editor-actions">
                    <button className="btn primary" type="button" onClick={saveParticipant}>
                      {editingParticipantId ? 'Änderungen speichern' : discipline === 'TEAMS' ? 'Mannschaft hinzufügen' : discipline === 'SINGLES' ? 'Spieler hinzufügen' : 'Doppel hinzufügen'}
                    </button>
                  </div>
                </div>
                <p className="field-hint">Namen: Buchstaben, Zahlen, Punkte, Bindestriche und Klammern – z. B. Max Müller (TSV) oder 1. FC Köln. Maximal {MAX_PARTICIPANT_NAME_LENGTH} Zeichen je Feld.</p>
                <div className="participant-validation" aria-live="polite">
                  {participantErrorMessages.map((message) => (
                    <span className="field-error" key={message}>{message}</span>
                  ))}
                </div>
              </div>
            </div>

            <aside ref={rosterRef} className="participant-roster participant-roster-grid-card" aria-label="Gespeicherte Teilnehmer">
                <div className="participant-roster-head">
                  <h3>Teilnehmerliste</h3>
                  <span className="badge" aria-label={`${participantCount} Teilnehmer gespeichert`}>{participantCount}</span>
                </div>

                {showRosterNavigation && <nav className="creation-roster-pagination" aria-label="Teilnehmerseiten">
                  <button type="button" className="btn small" disabled={visibleRosterStart === 0}
                    onClick={rosterPreviousPage}>Zurück</button>
                  <span aria-live="polite">Einträge {visibleRosterStart + 1}–{Math.min(participants.length, visibleRosterStart + rosterPageSize)} von {participants.length}</span>
                  <button type="button" className="btn small" disabled={visibleRosterStart + rosterPageSize >= participants.length}
                    onClick={rosterNextPage}>Weiter</button>
                </nav>}

                <div className="participant-roster-list participant-roster-multi">
                  {participants.length === 0 ? (
                    <div className="participant-empty">
                      Noch keine Teilnehmer gespeichert. Neue Einträge erscheinen hier sofort.
                    </div>
                  ) : visibleRoster.map((participant, index) => (
                    <article className={`participant-roster-row ${discipline === 'DOUBLES' ? 'is-double' : 'is-compact'} ${editingParticipantId === participant.id ? 'editing' : ''}`} key={participant.id}>
                      <span className="participant-list-number">{visibleRosterStart + index + 1}</span>
                      <div className="participant-list-name" title={participantDisplayName(participant, discipline)}>
                         {discipline === 'DOUBLES' ? (
                           <div className="participant-double-players">
                             <div className="participant-double-player">
                               <span className="participant-player-number" aria-hidden="true">1</span>
                               <ScrollingParticipantName name={displayPersonName(participant.firstName, participant.lastName)} />
                             </div>
                             <div className="participant-double-player">
                               <span className="participant-player-number" aria-hidden="true">2</span>
                               <ScrollingParticipantName name={displayPersonName(participant.partnerFirstName, participant.partnerLastName)} />
                             </div>
                           </div>
                         ) : (
                           <ScrollingParticipantName name={participantDisplayName(participant, discipline)} />
                         )}
                         {invalidRosterIndices.has(visibleRosterStart + index) && (
                           <span className="participant-incomplete" role="img" aria-label="Eintrag fehlerhaft" title="Unvollständiger, ungültiger oder doppelter Eintrag.">!</span>
                         )}
                       </div>
                       <div className="participant-list-actions">
                         <button className="participant-icon-button" type="button"
                           aria-label={`${participantDisplayName(participant, discipline)} bearbeiten`}
                           title={`${participantDisplayName(participant, discipline)} bearbeiten`}
                           onClick={() => editParticipant(participant)}>
                           <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                             <path d="M12 20h9" />
                             <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z" />
                           </svg>
                         </button>
                         <button className="participant-icon-button participant-icon-delete" type="button"
                           aria-label={`${participantDisplayName(participant, discipline)} entfernen`}
                           title={`${participantDisplayName(participant, discipline)} entfernen`}
                           onClick={() => removeParticipant(participant.id)}>
                           <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                             <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7" />
                           </svg>
                         </button>
                       </div>
                    </article>
                  ))}
                </div>
              </aside>

            {recentlyRemovedParticipant && <div className="creation-undo-remove" role="status">
              <span>„{participantDisplayName(recentlyRemovedParticipant.participant, discipline)}“ wurde entfernt.</span>
              <button className="btn small" type="button" onClick={undoRemoveParticipant}>Rückgängig</button>
            </div>}
            {undoRemoveError && <p className="field-error" role="alert">{undoRemoveError}</p>
            {!savedParticipantNamesValid && <p className="field-error" role="alert">Mindestens ein gespeicherter Teilnehmereintrag ist unvollständig, ungültig oder doppelt. Bitte die markierten Einträge überprüfen.</p>}
            {invalidRosterIndices.size > 0 && (
              <div className="wizard-invalid-participants" role="status">
                <span><strong>{invalidRosterIndices.size} fehlerhafte {invalidRosterIndices.size === 1 ? 'Eintragung' : 'Eintragungen'}</strong> · Der erste gültige Eintrag bei einem Namensduplikat bleibt erhalten.</span>
                <button type="button" className="btn small danger-outline" onClick={removeInvalidParticipants}>
                  Alle fehlerhaften Einträge entfernen
                </button>
              </div>
            )}
          </section>
        )}


        {step === 3 && (
          <section className="format-step">
            <div className="format-step-header">
              <div>
                <h2>Turnierform auswählen</h2>
                <p className="muted">Wähle eine Empfehlung oder stelle deine Turnierphasen im nächsten Schritt selbst zusammen.</p>
              </div>
              <span className="format-info-tag" title="Dieser Planungswert wird zur Schätzung der Turnierdauer verwendet.">
                {timedSport
                  ? `Planungswert: ${matchDurationMinutes} Min./Spiel${breakMinutes ? ` + ${breakMinutes} Min. Wechselzeit` : ''}`
                  : `Planungswert: ${planningMinutesPerSet(sport)} Min./Satz`}
              </span>
            </div>

            <div className="format-step-layout">
              <aside className="format-settings-panel">
                <div className="format-settings-head">
                  <h3>Vorgaben für Vorschläge</h3>
                  <p className="muted">Passe die Vorschläge an deine Veranstaltung an. Deine manuelle Phasenplanung bleibt unabhängig von diesen Vorgaben.</p>
                </div>

                <div className="format-settings-content">
                <div className="tournament-mode-setting">
                  <fieldset className="tournament-mode-choice">
                    <legend>Turnierzeitraum</legend>
                    <label className="tournament-mode-option">
                      <input type="radio" name="tournament-mode" checked={tournamentMode === 'single'}
                        onChange={() => setPendingTournamentMode('single')}/>
                      <span>Eintägig</span>
                    </label>
                    <label className="tournament-mode-option">
                      <input type="radio" name="tournament-mode" checked={tournamentMode === 'multi'}
                        onChange={() => setTournamentMode('multi')}/>
                      <span>Mehrtägig</span>
                    </label>
                  </fieldset>
                  {tournamentMode === 'multi' && <div className="field tournament-day-count">
                    <label htmlFor="planned-playing-days">Spieltage</label>
                    <RecommendationNumberStepper id="planned-playing-days" label="Geplante Anzahl an Spieltagen"
                      value={plannedDays} min={2} max={14} onChange={setPlannedDays}/>
                  </div>}
                  <div className="field recommendation-duration-field">
                    <label htmlFor="preferred-duration" title="Die gesamte aktive Turnierdauer als Zielwert. Mit ± in 15-Minuten-Schritten ändern.">Geplante Turnierdauer</label>
                    <div className="recommendation-duration-stepper" role="group" aria-label="Geplante Turnierdauer anpassen">
                      <button type="button" className="recommendation-number-stepper-button"
                        aria-label="Geplante Turnierdauer um 15 Minuten verringern"
                        disabled={preferredDurationMinutes <= MIN_RECOMMENDATION_DURATION}
                        onClick={() => adjustPreferredDuration(-15)}>−</button>
                      <RecommendationDurationPicker value={preferredDurationMinutes} onChange={setPreferredDurationMinutes}/>
                      <button type="button" className="recommendation-number-stepper-button"
                        aria-label="Geplante Turnierdauer um 15 Minuten erhöhen"
                        disabled={preferredDurationMinutes >= MAX_RECOMMENDATION_DURATION}
                        onClick={() => adjustPreferredDuration(15)}>+</button>
                    </div>
                  </div>
                </div>
                <div className="format-setting-fields">
                  <div className="field">
                    <label htmlFor="max-groups" title="Begrenzt ausschließlich die Anzahl der Gruppen in Empfehlungen.">Max. Gruppen</label>
                    <RecommendationNumberStepper id="max-groups" label="Maximale Gruppenanzahl"
                      value={effectiveMaxGroups} min={2} max={Math.max(2, Math.floor(participantCount / 2))}
                      onChange={setMaxGroups} disabled={!enabledSystems.groups}/>
                  </div>

                  <div className="field">
                    <label htmlFor="max-swiss-rounds" title="Maximal Teilnehmerzahl minus 1, ohne Gegnerwiederholung.">Max. Schweizer Runden</label>
                    <RecommendationNumberStepper id="max-swiss-rounds" label="Maximale Schweizer Runden"
                      value={effectiveMaxSwissRounds} min={2} max={Math.max(2, participantCount - 1)}
                      onChange={setMaxSwissRounds} disabled={!enabledSystems.swiss}/>
                  </div>

                  <div className="field">
                    <label htmlFor="knockout-qualifiers" title="Maximale Teilnehmerzahl einer empfohlenen K.-o.-Phase.">K.-o.-Teilnehmer</label>
                    <RecommendationNumberStepper id="knockout-qualifiers" label="Teilnehmer einer empfohlenen K.-o.-Phase"
                      value={effectiveKnockoutQualifierCount} min={2} max={Math.max(2, participantCount)}
                      onChange={setKnockoutQualifierCount} disabled={!enabledSystems.knockout}/>
                  </div>
                </div>

                <fieldset className="format-toggle-group">
                  <legend>Turniersysteme für Empfehlungen</legend>
                  {tournamentSystemOptions.map((system) => (
                    <label className="format-toggle" key={system.id}>
                      <input
                        type="checkbox"
                        checked={enabledSystems[system.id]}
                        onChange={() => toggleSystem(system.id)}
                      />
                      <span className="format-toggle-label">{system.label}</span>
                    </label>
                  ))}
                </fieldset>
                </div>
                <div className="format-settings-bottom">
                  <details className="format-help-details">
                    <summary>Einstellungen erklärt</summary>
                    <p>Die Obergrenzen gelten nur für die Empfehlungen. Schweizer Runden haben das Limit Teilnehmerzahl minus 1; bei kombinierten Turnierformen muss vor der K.-o.-Phase mindestens eine Person ausscheiden.</p>
                    <p>Die Dauer ist die gesamte aktive Planungszeit, maximal 23 Std. 59 Min. Nächte zählen nicht dazu. Mit ± lässt sie sich um 15 Minuten ändern; weitere Turnierformen können die gewünschte Dauer überschreiten.</p>
                    <p>Die Schätzungen berücksichtigen parallele Spiele, aber keine zusätzlichen Verzögerungen bei der Auswertung. Die konkreten Spieltage konfigurierst du in Schritt 4.</p>
                  </details>
                  <p className="format-settings-footnote">Nur Empfehlungen betroffen · Schätzungen ohne Auswertungsverzögerungen</p>
                </div>
              </aside>
              <div className="recommendation-list">
                <h3 className="recommendation-section-title">Vorschläge</h3>
                {recommendations.length === 0 && (
                  <div className="callout">Mit den aktuellen Vorgaben gibt es keinen sinnvollen automatischen Vorschlag innerhalb des Zeitmodells. Du kannst trotzdem weitergehen und die Phasen manuell anlegen.</div>
                )}
                {recommendations.map((item, index) => (
                  <button
                    className={`card recommendation recommendation-select ${selectedRecommendationId === item.id && recommendationPlanMatches ? 'selected' : ''} ${index === 0 ? 'best' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => selectRecommendation(item)}
                  >
                    <div className="recommendation-heading">
                      <h3 className="recommendation-phase-heading">
                        {item.phases.map((phase, phaseIndex) => {
                          const entrants = phase.entrantCount ?? participantCount;
                          const previousEntrants = phaseIndex > 0
                            ? item.phases[phaseIndex - 1].entrantCount ?? participantCount
                            : null;
                          const phaseName = phase.type === 'GROUPS'
                            ? `${phase.groupCount ?? 2} Gruppen`
                            : phase.type === 'SWISS'
                              ? `${phase.swissRounds ?? 1} Runden Schweizer System`
                              : phase.label;
                          return (
                            <span className="recommendation-phase-segment" key={phase.key}>
                              {phaseIndex > 0 && <span className="recommendation-phase-arrow" aria-hidden="true">→</span>}
                              <span className="recommendation-phase-name">{phaseName}</span>
                              <span className="recommendation-phase-count"
                                title={previousEntrants === null
                                  ? `${entrants} Teilnehmer starten in dieser Phase.`
                                  : `${entrants} von ${previousEntrants} Teilnehmern kommen in diese Phase weiter.`}>
                                {previousEntrants === null ? entrants : `${entrants}/${previousEntrants}`}
                              </span>
                            </span>
                          );
                        })}
                      </h3>
                      <div className="recommendation-labels">
                        <span className="badge">{index === 0 ? 'Empfohlen' : 'Alternative'}</span>
                        {selectedRecommendationId === item.id && <span className="badge selected-badge">{recommendationPlanMatches ? 'Ausgewählt' : 'Plan weicht ab · erneut übernehmen'}</span>}
                      </div>
                    </div>
                    <p>{item.description}</p>
                    <div className="recommendation-metrics">
                      <span className="recommendation-metric-tag">{item.estimatedMatches} Spiele</span>
                      <span className="recommendation-metric-tag">ca. {formatDuration(item.estimatedDurationMinutes)}</span>
                      {tournamentMode === 'multi' && <span className="recommendation-metric-tag">
                        {suggestDaySplit(item.phases.map((phase) => ({
                          ...phase, entrantCount: phase.entrantCount ?? participantCount,
                        })), plannedDays).possible
                          ? `${plannedDays} Rundentagesabschnitte möglich · Uhrzeiten in Schritt 4 prüfen`
                          : 'Zu wenige teilbare Runden für diese Anzahl Spieltage'}
                      </span>}
                      <span className={`recommendation-metric-tag ${item.minimumMatchShortfall ? 'wizard-metric-warning' : ''}`}>
                        mindestens {item.minimumGuaranteedMatches} gespielte Begegnungen
                      </span>
                    </div>
                    {index === 0 && !item.minimumMatchShortfall && (
                      <p className="recommendation-reason">
                        {item.estimatedDurationMinutes <= preferredDurationMinutes
                          ? `Warum empfohlen: Erfüllt dein Mindestspielziel und liegt innerhalb deiner geplanten Turnierdauer von ${formatRecommendationDuration(preferredDurationMinutes)}.`
                          : `Warum empfohlen: Erfüllt dein Mindestspielziel; die geschätzte Dauer übersteigt deine Zielzeit von ${formatRecommendationDuration(preferredDurationMinutes)}.`}
                      </p>
                    )}
                  </button>
                ))}
              </div>

            </div>
          </section>
        )}

        {step === 4 && (
          <section className="phase-wizard-step">
            <h2>Phasen konfigurieren</h2>
            <p className="muted">Ordne deine Phasen an und öffne bei Bedarf die Einstellungen.</p>
            {!prestart && !canCreate && (
              <div className="wizard-schedule-errors" role="alert">
                <strong>Bitte vor der Zusammenfassung korrigieren:</strong>
                <ul>
                  {[...new Set([...centralCreationIssues, ...scheduleIssues,
                    ...(!phaseConfigurationValid ? ['Prüfe Phasentypen, Phasennamen, Runden und Pauseneinstellungen.'] : []),
                    ...(!phaseEntrantsValid ? ['Die Anzahl der Teilnehmer oder Qualifikationsplätze ist in mindestens einer Phase ungültig.'] : []),
                    ...(!overnightDatesValid ? ['Mindestens ein Fortsetzungsdatum muss nach dem Ende der vorherigen Phase liegen.'] : []),
                    ...(reviewRequiredPhaseIds.length ? ['Bestätige die Prüfung aller automatisch angepassten Phasen.'] : []),
                    ...(!venueLayoutValid ? ['Der Spielflächenplan muss in den Grunddaten korrigiert werden.'] : []),
                    ...(!basicsValid ? ['Bitte die Grunddaten in Schritt 1 prüfen.'] : []),
                    ...(!participantsValid ? ['Bitte die Teilnehmerliste in Schritt 2 prüfen.'] : [])])]
                    .map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
            {groupRecommendationNotice && <div className="callout" role="status">{groupRecommendationNotice} Die bisherige Einstellung bleibt erhalten; über „Empfehlung übernehmen“ kannst du sie ändern.</div>}
            {reviewRequiredPhaseIds.length > 0 && <div className="callout" role="alert">
              Einige Qualifikationswerte oder Rundeneinstellungen wurden nach einer Änderung der Teilnehmerzahl verkleinert. Bitte die markierten Phasen kontrollieren und einzeln als geprüft bestätigen.
            </div>}

            <div className="phase-step-layout">
              <div className="phase-step-main">
                {selectedRecommendation && (
                  <div className="selected-format-summary">
                    <span className="badge">{recommendationPlanMatches ? 'Vorlage' : 'Individuell angepasst'}</span>
                    <strong>{selectedRecommendation.label}</strong>
                    {!recommendationPlanMatches && <span className="wizard-review-warning">Der Phasenplan weicht von der Empfehlung ab. Deine Phasen bleiben erhalten.</span>}
                    <span className="muted">Alle Einstellungen unten bleiben frei änderbar.</span>
                  </div>
                )}

                <div className="phase-add-panel phase-add-compact">
                  <div>
                    <strong>{phaseDrafts.length ? 'Phasenreihenfolge' : 'Erste Phase hinzufügen'}</strong>
                    <span className="muted">{phaseDrafts.length
                      ? 'Per Griff verschieben · Zwischen den Phasen über + einfügen · K.-o. bleibt zuletzt.'
                      : 'Wähle ein Turniersystem für die erste Phase.'}</span>
                  </div>
                  {phaseDrafts.length > 0 && <button className="btn small" type="button"
                    aria-expanded={phaseInsertIndex === 0}
                    onClick={() => setPhaseInsertIndex((current) => current === 0 ? null : 0)}>+ Phase am Anfang</button>}
                </div>
                {(phaseDrafts.length === 0 || phaseInsertIndex === 0) && (
                  <div className="phase-insert-options" role="group" aria-label={phaseDrafts.length ? 'Phase am Anfang auswählen' : 'Erste Phase auswählen'}>
                    {tournamentSystemOptions.map((system) => (
                      <button className="btn small" type="button" key={system.id}
                        disabled={(phaseDrafts.length > 0 && isTerminalStage(system.stageType)) || (system.stageType === 'GROUPS' && participantCount < 4) || (system.stageType === 'SWISS' && participantCount < 3)}
                        onClick={() => insertPhase(0, system.stageType)}>+ {system.label}</button>
                    ))}
                    {phaseInsertIndex === 0 && phaseDrafts.length > 0 && <button className="btn small" type="button" onClick={() => setPhaseInsertIndex(null)}>Abbrechen</button>}
                  </div>
                )}

                {phaseDrafts.length === 0 ? (
                  <div className="callout phase-empty">Noch keine Phase festgelegt. Wähle oben mindestens eine Phase aus.</div>
                ) : (
                  <div className="phase-config-list">
                    {phaseDrafts.map((phase, index) => {
                      const maximumPhaseEntrants = index === 0 ? participantCount : phaseDrafts[index - 1].entrantCount;
                      const previousCompetitionPhaseNumber = phaseDrafts.slice(0, index).reduce((previous, candidate, position) =>
                        candidate.type === 'BREAK' ? previous : position + 1, 0);
                      const knockoutEntrants = knockoutEntrantPresets(maximumPhaseEntrants);
                      const knockoutRounds = phase.type === 'KNOCKOUT' ? knockoutRoundLabels(phase.entrantCount) : [];
                      const inlineBreakRounds = phase.type === 'SWISS' ? phase.swissRounds
                        : phase.type === 'KNOCKOUT' ? knockoutRounds.length : 0;
                      const dayRoundCount = playingRounds(phase);
                      const inlineBreakActive = inlineBreakRounds > 1 && phase.inlineBreakAfterRound > 0;
                      const inlineBreakExpanded = expandedInlineBreakIds.includes(phase.id);
                      const editingPhaseType = editingPhaseTypeId === phase.id;
                      const isExpanded = expandedPhaseId === phase.id;
                      const nextPhase = phaseDrafts.slice(index + 1).find((candidate) => candidate.type !== 'BREAK');
                      const previousPlaying = phaseDrafts.slice(0, index).reverse().find((candidate) => candidate.type !== 'BREAK');
                      const unequalGroupComparison = previousPlaying?.type === 'GROUPS'
                        && needsGroupStreichungsregel(previousPlaying.entrantCount, previousPlaying.groupCount, phase.entrantCount);
                      const recommendedGroups = phase.type === 'GROUPS'
                        ? recommendGroupCount(phase.entrantCount, nextPhase?.entrantCount) : null;
                      const recommendedRounds = phase.type === 'SWISS'
                        ? recommendedSwissRounds(phase.entrantCount, minimumMatches) : null;
                      const groupQualifiers = nextPhase && nextPhase.entrantCount < phase.entrantCount
                        ? nextPhase.entrantCount : null;
                      const plannedPhaseStart = plannedTimeline.items.find((item) => item.id === `phase-${index + 1}`)?.at;
                      const plannedInlinePause = plannedTimeline.items.find((item) => item.id === `inline-break-${index + 1}`)?.at;
                      // The next phase begins when this phase (including a scheduled pause) ends.
                      const plannedPhaseEnd = plannedTimeline.items.find((item) => item.id === `phase-${index + 2}`)?.at
                        ?? plannedTimeline.estimatedEnd;
                      const estimatedPhaseEnd = plannedPhaseEnd && isValidLocalDateTime(plannedPhaseEnd)
                        ? formatPlannedDateTime(plannedPhaseEnd, plannedPhaseEnd.slice(0, 10) !== scheduledStart.slice(0, 10))
                        : 'noch nicht berechenbar';
                      const estimatedPauseStart = plannedPhaseStart && isValidLocalDateTime(plannedPhaseStart)
                        ? formatPlannedDateTime(plannedPhaseStart) : 'noch nicht berechenbar';
                      const earliestContinuationDate = nextCalendarDate((plannedPhaseStart ?? scheduledStart).slice(0, 10));
                      const estimatedInlinePauseStart = plannedInlinePause && isValidLocalDateTime(plannedInlinePause)
                        ? formatPlannedDateTime(plannedInlinePause) : 'noch nicht berechenbar';
                      return (
                        <div className={`phase-sequence-item${dropTargetPhaseId === phase.id ? ' is-drop-target' : ''}${draggingPhaseId === phase.id ? ' is-being-dragged' : ''}`}
                          key={phase.id}
                          onDragOver={(event) => onPhaseDragOver(event, index)}
                          onDrop={(event) => onPhaseDrop(event, index)}>
                        <div className="phase-sequence-row">
                          {isTerminalStage(phase.type) ? (
                            <span className="phase-drag-fixed" role="img"
                              aria-label="K.-o.-Phase ist am Ende fixiert und nicht verschiebbar"
                              title="K.-o.-Phase ist am Ende fixiert und nicht verschiebbar">🔒</span>
                          ) : (
                            <button type="button" draggable className="phase-drag-handle"
                              title="Phase hier greifen und per Drag & Drop verschieben"
                              aria-label={`Phase ${index + 1}: ${phase.label} ziehen, um sie zu verschieben`}
                              onDragStart={(event) => onPhaseDragStart(event, phase.id)}
                              onDragEnd={onPhaseDragEnd}>
                              <span aria-hidden="true">⠿</span>
                            </button>
                          )}
                        <article className={`phase-config phase-config-expanded ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                          role="group" tabIndex={0} aria-label={`Phase ${index + 1}: ${phase.label}. Klicken oder Enter drücken, um Einstellungen ${isExpanded ? 'zu schließen' : 'zu öffnen'}.`}
                          onClick={(event) => {
                            const target = event.target as HTMLElement;
                            if (target.closest('button, input, select, textarea, label, a, .phase-config-body')) return;
                            setExpandedPhaseId(isExpanded ? null : phase.id);
                            setEditingPhaseTypeId(null);
                          }}
                          onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setExpandedPhaseId(isExpanded ? null : phase.id);
                              setEditingPhaseTypeId(null);
                            }
                          }}>
                          <div className="phase-config-head">
                            <div className="phase-card-summary">
                              <div className="phase-card-title">
                                <span className="badge">Phase {index + 1}</span>
                                <h3>{phase.label}</h3>
                                {reviewRequiredPhaseIds.includes(phase.id) && <span className="phase-warning-chip" role="status">Prüfung erforderlich</span>}
                                {unequalGroupComparison && (
                                  <button className="phase-qualification-warning-button" type="button"
                                    aria-label={`Streichungsregel für Phase ${index + 1} erläutern`}
                                    title="Ungleiche Gruppen: Streichungsregel und empfohlene Qualifikationsplätze anzeigen"
                                    onClick={() => setQualificationRulePhaseId(phase.id)}>!</button>
                                )}
                              </div>
                              <div className="phase-quick-tags">
                                {phase.type === 'BREAK' ? (
                                  <>
                                    <span className="phase-quick-tag">{phase.breakKind === 'overnight'
                                      ? 'Spieltagsende'
                                      : phase.breakKind === 'until' ? `Pause bis ${phase.breakUntil} Uhr`
                                      : `${phase.breakMinutes} Min. Pause`}</span>
                                    {phase.breakKind === 'overnight' && <span className="phase-quick-tag">Fortsetzung: {estimatedPhaseEnd}</span>}
                                    <span className="phase-quick-tag phase-quick-tag-time">Nach vorheriger Phase: ca. {estimatedPauseStart}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="phase-quick-tag phase-quick-tag-participants">{phase.entrantCount} Teilnehmer</span>
                                    {phase.type === 'GROUPS' && <span className="phase-quick-tag">{phase.groupCount} Gruppen</span>}
                                    {phase.type === 'SWISS' && <span className="phase-quick-tag">{phase.swissRounds} Runden</span>}
                                    {phase.type === 'KNOCKOUT' && <span className="phase-quick-tag">{knockoutRoundLabels(phase.entrantCount).length} Runden</span>}
                                    <span className="phase-quick-tag">{timedSport ? `${matchDurationMinutes} Min./Spiel` : `Best-of-${phase.bestOf}`}</span>
                                    {phaseEstimates[index] && <span className="phase-quick-tag phase-quick-tag-time">ca. {formatCompactDuration(phaseEstimates[index].estimatedDurationMinutes)}</span>}
                                  </>
                                )}
                                <span className="phase-quick-tag phase-quick-tag-end">Ende ca. {estimatedPhaseEnd}</span>
                              </div>
                              {plannedTimeline.warnings.some((warning) => warning.phaseIndex === index) &&
                                <span className="phase-warning-chip" role="status">
                                  {phase.breakKind === 'overnight' && phase.type === 'BREAK'
                                    ? '⚠ Fortsetzungsdatum muss nach der vorherigen Phase liegen'
                                    : '⚠ Pausenuhrzeit liegt vor dem geschätzten Pausenbeginn'}
                                </span>}
                              {phase.inlineBreakAfterRound > 0 && (phase.type === 'SWISS' || phase.type === 'KNOCKOUT') &&
                                <span className="phase-inline-break-badge">· Zwischenpause nach Runde {phase.inlineBreakAfterRound} {phase.inlineBreakKind === 'minutes'
                                  ? `für ${phase.inlineBreakMinutes} Minuten`
                                  : `bis ${phase.inlineBreakUntil} Uhr`}</span>}
                            </div>
                            <div className="phase-order-actions">
                              <button
                                className="btn small"
                                type="button"
                                onClick={() => {
                                  setExpandedPhaseId(phase.id);
                                  setEditingPhaseTypeId(editingPhaseType ? null : phase.id);
                                }}
                              >
                                {editingPhaseType ? 'Typ schließen' : 'Typ ändern'}
                              </button>
                              {inlineBreakRounds > 1 && (
                                <button
                                  className={`btn small phase-inline-break-action ${inlineBreakActive ? 'is-active' : ''}`}
                                  type="button"
                                  aria-pressed={inlineBreakActive}
                                  aria-label={inlineBreakActive ? 'Zwischenpause deaktivieren' : 'Zwischenpause aktivieren'}
                                  title={inlineBreakActive ? 'Zwischenpause deaktivieren' : 'Zwischenpause aktivieren'}
                                  onClick={() => togglePhaseInlineBreak(phase, inlineBreakRounds)}
                                >
                                  Zwischenpause
                                </button>
                              )}
                              {!isTerminalStage(phase.type) && (
                                <>
                                  <button className="btn small" type="button" disabled={!canMovePhase(index, -1)} onClick={() => movePhase(index, -1)} aria-label="Phase nach oben">↑</button>
                                  <button className="btn small" type="button" disabled={!canMovePhase(index, 1)} onClick={() => movePhase(index, 1)} aria-label="Phase nach unten">↓</button>
                                </>
                              )}
                              <button className="btn small" type="button" onClick={() => removePhase(phase.id)}>Entfernen</button>
                            </div>
                          </div>

                          {reviewRequiredPhaseIds.includes(phase.id) && <div className="phase-review-acknowledgement">
                            <span>Die Teilnehmerkonstellation hat diese Phase verändert. Prüfe Qualifikationsplätze und gegebenenfalls die Rundenanzahl.</span>
                            <button className="btn small" type="button" onClick={() => setReviewRequiredPhaseIds((ids) => ids.filter((id) => id !== phase.id))}>Als geprüft markieren</button>
                          </div>}
                          {isExpanded && <div className="phase-config-body">
                          {editingPhaseType && (
                            <div className="phase-type-editor">
                              <strong>Phasentyp ändern</strong>
                              <div className="phase-type-options">
                                {tournamentSystemOptions
                                  .map((system) => {
                                    const terminalNotAllowed = isTerminalStage(system.stageType) && index !== phaseDrafts.length - 1;
                                    return (
                                      <button
                                        className={`btn small ${phase.type === system.stageType ? 'phase-type-active' : ''}`}
                                        key={system.id}
                                        type="button"
                                        disabled={terminalNotAllowed || (system.stageType === 'SWISS' && phase.entrantCount < 3) || (system.stageType === 'GROUPS' && phase.entrantCount < 4)}
                                        title={terminalNotAllowed ? 'Eine K.-o.-Phase kann nur die letzte Phase des Turniers sein.' : undefined}
                                        onClick={() => changePhaseType(index, system.stageType)}
                                      >
                                        {system.label}
                                      </button>
                                    );
                                  })}
                              </div>
                              {index !== phaseDrafts.length - 1 && (
                                <span className="field-hint">K.-o. steht nur für die letzte Phase zur Verfügung.</span>
                              )}
                            </div>
                          )}

                          {(recommendedGroups !== null || recommendedRounds !== null) && (
                            <div className="phase-configuration-recommendation">
                              {recommendedGroups !== null && (
                                <>
                                  <div>
                                    <strong>Empfehlung: {recommendedGroups} Gruppen</strong>
                                    <span>{formatGroupDistribution(phase.entrantCount, recommendedGroups)}
                                      {groupQualifiers !== null && ` · ${groupQualifiers} weiter in ${nextPhase?.label ?? 'die nächste Phase'}`}
                                      {groupQualifiers !== null && groupQualifiers % recommendedGroups === 0
                                        ? ` · ${groupQualifiers / recommendedGroups} pro Gruppe`
                                        : groupQualifiers !== null ? ' · Weiterkommen nach Platzierung/Quote' : ''}
                                    </span>
                                  </div>
                                  <button type="button" className="btn small"
                                    disabled={phase.groupCount === recommendedGroups}
                                    onClick={() => updatePhase(phase.id, { groupCount: recommendedGroups })}>
                                    {phase.groupCount === recommendedGroups ? 'Bereits übernommen' : 'Empfehlung übernehmen'}
                                  </button>
                                </>
                              )}
                              {recommendedRounds !== null && (
                                <>
                                  <div>
                                    <strong>Empfehlung: {recommendedRounds} Schweizer Runden</strong>
                                    <span>Berücksichtigt {phase.entrantCount} Teilnehmer und mindestens {minimumMatches} gewünschte Spiele.</span>
                                  </div>
                                  <button type="button" className="btn small"
                                    disabled={phase.swissRounds === recommendedRounds}
                                    onClick={() => updatePhase(phase.id, { swissRounds: recommendedRounds })}>
                                    {phase.swissRounds === recommendedRounds ? 'Bereits übernommen' : 'Empfehlung übernehmen'}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          {phase.type === 'BREAK' ? (
                            <div className="break-phase-fields">
                              <div className="break-phase-inputs">
                                <label className={phase.breakKind === 'overnight' ? 'field break-overnight-name' : 'field'}>Name der Pause
                                  <input type="text" maxLength={80} value={phase.label}
                                    placeholder="z. B. Mittagspause"
                                    onChange={(event) => updatePhase(phase.id, { label: event.target.value })} />
                                </label>
                                {phase.breakKind === 'minutes' ? (
                                  <label className="field">Dauer in Minuten
                                    <BufferedNumberInput min={1} max={1440} value={phase.breakMinutes}
                                      onCommit={(value) => updatePhase(phase.id, { breakMinutes: value })} />
                                  </label>
                                ) : phase.breakKind === 'until' ? (
                                  <>
                                    <label className="field">Pause bis (Datum)
                                      <CalendarDatePicker id={`phase-until-date-${phase.id}`} label="Pausenzieldatum"
                                        value={phase.breakUntilDate || (plannedPhaseStart ?? scheduledStart).slice(0, 10)}
                                        minDate={scheduledStart.slice(0, 10)}
                                        onChange={(date) => updatePhase(phase.id, { breakUntilDate: date })} />
                                    </label>
                                    <label className="field">Pause bis (Uhrzeit)
                                      <ClockTimePicker id={`phase-until-${phase.id}`} label="Pause bis" value={phase.breakUntil}
                                        onChange={(time) => updatePhase(phase.id, { breakUntil: time })} />
                                    </label>
                                  </>
                                ) : (
                                  <>
                                    <div className="field">
                                      <label htmlFor={`phase-next-day-date-${phase.id}`}>Fortsetzungsdatum</label>
                                      <CalendarDatePicker id={`phase-next-day-date-${phase.id}`} label="Fortsetzungsdatum"
                                        value={phase.nextDayDate || earliestContinuationDate}
                                        minDate={earliestContinuationDate}
                                        onChange={(date) => updatePhase(phase.id, { nextDayDate: date })} />
                                    </div>
                                    <div className="field">
                                      <label htmlFor={`phase-next-day-${phase.id}`}>Fortsetzungsuhrzeit</label>
                                      <ClockTimePicker id={`phase-next-day-${phase.id}`} label="Fortsetzungsuhrzeit" value={phase.nextDayStart}
                                        onChange={(time) => updatePhase(phase.id, { nextDayStart: time })} />
                                    </div>
                                  </>
                                )}
                                {phase.breakKind === 'until' && (
                                  <p className="field-hint break-phase-time-hint">
                                    Der Zeitpunkt ist eine Planungshilfe und sollte nach dem geschätzten Pausenbeginn liegen. Die Turnierleitung gibt die Fortsetzung tatsächlich frei.
                                  </p>
                                )}
                                {phase.breakKind === 'overnight' && (
                                  <p className="field-hint break-phase-time-hint">
                                    Die Fortsetzung darf auch mehrere Tage später stattfinden. Das Datum muss nach dem Ende der vorherigen Phase liegen.
                                  </p>
                                )}
                              </div>
                              <fieldset className="break-phase-choice">
                                <legend>Art der Unterbrechung</legend>
                                <label><input type="radio" name={`break-kind-${phase.id}`} checked={phase.breakKind === 'minutes'}
                                  onChange={() => updatePhase(phase.id, { breakKind: 'minutes' })} /> Pause in Minuten</label>
                                <label><input type="radio" name={`break-kind-${phase.id}`} checked={phase.breakKind === 'until'}
                                  onChange={() => updatePhase(phase.id, { breakKind: 'until' })} /> Pause bis</label>
                                <label><input type="radio" name={`break-kind-${phase.id}`} checked={phase.breakKind === 'overnight'}
                                  onChange={() => updatePhase(phase.id, { breakKind: 'overnight' })} /> Spieltagsende</label>
                              </fieldset>
                              {(phase.breakKind === 'until' || phase.breakKind === 'overnight')
                                && plannedTimeline.warnings.filter((warning) => warning.phaseIndex === index).map((warning) => (
                                <p className="planned-schedule-phase-warning" role="alert" key={warning.message}>{warning.message}</p>
                              ))}
                              <div className="field break-phase-notes">
                                <div className="break-phase-note-heading">
                                  <label htmlFor={`phase-note-${phase.id}`}>Hinweis an Spieler (optional)</label>
                                  <span className="field-hint">Diese Information wird im Turnierverlauf angezeigt.</span>
                                </div>
                                <textarea id={`phase-note-${phase.id}`} rows={2} maxLength={600} value={phase.note}
                                  placeholder="z. B. Treffpunkt, Verpflegung oder organisatorische Hinweise"
                                  onChange={(event) => updatePhase(phase.id, { note: event.target.value })} />
                              </div>
                            </div>
                          ) : <div className="phase-settings-grid">
                            {index > 0 && isTerminalStage(phase.type) && (
                              <div className="field phase-entrant-choice field-wide">
                                <label>Weiterkommende Teilnehmer aus Phase {previousCompetitionPhaseNumber}</label>
                                <NumberChoice
                                  ariaLabel={`Weiterkommende Teilnehmer für Phase ${index + 1}`}
                                  value={phase.entrantCount}
                                  presets={knockoutEntrants}
                                  custom={phase.customEntrants}
                                  customMinimum={2}
                                  customMaximum={maximumPhaseEntrants}
                                  onPreset={(value) => updatePhaseEntrants(index, value, false)}
                                  onCustom={() => updatePhaseEntrants(index, phase.entrantCount, true)}
                                  onCustomValue={(value) => updatePhaseEntrants(index, value, true)}
                                />
                                <span className="field-hint">Maximal {maximumPhaseEntrants} Teilnehmer können aus der vorherigen Phase weiterkommen.</span>
                              </div>
                            )}

                            {index > 0 && !isTerminalStage(phase.type) && (
                              <div className="field">
                                <label htmlFor={`entrants-${phase.id}`}>Weiterkommende Teilnehmer aus Phase {previousCompetitionPhaseNumber}</label>
                                <BufferedNumberInput id={`entrants-${phase.id}`} min={2} max={maximumPhaseEntrants}
                                  value={phase.entrantCount} onCommit={(value) => updatePhaseEntrants(index, value)} />
                              </div>
                            )}

                            {index === 0 && (
                              <div className="phase-start-count">
                                <span className="field-hint">Startfeld</span>
                                <strong>{participantCount} Teilnehmer</strong>
                              </div>
                            )}

                            {phase.type === 'GROUPS' && (
                              <div className="field">
                                <label htmlFor={`groups-${phase.id}`}>Anzahl Gruppen</label>
                                <BufferedNumberInput id={`groups-${phase.id}`} min={2}
                                  max={Math.max(2, Math.floor(phase.entrantCount / 2))}
                                  value={Math.min(phase.groupCount, Math.max(2, Math.floor(phase.entrantCount / 2)))}
                                  onCommit={(value) => updatePhase(phase.id, { groupCount: value })} />
                              </div>
                            )}

                            {phase.type === 'SWISS' && (
                              <div className="field">
                                <label htmlFor={`swiss-rounds-${phase.id}`}>Runden</label>
                                <BufferedNumberInput id={`swiss-rounds-${phase.id}`} min={2}
                                  max={Math.max(2, phase.entrantCount - 1)}
                                  value={phase.swissRounds}
                                  onCommit={(value) => updatePhase(phase.id, { swissRounds: value })} />
                                {!isValidSwissRoundCount(phase.swissRounds, phase.entrantCount) &&
                                  <span className="field-error" role="alert">{phase.entrantCount < 3
                                    ? 'Für das Schweizer System sind mindestens 3 Teilnehmer erforderlich.'
                                    : `Für ${phase.entrantCount} Teilnehmer sind 2 bis ${phase.entrantCount - 1} Schweizer Runden möglich.`}</span>}
                              </div>
                            )}

                            {phase.type !== 'KNOCKOUT' && !timedSport && (
                              <div className="field phase-bestof">
                                <label htmlFor={`best-of-${phase.id}`}>Best-of</label>
                                <select
                                  id={`best-of-${phase.id}`}
                                  value={phase.bestOf}
                                  onChange={(event) => updatePhase(phase.id, { bestOf: Number(event.target.value) })}
                                >
                                  {bestOfOptions.map((bestOf) => <option key={bestOf} value={bestOf}>Best-of-{bestOf}</option>)}
                                </select>
                              </div>
                            )}
                          </div>}

                          {phase.type === 'KNOCKOUT' && !timedSport && (
                            <div className="knockout-round-settings">
                              <div className="knockout-round-head">
                                <strong>Best-of je K.-o.-Runde</strong>
                                <span className="muted">Freilose bei nicht voller Zweierpotenz werden vom Bracket berücksichtigt.</span>
                              </div>
                              <div className="knockout-round-grid">
                                {knockoutRounds.map((roundLabel, roundIndex) => (
                                  <div className="field" key={`${phase.id}-${roundLabel}-${roundIndex}`}>
                                    <label htmlFor={`ko-bestof-${phase.id}-${roundIndex}`}>{roundLabel}</label>
                                    <select
                                      id={`ko-bestof-${phase.id}-${roundIndex}`}
                                      value={phase.knockoutBestOf[roundIndex] ?? phase.bestOf}
                                      onChange={(event) => updateKnockoutRoundBestOf(phase, roundIndex, Number(event.target.value))}
                                    >
                                      {bestOfOptions.map((bestOf) => <option key={bestOf} value={bestOf}>Best-of-{bestOf}</option>)}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          </div>}
                          {isExpanded && tournamentMode === 'multi' && phase.type !== 'BREAK' && (
                            <section className="playing-day-editor" aria-label={`Spieltagswechsel innerhalb Phase ${index + 1}`}>
                              <div className="playing-day-editor-heading">
                                <div><strong>Spieltage innerhalb der Phase</strong>
                                  <p className="field-hint">Unterbrechung nach einer vollständigen Runde mit konkreter Fortsetzung am nächsten Spieltag.</p></div>
                                <button type="button" className="btn small" disabled={dayRoundCount < 2 || phase.dayBreaks.length >= dayRoundCount - 1 || configuredPlayingDays(phaseDrafts) >= 14}
                                  onClick={() => {
                                    const available = Array.from({ length: dayRoundCount - 1 }, (_, i) => i + 1)
                                      .find((round) => round !== phase.inlineBreakAfterRound && !phase.dayBreaks.some((item) => item.afterRound === round));
                                    if (!available) return;
                                    updatePhase(phase.id, { dayBreaks: [...phase.dayBreaks, {
                                      afterRound: available, date: followingPlayingDate(scheduledDate, configuredPlayingDays(phaseDrafts)), time: '09:00',
                                    }].sort((a,b) => a.afterRound - b.afterRound) });
                                  }}>+ Spieltagsende nach Runde</button>
                              </div>
                              {phase.dayBreaks.map((boundary, position) => {
                                const boundaryTime = plannedTimeline.items.find((item) => item.id === `day-break-${index + 1}-${boundary.afterRound}`)?.at;
                                return <div className="playing-day-editor-row" key={position}>
                                  <label className="field">Nach Runde
                                    <select value={boundary.afterRound} onChange={(event) => updatePhase(phase.id, {
                                      dayBreaks: phase.dayBreaks.map((item, i) => i === position
                                        ? { ...item, afterRound: Number(event.target.value) } : item),
                                    })}>
                                      {Array.from({ length: dayRoundCount - 1 }, (_, i) => i + 1)
                                        .filter((round) => round === boundary.afterRound || (round !== phase.inlineBreakAfterRound && !phase.dayBreaks.some((entry) => entry.afterRound === round)))
                                        .map((round) => <option value={round} key={round}>Runde {round}</option>)}
                                    </select>
                                  </label>
                                  <label className="field">Fortsetzungsdatum
                                    <CalendarDatePicker id={`day-break-date-${phase.id}-${position}`} label="Fortsetzungsdatum" value={boundary.date}
                                      minDate={followingPlayingDate((boundaryTime ?? scheduledStart).slice(0,10), 1)}
                                      onChange={(date) => updatePhase(phase.id, { dayBreaks: phase.dayBreaks.map((item,i) => i === position ? { ...item, date } : item) })}/>
                                  </label>
                                  <label className="field">Fortsetzungsuhrzeit
                                    <ClockTimePicker id={`day-break-time-${phase.id}-${position}`} label="Fortsetzungsuhrzeit" value={boundary.time}
                                      onChange={(time) => updatePhase(phase.id, { dayBreaks: phase.dayBreaks.map((item,i) => i === position ? { ...item, time } : item) })}/>
                                  </label>
                                  <button type="button" className="btn small danger-outline" onClick={() => updatePhase(phase.id, {
                                    dayBreaks: phase.dayBreaks.filter((_, i) => i !== position),
                                  })}>Entfernen</button>
                                </div>;
                              })}
                            </section>
                          )}
                          {isExpanded && inlineBreakActive && (
                            <section
                              className={`phase-inline-break phase-inline-break-card ${inlineBreakExpanded ? 'is-expanded' : 'is-collapsed'}`}
                              aria-label={`Zwischenpause nach Runde ${phase.inlineBreakAfterRound}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if ((event.target as HTMLElement).closest('button, input, select, textarea, label, a, .phase-inline-break-settings')) return;
                                setExpandedInlineBreakIds((current) => current.includes(phase.id)
                                  ? current.filter((id) => id !== phase.id) : [...current, phase.id]);
                              }}
                            >
                              <button
                                type="button"
                                className="phase-inline-break-header"
                                aria-expanded={inlineBreakExpanded}
                                aria-controls={`inline-break-settings-${phase.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedInlineBreakIds((current) => current.includes(phase.id)
                                    ? current.filter((id) => id !== phase.id) : [...current, phase.id]);
                                }}
                              >
                                <span className="phase-inline-break-title">Zwischenpause nach Runde {phase.inlineBreakAfterRound} {phase.inlineBreakKind === 'minutes'
                                  ? `für ${phase.inlineBreakMinutes} Minuten`
                                  : `bis ${phase.inlineBreakUntil} Uhr`}</span>
                                <span className="phase-inline-break-summary">
                                  <span className="phase-quick-tag phase-quick-tag-time">Runde endet ca. {estimatedInlinePauseStart}</span>
                                </span>
                                <span className="phase-inline-break-chevron" aria-hidden="true">{inlineBreakExpanded ? '▴' : '▾'}</span>
                              </button>
                              {inlineBreakExpanded && (
                                <div id={`inline-break-settings-${phase.id}`} className="phase-inline-break-settings">
                                  <div className="break-phase-fields">
                                    <div className="break-phase-inputs">
                                      <label className="field">Unterbrechung nach
                                        <select value={Math.min(phase.inlineBreakAfterRound, inlineBreakRounds - 1)}
                                          onChange={(event) => updatePhase(phase.id, { inlineBreakAfterRound: Number(event.target.value) })}>
                                          {Array.from({ length: inlineBreakRounds - 1 }, (_, round) =>
                                            <option key={round + 1} value={round + 1}>Runde {round + 1}</option>)}
                                        </select>
                                      </label>
                                      {phase.inlineBreakKind === 'minutes' ? (
                                        <label className="field">Dauer in Minuten
                                          <BufferedNumberInput min={1} max={1440} value={phase.inlineBreakMinutes}
                                            onCommit={(value) => updatePhase(phase.id, { inlineBreakMinutes: value })} />
                                        </label>
                                      ) : (
                                        <>
                                          <label className="field">Pause bis (Datum)
                                            <CalendarDatePicker id={`inline-break-date-${phase.id}`} label="Zwischenpausendatum"
                                              value={phase.inlineBreakUntilDate || (plannedInlinePause ?? scheduledStart).slice(0, 10)}
                                              minDate={scheduledStart.slice(0, 10)}
                                              onChange={(date) => updatePhase(phase.id, { inlineBreakUntilDate: date })} />
                                          </label>
                                          <label className="field">Pause bis (Uhrzeit)
                                            <ClockTimePicker id={`inline-break-time-${phase.id}`} label="Zwischenpause bis"
                                              value={phase.inlineBreakUntil} onChange={(time) => updatePhase(phase.id, { inlineBreakUntil: time })} />
                                          </label>
                                        </>
                                      )}
                                      <p className="field-hint break-phase-time-hint">
                                        {phase.inlineBreakKind === 'until'
                                          ? 'Die geplante Uhrzeit sollte nach dem voraussichtlichen Rundenende liegen. Die Turnierleitung gibt die Fortsetzung frei.'
                                          : 'Die Pause beginnt nach der ausgewählten Runde. Die Turnierleitung gibt die Fortsetzung frei.'}
                                      </p>
                                    </div>
                                    <fieldset className="break-phase-choice">
                                      <legend>Art der Unterbrechung</legend>
                                      <label><input type="radio" name={`inline-break-kind-${phase.id}`}
                                        checked={phase.inlineBreakKind === 'minutes'}
                                        onChange={() => updatePhase(phase.id, { inlineBreakKind: 'minutes' })} /> Pause in Minuten</label>
                                      <label><input type="radio" name={`inline-break-kind-${phase.id}`}
                                        checked={phase.inlineBreakKind === 'until'}
                                        onChange={() => updatePhase(phase.id, { inlineBreakKind: 'until' })} /> Pause bis</label>
                                    </fieldset>
                                    {plannedTimeline.warnings.filter((warning) => warning.phaseIndex === index).map((warning) =>
                                      <p key={warning.message} className="planned-schedule-phase-warning" role="alert">{warning.message}</p>)}
                                  </div>
                                </div>
                              )}
                            </section>
                          )}
                        </article>
                        </div>
                        {(index < phaseDrafts.length - 1 || !isTerminalStage(phase.type)) && (
                          <div className="phase-insert-bar">
                            <button type="button" className="phase-insert-trigger"
                              aria-expanded={phaseInsertIndex === index + 1}
                              onClick={() => setPhaseInsertIndex((current) => current === index + 1 ? null : index + 1)}>
                              + {index < phaseDrafts.length - 1 ? 'weitere Phase hier einfügen' : 'nächste Phase hinzufügen'}
                            </button>
                            {phaseInsertIndex === index + 1 && (
                              <div className="phase-insert-options" role="group" aria-label={`Phase nach Phase ${index + 1} hinzufügen`}>
                                {tournamentSystemOptions.map((system) => (
                                  <button key={system.id} className="btn small" type="button"
                                    disabled={(isTerminalStage(system.stageType) && index + 1 !== phaseDrafts.length)
                                     || (system.stageType === 'GROUPS' && phase.entrantCount < 4)
                                     || (system.stageType === 'SWISS' && phase.entrantCount < 3)}
                                    onClick={() => insertPhase(index + 1, system.stageType)}>+ {system.label}</button>
                                ))}
                                {index + 1 < phaseDrafts.length && phase.type !== 'BREAK' && phaseDrafts[index + 1]?.type !== 'BREAK' && (
                                  <>
                                    <button className="btn small" type="button" onClick={() => insertPhase(index + 1, 'BREAK')}>+ Pause / Spieltagsende</button>
                                  </>
                                )}
                                <button className="btn small" type="button" onClick={() => setPhaseInsertIndex(null)}>Abbrechen</button>
                              </div>
                            )}
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


            </div>
          </section>
        )}

        {step === 5 && (
          <section className="schedule-wizard-step">
            <div className="creation-review-heading">
              <div>
                <h2>Zusammenfassung</h2>
                <p className="muted">Prüfe deine Turnierdaten. Über die bisherigen Schritte kannst du Angaben jederzeit korrigieren.</p>
              </div>
              <div className="creation-review-toolbar">
                <div className="creation-review-edit-actions" aria-label="Einstellungen bearbeiten">
                  <button className="btn small" type="button" onClick={() => navigateToStep(1)}>Grunddaten</button>
                  <button className="btn small" type="button" onClick={() => navigateToStep(2)}>Teilnehmer</button>
                  <button className="btn small" type="button" onClick={() => navigateToStep(4)}>Phasen</button>
                </div>
                <div className="creation-review-final-actions">
                  <button className="btn" type="button" onClick={goBack}>← Zurück</button>
                  <button className="btn primary wizard-create-button" type="button" onClick={() => { void submitTournament(); }}
                    disabled={!canCreate || scheduleIssues.length > 0 || submittingTournament || Boolean(createdTournamentWithDraftNotice)}>Turnier erstellen</button>
                </div>
              </div>
            </div>
            {(minimumMatchesShortfall > 0 || scheduleIssues.length > 0) && (
              <div className="wizard-review-check" role="status">
                <strong>Vor Erstellung prüfen</strong>
                {minimumMatchesShortfall > 0 && <p>Die erste Phase garantiert nur {actualMinimumMatches} tatsächlich gespielte Begegnungen pro Teilnehmer, gewünscht sind {minimumMatches}. Freilose zählen nicht als Spiele.</p>}
                {scheduleIssues.map((issue, index) => <p key={index}>{issue}</p>)}
              </div>
            )}
            <div className="creation-review-overview" aria-label="Turnierdaten im Überblick">
              <div className="creation-review-identity">
                <span>Dein Turnier</span>
                <strong>{name.trim() || 'Turniername offen'}</strong>
                <small>{sportOptions.find((option) => option.id === sport)?.label ?? 'Sportart offen'} · {disciplineLabel(discipline)}</small>
              </div>
              <dl className="creation-review-facts">
                <div><dt>Geplanter Beginn</dt><dd>{isValidLocalDateTime(scheduledStart) ? formatPlannedDateTime(scheduledStart) : 'Noch offen'}</dd></div>
                <div><dt>Teilnehmer</dt><dd>{participantCount} {discipline === 'TEAMS' ? 'Mannschaften' : discipline === 'DOUBLES' ? 'Doppel' : 'Spieler'}</dd></div>
                <div><dt>Spielflächen</dt><dd>{tables} {venue.plural} · {venueLayoutEnabled ? 'Individueller Plan' : 'Automatische Nummerierung'}</dd></div>
                {timedSport && <div><dt>Wechselpuffer</dt><dd>{breakMinutes} Min. pro Spielfläche</dd></div>}
                <div><dt>Mindestspiele</dt><dd>{minimumMatches} pro Teilnehmer</dd></div>
                <div><dt>Turniermodus</dt><dd>{tournamentMode === 'multi' ? `Mehrtägig · ${plannedDays} Spieltage` : 'Eintägig'}</dd></div>
                {timedSport && <div><dt>Spielzeit je Begegnung</dt><dd>{matchDurationMinutes} Min.</dd></div>}
                <div><dt>Turnierphasen</dt><dd>{phaseDrafts.filter((phase) => phase.type !== 'BREAK').length} Wettkampfphasen · {phaseDrafts.filter((phase) => phase.type === 'BREAK').length} {phaseDrafts.filter((phase) => phase.type === 'BREAK').length === 1 ? 'Pause' : 'Pausen'}</dd></div>
                <div><dt>Geplante Spiele</dt><dd>{phaseEstimates.reduce((total, estimate) => total + estimate.estimatedMatches, 0)}</dd></div>
              </dl>
              <div className="creation-review-timing">
                <div><span>Geplante Spieltage</span><strong>{configuredPlayingDays(phaseDrafts)} von {tournamentMode === 'multi' ? plannedDays : 1}</strong></div>
                <div><span>Voraussichtliche Spielzeit</span><strong>ca. {formatDuration(estimatedPlayingMinutes)}</strong></div>
                <div><span>Geplante Unterbrechungen</span><strong>{formatDuration(estimatedBreakMinutes)}</strong></div>
                <div><span>Aktive Turnierdauer inkl. Pausen</span><strong>{formatDuration(estimatedTournamentDurationMinutes)}</strong></div>
                <div><span>Voraussichtliches Ende</span><strong>{plannedTimeline.estimatedEnd ? formatPlannedDateTime(plannedTimeline.estimatedEnd) : 'Noch offen'}</strong></div>
              </div>
            </div>
            <PlannedScheduleEditor
              scheduledStart={scheduledStart}
              timeline={plannedTimeline}
              phaseSummaries={phaseDrafts.map((_, index) => formatPhaseOverview(phaseDrafts, index, discipline, !timedSport))}
              awardsEnabled={awardsEnabled}
              awardsAt={awardsAt}
              onToggleAwards={(enabled) => { setAwardsEnabled(enabled); setAwardsAtOverride(null); }}
              onAwardsAtChange={setAwardsAtOverride}
            />
            {centralCreationIssues.length > 0 && basicsValid && participantsValid && <div className="wizard-schedule-errors" role="alert">
              <strong>Bitte vor der Erstellung korrigieren:</strong>
              <ul>{centralCreationIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            </div>}
            {creationError && <div className="wizard-schedule-errors" role="alert"><strong>Speichern fehlgeschlagen:</strong> {creationError}</div>}
            {scheduleIssues.length > 0 && <div className="wizard-schedule-errors" role="alert">
              <strong>Bitte diese Zeitplan-Angaben korrigieren:</strong>
              <ul>{scheduleIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            </div>}
          </section>
        )}
      </div>

      {prestart && <section className="prestart-phase-save-panel" aria-label="Vorstart-Planung übernehmen">
        <PlannedScheduleEditor
          scheduledStart={scheduledStart} timeline={plannedTimeline}
          phaseSummaries={phaseDrafts.map((_, index) => formatPhaseOverview(phaseDrafts, index, discipline, !timedSport))}
          awardsEnabled={false} awardsAt={plannedTimeline.estimatedEnd}
          showCeremony={false} onToggleAwards={() => {}} onAwardsAtChange={() => {}} />
        {prestartIssues.length > 0 && <div className="prestart-editor-errors" role="alert">
          <strong>Bitte vor dem Speichern korrigieren:</strong>
          <ul>{prestartIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        </div>}
        {(() => {
          const ceremony = prestart.tournament.plannedSchedule?.find((item) => item.id === 'award-ceremony');
          return ceremony && !ceremony.autoTime
            ? <div className="callout">
                <p>Manuell geplante Siegerehrung: {formatPlannedDateTime(ceremony.at)}. Sie wird nicht ohne Bestätigung verschoben.</p>
                <div className="actions">
                  <label>Datum<input type="date" value={prestartCeremonyAt.slice(0, 10)}
                    onChange={(event) => setPrestartCeremonyAt(event.target.value + 'T' + (prestartCeremonyAt.slice(11, 16) || '12:00'))} /></label>
                  <label>Uhrzeit<input type="time" value={prestartCeremonyAt.slice(11, 16)}
                    onChange={(event) => setPrestartCeremonyAt(prestartCeremonyAt.slice(0, 10) + 'T' + event.target.value)} /></label>
                  <button className="btn small" type="button"
                    onClick={() => setPrestartCeremonyAt(plannedTimeline.estimatedEnd)}>Auf neues Turnierende setzen</button>
                </div>
              </div>
            : null;
        })()}
        <p className="muted">Beim Speichern werden die bisherigen Vorstart-Auslosungen neu erstellt. Teilnehmer, Codes und Rückzüge bleiben erhalten.</p>
        {prestartSaveError && <p role="alert" className="field-error">{prestartSaveError}</p>}

        <div className="prestart-editor-actions">
          <button className="btn" type="button" onClick={() => confirmPrestartSave
            ? setConfirmPrestartSave(false) : prestartDirty ? setConfirmPrestartDiscard(true) : discardPrestartEditing()}>
            Abbrechen
          </button>
          <button className="btn primary" type="button" disabled={prestartRecoveryConflict || prestartIssues.length > 0 || !prestartDirty || prestartSaveBusy}
            onClick={savePrestartPhases}>
            {prestartDirty ? 'Änderungen prüfen und speichern' : 'Keine Änderungen vorhanden'}
          </button>
        </div>
      </section>}
      {!prestart && step !== 5 && <div className="wizard-sidebar-column">
      <aside className="wizard-side-summary" aria-label="Aktuelle Einstellungen">
        <div className="wizard-side-summary-heading">
          <div>
            <h2>Dein Turnier</h2>
          </div>
          <span className="wizard-side-step">{step}/5</span>
        </div>
        <div className="wizard-side-facts">
          <button type="button" className="wizard-side-fact" onClick={() => navigateToStep(1)}>
            <span>Grunddaten <span aria-hidden="true">↗</span></span>
            <strong>{name.trim() || 'Noch kein Name'}</strong>
            <small>{sportOptions.find((item) => item.id === sport)?.label ?? 'Sportart auswählen'} · {sport ? disciplineLabel(discipline) : 'Wettbewerbsart offen'} · {tables} {venue.plural} · mindestens {minimumMatches} Spiele</small>
            <small>{isValidLocalDateTime(scheduledStart) ? `Geplanter Beginn: ${scheduledDate} · ${scheduledTime} Uhr` : 'Turnierdatum noch offen'}</small>
          </button>
          <button type="button" className="wizard-side-fact" disabled={maxReachedStep < 2} onClick={() => navigateToStep(2)}>
            <span>Teilnehmer {maxReachedStep >= 2 && <span aria-hidden="true">↗</span>}</span>
            <strong>{participantCount} {discipline === 'TEAMS' ? 'Mannschaften' : discipline === 'SINGLES' ? 'Spieler' : 'Doppel'}</strong>
            <small>{participantsValid ? 'Teilnehmerliste vollständig' : 'Mindestens 2 vollständige Einträge erforderlich'}</small>
          </button>
          <button type="button" className="wizard-side-fact" disabled={maxReachedStep < 3} onClick={() => navigateToStep(3)}>
            <span>Turnierform {maxReachedStep >= 3 && <span aria-hidden="true">↗</span>}</span>
            <strong>{phaseDrafts.length ? `${phaseDrafts.length} ${phaseDrafts.length === 1 ? 'Phase' : 'Phasen'} konfiguriert` : 'Noch keine Form gewählt'}</strong>
            <small>{selectedRecommendation ? recommendationPlanMatches ? 'Empfehlung übernommen – frei anpassbar' : 'Individuell angepasst – ursprüngliche Empfehlung weicht ab' : 'Individuelle Phasenauswahl'}</small>
          </button>
        </div>
        <div className="wizard-side-phase-summary">
          <div className="wizard-side-phase-heading">
            <strong>Phasenplan</strong>
            {maxReachedStep >= 4 && <button className="wizard-side-link" type="button" onClick={() => navigateToStep(4)}>Bearbeiten</button>}
          </div>
          {phaseDrafts.length === 0
            ? <p className="muted">Noch keine Phasen eingestellt.</p>
            : <ol className="wizard-side-phase-list">
              {phaseDrafts.map((phase, index) => (
                <li key={phase.id}>
                  <span className="wizard-side-phase-index">{index + 1}</span>
                  <div>
                    <strong>{phase.label}</strong>
                    <small>{phase.type === 'BREAK'
                    ? phase.breakKind === 'overnight' ? `Spieltagsende · Fortsetzung ${formatPlannedDateTime(plannedTimeline.items.find((item) => item.id === `phase-${index + 2}`)?.at ?? '')}` : phase.breakKind === 'until' ? `Pause bis ${phase.breakUntil} Uhr` : `${phase.breakMinutes} Minuten`
                    : `${phase.type === 'GROUPS' ? `${phase.groupCount} Gruppen` : phase.type === 'SWISS' ? `${phase.swissRounds} Runden` : `${phase.entrantCount} Teilnehmer`} · ${phaseEstimates[index]?.estimatedMatches ?? 0} Spiele · ca. ${formatCompactDuration(phaseEstimates[index]?.estimatedDurationMinutes ?? 0)}`}</small>
                  </div>
                </li>
              ))}
            </ol>}
        </div>
        {maxReachedStep >= 5 && <button className="wizard-side-fact wizard-side-schedule" type="button" onClick={() => navigateToStep(5)}>
          <span>Zeitplan <span aria-hidden="true">↗</span></span>
          <strong>{phaseDrafts.length} Phasen automatisch geplant{awardsEnabled ? ' · mit Siegerehrung' : ''}</strong>
        </button>}
        <div className="wizard-side-duration">
          <span>Voraussichtliche Spielzeit</span>
          <strong>{phaseDrafts.length > 0 ? `ca. ${formatDuration(estimatedPlayingMinutes)}` : 'Noch offen'}</strong>
          {phaseDrafts.length > 0 && (
            <div className="wizard-side-duration-breakdown">
              <span>Geplante Pausen <strong>{formatDuration(estimatedBreakMinutes)}</strong></span>
              <span>Aktive Turnierdauer inkl. Pausen <strong>{formatDuration(estimatedTournamentDurationMinutes)}</strong></span>
              {plannedTimeline.estimatedEnd && <span>Voraussichtliches Ende <strong>{formatPlannedDateTime(plannedTimeline.estimatedEnd)}</strong></span>}
            </div>
          )}
          {phaseDrafts.length > 0 && <small>Unverbindliche Planung mit {timedSport ? `${matchDurationMinutes} Min. je Spiel` : `${planningMinutesPerSet(sport)} Min. je Satz`}. Zusätzliche Verzögerungen bei der Rundenfreigabe sind nicht enthalten.</small>}
          {plannedTimeline.warnings.length > 0 && <small>⚠ Die Pausenplanung enthält einen Zeitkonflikt, der vor Erstellung korrigiert werden muss.</small>}
        </div>
        {minimumMatchesShortfall > 0 && (
          <div className="wizard-side-minimum-warning" role="status" aria-label="Warnung zur Mindestspielzahl">
            <span className="wizard-side-minimum-warning-icon" aria-hidden="true">!</span>
            <div className="wizard-side-minimum-warning-content">
              <strong>Mindestspielzahl nicht erreicht</strong>
              <p>Garantiert <b>{actualMinimumMatches}</b> von gewünschten <b>{minimumMatches}</b> tatsächlich gespielten Begegnungen pro Teilnehmer.</p>
              <small>Freilose zählen nicht als gespielte Begegnungen.</small>
              {maxReachedStep >= 4 && (
                <button type="button" onClick={() => navigateToStep(4)}>Phasenplanung prüfen</button>
              )}
            </div>
          </div>
        )}
        {maxReachedStep >= 4 && !canCreate && (
          <div className="wizard-side-validation" role="status">
            <strong>Noch nicht bereit zur Erstellung</strong>
            {!basicsValid && <button type="button" onClick={() => navigateToStep(1)}>Grunddaten vervollständigen</button>}
            {!participantsValid && <button type="button" onClick={() => navigateToStep(2)}>Teilnehmer überprüfen</button>}
            
            {(!phaseConfigurationValid || !phaseEntrantsValid) && <button type="button" onClick={() => navigateToStep(4)}>Phasen prüfen</button>}
          </div>
        )}
        <p className="wizard-side-footnote">Klicke auf eine bereits erreichte Einstellung, um sie direkt zu ändern.</p>
      </aside>
      <div className="wizard-side-actions">
        {step === 2 && !participantsValid && (
          <span className="wizard-validation-message">
            {incompleteSavedParticipants > 0
              ? 'Alle gespeicherten Teilnehmer müssen vollständig sein.'
              : `Mindestens 2 ${discipline === 'TEAMS' ? 'Mannschaften' : discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} für ein Turnier.`}
          </span>
        )}
        {step === 3 && <span className="muted wizard-optional-note">Eine Empfehlung ist optional.</span>}
        <div className="wizard-side-navigation">
          <button className="btn" type="button" onClick={goBack} disabled={step === 1}>← Zurück</button>
        <button className="btn primary wizard-continue-button" type="button" onClick={goNext} disabled={!canContinue}>{step === 4 ? 'Weiter zur Zusammenfassung →' : 'Weiter →'}</button>
        </div>
      </div>
      </div>}
      </div>
      </div>
      {confirmPrestartSave && prestart && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="prestart-save-confirm-title">
          <h2 id="prestart-save-confirm-title">Vorstart-Planung wirklich übernehmen?</h2>
          <p>Die bisherige Auslosung wird zurückgesetzt. Die Teilnehmer, Codes und dokumentierten Rückzüge bleiben erhalten.</p>
          <div className="prestart-confirm-summary">
            {prestartPhaseDrafts.map((phase, index) => <p key={phase.id}>
              <strong>{index + 1}. {phase.label}</strong> · {phase.entrantCount} Teilnehmer
              {phase.type === 'SWISS' ? ` · ${phase.swissRounds} Schweizer Runden` : ''}
              {phase.type === 'GROUPS' ? ` · ${phase.groupCount} Gruppen` : ''}
              {phase.type !== 'BREAK' ? ` · Best-of-${phase.bestOf}` : ''}
            </p>)}
          </div>
          <div className="actions">
            <button type="button" className="btn primary" disabled={prestartSaveBusy} onClick={() => { void savePrestartPhases(); }}>
              {prestartSaveBusy ? 'Speichern …' : 'Ja, Phasen und Auslosung aktualisieren'}</button>
            <button type="button" className="btn" onClick={() => { setConfirmPrestartSave(false); prestartConfirmationSignature.current = null; }}>Weiter bearbeiten</button>
          </div>
        </section>
      </div>}
      {createdTournamentWithDraftNotice && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="created-draft-notice-title">
          <h2 id="created-draft-notice-title">Turnier erstellt – Entwurf bleibt erhalten</h2>
          <p>{createdTournamentWithDraftNotice.message}</p>
          <p>Das neu erstellte Turnier wurde erfolgreich gespeichert. Du kannst es jetzt unabhängig vom weiterhin vorhandenen Entwurf verwalten.</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => navigate(`/tournaments/${createdTournamentWithDraftNotice.id}/control`, { replace: true })}>
              Zur Turnierleitung
            </button>
          </div>
        </section>
      </div>}
      {draftConflictOpen && savedDraftId && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="draft-conflict-title">
          <h2 id="draft-conflict-title">Dieser Entwurf wurde zwischenzeitlich geändert</h2>
          <p>Ein anderer Browser-Tab hat diesen Entwurf bereits gespeichert oder gelöscht. Deine aktuelle Bearbeitung bleibt erhalten und wird nicht automatisch überschrieben.</p>
          <div className="actions">
            <button className="btn primary" type="button" onClick={() => { setDraftConflictOpen(false); saveNamedDraft(true); }}>Meine Fassung als Kopie speichern</button>
            <button className="btn" type="button" onClick={() => {
              clearCreationDraft(window.sessionStorage, sessionDraftKey);
              try { window.sessionStorage.removeItem(`${sessionDraftKey}:base-revision`); } catch { /* ignored */ }
              window.location.reload();
            }}>Aktuellen Speicherstand laden</button>
            <button className="btn" type="button" onClick={() => setDraftConflictOpen(false)}>Weiter bearbeiten</button>
          </div>
        </section>
      </div>}
      {recoveryChoiceOpen && savedDraftId && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="draft-recovery-title">
          <h2 id="draft-recovery-title">Ungespeicherte Änderungen gefunden</h2>
          <p>Für diesen Entwurf existiert eine neuere Bearbeitungsfassung in diesem Browser-Tab. Du kannst sie wiederherstellen oder stattdessen den zuletzt ausdrücklich gespeicherten Stand laden.</p>
          <div className="actions">
            <button className="btn primary" type="button" onClick={() => setRecoveryChoiceOpen(false)}>Ungespeicherte Änderungen wiederherstellen</button>
            <button className="btn" type="button" onClick={() => {
              clearCreationDraft(window.sessionStorage, sessionDraftKey);
              try { window.sessionStorage.removeItem(`${sessionDraftKey}:base-revision`); } catch { /* ignored */ }
              window.location.reload();
            }}>Gespeicherten Stand laden</button>
          </div>
        </section>
      </div>}
      {overwriteTournamentId && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="overwrite-tournament-title">
          <h2 id="overwrite-tournament-title">Vorhandenes Turnier überschreiben?</h2>
          <p>Ein noch nicht gestartetes Turnier mit dem Namen „{name.trim()}“ ist bereits gespeichert. Beim Überschreiben wird das alte Turnier durch ein <strong>neues Turnier mit neuer Kennung</strong> ersetzt.</p>
          <p>Die alte Teilnehmerliste, individuell vergebenen Spielercodes, Auslosungen, gespeicherten Vorstart-Einstellungen und der bisherige Direktlink werden dabei nicht übernommen. Alte lokale Turnierdaten werden bereinigt. Andere Turniere bleiben unverändert.</p>
          <div className="actions">
            <button className="btn danger" type="button" onClick={() => {
              const id = overwriteTournamentId;
              setOverwriteTournamentId(null);
              submitTournament(id);
            }}>Vorhandenes Turnier überschreiben</button>
            <button className="btn" type="button" onClick={() => setOverwriteTournamentId(null)}>Abbrechen</button>
          </div>
        </section>
      </div>}
      {confirmPrestartDiscard && prestart && <div className="prototype-modal-backdrop" role="presentation">
        <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-label="Ungespeicherte Phasenänderungen">
          <h2>Ungespeicherte Phasenänderungen verwerfen?</h2>
          <p>Die Einstellungen bleiben beim Wechsel zwischen den Turnierleitungs-Tabs erhalten. Beim Schließen ohne Speichern gehen sie jedoch verloren.</p>
          <div className="actions">
            <button className="btn danger" type="button" onClick={discardPrestartEditing}>Änderungen verwerfen</button>
            <button className="btn" type="button" onClick={() => setConfirmPrestartDiscard(false)}>Weiter bearbeiten</button>
          </div>
        </section>
      </div>}
      {qualificationRulePhaseId && (() => {
        const phaseIndex = phaseDrafts.findIndex((phase) => phase.id === qualificationRulePhaseId);
        const previous = phaseDrafts.slice(0, phaseIndex).reverse().find((phase) => phase.type !== 'BREAK');
        const current = phaseDrafts[phaseIndex];
        if (!previous || previous.type !== 'GROUPS' || !current) return null;
        return (
          <QualificationRuleDialog
            groupCount={previous.groupCount} groupEntrants={previous.entrantCount}
            qualifiers={current.entrantCount}
            recommended={recommendedEqualGroupQualifiers(previous.entrantCount, previous.groupCount, current.entrantCount)}
            onCancel={() => setQualificationRulePhaseId(null)}
            onApply={(count) => { updatePhaseEntrants(phaseIndex, count); setQualificationRulePhaseId(null); }}
          />
        );
      })()}
      {(pendingStepNavigation || pendingParticipantAction) && (
        <UnsavedParticipantDialog
          onStay={() => { setPendingStepNavigation(null); setPendingParticipantAction(null); }}
          onDiscard={() => {
            const requested = pendingStepNavigation;
            const action = pendingParticipantAction;
            setPendingStepNavigation(null);
            setPendingParticipantAction(null);
            resetParticipantEditor();
            if (requested) applyStepNavigation(requested.target, requested.focusDate, requested.advance);
            else if (action?.kind === 'edit') {
              const participant = participants.find((entry) => entry.id === action.id);
              if (participant) openParticipantEditor(participant);
            } else if (action?.kind === 'test-players') generateTestParticipants();
          }}
        />
      )}
      {pendingTournamentMode && (
        <div className="sport-change-backdrop" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingTournamentMode(null); }}>
          <section className="sport-change-dialog" role="alertdialog" aria-modal="true"
            aria-label="Turniermodus wechseln?"
            onKeyDown={(event) => { if (event.key === 'Escape') setPendingTournamentMode(null); }}>
            <h2>Auf eintägiges Turnier umstellen?</h2>
            <p>Die Veranstaltung wird wieder für einen Spieltag geplant. Die gewünschte aktive Turnierdauer und alle anderen Einstellungen bleiben erhalten.</p>
            {configuredPlayingDays(phaseDrafts) > 1 && (
              <p className="modal-mode-warning">Im Phasenplan sind bereits Spieltagsenden eingerichtet. Sie werden nicht automatisch gelöscht und müssen vor der Erstellung angepasst werden.</p>
            )}
            <div className="sport-change-dialog-actions">
              <button type="button" className="btn" autoFocus onClick={() => setPendingTournamentMode(null)}>Mehrtägig behalten</button>
              <button type="button" className="btn primary" onClick={() => {
                setTournamentMode('single');
                setPendingTournamentMode(null);
              }}>Auf eintägig umstellen</button>
            </div>
          </section>
        </div>
      )}
      {pendingRecommendationId && (
        <div className="sport-change-backdrop" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingRecommendationId(null); }}>
          <section className="sport-change-dialog phase-replacement-dialog" role="alertdialog" aria-modal="true" aria-label="Phasenplanung ersetzen?"
            onKeyDown={(event) => { if (event.key === 'Escape') setPendingRecommendationId(null); }}>
            <h2>Bestehende Phasenplanung ersetzen?</h2>
            <p>Die ausgewählte Empfehlung ersetzt alle derzeit konfigurierten Phasen. Individuelle Best-of-Werte, Qualifikationsplätze und Pausen gehen verloren.</p>
            <div className="sport-change-dialog-actions">
              <button type="button" className="btn" autoFocus onClick={() => setPendingRecommendationId(null)}>Bisherige Planung behalten</button>
              <button type="button" className="btn danger" onClick={() => {
                const recommendation = recommendations.find((item) => item.id === pendingRecommendationId);
                setPendingRecommendationId(null);
                if (recommendation) applyRecommendation(recommendation);
              }}>Phasen durch Empfehlung ersetzen</button>
            </div>
          </section>
        </div>
      )}
      {discardDraftDialogOpen && (
        <DiscardDraftDialog
          onCancel={() => {
            setDiscardDraftDialogOpen(false);
            discardDraftButtonRef.current?.focus();
          }}
          onConfirm={discardCreationDraft}
        />
      )}
      {testParticipantsDialogOpen && (
        <TestParticipantsDialog
          discipline={discipline}
          existingCount={participantCount}
          incompleteCount={incompleteSavedParticipants}
          onCancel={() => {
            setTestParticipantsDialogOpen(false);
            testParticipantsButtonRef.current?.focus();
          }}
          onConfirm={() => {
            setTestParticipantsDialogOpen(false);
            if (participantEditorDirty) setPendingParticipantAction({ kind: 'test-players' });
            else generateTestParticipants();
          }}
        />
      )}
      {pendingDiscipline && (
        <DisciplineChangeDialog
          previousDiscipline={disciplineLabel(discipline)}
          nextDiscipline={disciplineLabel(pendingDiscipline)}
          currentDiscipline={discipline}
          nextDisciplineId={pendingDiscipline}
          onCancel={() => { setPendingDiscipline(null); document.getElementById('discipline')?.focus(); }}
          onConfirm={confirmDisciplineChange}
        />
      )}
      {pendingSport && (
        <SportChangeDialog
          previousSport={sportOptions.find((option) => option.id === sport)?.label ?? sport}
          nextSport={sportOptions.find((option) => option.id === pendingSport)?.label ?? pendingSport}
          hasParticipants={participants.length > 0}
          hasPhases={phaseDrafts.length > 0}
          onCancel={cancelSportChange}
          onConfirm={confirmSportChange}
        />
      )}
    </>
  );
}
