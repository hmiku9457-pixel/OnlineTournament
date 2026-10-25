import { useState } from 'react';
import type { DemoTournament } from '@/data/demoTournaments';
import { MatchSetInput } from '@/components/MatchSetInput';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { SwissBuchholzHelpModal } from '@/components/SwissBuchholzHelpModal';
import { getSwissCutoffPair, type SwissCutoffStatus } from '@/services/mockRuntime';
import { buildSwissStandings, getSwissUnplayedWinWinners } from '@/services/mockCompetitionViews';
import { getSwissCutoffRowIndex } from '@/components/SwissQualificationCutoff';
import { getStageWithdrawalLabel } from '@/services/mockWithdrawals';
import { parseSportSet, sportScoring } from '@/domain/sportScoring';
import { playoffRoundFinished, playoffScores, type PlayoffMode } from '@/domain/swissCutoffPlayoff';

interface Props {
  status: SwissCutoffStatus;
  tournament: DemoTournament;
  onSet: (pointsA: number, pointsB: number) => string | null;
  onLot: (winners: string[]) => string | null;
  onBegin: (kind: PlayoffMode) => string | null;
  onOpenControl?: () => void;
  onReset: () => void;
}

/** Mandatory manual qualification decision with the unchanged Swiss table as context. */
export function SwissCutoffDecisionModal({ status, tournament, onSet, onLot, onBegin, onReset, onOpenControl }: Props) {
  const [chosenMode, setChosenMode] = useState<'SET' | 'LOT' | null>(null);
  const [setValue, setSetValue] = useState('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [showBuchholz, setShowBuchholz] = useState(false);

  const stage = tournament.stages.find((item) => item.id === status.stageId);
  const rules = sportScoring(tournament.sport);
  const scoreSport = rules.mode === 'score';
  const pair = getSwissCutoffPair(status);
  const played = status.decision?.sets ?? [];
  const extraRounds = status.decision?.extraRounds ?? [];
  const lastRound = extraRounds[extraRounds.length - 1];
  const isRoundRunning = Boolean(lastRound && !playoffRoundFinished(lastRound));
  const roundFinishedButTied = Boolean(lastRound && playoffRoundFinished(lastRound));
  const mode = isRoundRunning ? lastRound!.kind : played.length ? 'SET' : chosenMode;
  const multiPlayer = status.tie.players.length > 2;
  const selectedPlayers = new Set(status.tie.players);
  const eliminated = new Set(status.decision?.eliminated ?? []);
  const remaining = status.tie.players.filter((name) => !eliminated.has(name));
  const outcomeType = scoreSport ? 'Entscheidungsspiel' : 'Entscheidungssatz';

  const validNumber = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
  const scored = validNumber(scoreA) && validNumber(scoreB);
  const parsedSet = !scoreSport ? parseSportSet(tournament.sport, 1, 0, setValue) : null;

  function clearInputs() { setSetValue(''); setScoreA(''); setScoreB(''); setError(''); }
  function submitSet() {
    if (!scoreSport && !parsedSet) { setError('Bitte ein gültiges Satzergebnis eintragen.'); return; }
    if (scoreSport && (!scored || Number(scoreA) === Number(scoreB))) {
      setError('Bitte einen eindeutigen Sieger mit gültigen Punktzahlen eintragen.'); return;
    }
    const a = scoreSport ? Number(scoreA) : parsedSet!.sideAScore;
    const b = scoreSport ? Number(scoreB) : parsedSet!.sideBScore;
    const problem = onSet(a, b);
    if (problem) setError(problem); else clearInputs();
  }
  function begin(kind: PlayoffMode) {
    const problem = onBegin(kind);
    if (problem) setError(problem);
    else { setChosenMode(null); clearInputs(); }
  }
  function submitLot() {
    const problem = onLot(selected);
    if (problem) setError(problem);
  }
  function reset() {
    onReset();
    setChosenMode(null);
    setSelected([]);
    clearInputs();
  }

  const entry = (onConfirm: () => void, sideA: string, sideB: string) => (
    <div className="swiss-cutoff-game-entry">
      <div className="set-entry-scoreline"><span>{sideA}</span><strong>{scoreSport ? `${scoreA || '0'}:${scoreB || '0'}` : '0:0'}</strong><span>{sideB}</span></div>
      {scoreSport ? (
        <>
          <div className="sport-score-fields">
            <label className="current-set-field"><span>{rules.plural} · {sideA}</span><input type="number" min="0" step="1" inputMode="numeric" value={scoreA} onChange={(event) => setScoreA(event.target.value)} /></label>
            <span className="sport-score-colon">:</span>
            <label className="current-set-field"><span>{rules.plural} · {sideB}</span><input type="number" min="0" step="1" inputMode="numeric" value={scoreB} onChange={(event) => setScoreB(event.target.value)} /></label>
          </div>
          <button className="btn small primary" type="button" disabled={!scored} onClick={onConfirm}>Ergebnis bestätigen</button>
        </>
      ) : (
        <MatchSetInput sport={tournament.sport} bestOf={1} setIndex={0} value={setValue}
          onChange={(value) => { setSetValue(value); setError(''); }} onConfirm={onConfirm} compact />
      )}
    </div>
  );

  return (
    <div className="prototype-modal-backdrop swiss-cutoff-backdrop">
      <section className="prototype-modal swiss-cutoff-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="swiss-cutoff-title" aria-describedby="swiss-cutoff-description">
        <div className="swiss-cutoff-layout">
          <div className="swiss-cutoff-main">
            <div className="swiss-cutoff-heading">
              <span className="badge">ENTSCHEIDUNG ERFORDERLICH</span>
              <h2 id="swiss-cutoff-title">Gleichstand an der Qualifikationsgrenze</h2>
              <p id="swiss-cutoff-description" className="swiss-cutoff-intro">Nach der letzten Schweizer Runde liegen <strong>{status.tie.players.length} Teilnehmende</strong> bei allen sportlichen Tie-Breakern gleichauf.</p>
              <div className="swiss-cutoff-summary">
                <div><span>Offene Qualifikationsplätze</span><strong>{status.tie.slots}</strong></div>
                <div><span>Spieler im Stichentscheid</span><strong>{status.tie.players.length}</strong></div>
              </div>
              <p className="swiss-cutoff-help-text">Die Rangfolge bleibt bis zur Entscheidung offen. Die Tabelle rechts zeigt die betroffenen Spieler. <strong>Der Name entscheidet niemals über das Weiterkommen.</strong></p>
            </div>
            <div className="swiss-cutoff-candidates" aria-label="Gleichplatzierte Teilnehmer">
              {status.tie.players.map((name) => (
                <div key={name} className={eliminated.has(name) ? 'swiss-cutoff-candidate eliminated' : 'swiss-cutoff-candidate'}>
                  <strong>{name}</strong>
                  {eliminated.has(name) && <span className="muted">Ausgeschieden im Stichentscheid</span>}
                </div>
              ))}
            </div>

            {roundFinishedButTied && !isRoundRunning && (
              <p className="swiss-cutoff-still-tied" role="status">Die Zusatzspiele sind abgeschlossen, aber an der Qualifikationsgrenze besteht weiterhin Gleichstand. Bitte eine weitere Entscheidung auswählen.</p>
            )}

            {!mode && (
              <div className="swiss-cutoff-choice">
                <h3>Wie soll die Qualifikation entschieden werden?</h3>
                <p className="muted">Wähle ein Verfahren. Erst das bestätigte Ergebnis gibt die nächste Phase frei.</p>
                <div className="swiss-cutoff-choice-actions" role="group" aria-label="Entscheidungsverfahren auswählen">
                  {multiPlayer ? (
                    <button type="button" className="swiss-cutoff-method" autoFocus onClick={() => begin('ROUND')}>
                      <strong>Weitere Runde ausspielen</strong>
                      <span>Eine reguläre Schweizer Runde für alle verbleibenden Spieler, inklusive Tabellen- und BHZ-Wertung.</span>
                    </button>
                  ) : (
                    <button type="button" className="swiss-cutoff-method" autoFocus onClick={() => { setChosenMode('SET'); clearInputs(); }}>
                      <strong>{outcomeType} spielen</strong>
                      <span>Ein zusätzlicher Satz mit der gewohnten Ergebniseingabe entscheidet direkt.</span>
                    </button>
                  )}
                  <button type="button" className="swiss-cutoff-method" onClick={() => { setChosenMode('LOT'); setError(''); }}>
                    <strong>Physischer Losentscheid</strong>
                    <span>Vor Ort auslosen und anschließend die qualifizierten Spieler verbindlich eintragen.</span>
                  </button>
                  {multiPlayer && <button type="button" className="swiss-cutoff-method" onClick={() => begin('ROUND_ROBIN')}>
                    <strong>Jeder gegen Jeden</strong>
                    <span>Die Gleichplatzierten spielen Phase 1.5 über die normale Tischverwaltung und Ergebniseingabe.</span>
                  </button>}
                </div>
              </div>
            )}

            {mode === 'SET' && (
              <div className="swiss-cutoff-mode">
                <h3>{outcomeType} erfassen</h3>
                <p className="muted">Spielt einen Satz nach den üblichen Regeln und tragt ihn wie bei einem normalen Spiel ein. Das Ergebnis entscheidet ausschließlich über die Qualifikation; die Schweizer Tabellenwerte bleiben erhalten.</p>
                {played.length > 0 && (
                  <div className="swiss-cutoff-history">
                    <strong>Bereits entschieden</strong>
                    {played.map((set, index) => <div key={index}>{set.sideA} – {set.sideB}: {set.pointsA}:{set.pointsB} · Sieger: <strong>{set.winner}</strong></div>)}
                  </div>
                )}
                <p><strong>Noch {remaining.length - status.tie.slots} {remaining.length - status.tie.slots === 1 ? 'Entscheidung' : 'Entscheidungen'} erforderlich</strong></p>
                {pair[0] && pair[1] && entry(submitSet, pair[0], pair[1])}
                <div className="actions">
                  {played.length === 0
                    ? <button type="button" className="btn" onClick={() => { setChosenMode(null); clearInputs(); }}>Zurück zur Auswahl</button>
                    : <button type="button" className="btn" onClick={reset}>Stichentscheid neu beginnen</button>}
                </div>
              </div>
            )}

            {isRoundRunning && lastRound && (
              <div className="swiss-cutoff-mode swiss-cutoff-redirect">
                <h3>Phase 1.5 läuft in der Turnierleitung</h3>
                <p>Die Entscheidungsspiele sind bereits angesetzt. Weist ihnen wie gewohnt Tische zu und tragt die Ergebnisse in der normalen Spielmaske ein.</p>
                {onOpenControl && <button type="button" className="btn primary" onClick={onOpenControl}>Zur regulären Turnierleitung</button>}
              </div>
            )}

            {extraRounds.length > 0 && (
              <div className="swiss-cutoff-extra-standings">
                <strong>Zwischenstand der Zusatzspiele</strong>
                <div className="swiss-cutoff-extra-grid">
                  <span>Teilnehmer</span><span>Pkt.</span><span>±</span>
                  {playoffScores(status.tie.players, extraRounds).map((row) => (
                    <div className="swiss-cutoff-extra-row" key={row.name}>
                      <span>{row.name}</span><span>{row.points.toLocaleString('de-DE')}</span>
                      <span>{row.difference > 0 ? `+${row.difference}` : row.difference}</span>
                    </div>
                  ))}
                </div>
                {!isRoundRunning && <button type="button" className="btn small" onClick={reset}>Alle Zusatzspiele zurücksetzen</button>}
              </div>
            )}

            {mode === 'LOT' && (
              <div className="swiss-cutoff-mode">
                <h3>Losentscheid vor Ort</h3>
                <p>Zieht die Lose <strong>vor Ort</strong>. Markiert danach die {status.tie.slots === 1 ? 'qualifizierte Person' : `${status.tie.slots} qualifizierten Personen`}. Die Software führt selbst keine Auslosung durch.</p>
                <div className="swiss-cutoff-lot-choices" role="group" aria-label="Ausgeloste Qualifizierte">
                  {status.tie.players.map((name) => (
                    <label key={name}>
                      <input type="checkbox" checked={selected.includes(name)} onChange={(event) => {
                        setSelected((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name));
                        setError('');
                      }} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
                <p className="muted">{selected.length} von {status.tie.slots} Qualifikationsplätzen ausgewählt</p>
                <div className="actions">
                  <button type="button" className="btn primary" disabled={selected.length !== status.tie.slots} onClick={submitLot}>Losentscheid verbindlich bestätigen</button>
                  <button type="button" className="btn" onClick={() => { setChosenMode(null); setSelected([]); setError(''); }}>Zurück zur Auswahl</button>
                </div>
              </div>
            )}
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>

          <aside className="swiss-cutoff-table-side" aria-label="Schweizer Tabelle zum Stichentscheid">
            <div className="swiss-cutoff-table-heading">
              <strong>Schweizer Tabelle</strong>
              <span className="muted">Markiert: Spieler im Stichentscheid</span>
            </div>
            {stage && (() => {
              const standings = buildSwissStandings(tournament, stage);
              const qualifyingPlaces = status.tie.firstRank + status.tie.slots - 1;
              return <SwissStandingsTable
                standings={standings} scoreSport={scoreSport} scoreUnit={rules.plural}
                unplayedWinners={new Set(getSwissUnplayedWinWinners(tournament, stage))}
                previousFinishLabels={{}}
                withdrawalLabel={(name) => getStageWithdrawalLabel(tournament, name, stage.id)}
                qualifyingPlaces={qualifyingPlaces}
                cutoffIndex={getSwissCutoffRowIndex(standings, qualifyingPlaces)}
                finalized={false}
                highlightPlayers={selectedPlayers}
                readOnly
                onSelectPlayer={() => {}}
                onShowBuchholz={() => setShowBuchholz(true)}
              />;
            })()}
          </aside>
        </div>
      </section>
      {showBuchholz && stage && <div className="swiss-cutoff-nested-help"><SwissBuchholzHelpModal rounds={Number(stage.settings.rounds) || 4} onClose={() => setShowBuchholz(false)} /></div>}
    </div>
  );
}
