import { useEffect, useMemo, useState } from 'react';
import {
  bestOfOptions,
  phasesForFormat,
  type SupportedFormatId,
} from '@/domain/tournamentCreation';
import type { Discipline } from '@/domain/types';
import { recommendTournamentFormats } from '@/engine/recommendations';

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

const stepLabels = ['Grunddaten', 'Teilnehmer', 'Spieldaten', 'Turnierform', 'Phasen'];
const formatLabels: Record<SupportedFormatId, string> = {
  'round-robin': 'Jeder gegen jeden',
  'groups-ko': 'Gruppenphase + K.-o.',
  'swiss-ko': 'Schweizer System + K.-o.',
  'single-ko': 'Einfaches K.-o.',
};

const initialEnabledFormats: Record<SupportedFormatId, boolean> = {
  'round-robin': true,
  'groups-ko': true,
  'swiss-ko': true,
  'single-ko': true,
};

let participantSequence = 0;

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

function validateParticipant(participant: ParticipantFields, discipline: Discipline): ParticipantErrors {
  const errors: ParticipantErrors = {};
  if (!participant.firstName.trim()) errors.firstName = 'Vorname fehlt.';
  if (!participant.lastName.trim()) errors.lastName = 'Nachname fehlt.';
  if (discipline === 'DOUBLES') {
    if (!participant.partnerFirstName.trim()) errors.partnerFirstName = 'Vorname von Spieler 2 fehlt.';
    if (!participant.partnerLastName.trim()) errors.partnerLastName = 'Nachname von Spieler 2 fehlt.';
  }
  return errors;
}

function participantDisplayName(participant: ParticipantFields, discipline: Discipline): string {
  const firstPlayer = `${participant.firstName.trim()} ${participant.lastName.trim()}`.trim();
  if (discipline === 'SINGLES') return firstPlayer;
  const secondPlayer = `${participant.partnerFirstName.trim()} ${participant.partnerLastName.trim()}`.trim();
  return `${firstPlayer} / ${secondPlayer}`;
}

export function CreateTournamentPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('table_tennis');
  const [discipline, setDiscipline] = useState<Discipline>('SINGLES');
  const [tables, setTables] = useState(8);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [participantForm, setParticipantForm] = useState<ParticipantFields>(emptyParticipantFields());
  const [participantErrors, setParticipantErrors] = useState<ParticipantErrors>({});
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [minimumMatches, setMinimumMatches] = useState(4);
  const [selectedFormat, setSelectedFormat] = useState<SupportedFormatId | null>(null);
  const [phaseBestOf, setPhaseBestOf] = useState<Record<string, number>>({});
  const [enabledFormats, setEnabledFormats] = useState<Record<SupportedFormatId, boolean>>(initialEnabledFormats);
  const [maxGroups, setMaxGroups] = useState<number | null>(null);
  const [maxSwissRounds, setMaxSwissRounds] = useState<number | null>(null);
  const [knockoutQualifierCount, setKnockoutQualifierCount] = useState<number | null>(null);

  const participantCount = participants.filter((participant) => participantIsComplete(participant, discipline)).length;
  const incompleteSavedParticipants = participants.length - participantCount;
  const participantFormHasContent = Object.values(participantForm).some((value) => value.trim().length > 0);
  const participantsValid = participants.length >= 2 && incompleteSavedParticipants === 0;

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
        enabledFormats,
        maxGroups: effectiveMaxGroups,
        maxSwissRounds: effectiveMaxSwissRounds,
        knockoutQualifierCount: effectiveKnockoutQualifierCount,
      },
    ),
    [
      participantCount,
      tables,
      minimumMatches,
      enabledFormats,
      effectiveMaxGroups,
      effectiveMaxSwissRounds,
      effectiveKnockoutQualifierCount,
    ],
  );

  const phases = useMemo(() => (selectedFormat ? phasesForFormat(selectedFormat) : []), [selectedFormat]);
  const selectedRecommendation = useMemo(
    () => recommendations.find((recommendation) => recommendation.id === selectedFormat),
    [recommendations, selectedFormat],
  );

  useEffect(() => {
    if (selectedFormat && !recommendations.some((item) => item.id === selectedFormat)) {
      setSelectedFormat(null);
    }
  }, [recommendations, selectedFormat]);

  useEffect(() => {
    if (!selectedFormat) {
      setPhaseBestOf({});
      return;
    }

    const next: Record<string, number> = {};
    for (const phase of phasesForFormat(selectedFormat)) {
      next[phase.key] = phase.defaultBestOf;
    }
    setPhaseBestOf(next);
  }, [selectedFormat]);

  const canContinue =
    (step === 1 && Boolean(name.trim()) && tables >= 1) ||
    (step === 2 && participantsValid && !participantFormHasContent && !editingParticipantId) ||
    (step === 3 && minimumMatches >= 1) ||
    (step === 4 && Boolean(selectedFormat)) ||
    step === 5;

  function updateParticipantForm(field: ParticipantField, value: string) {
    setParticipantForm((current) => ({ ...current, [field]: value }));
    setParticipantErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function resetParticipantEditor() {
    setParticipantForm(emptyParticipantFields());
    setParticipantErrors({});
    setEditingParticipantId(null);
  }

  function saveParticipant() {
    const errors = validateParticipant(participantForm, discipline);
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

  function toggleFormat(formatId: SupportedFormatId) {
    setEnabledFormats((current) => ({ ...current, [formatId]: !current[formatId] }));
  }

  function goNext() {
    if (!canContinue || step === 5) return;
    setStep((step + 1) as WizardStep);
  }

  function goBack() {
    if (step === 1) return;
    setStep((step - 1) as WizardStep);
  }

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
              <div className="field">
                <label htmlFor="tables">Tische</label>
                <input id="tables" type="number" min="1" value={tables} onChange={(event) => setTables(Math.max(1, Number(event.target.value)))} />
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
                    {participantErrors.firstName && <span className="field-error">{participantErrors.firstName}</span>}
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
                    {participantErrors.lastName && <span className="field-error">{participantErrors.lastName}</span>}
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
                        {participantErrors.partnerFirstName && <span className="field-error">{participantErrors.partnerFirstName}</span>}
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
                        {participantErrors.partnerLastName && <span className="field-error">{participantErrors.partnerLastName}</span>}
                      </div>
                    </>
                  )}
                </div>

                <div className="participant-editor-actions">
                  <button className="btn primary" type="button" onClick={saveParticipant}>
                    {editingParticipantId ? 'Änderungen speichern' : discipline === 'SINGLES' ? 'Spieler hinzufügen' : 'Doppel hinzufügen'}
                  </button>
                  <span className="muted">
                    {participantFormHasContent || editingParticipantId
                      ? 'Aktuelle Eingabe zuerst speichern oder abbrechen.'
                      : `Mindestens 2 ${discipline === 'SINGLES' ? 'Spieler' : 'Doppel'} für ein Turnier.`}
                  </span>
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
            <p className="muted">Die gewünschte Mindestanzahl beeinflusst die Formatempfehlung. Best-of wird erst anschließend pro Phase festgelegt.</p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="minimumMatches">Gewünschte Mindestspiele pro Teilnehmer</label>
                <input id="minimumMatches" type="number" min="1" value={minimumMatches} onChange={(event) => setMinimumMatches(Math.max(1, Number(event.target.value)))} />
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
            <p className="muted">Die Vorschläge reagieren sofort auf die Vorgaben rechts. Systeme, die du deaktivierst, werden nicht mehr vorgeschlagen.</p>

            <div className="format-step-layout">
              <div className="recommendation-list">
                {recommendations.length === 0 && (
                  <div className="callout">Aktuell ist kein Turniersystem aktiviert. Aktiviere rechts mindestens ein System.</div>
                )}
                {recommendations.map((item, index) => (
                  <button
                    className={`card recommendation recommendation-select ${selectedFormat === item.id ? 'selected' : ''} ${index === 0 ? 'best' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedFormat(item.id)}
                  >
                    <div className="recommendation-head">
                      <span className="badge">{index === 0 ? 'Empfohlen' : 'Alternative'}</span>
                      {selectedFormat === item.id && <span className="badge selected-badge">Ausgewählt</span>}
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
                  <p className="muted">Grenzen und erlaubte Systeme festlegen.</p>
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
                      disabled={!enabledFormats['groups-ko']}
                    />
                    <span className="field-hint">Gruppenphase wird mit höchstens dieser Anzahl geplant.</span>
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
                      disabled={!enabledFormats['swiss-ko']}
                    />
                    <span className="field-hint">Die Empfehlung überschreitet diese Rundenzahl nicht.</span>
                  </div>

                  <div className="field">
                    <label htmlFor="knockout-qualifiers">Qualifizierte für K.-o.</label>
                    <input
                      id="knockout-qualifiers"
                      type="number"
                      min="2"
                      max={Math.max(2, participantCount)}
                      value={effectiveKnockoutQualifierCount}
                      onChange={(event) => setKnockoutQualifierCount(Math.max(2, Number(event.target.value)))}
                      disabled={!enabledFormats['groups-ko'] && !enabledFormats['swiss-ko']}
                    />
                    <span className="field-hint">Anzahl der bestplatzierten Teilnehmer, die nach Gruppen oder Schweizer System in die K.-o.-Phase einziehen.</span>
                  </div>
                </div>

                <fieldset className="format-toggle-group">
                  <legend>Erlaubte Turniersysteme</legend>
                  {(Object.keys(formatLabels) as SupportedFormatId[]).map((formatId) => (
                    <label className="format-toggle" key={formatId}>
                      <input
                        type="checkbox"
                        checked={enabledFormats[formatId]}
                        onChange={() => toggleFormat(formatId)}
                      />
                      <span>{formatLabels[formatId]}</span>
                    </label>
                  ))}
                </fieldset>
              </aside>
            </div>
          </section>
        )}

        {step === 5 && (
          <section>
            <h2>Best-of pro Phase</h2>
            <p className="muted">Jede Phase erhält ihre eigene Satzlänge. Best-of-1 ist besonders für kompakte Gruppenphasen verfügbar.</p>
            {selectedRecommendation && (
              <div className="selected-format-summary">
                <span className="badge">Gewählte Turnierform</span>
                <strong>{selectedRecommendation.label}</strong>
              </div>
            )}
            <div className="phase-config-list">
              {phases.map((phase, index) => (
                <article className="phase-config" key={phase.key}>
                  <div>
                    <span className="badge">Phase {index + 1}</span>
                    <h3>{phase.label}</h3>
                    <p className="muted">{phase.type}</p>
                  </div>
                  <div className="field phase-bestof">
                    <label htmlFor={`best-of-${phase.key}`}>Best-of</label>
                    <select
                      id={`best-of-${phase.key}`}
                      value={phaseBestOf[phase.key] ?? phase.defaultBestOf}
                      onChange={(event) => setPhaseBestOf((current) => ({ ...current, [phase.key]: Number(event.target.value) }))}
                    >
                      {bestOfOptions.map((bestOf) => <option key={bestOf} value={bestOf}>Best-of-{bestOf}</option>)}
                    </select>
                  </div>
                </article>
              ))}
            </div>

            <div className="creation-summary">
              <h3>Zusammenfassung</h3>
              <dl>
                <div><dt>Turnier</dt><dd>{name}</dd></div>
                <div><dt>Disziplin</dt><dd>{discipline === 'SINGLES' ? 'Einzel' : 'Doppel'}</dd></div>
                <div><dt>Teilnehmer</dt><dd>{participantCount}</dd></div>
                <div><dt>Tische</dt><dd>{tables}</dd></div>
                <div><dt>Mindestspiele</dt><dd>{minimumMatches}</dd></div>
                <div><dt>Turnierform</dt><dd>{selectedRecommendation?.label ?? '—'}</dd></div>
              </dl>
            </div>
          </section>
        )}

        <footer className="wizard-actions">
          <button className="btn" type="button" onClick={goBack} disabled={step === 1}>Zurück</button>
          {step < 5 ? (
            <button className="btn primary" type="button" onClick={goNext} disabled={!canContinue}>Weiter</button>
          ) : (
            <button className="btn primary" type="submit">Turnier erstellen</button>
          )}
        </footer>
      </form>
    </>
  );
}
