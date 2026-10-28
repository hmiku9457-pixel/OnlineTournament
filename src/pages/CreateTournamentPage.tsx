import { VenueLayoutEditor } from '@/components/VenueLayout';
import { createVenueLayout, resizeVenueLayout } from '@/domain/venueLayout';
import { getVenueTerminology } from '@/domain/venueTerminology';
import { disciplineLabel, disciplineOptionsForSport, sportOptions } from '@/domain/sports';
import { sportScoring } from '@/domain/sportScoring';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  bestOfOptions,
  createPhaseTemplate,
  defaultBestOfForStage,
  estimatePhaseMetrics,
  estimateTournamentDurationMinutes,
  hasValidTerminalStageOrder,
  isTerminalStage,
  knockoutByeCount,
  knockoutEntrantPresets,
  knockoutRoundLabels,
  projectSwissTopScores,
  recommendedSwissRounds,
  stageLabel,
  systemIdForStage,
  tournamentSystemOptions,
  type CreationPhaseTemplate,
  type TournamentSystemId,
} from '@/domain/tournamentCreation';
import type { Discipline, StageType } from '@/domain/types';
import { recommendTournamentFormats, type FormatRecommendation } from '@/engine/recommendations';
import { createMockTournament } from '@/services/mockTournamentStore';

type WizardStep = 1 | 2 | 3 | 4;

type ParticipantFields = {
  firstName: string;
  lastName: string;
  partnerFirstName: string;
  partnerLastName: string;
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
};

const stepLabels = ['Grunddaten', 'Teilnehmer', 'Turnierform', 'Phasen'];
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
  };
}

function newParticipant(fields: ParticipantFields): ParticipantDraft {
  participantSequence += 1;
  return { id: `participant-${participantSequence}`, ...fields };
}

function participantIsComplete(participant: ParticipantFields, discipline: Discipline): boolean {
  if (discipline === 'TEAMS') return Boolean(participant.firstName.trim());
  if (!participant.firstName.trim() || !participant.lastName.trim()) return false;
  if (discipline === 'DOUBLES') {
    return Boolean(participant.partnerFirstName.trim() && participant.partnerLastName.trim());
  }
  return true;
}

function normalizePersonName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function displayPersonName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim();
}

function participantDisplayName(participant: ParticipantFields, discipline: Discipline): string {
  if (discipline === 'TEAMS') return participant.firstName.trim();
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
      if (participant.firstName.trim()) names.add(participant.firstName.trim().toLocaleLowerCase('de-DE'));
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
    const teamName = participant.firstName.trim();
    if (!teamName) return { firstName: 'Bitte einen Mannschaftsnamen eingeben.' };
    const occupied = collectSavedPersonNames(participants, discipline, editingParticipantId);
    return occupied.has(teamName.toLocaleLowerCase('de-DE'))
      ? { firstName: 'Diese Mannschaft ist bereits eingetragen.' } : errors;
  }
  if (!participant.firstName.trim()) errors.firstName = 'Vorname fehlt.';
  if (!participant.lastName.trim()) errors.lastName = 'Nachname fehlt.';
  if (discipline === 'DOUBLES') {
    if (!participant.partnerFirstName.trim()) errors.partnerFirstName = 'Vorname von Spieler 2 fehlt.';
    if (!participant.partnerLastName.trim()) errors.partnerLastName = 'Nachname von Spieler 2 fehlt.';
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

function formatSwissProjection(entrantCount: number, rounds: number): string {
  return projectSwissTopScores(entrantCount, rounds)
    .map((projection) => `${projection.approximatePlayers}× ${projection.wins}:${projection.losses}`)
    .join(' · ');
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
    swissRounds: Math.max(1, template.swissRounds ?? Math.ceil(Math.log2(Math.max(2, participantCount)))),
    entrantCount,
    knockoutBestOf: Array.from({ length: knockoutRounds }, () => phaseBestOfForSport(sport, template.type)),
    customEntrants: isTerminalStage(template.type) && !knockoutEntrantPresets(participantCount).includes(entrantCount),
  };
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
  function clampCustomValue(rawValue: number): number {
    const minimumApplied = Math.max(customMinimum, rawValue || customMinimum);
    return customMaximum === undefined ? minimumApplied : Math.min(customMaximum, minimumApplied);
  }

  return (
    <div className="number-choice" aria-label={ariaLabel}>
      <div className="number-choice-buttons">
        {presets.map((preset) => (
          <button
            className={`number-choice-button ${!custom && value === preset ? 'active' : ''}`}
            key={preset}
            type="button"
            onClick={() => onPreset(preset)}
          >
            {preset}
          </button>
        ))}
        <button
          className={`number-choice-button custom ${custom ? 'active' : ''}`}
          type="button"
          onClick={onCustom}
        >
          Custom
        </button>
        {custom && (
          <input
            className="custom-number-input"
            type="number"
            min={customMinimum}
            max={customMaximum}
            value={value}
            onChange={(event) => onCustomValue(clampCustomValue(Number(event.target.value)))}
            aria-label={`${ariaLabel} benutzerdefiniert`}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

export function CreateTournamentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);
  const [hasVisitedPhaseStep, setHasVisitedPhaseStep] = useState(false);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const availableDisciplines = disciplineOptionsForSport(sport);
  const venue = getVenueTerminology(sport);
  const timedSport = sportScoring(sport).mode === 'score';
  const [timedMatchMinutes, setTimedMatchMinutes] = useState('');
  const [venueTurnoverMinutes, setVenueTurnoverMinutes] = useState('');
  const validMatchDuration = !timedSport || (timedMatchMinutes.trim() !== '' && Number.isInteger(Number(timedMatchMinutes)) && Number(timedMatchMinutes) > 0);
  const validTurnover = venueTurnoverMinutes.trim() === '' || (Number.isInteger(Number(venueTurnoverMinutes)) && Number(venueTurnoverMinutes) >= 0);
  const matchDurationMinutes = timedSport ? Number(timedMatchMinutes) || 15 : 15;
  const breakMinutes = timedSport ? Number(venueTurnoverMinutes) || 0 : 0;
  const [discipline, setDiscipline] = useState<Discipline>('SINGLES');
  const selectedDisciplineValid = availableDisciplines.some((option) => option.value === discipline);
  const [tables, setTables] = useState(8);
  const [customTables, setCustomTables] = useState(false);
  const [venueLayoutEnabled, setVenueLayoutEnabled] = useState(false);
  const [venueLayoutEditorOpen, setVenueLayoutEditorOpen] = useState(false);
  const [venueLayout, setVenueLayout] = useState(() => resizeVenueLayout(createVenueLayout(8), 4, 2, 8));
  useEffect(() => { setVenueLayout((current) => resizeVenueLayout(current, current.columns, Math.max(current.rows, Math.ceil(tables / current.columns)), tables)); }, [tables]);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [participantForm, setParticipantForm] = useState<ParticipantFields>(emptyParticipantFields());
  const [participantErrors, setParticipantErrors] = useState<ParticipantErrors>({});
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [minimumMatches, setMinimumMatches] = useState(4);
  const [customMinimumMatches, setCustomMinimumMatches] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDraft[]>([]);
  const [editingPhaseTypeId, setEditingPhaseTypeId] = useState<string | null>(null);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [phaseInsertIndex, setPhaseInsertIndex] = useState<number | null>(null);
  const [enabledSystems, setEnabledSystems] = useState<Record<TournamentSystemId, boolean>>(initialEnabledSystems);
  const [maxGroups, setMaxGroups] = useState<number | null>(null);
  const [maxSwissRounds, setMaxSwissRounds] = useState<number | null>(null);
  const [knockoutQualifierCount, setKnockoutQualifierCount] = useState<number | null>(null);

  const participantCount = participants.filter((participant) => participantIsComplete(participant, discipline)).length;
  const incompleteSavedParticipants = participants.length - participantCount;
  const participantsValid = participantCount >= 2 && incompleteSavedParticipants === 0;
  const participantErrorMessages = uniqueErrorMessages(participantErrors);

  const defaultMaxGroups = Math.max(2, Math.ceil(participantCount / (participantCount >= 20 ? 5 : 4)));
  const defaultMaxSwissRounds = Math.max(minimumMatches, Math.ceil(Math.log2(Math.max(2, participantCount))));
  const defaultKnockoutQualifierCount = Math.max(
    2,
    Math.min(participantCount, participantCount >= 16 ? 8 : 4),
  );
  const effectiveMaxGroups = maxGroups ?? defaultMaxGroups;
  const effectiveMaxSwissRounds = maxSwissRounds ?? defaultMaxSwissRounds;
  const effectiveKnockoutQualifierCount = knockoutQualifierCount ?? defaultKnockoutQualifierCount;

  const recommendations = useMemo(
    () => recommendTournamentFormats(
      { playerCount: participantCount, tableCount: tables, minimumMatches, matchDurationMinutes, venueTurnoverMinutes: breakMinutes },
      {
        enabledSystems,
        maxGroups: effectiveMaxGroups,
        maxSwissRounds: effectiveMaxSwissRounds,
        knockoutQualifierCount: effectiveKnockoutQualifierCount,
      },
    ),
    [
      participantCount,
      tables,
      minimumMatches,
      matchDurationMinutes,
      breakMinutes,
      enabledSystems,
      effectiveMaxGroups,
      effectiveMaxSwissRounds,
      effectiveKnockoutQualifierCount,
    ],
  );

  const selectedRecommendation = useMemo(
    () => recommendations.find((recommendation) => recommendation.id === selectedRecommendationId) ?? null,
    [recommendations, selectedRecommendationId],
  );

  // Frühere Einstellungen dürfen vorhandene manuell angepasste Phasen nicht
  // unbemerkt löschen oder eine Empfehlung erneut über die Änderungen legen.
  useEffect(() => {
    if (selectedRecommendationId && !selectedRecommendation) setSelectedRecommendationId(null);
  }, [selectedRecommendationId, selectedRecommendation]);

  const phaseOrderValid = hasValidTerminalStageOrder(phaseDrafts.map((phase) => phase.type));
  const hasTerminalPhase = phaseDrafts.some((phase) => isTerminalStage(phase.type));
  const phaseConfigurationValid = phaseDrafts.length > 0 && phaseOrderValid;
  const basicsValid = Boolean(name.trim()) && Boolean(sport) && selectedDisciplineValid && tables >= 1 && gameSettingsValid;
  const gameSettingsValid = minimumMatches >= 1 && validMatchDuration && validTurnover;
  const phaseEntrantsValid = phaseDrafts.every((phase, index) => {
    const maximum = index === 0 ? participantCount : phaseDrafts[index - 1].entrantCount;
    return phase.entrantCount >= 2 && phase.entrantCount <= maximum
      && (index !== 0 || phase.entrantCount === participantCount)
      && (phase.type !== 'GROUPS' || (phase.groupCount >= 2 && phase.groupCount <= Math.floor(phase.entrantCount / 2)));
  });
  const canCreate = basicsValid && participantsValid && gameSettingsValid
    && phaseConfigurationValid && phaseEntrantsValid && hasVisitedPhaseStep;

  const canContinue =
    (step === 1 && basicsValid) ||
    (step === 2 && participantsValid) ||
    step === 3 ||
    step === 4;

  function updateParticipantForm(field: ParticipantField, value: string) {
    setParticipantForm((current) => ({ ...current, [field]: value }));
    setParticipantErrors((current) => {
      const next = { ...current };
      if (field === 'firstName' || field === 'lastName') {
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
      setParticipants((current) => [...current, newParticipant(participantForm)]);
    }
    resetParticipantEditor();
  }

  function editParticipant(participant: ParticipantDraft) {
    setParticipantForm({
      firstName: participant.firstName,
      lastName: participant.lastName,
      partnerFirstName: participant.partnerFirstName,
      partnerLastName: participant.partnerLastName,
    });
    setParticipantErrors({});
    setEditingParticipantId(participant.id);
  }

  function removeParticipant(id: string) {
    setParticipants((current) => current.filter((participant) => participant.id !== id));
    if (editingParticipantId === id) resetParticipantEditor();
  }

  function removeIncompleteParticipants() {
    setParticipants((current) => current.filter((participant) => participantIsComplete(participant, discipline)));
    if (editingParticipantId && participants.some((participant) =>
      participant.id === editingParticipantId && !participantIsComplete(participant, discipline))) {
      resetParticipantEditor();
    }
  }

  function generateTestParticipants() {
    const targetCount = 19;
    setParticipants((current) => {
      const next = [...current];
      let sequence = 1;
      while (next.length < targetCount) {
        const suffix = String(sequence).padStart(2, '0');
        const firstName = discipline === 'TEAMS' ? `Test Mannschaft ${suffix}` : 'Test';
        const lastName = discipline === 'TEAMS' ? '' : `Spieler ${suffix}`;
        const partnerFirstName = discipline === 'DOUBLES' ? 'Test' : '';
        const partnerLastName = discipline === 'DOUBLES' ? `Partner ${suffix}` : '';
        const candidate: ParticipantFields = { firstName, lastName, partnerFirstName, partnerLastName };
        const duplicate = validateParticipant(candidate, discipline, next, null);
        if (Object.keys(duplicate).length === 0) next.push(newParticipant(candidate));
        sequence += 1;
      }
      return next;
    });
    resetParticipantEditor();
  }

  function toggleSystem(systemId: TournamentSystemId) {
    const disabling = enabledSystems[systemId];
    setEnabledSystems((current) => ({ ...current, [systemId]: !current[systemId] }));
    if (disabling) {
      setSelectedRecommendationId(null);
      setPhaseDrafts((current) => current.filter((phase) => systemIdForStage(phase.type) !== systemId));
    }
  }

  function selectRecommendation(recommendation: FormatRecommendation) {
    if (selectedRecommendationId === recommendation.id) {
      setSelectedRecommendationId(null);
      setPhaseDrafts([]);
      return;
    }
    setSelectedRecommendationId(recommendation.id);
    setPhaseDrafts(recommendation.phases.map((phase) => phaseDraftFromTemplate(phase, participantCount, sport)));
    setExpandedPhaseId(null);
    setPhaseInsertIndex(null);
  }

  function normalizePhaseEntrants(phases: PhaseDraft[]): PhaseDraft[] {
    const next = phases.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
    for (let index = 0; index < next.length; index += 1) {
      const maximum = index === 0 ? participantCount : next[index - 1].entrantCount;
      const minimum = Math.min(2, maximum);
      const entrants = index === 0
        ? participantCount
        : Math.max(minimum, Math.min(maximum, next[index].entrantCount));
      next[index].entrantCount = entrants;
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
    }
    return next;
  }

  useEffect(() => {
    setPhaseDrafts((current) => {
      if (!current.length) return current;
      const normalized = normalizePhaseEntrants(current);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  // Die Teilnehmerzahl ist die Quelle für das Startfeld aller Phasen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantCount]);

  function insertPhase(insertIndex: number, type: StageType) {
    if (insertIndex < 0 || insertIndex > phaseDrafts.length) return;
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
    const candidate = [...phaseDrafts.slice(0, insertIndex), phase, ...phaseDrafts.slice(insertIndex)];
    if (!hasValidTerminalStageOrder(candidate.map((item) => item.type))) return;
    setPhaseDrafts(normalizePhaseEntrants(candidate));
    setSelectedRecommendationId(null);
    setPhaseInsertIndex(null);
    setExpandedPhaseId(phase.id);
  }

  function addPhase(type: StageType) {
    insertPhase(phaseDrafts.length, type);
  }

  function removePhase(id: string) {
    setSelectedRecommendationId(null);
    if (editingPhaseTypeId === id) setEditingPhaseTypeId(null);
    if (expandedPhaseId === id) setExpandedPhaseId(null);
    setPhaseDrafts((current) => normalizePhaseEntrants(current.filter((phase) => phase.id !== id)));
  }

  function canMovePhase(index: number, direction: -1 | 1): boolean {
    const target = index + direction;
    if (target < 0 || target >= phaseDrafts.length) return false;
    const candidate = [...phaseDrafts];
    [candidate[index], candidate[target]] = [candidate[target], candidate[index]];
    return hasValidTerminalStageOrder(candidate.map((phase) => phase.type));
  }

  function movePhase(index: number, direction: -1 | 1) {
    if (!canMovePhase(index, direction)) return;
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => {
      const next = [...current];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return normalizePhaseEntrants(next);
    });
  }

  function updatePhase(id: string, patch: Partial<PhaseDraft>) {
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => current.map((phase) => (
      phase.id === id ? { ...phase, ...patch } : phase
    )));
  }

  function changePhaseType(index: number, type: StageType) {
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => {
      if (!current[index]) return current;
      if (current[index].type === type) return current;
      if (isTerminalStage(type) && index !== current.length - 1) return current;

      const next = current.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
      const phase = next[index];
      const bestOf = phaseBestOfForSport(sport, type);
      phase.type = type;
      phase.label = stageLabel(type);
      phase.bestOf = bestOf;
      phase.customEntrants = isTerminalStage(type)
        ? phase.customEntrants || !knockoutEntrantPresets(index === 0 ? participantCount : next[index - 1].entrantCount).includes(phase.entrantCount)
        : false;
      phase.knockoutBestOf = type === 'KNOCKOUT'
        ? resizeKnockoutBestOf(phase.knockoutBestOf, knockoutRoundLabels(phase.entrantCount).length, bestOf)
        : [];

      return normalizePhaseEntrants(next);
    });
    setEditingPhaseTypeId(null);
  }

  function updatePhaseEntrants(index: number, entrantCount: number, customEntrants = false) {
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => {
      const next = current.map((phase) => ({ ...phase, knockoutBestOf: [...phase.knockoutBestOf] }));
      if (!next[index] || index === 0) return next;
      const maximum = next[index - 1].entrantCount;
      const nextEntrants = Math.max(2, Math.min(maximum, entrantCount));
      next[index].entrantCount = nextEntrants;
      next[index].customEntrants = customEntrants;
      if (next[index].type === 'KNOCKOUT') {
        next[index].knockoutBestOf = resizeKnockoutBestOf(
          next[index].knockoutBestOf,
          knockoutRoundLabels(nextEntrants).length,
          next[index].bestOf,
        );
      }
      return normalizePhaseEntrants(next);
    });
  }

  function updateKnockoutRoundBestOf(phase: PhaseDraft, roundIndex: number, bestOf: number) {
    const next = [...phase.knockoutBestOf];
    next[roundIndex] = bestOf;
    updatePhase(phase.id, { knockoutBestOf: next });
  }

  function navigateToStep(target: WizardStep) {
    if (target > maxReachedStep) return;
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goNext() {
    if (!canContinue || step === 4) return;
    const next = (step + 1) as WizardStep;
    if (step === 3) {
      if (phaseDrafts.length === 0 && selectedRecommendation) {
        setPhaseDrafts(selectedRecommendation.phases.map((phase) => phaseDraftFromTemplate(phase, participantCount, sport)));
      }
      setHasVisitedPhaseStep(true);
    }
    setMaxReachedStep((current) => Math.max(current, next) as WizardStep);
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goBack() {
    if (step === 1) return;
    navigateToStep((step - 1) as WizardStep);
  }

  function submitTournament() {
    if (step !== 4 || !canCreate) return;
    const tournament = createMockTournament({
      name,
      sport,
      discipline,
      tables,
      minimumMatches,
      matchDurationMinutes,
      venueTurnoverMinutes: breakMinutes,
      participantNames: participants.map((participant) => participantDisplayName(participant, discipline)),
      phases: phaseDrafts.map((phase) => ({
        type: phase.type,
        label: phase.label,
        bestOf: timedSport ? 1 : phase.bestOf,
        entrantCount: phase.entrantCount,
        groupCount: phase.groupCount,
        swissRounds: phase.swissRounds,
        knockoutBestOf: timedSport ? phase.knockoutBestOf.map(() => 1) : phase.knockoutBestOf,
      })),
      estimatedDurationMinutes: estimatedTournamentDurationMinutes,
      venueLayout: venueLayoutEnabled ? venueLayout : undefined,
    });
    navigate(`/tournaments/${tournament.id}/control`, { replace: true });
  }

  const estimatedTournamentDurationMinutes = useMemo(
    () => estimateTournamentDurationMinutes(
      phaseDrafts.map((phase) => ({
        type: phase.type,
        entrantCount: phase.entrantCount,
        bestOf: phase.bestOf,
        groupCount: phase.groupCount,
        swissRounds: phase.swissRounds,
        knockoutBestOf: phase.knockoutBestOf,
      })),
      tables,
      timedSport ? { matchDurationMinutes, venueTurnoverMinutes: breakMinutes } : undefined,
    ),
    [phaseDrafts, tables, timedSport, matchDurationMinutes, breakMinutes],
  );

  const phaseEstimates = useMemo(
    () => phaseDrafts.map((phase) => estimatePhaseMetrics({
      type: phase.type,
      entrantCount: phase.entrantCount,
      bestOf: phase.bestOf,
      groupCount: phase.groupCount,
      swissRounds: phase.swissRounds,
      knockoutBestOf: phase.knockoutBestOf,
    }, tables, timedSport ? { matchDurationMinutes, venueTurnoverMinutes: breakMinutes } : undefined)),
    [phaseDrafts, tables, timedSport, matchDurationMinutes, breakMinutes],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turnier erstellen</h1>
          <p className="muted">Schritt {step} von 4 · Einstellungen bleiben erhalten und können jederzeit über die bereits erreichten Schritte geändert werden.</p>
        </div>
      </header>

      <nav className="wizard-steps" aria-label="Erstellungsschritte">
        {stepLabels.map((label, index) => {
          const stepNumber = (index + 1) as WizardStep;
          const reached = stepNumber <= maxReachedStep;
          const stepValid = [basicsValid, participantsValid, maxReachedStep >= 4,
            phaseConfigurationValid && phaseEntrantsValid][index];
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
      </nav>

      <div className="wizard-workspace">
      <div className="card wizard-card">
        {step === 1 && (
          <section>
            <h2>Grunddaten</h2>
            <p className="muted">Zuerst nur die Daten, die für die Teilnehmererfassung und spätere Empfehlung benötigt werden.</p>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Turniername</label>
                <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Vereinsmeisterschaft 2027" autoFocus />
              </div>
              <div className="field">
                <label htmlFor="sport">Sportart</label>
                <select id="sport" value={sport} onChange={(event) => {
                  const selectedSport = event.target.value;
                  const allowed = disciplineOptionsForSport(selectedSport);
                  const nextDiscipline = allowed.some((option) => option.value === discipline)
                    ? discipline : allowed[0]?.value ?? 'SINGLES';
                  if (nextDiscipline !== discipline) {
                    setDiscipline(nextDiscipline);
                    resetParticipantEditor();
                    // Bei Mannschaftssportarten ist der Name des Teams ein eigener Eintrag.
                    // Vorhandene Spieler werden nicht gelöscht, sondern müssen bei Bedarf
                    // in der Teilnehmerliste überprüft werden.
                    if (nextDiscipline === 'TEAMS') {
                      setParticipants((current) => current.map((participant) => ({
                        ...participant,
                        firstName: displayPersonName(participant.firstName, participant.lastName),
                        lastName: '',
                      })));
                    }
                  }
                  setSport(selectedSport);
                  setPhaseDrafts((current) => current.map((phase) => ({ ...phase,
                    bestOf: phaseBestOfForSport(selectedSport, phase.type),
                    knockoutBestOf: phase.knockoutBestOf.map(() => phaseBestOfForSport(selectedSport, phase.type)),
                  })));
                }}>
                  <option value="" disabled>Sportart auswählen</option>
                  {sportOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="discipline">Disziplin</label>
                <select id="discipline" value={sport ? discipline : ''} disabled={!sport}
                  onChange={(event) => {
                    const nextDiscipline = event.target.value as Discipline;
                    if (nextDiscipline === discipline) return;
                    setDiscipline(nextDiscipline);
                    resetParticipantEditor();
                  }}>
                  {!sport && <option value="">Zuerst Sportart auswählen</option>}
                  {availableDisciplines.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label>Anzahl {sport ? venue.plural : 'Spielflächen'}</label>
                <NumberChoice
                  ariaLabel={`Anzahl ${sport ? venue.plural : 'Spielflächen'}`}
                  value={tables}
                  presets={Array.from({ length: 12 }, (_, index) => index + 1)}
                  custom={customTables}
                  customMinimum={13}
                  onPreset={(value) => { setTables(value); setCustomTables(false); }}
                  onCustom={() => { setCustomTables(true); setTables((current) => current > 12 ? current : 13); }}
                  onCustomValue={setTables}
                />
              </div>
            </div>
            <div className="venue-optional wizard-venue-choice">
              <div className="wizard-venue-choice-head">
                <div>
                  <h3>Spielflächenplan <span className="wizard-optional-tag">Optional</span></h3>
                  <p className="muted">Ohne Hallenplan werden die {venue.plural} automatisch nummeriert und zugewiesen. Einen individuellen Aufbau kannst du bei Bedarf aktivieren.</p>
                </div>
                <label className="format-toggle"><input type="checkbox" role="switch" checked={venueLayoutEnabled} onChange={(event) => { setVenueLayoutEnabled(event.target.checked); if (event.target.checked) setVenueLayoutEditorOpen(true); }} /> <strong>{venueLayoutEnabled ? 'Aktiv' : 'Aus'}</strong></label>
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
                  {venueLayoutEditorOpen && <VenueLayoutEditor layout={venueLayout} tableCount={tables} sport={sport} onChange={setVenueLayout} />}
                </>
              )}
            </div>
            <div className="wizard-game-settings">
              <div className="wizard-game-settings-heading">
                <h3>Spieldaten</h3>
                <p className="muted">Die Mindestspielzahl steuert die Turnierempfehlungen. Die Best-of-Werte stellst du später je Phase ein.</p>
              </div>
            <div className="spieldaten-layout">
              <div className="field">
                <label>Gewünschte Mindestspiele pro Teilnehmer</label>
                <NumberChoice
                  ariaLabel="Gewünschte Mindestspiele pro Teilnehmer"
                  value={minimumMatches}
                  presets={[1, 2, 3, 4, 5]}
                  custom={customMinimumMatches}
                  customMinimum={6}
                  onPreset={(value) => { setMinimumMatches(value); setCustomMinimumMatches(false); }}
                  onCustom={() => { setCustomMinimumMatches(true); setMinimumMatches((current) => current > 5 ? current : 6); }}
                  onCustomValue={setMinimumMatches}
                />
              </div>
              <div className="field match-timing-fields">
                <label htmlFor="match-duration">{timedSport ? 'Spieldauer (Minuten) *' : 'Satzdauer (Minuten)'}</label>
                <input id="match-duration" type="number" min="1" step="1" required={timedSport} value={timedSport ? timedMatchMinutes : '15'} disabled={!timedSport} placeholder={timedSport ? 'Pflichtfeld – z. B. 12' : undefined} onChange={(event) => setTimedMatchMinutes(event.target.value)} />
                {!timedSport && <span className="field-hint">Planungswert: derzeit 15 Minuten je Satz.</span>}
                {timedSport && <>
                  <label htmlFor="venue-turnover">Pause zwischen Spielen auf derselben Spielfläche (Minuten)</label>
                  <input id="venue-turnover" type="number" min="0" step="1" placeholder="Optional – z. B. 5" value={venueTurnoverMinutes} onChange={(event) => setVenueTurnoverMinutes(event.target.value)} />
                  <span className="field-hint">Die Pause wird in der groben Spielplan-Dauer berücksichtigt; leer bedeutet 0 Minuten.</span>
                  {(!validMatchDuration || !validTurnover) && <span className="field-error">Bitte gültige ganze Minutenwerte angeben. Die Spieldauer ist erforderlich.</span>}
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

            <div className="participant-entry-layout">
              <div className="participant-editor">
                <div className="participant-editor-head">
                  <div>
                    <span className="badge">{editingParticipantId ? 'Bearbeiten' : 'Neuer Eintrag'}</span>
                    <h3>{discipline === 'TEAMS' ? 'Mannschaft' : discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} erfassen</h3>
                  </div>
                  {editingParticipantId && (
                    <button className="btn" type="button" onClick={resetParticipantEditor}>Abbrechen</button>
                  )}
                </div>

                <div className="participant-mask">
                  <div className="field">
                    <label htmlFor="participant-first">{discipline === 'TEAMS' ? 'Mannschaftsname' : discipline === 'DOUBLES' ? 'Spieler 1 · Vorname' : 'Vorname'}</label>
                    <input
                      id="participant-first"
                      className={participantErrors.firstName ? 'input-error' : ''}
                      value={participantForm.firstName}
                      onChange={(event) => updateParticipantForm('firstName', event.target.value)}
                      aria-invalid={Boolean(participantErrors.firstName)}
                      autoFocus
                    />
                  </div>
                  {discipline !== 'TEAMS' && <div className="field">
                    <label htmlFor="participant-last">{discipline === 'DOUBLES' ? 'Spieler 1 · Nachname' : 'Nachname'}</label>
                    <input
                      id="participant-last"
                      className={participantErrors.lastName ? 'input-error' : ''}
                      value={participantForm.lastName}
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
                  <div className="participant-validation" aria-live="polite">
                    {participantErrorMessages.map((message) => (
                      <span className="field-error" key={message}>{message}</span>
                    ))}
                  </div>
                </div>
              </div>
              <aside className="wizard-test-tools" aria-label="Testdaten">
                <button className="btn wizard-test-player-button" type="button" onClick={generateTestParticipants} disabled={participantCount >= 19}>
                  {discipline === 'TEAMS' ? '19 Testmannschaften erzeugen' : discipline === 'SINGLES' ? '19 Testspieler erzeugen' : '19 Testdoppel erzeugen'}
                </button>
              </aside>
            </div>

            <aside className="participant-roster participant-roster-grid-card" aria-label="Gespeicherte Teilnehmer">
                <div className="participant-roster-head">
                  <div>
                    <h3>Teilnehmerliste</h3>
                    <span className="muted">{participantCount} gespeichert</span>
                  </div>
                  <span className="badge">{participantCount}</span>
                </div>

                <div className="participant-roster-list participant-roster-multi">
                  {participants.length === 0 ? (
                    <div className="participant-empty">
                      Noch keine Teilnehmer gespeichert. Neue Einträge erscheinen hier sofort.
                    </div>
                  ) : participants.map((participant, index) => (
                    <article className={`participant-roster-row ${editingParticipantId === participant.id ? 'editing' : ''}`} key={participant.id}>
                      <span className="participant-list-number">{index + 1}</span>
                      <div className="participant-list-name">
                        <strong>{participantDisplayName(participant, discipline)}</strong>
                        {!participantIsComplete(participant, discipline) && <span className="field-error">Eintrag muss ergänzt werden.</span>}
                      </div>
                      <div className="participant-list-actions">
                        <button className="btn small" type="button" onClick={() => editParticipant(participant)}>Bearbeiten</button>
                        <button className="btn small" type="button" onClick={() => removeParticipant(participant.id)}>Entfernen</button>
                      </div>
                    </article>
                  ))}
                </div>
              </aside>

            {incompleteSavedParticipants > 0 && (
              <div className="wizard-invalid-participants" role="status">
                <span><strong>{incompleteSavedParticipants} unvollständige {incompleteSavedParticipants === 1 ? 'Eintragung' : 'Eintragungen'}</strong> · Du kannst sie ergänzen oder gesammelt entfernen.</span>
                <button type="button" className="btn small danger-outline" onClick={removeIncompleteParticipants}>
                  Alle fehlerhaften Einträge entfernen
                </button>
              </div>
            )}
          </section>
        )}


        {step === 3 && (
          <section>
            <h2>Turnierform auswählen</h2>
            <p className="muted">Vorschläge sind optional. Du kannst eine Vorlage übernehmen oder im nächsten Schritt deine Phasen vollständig selbst zusammenstellen.</p>

            <div className="format-step-layout">
              <div className="recommendation-list">
                {recommendations.length === 0 && (
                  <div className="callout">Mit den aktuellen Vorgaben gibt es keinen sinnvollen automatischen Vorschlag innerhalb des Zeitmodells. Du kannst trotzdem weitergehen und die Phasen manuell anlegen.</div>
                )}
                {recommendations.map((item, index) => (
                  <button
                    className={`card recommendation recommendation-select ${selectedRecommendationId === item.id ? 'selected' : ''} ${index === 0 ? 'best' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => selectRecommendation(item)}
                  >
                    <div className="recommendation-head">
                      <span className="badge">{index === 0 ? 'Empfohlen' : 'Alternative'}</span>
                      {selectedRecommendationId === item.id && <span className="badge selected-badge">Als Vorlage gewählt</span>}
                    </div>
                    <h3>{item.label}</h3>
                    <p>{item.description}</p>
                    <p className="muted">Geschätzte Spiele insgesamt: {item.estimatedMatches}</p>
                    <p className="muted">Basisdauer: ca. {formatDuration(item.estimatedDurationMinutes)} · {timedSport ? `${matchDurationMinutes} Min. Spieldauer + ${breakMinutes} Min. Wechselzeit` : '15 Min. pro Satz und mindestens 1 Satz pro Spiel'}.</p>
                  </button>
                ))}
              </div>

              <aside className="format-settings-panel">
                <div className="format-settings-head">
                  <h3>Vorgaben für Vorschläge</h3>
                  <p className="muted">Diese Grenzen beeinflussen nur die Empfehlung. Vorschläge werden zusätzlich auf eine Basisdauer von maximal ca. 3,5 Stunden begrenzt (15 Min. pro Satz, mindestens 1 Satz pro Spiel). Im nächsten Schritt kannst du alles frei ändern.</p>
                </div>

                <div className="format-setting-fields">
                  <div className="field">
                    <label htmlFor="max-groups">Maximale Gruppenanzahl</label>
                    <input
                      id="max-groups"
                      type="number"
                      min="2"
                      max={Math.max(2, Math.floor(participantCount / 2))}
                      value={effectiveMaxGroups}
                      onChange={(event) => setMaxGroups(Math.max(2, Number(event.target.value)))}
                      disabled={!enabledSystems.groups}
                    />
                    <span className="field-hint">Gruppen-Vorschläge verwenden höchstens diese Anzahl.</span>
                  </div>

                  <div className="field">
                    <label htmlFor="max-swiss-rounds">Max. Schweizer Runden</label>
                    <input
                      id="max-swiss-rounds"
                      type="number"
                      min="1"
                      max="30"
                      value={effectiveMaxSwissRounds}
                      onChange={(event) => setMaxSwissRounds(Math.max(1, Number(event.target.value)))}
                      disabled={!enabledSystems.swiss}
                    />
                    <span className="field-hint">Schweizer Vorschläge überschreiten diese Rundenzahl nicht.</span>
                  </div>

                  <div className="field">
                    <label htmlFor="knockout-qualifiers">Teilnehmer einer empfohlenen K.-o.-Phase</label>
                    <input
                      id="knockout-qualifiers"
                      type="number"
                      min="2"
                      max={Math.max(2, participantCount)}
                      value={effectiveKnockoutQualifierCount}
                      onChange={(event) => setKnockoutQualifierCount(Math.max(2, Number(event.target.value)))}
                      disabled={!enabledSystems.knockout}
                    />
                    <span className="field-hint">Beispiel: 8 bedeutet, dass eine vorgeschlagene K.-o.-Phase mit 8 Teilnehmern startet.</span>
                  </div>
                </div>

                <fieldset className="format-toggle-group">
                  <legend>Erlaubte Turniersysteme</legend>
                  {tournamentSystemOptions.map((system) => (
                    <label className="format-toggle" key={system.id}>
                      <input
                        type="checkbox"
                        checked={enabledSystems[system.id]}
                        onChange={() => toggleSystem(system.id)}
                      />
                      <span>{system.label}</span>
                    </label>
                  ))}
                </fieldset>
              </aside>
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h2>Phasen konfigurieren</h2>
            <p className="muted">Die Empfehlung ist nur eine Vorlage. Phasen können ergänzt, entfernt, verschoben und unabhängig konfiguriert werden.</p>

            <div className="phase-step-layout">
              <div className="phase-step-main">
                {selectedRecommendation && (
                  <div className="selected-format-summary">
                    <span className="badge">Vorlage</span>
                    <strong>{selectedRecommendation.label}</strong>
                    <span className="muted">Alle Einstellungen unten bleiben frei änderbar.</span>
                  </div>
                )}

                <div className="phase-add-panel">
                  <div>
                    <strong>Phase hinzufügen</strong>
                    <span className="muted">Nur in Schritt 4 erlaubte Systeme werden angeboten.</span>
                  </div>
                  <div className="phase-add-buttons">
                    {hasTerminalPhase ? (
                      <span className="muted terminal-phase-note">Nach einer K.-o.-Phase kann keine weitere Phase folgen.</span>
                    ) : tournamentSystemOptions
                      .filter((system) => enabledSystems[system.id])
                      .map((system) => (
                        <button className="btn small" key={system.id} type="button" onClick={() => addPhase(system.stageType)}>
                          + {system.label}
                        </button>
                      ))}
                  </div>
                </div>

                {phaseDrafts.length === 0 ? (
                  <div className="callout phase-empty">Noch keine Phase festgelegt. Wähle oben mindestens eine Phase aus.</div>
                ) : (
                  <div className="phase-config-list">
                    {phaseDrafts.map((phase, index) => {
                      const maximumPhaseEntrants = index === 0 ? participantCount : phaseDrafts[index - 1].entrantCount;
                      const knockoutEntrants = knockoutEntrantPresets(maximumPhaseEntrants);
                      const knockoutRounds = phase.type === 'KNOCKOUT' ? knockoutRoundLabels(phase.entrantCount) : [];
                      const editingPhaseType = editingPhaseTypeId === phase.id;
                      const swissRoundRecommendation = phase.type === 'SWISS' ? recommendedSwissRounds(phase.entrantCount) : null;
                      const swissProjection = phase.type === 'SWISS' ? formatSwissProjection(phase.entrantCount, phase.swissRounds) : '';
                      const knockoutByes = phase.type === 'KNOCKOUT' ? knockoutByeCount(phase.entrantCount) : 0;
                      return (
                        <article className="phase-config phase-config-expanded" key={phase.id}>
                          <div className="phase-config-head">
                            <div>
                              <span className="badge">Phase {index + 1}</span>
                              <h3>{phase.label}</h3>
                              {phase.type === 'SWISS' ? (
                                <div className="phase-description phase-insight">
                                  <span>Empfehlung für {phase.entrantCount} Teilnehmer: <strong>{swissRoundRecommendation} Runden</strong>.</span>
                                  <span className="muted">Grobe Score-Verteilung nach {phase.swissRounds} Runden: ca. {swissProjection}</span>
                                </div>
                              ) : phase.type === 'KNOCKOUT' ? (
                                <div className="phase-description phase-insight">
                                  <span>Startfeld: <strong>{phase.entrantCount} Teilnehmer</strong>.</span>
                                  <span className="muted">
                                    {knockoutByes > 0
                                      ? `${knockoutByes} Spieler ${knockoutByes === 1 ? 'hat' : 'haben'} in der ersten Runde ein Freilos.`
                                      : 'Keine Freilose in der ersten Runde.'}
                                  </span>
                                </div>
                              ) : (
                                <p className="muted">{stageLabel(phase.type)}</p>
                              )}
                            </div>
                            <div className="phase-order-actions">
                              <button
                                className="btn small"
                                type="button"
                                onClick={() => setEditingPhaseTypeId(editingPhaseType ? null : phase.id)}
                              >
                                {editingPhaseType ? 'Abbrechen' : 'Ändern'}
                              </button>
                              <button className="btn small" type="button" disabled={!canMovePhase(index, -1)} onClick={() => movePhase(index, -1)} aria-label="Phase nach oben">↑</button>
                              <button className="btn small" type="button" disabled={!canMovePhase(index, 1)} onClick={() => movePhase(index, 1)} aria-label="Phase nach unten">↓</button>
                              <button className="btn small" type="button" onClick={() => removePhase(phase.id)}>Entfernen</button>
                            </div>
                          </div>

                          {editingPhaseType && (
                            <div className="phase-type-editor">
                              <strong>Phasentyp ändern</strong>
                              <div className="phase-type-options">
                                {tournamentSystemOptions
                                  .filter((system) => enabledSystems[system.id])
                                  .map((system) => {
                                    const terminalNotAllowed = isTerminalStage(system.stageType) && index !== phaseDrafts.length - 1;
                                    return (
                                      <button
                                        className={`btn small ${phase.type === system.stageType ? 'phase-type-active' : ''}`}
                                        key={system.id}
                                        type="button"
                                        disabled={terminalNotAllowed}
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

                          <div className="phase-settings-grid">
                            {index > 0 && isTerminalStage(phase.type) && (
                              <div className="field phase-entrant-choice field-wide">
                                <label>Weiterkommende Teilnehmer aus Phase {index}</label>
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
                                <label htmlFor={`entrants-${phase.id}`}>Weiterkommende Teilnehmer aus Phase {index}</label>
                                <input
                                  id={`entrants-${phase.id}`}
                                  type="number"
                                  min="2"
                                  max={maximumPhaseEntrants}
                                  value={phase.entrantCount}
                                  onChange={(event) => updatePhaseEntrants(index, Number(event.target.value))}
                                />
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
                                <input
                                  id={`groups-${phase.id}`}
                                  type="number"
                                  min="2"
                                  max={Math.max(2, Math.floor(phase.entrantCount / 2))}
                                  value={Math.min(phase.groupCount, Math.max(2, Math.floor(phase.entrantCount / 2)))}
                                  onChange={(event) => updatePhase(phase.id, { groupCount: Math.max(2, Math.min(Math.floor(phase.entrantCount / 2), Number(event.target.value))) })}
                                />
                              </div>
                            )}

                            {phase.type === 'SWISS' && (
                              <div className="field">
                                <label htmlFor={`swiss-rounds-${phase.id}`}>Runden</label>
                                <input
                                  id={`swiss-rounds-${phase.id}`}
                                  type="number"
                                  min="1"
                                  max="30"
                                  value={phase.swissRounds}
                                  onChange={(event) => updatePhase(phase.id, { swissRounds: Math.max(1, Number(event.target.value)) })}
                                />
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
                          </div>

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
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>


            </div>
          </section>
        )}


      </div>

      <div className="wizard-sidebar-column">
      <aside className="wizard-side-summary" aria-label="Aktuelle Einstellungen">
        <div className="wizard-side-summary-heading">
          <div>
            <span className="wizard-side-kicker">Während der Erstellung</span>
            <h2>Dein Turnier</h2>
          </div>
          <span className="wizard-side-step">{step}/4</span>
        </div>
        <div className="wizard-side-facts">
          <button type="button" className="wizard-side-fact" onClick={() => navigateToStep(1)}>
            <span>Grunddaten <span aria-hidden="true">↗</span></span>
            <strong>{name.trim() || 'Noch kein Name'}</strong>
            <small>{sportOptions.find((item) => item.id === sport)?.label ?? 'Sportart auswählen'} · {sport ? disciplineLabel(discipline) : 'Disziplin offen'} · {tables} {venue.plural} · mindestens {minimumMatches} Spiele</small>
          </button>
          <button type="button" className="wizard-side-fact" disabled={maxReachedStep < 2} onClick={() => navigateToStep(2)}>
            <span>Teilnehmer {maxReachedStep >= 2 && <span aria-hidden="true">↗</span>}</span>
            <strong>{participantCount} {discipline === 'TEAMS' ? 'Mannschaften' : discipline === 'SINGLES' ? 'Spieler' : 'Doppel'}</strong>
            <small>{participantsValid ? 'Teilnehmerliste vollständig' : 'Mindestens 2 vollständige Einträge erforderlich'}</small>
          </button>
          <button type="button" className="wizard-side-fact" disabled={maxReachedStep < 3} onClick={() => navigateToStep(3)}>
            <span>Turnierform {maxReachedStep >= 3 && <span aria-hidden="true">↗</span>}</span>
            <strong>{phaseDrafts.length ? `${phaseDrafts.length} ${phaseDrafts.length === 1 ? 'Phase' : 'Phasen'} konfiguriert` : 'Noch keine Form gewählt'}</strong>
            <small>{selectedRecommendation ? 'Empfehlung übernommen – frei anpassbar' : 'Individuelle Phasenauswahl'}</small>
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
                    <small>{phase.type === 'GROUPS' ? `${phase.groupCount} Gruppen` : phase.type === 'SWISS' ? `${phase.swissRounds} Runden` : `${phase.entrantCount} Teilnehmer`} · {phaseEstimates[index] ? `${phaseEstimates[index].estimatedMatches} Spiele · ca. ${formatCompactDuration(phaseEstimates[index].estimatedDurationMinutes)}` : ''}</small>
                  </div>
                </li>
              ))}
            </ol>}
        </div>
        <div className="wizard-side-duration">
          <span>Voraussichtliche Dauer</span>
          <strong>{phaseDrafts.length > 0 ? `ca. ${formatDuration(estimatedTournamentDurationMinutes)}` : 'Noch offen'}</strong>
          {phaseDrafts.length > 0 && <small>Schätzung · verändert sich mit den Phasen und {venue.dativePlural}.</small>}
        </div>
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
        {step < 4 ? (
          <button className="btn primary wizard-continue-button" type="button" onClick={goNext} disabled={!canContinue}>Weiter →</button>
        ) : (
          <button className="btn primary wizard-continue-button" type="button" onClick={submitTournament} disabled={!canCreate}>Turnier erstellen</button>
        )}
        </div>
      </div>
      </div>
      </div>
    </>
  );
}
