import { useEffect, useMemo, useState } from 'react';
import {
  bestOfOptions,
  createPhaseTemplate,
  knockoutRoundLabels,
  stageLabel,
  systemIdForStage,
  tournamentSystemOptions,
  type CreationPhaseTemplate,
  type TournamentSystemId,
} from '@/domain/tournamentCreation';
import type { Discipline, StageType } from '@/domain/types';
import { recommendTournamentFormats, type FormatRecommendation } from '@/engine/recommendations';

type WizardStep = 1 | 2 | 3 | 4 | 5;

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
};

const stepLabels = ['Grunddaten', 'Teilnehmer', 'Spieldaten', 'Turnierform', 'Phasen'];
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

function phaseDraftFromTemplate(template: CreationPhaseTemplate, participantCount: number): PhaseDraft {
  phaseSequence += 1;
  const entrantCount = Math.max(2, Math.min(participantCount, template.entrantCount ?? participantCount));
  const knockoutRounds = template.type === 'KNOCKOUT' ? knockoutRoundLabels(entrantCount).length : 0;
  return {
    id: `phase-${phaseSequence}`,
    type: template.type,
    label: template.label,
    bestOf: template.defaultBestOf,
    groupCount: Math.max(2, template.groupCount ?? Math.min(4, Math.max(2, Math.ceil(participantCount / 4)))),
    swissRounds: Math.max(1, template.swissRounds ?? Math.ceil(Math.log2(Math.max(2, participantCount)))),
    entrantCount,
    knockoutBestOf: Array.from({ length: knockoutRounds }, () => template.defaultBestOf),
  };
}

function NumberChoice({
  value,
  presets,
  custom,
  customMinimum,
  onPreset,
  onCustom,
  onCustomValue,
  ariaLabel,
}: {
  value: number;
  presets: number[];
  custom: boolean;
  customMinimum: number;
  onPreset: (value: number) => void;
  onCustom: () => void;
  onCustomValue: (value: number) => void;
  ariaLabel: string;
}) {
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
      </div>
      {custom && (
        <input
          className="custom-number-input"
          type="number"
          min={customMinimum}
          value={value}
          onChange={(event) => onCustomValue(Math.max(customMinimum, Number(event.target.value) || customMinimum))}
          aria-label={`${ariaLabel} benutzerdefiniert`}
          autoFocus
        />
      )}
    </div>
  );
}

export function CreateTournamentPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('table_tennis');
  const [discipline, setDiscipline] = useState<Discipline>('SINGLES');
  const [tables, setTables] = useState(8);
  const [customTables, setCustomTables] = useState(false);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [participantForm, setParticipantForm] = useState<ParticipantFields>(emptyParticipantFields());
  const [participantErrors, setParticipantErrors] = useState<ParticipantErrors>({});
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [minimumMatches, setMinimumMatches] = useState(4);
  const [customMinimumMatches, setCustomMinimumMatches] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDraft[]>([]);
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
      { playerCount: participantCount, tableCount: tables, minimumMatches },
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

  useEffect(() => {
    if (selectedRecommendationId && !selectedRecommendation) {
      setSelectedRecommendationId(null);
      setPhaseDrafts([]);
    }
  }, [selectedRecommendationId, selectedRecommendation]);

  useEffect(() => {
    if (!selectedRecommendation) return;
    setPhaseDrafts(selectedRecommendation.phases.map((phase) => phaseDraftFromTemplate(phase, participantCount)));
  }, [selectedRecommendation, participantCount]);

  const canContinue =
    (step === 1 && Boolean(name.trim()) && tables >= 1) ||
    (step === 2 && participantsValid) ||
    (step === 3 && minimumMatches >= 1) ||
    step === 4 ||
    step === 5;

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
    setPhaseDrafts(recommendation.phases.map((phase) => phaseDraftFromTemplate(phase, participantCount)));
  }

  function addPhase(type: StageType) {
    const template = createPhaseTemplate(type, phaseDrafts.length + 1, {
      entrantCount: participantCount,
      groupCount: effectiveMaxGroups,
      swissRounds: effectiveMaxSwissRounds,
    });
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => [...current, phaseDraftFromTemplate(template, participantCount)]);
  }

  function removePhase(id: string) {
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => current.filter((phase) => phase.id !== id));
  }

  function movePhase(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= phaseDrafts.length) return;
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updatePhase(id: string, patch: Partial<PhaseDraft>) {
    setSelectedRecommendationId(null);
    setPhaseDrafts((current) => current.map((phase) => (
      phase.id === id ? { ...phase, ...patch } : phase
    )));
  }

  function updateKnockoutEntrants(phase: PhaseDraft, entrantCount: number) {
    const nextEntrants = Math.max(2, Math.min(participantCount, entrantCount));
    const nextRoundCount = knockoutRoundLabels(nextEntrants).length;
    updatePhase(phase.id, {
      entrantCount: nextEntrants,
      knockoutBestOf: resizeKnockoutBestOf(phase.knockoutBestOf, nextRoundCount, phase.bestOf),
    });
  }

  function updateKnockoutRoundBestOf(phase: PhaseDraft, roundIndex: number, bestOf: number) {
    const next = [...phase.knockoutBestOf];
    next[roundIndex] = bestOf;
    updatePhase(phase.id, { knockoutBestOf: next });
  }

  function goNext() {
    if (!canContinue || step === 5) return;
    setStep((step + 1) as WizardStep);
  }

  function goBack() {
    if (step === 1) return;
    setStep((step - 1) as WizardStep);
  }

  const phaseSequenceLabel = phaseDrafts.length > 0
    ? phaseDrafts.map((phase) => phase.label).join(' → ')
    : 'Noch keine Phasen festgelegt';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Turnier erstellen</h1>
          <p className="muted">Schritt {step} von 5 · Die Teilnehmerzahl ergibt sich automatisch aus den Einträgen.</p>
        </div>
      </header>

      <nav className="wizard-steps" aria-label="Erstellungsschritte">
        {stepLabels.map((label, index) => {
          const stepNumber = (index + 1) as WizardStep;
          return (
            <button
              className={`wizard-step ${step === stepNumber ? 'active' : ''} ${step > stepNumber ? 'done' : ''}`}
              key={label}
              type="button"
              onClick={() => stepNumber < step && setStep(stepNumber)}
            >
              <span>{stepNumber}</span>
              {label}
            </button>
          );
        })}
      </nav>

      <form className="card wizard-card" onSubmit={(event) => event.preventDefault()}>
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
                <select id="sport" value={sport} onChange={(event) => setSport(event.target.value)}>
                  <option value="table_tennis">Tischtennis</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="discipline">Disziplin</label>
                <select id="discipline" value={discipline} onChange={(event) => setDiscipline(event.target.value as Discipline)}>
                  <option value="SINGLES">Einzel</option>
                  <option value="DOUBLES">Doppel</option>
                </select>
              </div>
              <div className="field full">
                <label>Anzahl Tische</label>
                <NumberChoice
                  ariaLabel="Anzahl Tische"
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
          </section>
        )}

        {step === 2 && (
          <section className="participant-step">
            <div className="section-head compact-head">
              <div>
                <h2>Teilnehmer eintragen</h2>
                <p className="muted">
                  {discipline === 'SINGLES'
                    ? `${participantCount} Einzelspieler gespeichert.`
                    : `${participantCount} Doppel gespeichert.`}
                </p>
              </div>
            </div>

            <div className="participant-entry-layout">
              <div className="participant-editor">
                <div className="participant-editor-head">
                  <div>
                    <span className="badge">{editingParticipantId ? 'Bearbeiten' : 'Neuer Eintrag'}</span>
                    <h3>{discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} erfassen</h3>
                  </div>
                  {editingParticipantId && (
                    <button className="btn" type="button" onClick={resetParticipantEditor}>Abbrechen</button>
                  )}
                </div>

                <div className="participant-mask">
                  <div className="field">
                    <label htmlFor="participant-first">{discipline === 'DOUBLES' ? 'Spieler 1 · Vorname' : 'Vorname'}</label>
                    <input
                      id="participant-first"
                      className={participantErrors.firstName ? 'input-error' : ''}
                      value={participantForm.firstName}
                      onChange={(event) => updateParticipantForm('firstName', event.target.value)}
                      aria-invalid={Boolean(participantErrors.firstName)}
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="participant-last">{discipline === 'DOUBLES' ? 'Spieler 1 · Nachname' : 'Nachname'}</label>
                    <input
                      id="participant-last"
                      className={participantErrors.lastName ? 'input-error' : ''}
                      value={participantForm.lastName}
                      onChange={(event) => updateParticipantForm('lastName', event.target.value)}
                      aria-invalid={Boolean(participantErrors.lastName)}
                    />
                  </div>
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
                    {editingParticipantId ? 'Änderungen speichern' : discipline === 'SINGLES' ? 'Spieler hinzufügen' : 'Doppel hinzufügen'}
                  </button>
                  <div className="participant-validation" aria-live="polite">
                    {participantErrorMessages.map((message) => (
                      <span className="field-error" key={message}>{message}</span>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="participant-roster" aria-label="Gespeicherte Teilnehmer">
                <div className="participant-roster-head">
                  <div>
                    <h3>Teilnehmerliste</h3>
                    <span className="muted">{participantCount} gespeichert</span>
                  </div>
                  <span className="badge">{participantCount}</span>
                </div>

                <div className="participant-roster-list">
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
            </div>

            {incompleteSavedParticipants > 0 && (
              <div className="callout">{incompleteSavedParticipants} gespeicherte Einträge müssen nach der Änderung der Disziplin noch ergänzt werden.</div>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <h2>Spieldaten</h2>
            <p className="muted">Die gewünschte Mindestanzahl beeinflusst die Formatempfehlung. Best-of wird anschließend in den Phasen festgelegt.</p>
            <div className="spieldaten-layout">
              <div className="field">
                <label>Gewünschte Mindestspiele pro Teilnehmer</label>
                <NumberChoice
                  ariaLabel="Gewünschte Mindestspiele pro Teilnehmer"
                  value={minimumMatches}
                  presets={[1, 2, 3, 4, 5, 6]}
                  custom={customMinimumMatches}
                  customMinimum={7}
                  onPreset={(value) => { setMinimumMatches(value); setCustomMinimumMatches(false); }}
                  onCustom={() => { setCustomMinimumMatches(true); setMinimumMatches((current) => current > 6 ? current : 7); }}
                  onCustomValue={setMinimumMatches}
                />
              </div>
              <div className="summary-box">
                <strong>{participantCount}</strong>
                <span>{discipline === 'SINGLES' ? 'Teilnehmer' : 'Doppel'}</span>
                <strong>{tables}</strong>
                <span>Tische</span>
              </div>
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h2>Turnierform auswählen</h2>
            <p className="muted">Vorschläge sind optional. Du kannst eine Vorlage übernehmen oder in Schritt 5 deine Phasen vollständig selbst zusammenstellen.</p>

            <div className="format-step-layout">
              <div className="recommendation-list">
                {recommendations.length === 0 && (
                  <div className="callout">Mit den aktuell erlaubten Systemen gibt es keinen automatischen Vorschlag. Du kannst trotzdem weitergehen und Phasen manuell anlegen.</div>
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
                  </button>
                ))}
              </div>

              <aside className="format-settings-panel">
                <div className="format-settings-head">
                  <h3>Vorgaben für Vorschläge</h3>
                  <p className="muted">Diese Grenzen beeinflussen nur die Empfehlung. In Schritt 5 kannst du sie noch ändern.</p>
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

        {step === 5 && (
          <section>
            <h2>Phasen konfigurieren</h2>
            <p className="muted">Die Empfehlung ist nur eine Vorlage. Phasen können ergänzt, entfernt, verschoben und unabhängig konfiguriert werden.</p>

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
                {tournamentSystemOptions
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
                  const knockoutRounds = phase.type === 'KNOCKOUT' ? knockoutRoundLabels(phase.entrantCount) : [];
                  return (
                    <article className="phase-config phase-config-expanded" key={phase.id}>
                      <div className="phase-config-head">
                        <div>
                          <span className="badge">Phase {index + 1}</span>
                          <h3>{phase.label}</h3>
                          <p className="muted">{stageLabel(phase.type)}</p>
                        </div>
                        <div className="phase-order-actions">
                          <button className="btn small" type="button" disabled={index === 0} onClick={() => movePhase(index, -1)} aria-label="Phase nach oben">↑</button>
                          <button className="btn small" type="button" disabled={index === phaseDrafts.length - 1} onClick={() => movePhase(index, 1)} aria-label="Phase nach unten">↓</button>
                          <button className="btn small" type="button" onClick={() => removePhase(phase.id)}>Entfernen</button>
                        </div>
                      </div>

                      <div className="phase-settings-grid">
                        {phase.type === 'GROUPS' && (
                          <div className="field">
                            <label htmlFor={`groups-${phase.id}`}>Anzahl Gruppen</label>
                            <input
                              id={`groups-${phase.id}`}
                              type="number"
                              min="2"
                              max={Math.max(2, Math.floor(participantCount / 2))}
                              value={phase.groupCount}
                              onChange={(event) => updatePhase(phase.id, { groupCount: Math.max(2, Number(event.target.value)) })}
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

                        {(phase.type === 'KNOCKOUT' || phase.type === 'DOUBLE_ELIMINATION') && (
                          <div className="field">
                            <label htmlFor={`entrants-${phase.id}`}>Teilnehmer in dieser Phase</label>
                            <input
                              id={`entrants-${phase.id}`}
                              type="number"
                              min="2"
                              max={Math.max(2, participantCount)}
                              value={phase.entrantCount}
                              onChange={(event) => {
                                const next = Math.max(2, Number(event.target.value));
                                if (phase.type === 'KNOCKOUT') updateKnockoutEntrants(phase, next);
                                else updatePhase(phase.id, { entrantCount: Math.min(participantCount, next) });
                              }}
                            />
                          </div>
                        )}

                        {phase.type !== 'KNOCKOUT' && (
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

                      {phase.type === 'KNOCKOUT' && (
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

            <div className="creation-summary">
              <h3>Zusammenfassung</h3>
              <dl>
                <div><dt>Turnier</dt><dd>{name}</dd></div>
                <div><dt>Disziplin</dt><dd>{discipline === 'SINGLES' ? 'Einzel' : 'Doppel'}</dd></div>
                <div><dt>Teilnehmer</dt><dd>{participantCount}</dd></div>
                <div><dt>Tische</dt><dd>{tables}</dd></div>
                <div><dt>Mindestspiele</dt><dd>{minimumMatches}</dd></div>
                <div><dt>Phasen</dt><dd>{phaseSequenceLabel}</dd></div>
              </dl>
            </div>
          </section>
        )}

        <footer className="wizard-actions">
          <button className="btn" type="button" onClick={goBack} disabled={step === 1}>Zurück</button>
          <div className="wizard-next-group">
            {step === 2 && !participantsValid && (
              <span className="wizard-validation-message">
                {incompleteSavedParticipants > 0
                  ? 'Alle gespeicherten Teilnehmer müssen vollständig sein.'
                  : `Mindestens 2 ${discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} für ein Turnier.`}
              </span>
            )}
            {step === 4 && <span className="muted wizard-optional-note">Auswahl einer Empfehlung ist optional.</span>}
            {step < 5 ? (
              <button className="btn primary" type="button" onClick={goNext} disabled={!canContinue}>Weiter</button>
            ) : (
              <button className="btn primary" type="submit" disabled={phaseDrafts.length === 0}>Turnier erstellen</button>
            )}
          </div>
        </footer>
      </form>
    </>
  );
}
