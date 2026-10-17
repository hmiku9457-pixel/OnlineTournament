import { useEffect, useMemo, useState } from 'react';
import { bestOfOptions, phasesForFormat } from '@/domain/tournamentCreation';
import type { Discipline } from '@/domain/types';
import { recommendTournamentFormats } from '@/engine/recommendations';

type WizardStep = 1 | 2 | 3 | 4 | 5;

type ParticipantDraft = {
  id: string;
  firstName: string;
  lastName: string;
  partnerFirstName: string;
  partnerLastName: string;
};

const stepLabels = ['Grunddaten', 'Teilnehmer', 'Spieldaten', 'Turnierform', 'Phasen'];
let participantSequence = 0;

function newParticipant(): ParticipantDraft {
  participantSequence += 1;
  return {
    id: `participant-${participantSequence}`,
    firstName: '',
    lastName: '',
    partnerFirstName: '',
    partnerLastName: '',
  };
}

function participantIsComplete(participant: ParticipantDraft, discipline: Discipline): boolean {
  if (!participant.firstName.trim() || !participant.lastName.trim()) return false;
  if (discipline === 'DOUBLES') {
    return Boolean(participant.partnerFirstName.trim() && participant.partnerLastName.trim());
  }
  return true;
}

export function CreateTournamentPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('table_tennis');
  const [discipline, setDiscipline] = useState<Discipline>('SINGLES');
  const [tables, setTables] = useState(8);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant(), newParticipant()]);
  const [minimumMatches, setMinimumMatches] = useState(4);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [phaseBestOf, setPhaseBestOf] = useState<Record<string, number>>({});

  const participantCount = participants.filter((participant) => participantIsComplete(participant, discipline)).length;
  const participantsValid = participants.length >= 2 && participants.every((participant) => participantIsComplete(participant, discipline));

  const recommendations = useMemo(
    () => recommendTournamentFormats({ playerCount: participantCount, tableCount: tables, minimumMatches }),
    [participantCount, tables, minimumMatches],
  );

  const phases = useMemo(() => (selectedFormat ? phasesForFormat(selectedFormat) : []), [selectedFormat]);

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
    (step === 2 && participantsValid) ||
    (step === 3 && minimumMatches >= 1) ||
    (step === 4 && Boolean(selectedFormat)) ||
    step === 5;

  function updateParticipant(id: string, field: keyof Omit<ParticipantDraft, 'id'>, value: string) {
    setParticipants((current) => current.map((participant) => (
      participant.id === id ? { ...participant, [field]: value } : participant
    )));
  }

  function removeParticipant(id: string) {
    setParticipants((current) => current.filter((participant) => participant.id !== id));
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
          <section>
            <div className="section-head">
              <div>
                <h2>Teilnehmer eintragen</h2>
                <p className="muted">
                  {discipline === 'SINGLES'
                    ? `${participantCount} Einzelspieler vollständig eingetragen.`
                    : `${participantCount} Doppel vollständig eingetragen.`}
                </p>
              </div>
              <button className="btn" type="button" onClick={() => setParticipants((current) => [...current, newParticipant()])}>
                + Teilnehmer
              </button>
            </div>

            <div className="participant-list">
              {participants.map((participant, index) => (
                <article className="participant-row" key={participant.id}>
                  <div className="participant-number">{index + 1}</div>
                  <div className="participant-fields">
                    <div className="field">
                      <label htmlFor={`${participant.id}-first`}>{discipline === 'DOUBLES' ? 'Spieler 1 · Vorname' : 'Vorname'}</label>
                      <input id={`${participant.id}-first`} value={participant.firstName} onChange={(event) => updateParticipant(participant.id, 'firstName', event.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`${participant.id}-last`}>{discipline === 'DOUBLES' ? 'Spieler 1 · Nachname' : 'Nachname'}</label>
                      <input id={`${participant.id}-last`} value={participant.lastName} onChange={(event) => updateParticipant(participant.id, 'lastName', event.target.value)} />
                    </div>
                    {discipline === 'DOUBLES' && (
                      <>
                        <div className="field">
                          <label htmlFor={`${participant.id}-partner-first`}>Spieler 2 · Vorname</label>
                          <input id={`${participant.id}-partner-first`} value={participant.partnerFirstName} onChange={(event) => updateParticipant(participant.id, 'partnerFirstName', event.target.value)} />
                        </div>
                        <div className="field">
                          <label htmlFor={`${participant.id}-partner-last`}>Spieler 2 · Nachname</label>
                          <input id={`${participant.id}-partner-last`} value={participant.partnerLastName} onChange={(event) => updateParticipant(participant.id, 'partnerLastName', event.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                  <button className="btn participant-remove" type="button" disabled={participants.length <= 2} onClick={() => removeParticipant(participant.id)} aria-label={`Teilnehmer ${index + 1} entfernen`}>
                    Entfernen
                  </button>
                </article>
              ))}
            </div>
            {!participantsValid && <div className="callout">Mindestens zwei vollständige {discipline === 'SINGLES' ? 'Teilnehmer' : 'Doppel'} werden benötigt.</div>}
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
            <p className="muted">Die Reihenfolge ist eine Empfehlung anhand von {participantCount} {discipline === 'SINGLES' ? 'Teilnehmern' : 'Doppeln'}, {tables} Tischen und mindestens {minimumMatches} Spielen.</p>
            <div className="recommendation-list">
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
          </section>
        )}

        {step === 5 && (
          <section>
            <h2>Best-of pro Phase</h2>
            <p className="muted">Jede Phase erhält ihre eigene Satzlänge. Best-of-1 ist besonders für kompakte Gruppenphasen verfügbar.</p>
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
