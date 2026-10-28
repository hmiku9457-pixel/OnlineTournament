import { useState, type DragEvent } from 'react';
import type { DemoTournament } from '@/data/demoTournaments';
import type { StageType } from '@/domain/types';
import {
  bestOfOptions, formatGroupDistribution, hasValidBreakStageOrder,
  hasValidTerminalStageOrder, knockoutRoundLabels, recommendedSwissRounds,
  stageLabel, tournamentSystemOptions,
} from '@/domain/tournamentCreation';
import {
  createPrestartPhase, estimatePrestartDuration, initialPrestartPhases,
  isKnockoutPhase, normalizePrestartPhases, recommendedPrestartGroupCount,
  validatePrestartPhases, type PrestartPhaseDraft,
} from '@/domain/prestartPhasePlanning';
import { sportScoring } from '@/domain/sportScoring';
import { updatePrestartTournamentPhases } from '@/services/mockTournamentStore';

interface Props {
  tournament: DemoTournament;
  activeParticipants: number;
  withdrawnParticipants: number;
  onSaved: () => void;
  onCancel: () => void;
}

const types: Array<{ type: StageType; name: string }> = [
  ...tournamentSystemOptions.map((item) => ({ type: item.stageType, name: item.label })),
  { type: 'BREAK', name: 'Pause / Spieltagsende' },
];

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} Std. ${rest} Min.` : `${rest} Min.`;
}

/** Only mounted after the user explicitly selects edit; local draft cannot
 * modify the running tournament until confirmed and revalidated at save.
 */
export function PrestartPhaseEditor({ tournament, activeParticipants, withdrawnParticipants, onSaved, onCancel }: Props) {
  const [drafts, setDrafts] = useState(() =>
    normalizePrestartPhases(initialPrestartPhases(tournament), activeParticipants));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saveError, setSaveError] = useState('');
  const scoreSport = sportScoring(tournament.sport).mode === 'score';
  const errors = validatePrestartPhases(drafts, activeParticipants);
  const estimated = estimatePrestartDuration(tournament, drafts);

  function change(next: PrestartPhaseDraft[]) {
    setDrafts(normalizePrestartPhases(next, activeParticipants));
    setConfirmSave(false);
    setSaveError('');
  }

  function edit(id: string, patch: Partial<PrestartPhaseDraft>) {
    change(drafts.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function move(from: number, to: number) {
    if (from < 0 || from >= drafts.length || to < 0 || to >= drafts.length || from === to) return;
    const candidate = [...drafts];
    const [item] = candidate.splice(from, 1);
    candidate.splice(to, 0, item);
    const order = candidate.map((stage) => stage.type);
    if (!hasValidTerminalStageOrder(order) || !hasValidBreakStageOrder(order)) return;
    change(candidate);
  }

  function insert(index: number, type: StageType) {
    const next = drafts[index];
    const previousPlaying = [...drafts.slice(0, index)].reverse().find((phase) => phase.type !== 'BREAK');
    const players = previousPlaying?.entrantCount ?? activeParticipants;
    const stage = createPrestartPhase(type, players, next);
    const candidate = [...drafts.slice(0, index), stage, ...drafts.slice(index)];
    const kinds = candidate.map((phase) => phase.type);
    if (!hasValidTerminalStageOrder(kinds) || !hasValidBreakStageOrder(kinds)) return;
    change(candidate);
    setExpanded(stage.id);
    setInsertAfter(null);
  }

  function onDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragged(id);
  }
  function onDrop(event: DragEvent<HTMLDivElement>, to: number) {
    if (!dragged) return;
    event.preventDefault();
    move(drafts.findIndex((entry) => entry.id === dragged), to);
    setDragged(null);
  }

  function save() {
    if (errors.length) return;
    if (!confirmSave) {
      setConfirmSave(true);
      return;
    }
    const result = updatePrestartTournamentPhases(tournament.id, drafts);
    if (!result.ok) {
      setSaveError(result.error ?? 'Die Phasen konnten nicht gespeichert werden.');
      setConfirmSave(false);
      return;
    }
    onSaved();
  }

  return (
    <section className="prestart-editor card" aria-label="Phasenplanung vor Turnierstart bearbeiten">
      <div className="prestart-editor-header">
        <div>
          <h2>Phasen vor Turnierstart bearbeiten</h2>
          <p className="muted">Große Absagen oder Nachmeldungen? Passe die Turnierform an die tatsächlich anwesenden Teilnehmer an.</p>
        </div>
        <button className="btn small" type="button" onClick={onCancel}>Schließen</button>
      </div>
      <div className="prestart-editor-metrics">
        <div><span>Aktive Teilnehmer</span><strong>{activeParticipants}</strong></div>
        <div><span>Vor Start zurückgezogen</span><strong>{withdrawnParticipants}</strong></div>
        <div><span>Phasen</span><strong>{drafts.length}</strong></div>
        <div><span>Neue Zeitprognose</span><strong>{durationLabel(estimated)}</strong></div>
      </div>
      <p className="prestart-editor-explanation">
        Die erste Spielphase übernimmt automatisch alle {activeParticipants} aktiven Teilnehmer. Bei folgenden Phasen kannst du Qualifikationsplätze festlegen.
        Gruppen und Schweizer Runden werden geprüft und erhalten passende Empfehlungen.
      </p>
      <div className="prestart-editor-list">
        {drafts.length > 0 && (
          <div className="prestart-editor-insert prestart-editor-before-first">
            <button className="prestart-editor-insert-trigger" type="button"
              aria-expanded={insertAfter === -1}
              onClick={() => setInsertAfter(insertAfter === -1 ? null : -1)}>+ Phase vor der ersten Phase hinzufügen</button>
            {insertAfter === -1 && <div className="prestart-editor-insert-choices">
              {types.filter((option) => option.type !== 'BREAK' && !isKnockoutPhase(option.type)).map((option) => (
                <button className="btn small" type="button" key={option.type}
                  disabled={option.type === 'GROUPS' && activeParticipants < 4}
                  onClick={() => insert(0, option.type)}>{option.name}</button>
              ))}
              <button className="btn small" type="button" onClick={() => setInsertAfter(null)}>Abbrechen</button>
            </div>}
          </div>
        )}
        {drafts.map((phase, index) => {
          const isOpen = expanded === phase.id;
          const available = index === 0 ? activeParticipants : drafts.slice(0, index).reverse().find((s) => s.type !== 'BREAK')?.entrantCount ?? activeParticipants;
          const nextPlaying = drafts.slice(index + 1).find((s) => s.type !== 'BREAK');
          const suggestedGroups = phase.type === 'GROUPS' ? recommendedPrestartGroupCount(drafts, index) : 0;
          const suggestedRounds = phase.type === 'SWISS' ? recommendedSwissRounds(phase.entrantCount) : 0;
          const fixed = isKnockoutPhase(phase.type);
          const canMove = (to: number) => {
            if (fixed || to < 0 || to >= drafts.length) return false;
            const copy = [...drafts];
            const [entry] = copy.splice(index, 1);
            copy.splice(to, 0, entry);
            return hasValidTerminalStageOrder(copy.map((s) => s.type)) && hasValidBreakStageOrder(copy.map((s) => s.type));
          };
          return (
            <div className="prestart-editor-item" key={phase.id}>
              <div className="prestart-editor-row"
                onDragOver={(event) => {
                  if (!dragged) return;
                  const from = drafts.findIndex((entry) => entry.id === dragged);
                  if (from < 0 || from === index) return;
                  const copy = [...drafts];
                  const [entry] = copy.splice(from, 1);
                  copy.splice(index, 0, entry);
                  if (hasValidTerminalStageOrder(copy.map((s) => s.type)) && hasValidBreakStageOrder(copy.map((s) => s.type))) event.preventDefault();
                }}
                onDrop={(event) => onDrop(event, index)}>
                {fixed ? (
                  <span className="phase-drag-fixed" title="Die K.-o.-Phase bleibt am Ende." aria-label="K.-o.-Phase fixiert">🔒</span>
                ) : (
                  <button type="button" className="phase-drag-handle" draggable
                    title="Nur an diesem Griff verschieben"
                    aria-label={`Phase ${index + 1} verschieben`}
                    onDragStart={(event) => onDragStart(event, phase.id)}
                    onDragEnd={() => setDragged(null)}>⠿</button>
                )}
                <article className={`prestart-editor-phase ${isOpen ? 'is-open' : ''}`}>
                  <div className="prestart-editor-phase-head">
                    <button type="button" className="prestart-editor-toggle" aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : phase.id)}>
                      <span className="prestart-editor-number">{index + 1}</span>
                      <span className="prestart-editor-title"><strong>{phase.label || stageLabel(phase.type)}</strong>
                        <small>{phase.type === 'BREAK'
                          ? phase.breakKind === 'overnight' ? `Spieltagsende · morgen ${phase.nextDayStart} Uhr` : `${phase.breakMinutes} Minuten`
                          : `${phase.entrantCount} Teilnehmer${phase.type === 'GROUPS' ? ` · ${phase.groupCount} Gruppen` : ''}${phase.type === 'SWISS' ? ` · ${phase.swissRounds} Runden` : ''}`}
                        </small>
                      </span>
                      <span aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                    </button>
                    <div className="prestart-editor-controls">
                      {!fixed && <>
                        <button type="button" className="btn small" onClick={() => move(index, index - 1)} disabled={!canMove(index - 1)} aria-label="Phase nach oben">↑</button>
                        <button type="button" className="btn small" onClick={() => move(index, index + 1)} disabled={!canMove(index + 1)} aria-label="Phase nach unten">↓</button>
                      </>}
                      <button type="button" className="btn small" onClick={() => {
                        change(drafts.filter((entry) => entry.id !== phase.id));
                        setExpanded(null);
                      }}>Entfernen</button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="prestart-editor-fields">
                      <label>Phasentyp
                        <select value={phase.type} onChange={(event) => {
                          const type = event.target.value as StageType;
                          if (type === 'BREAK' && (index === 0 || index === drafts.length - 1)) return;
                          const draft = createPrestartPhase(type, available, nextPlaying);
                          draft.id = phase.id;
                          draft.label = stageLabel(type);
                          change(drafts.map((entry) => entry.id === phase.id ? draft : entry));
                        }}>
                          {types.map((option) => <option key={option.type} value={option.type}
                            disabled={(isKnockoutPhase(option.type) && index !== drafts.length - 1)
                              || (option.type === 'BREAK' && (index === 0 || index === drafts.length - 1))}>
                            {option.name}
                          </option>)}
                        </select>
                      </label>
                      <label>Bezeichnung
                        <input value={phase.label} maxLength={80} onChange={(event) => edit(phase.id, { label: event.target.value })} />
                      </label>
                      {phase.type === 'BREAK' ? <>
                        <label>Art der Pause
                          <select value={phase.breakKind} onChange={(event) => edit(phase.id, { breakKind: event.target.value as 'minutes' | 'overnight' })}>
                            <option value="minutes">Pause in Minuten</option><option value="overnight">Spieltagsende</option>
                          </select>
                        </label>
                        <label>{phase.breakKind === 'overnight' ? 'Start am Folgetag' : 'Minuten'}
                          <input type={phase.breakKind === 'overnight' ? 'time' : 'number'}
                            min={phase.breakKind === 'minutes' ? 1 : undefined}
                            max={phase.breakKind === 'minutes' ? 1440 : undefined}
                            value={phase.breakKind === 'overnight' ? phase.nextDayStart : phase.breakMinutes}
                            onChange={(event) => edit(phase.id, phase.breakKind === 'overnight'
                              ? { nextDayStart: event.target.value } : { breakMinutes: Number(event.target.value) })} />
                        </label>
                        <label className="prestart-editor-wide">Hinweis für Spieler (optional)
                          <textarea rows={2} maxLength={600} value={phase.note}
                            onChange={(event) => edit(phase.id, { note: event.target.value })} />
                        </label>
                      </> : <>
                        {index > 0 && <label>Weiterkommende Teilnehmer
                          <input type="number" min={2} max={available} value={phase.entrantCount}
                            onChange={(event) => edit(phase.id, { entrantCount: Number(event.target.value) })}/>
                        </label>}
                        {phase.type === 'GROUPS' && <label>Anzahl Gruppen
                          <input type="number" min={2} max={Math.floor(phase.entrantCount / 2)}
                            value={phase.groupCount} onChange={(event) => edit(phase.id, { groupCount: Number(event.target.value) })}/>
                        </label>}
                        {phase.type === 'SWISS' && <label>Schweizer Runden
                          <input type="number" min={1} max={Math.min(30, phase.entrantCount - 1)}
                            value={phase.swissRounds} onChange={(event) => edit(phase.id, { swissRounds: Number(event.target.value) })}/>
                        </label>}
                        {!scoreSport && <label>Best-of
                          <select value={phase.bestOf} onChange={(event) => edit(phase.id, { bestOf: Number(event.target.value) })}>
                            {bestOfOptions.map((value) => <option value={value} key={value}>{value}</option>)}
                          </select>
                        </label>}
                        {phase.type === 'KNOCKOUT' && !scoreSport && (
                          <div className="prestart-editor-wide">
                            <strong>Best-of je K.-o.-Runde</strong>
                            <div className="prestart-editor-rounds">
                              {knockoutRoundLabels(phase.entrantCount).map((round, roundIndex) =>
                                <label key={round}>{round}
                                  <select value={phase.knockoutBestOf[roundIndex] ?? phase.bestOf} onChange={(event) => {
                                    const values = [...phase.knockoutBestOf];
                                    values[roundIndex] = Number(event.target.value);
                                    edit(phase.id, { knockoutBestOf: values });
                                  }}>
                                    {bestOfOptions.map((value) => <option value={value} key={value}>Best-of-{value}</option>)}
                                  </select>
                                </label>)}
                            </div>
                          </div>
                        )}
                        {phase.type === 'GROUPS' && <div className="prestart-editor-suggestion prestart-editor-wide">
                          <span><strong>Empfehlung: {suggestedGroups} Gruppen</strong>
                            <small>{formatGroupDistribution(phase.entrantCount, suggestedGroups)}
                              {nextPlaying && nextPlaying.entrantCount < phase.entrantCount ? ` · ${nextPlaying.entrantCount} qualifizieren sich` : ''}
                            </small>
                          </span>
                          <button type="button" className="btn small" disabled={phase.groupCount === suggestedGroups}
                            onClick={() => edit(phase.id, { groupCount: suggestedGroups })}>Empfehlung übernehmen</button>
                        </div>}
                        {phase.type === 'SWISS' && <div className="prestart-editor-suggestion prestart-editor-wide">
                          <span><strong>Empfehlung: {suggestedRounds} Runden</strong>
                            <small>Für {phase.entrantCount} aktive Teilnehmer.</small>
                          </span>
                          <button type="button" className="btn small" disabled={phase.swissRounds === suggestedRounds}
                            onClick={() => edit(phase.id, { swissRounds: suggestedRounds })}>Empfehlung übernehmen</button>
                        </div>}
                      </>}
                    </div>
                  )}
                </article>
              </div>
              {(!fixed && index < drafts.length - 1) && <div className="prestart-editor-insert">
                <button className="prestart-editor-insert-trigger" type="button"
                  aria-expanded={insertAfter === index}
                  onClick={() => setInsertAfter(insertAfter === index ? null : index)}>+ weitere Phase hier einfügen</button>
                {insertAfter === index && <div className="prestart-editor-insert-choices">
                  {types.filter((option) => !isKnockoutPhase(option.type)).map((option) =>
                    <button type="button" className="btn small" key={option.type} disabled={
                      option.type === 'BREAK' && (phase.type === 'BREAK' || drafts[index + 1]?.type === 'BREAK')
                    } onClick={() => insert(index + 1, option.type)}>{option.name}</button>)}
                  <button className="btn small" type="button" onClick={() => setInsertAfter(null)}>Abbrechen</button>
                </div>}
              </div>}
            </div>
          );
        })}
      </div>
      {!drafts.some((phase) => isKnockoutPhase(phase.type)) && drafts.length > 0 &&
        <div className="prestart-editor-insert">
          <button type="button" className="prestart-editor-insert-trigger"
            onClick={() => setInsertAfter(insertAfter === drafts.length ? null : drafts.length)}>+ nächste Phase hinzufügen</button>
          {insertAfter === drafts.length && <div className="prestart-editor-insert-choices">
            {types.filter((option) => option.type !== 'BREAK').map((option) =>
              <button className="btn small" type="button" key={option.type} onClick={() => insert(drafts.length, option.type)}>{option.name}</button>)}
          </div>}
        </div>}
      {errors.length > 0 && <div className="prestart-editor-errors" role="alert">
        <strong>Diese Angaben müssen vor dem Speichern korrigiert werden:</strong>
        <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </div>}
      <div className="prestart-editor-footer">
        <div className="prestart-editor-warning">
          <strong>Wichtig: Vorstart-Auslosungen werden zurückgesetzt.</strong>
          <span>Teilnehmer, Codes und Rückzüge bleiben erhalten. Kontrolliere nach dem Speichern die neue Auslosung, bevor du das Turnier startest.</span>
        </div>
        {saveError && <p className="prestart-editor-save-error" role="alert">{saveError}</p>}
        {confirmSave && <p className="prestart-editor-confirm">Neue Phasenplanung übernehmen und bisherige Auslosungen verwerfen?</p>}
        <div className="prestart-editor-actions">
          <button type="button" className="btn" onClick={confirmSave ? () => setConfirmSave(false) : onCancel}>
            {confirmSave ? 'Zurück zur Bearbeitung' : 'Abbrechen'}
          </button>
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={save}>
            {confirmSave ? 'Ja, Phasen und Auslosung aktualisieren' : 'Änderungen prüfen und speichern'}
          </button>
        </div>
      </div>
    </section>
  );
}
