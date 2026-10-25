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
  onResult: (matchIndex: number, pointsA: number, pointsB: number) => string | null;
  onReset: () => void;
}

/** Mandatory manual qualification decision with the unchanged Swiss table as context. */
export function SwissCutoffDecisionModal({ status, tournament, onSet, onLot, onBegin, onResult, onReset }: Props) {
  const [chosenMode, setChosenMode] = useState<'SET' | 'LOT' | null>(null);
  const [setValue, setSetValue] = useState('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFixture, setSelectedFixture] = useState(-1);
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
  const pendingIndex = lastRound?.matches.findIndex((match) => match.pointsA === undefined) ?? -1;
  const activeIndex = lastRound && selectedFixture >= 0 && lastRound.matches[selectedFixture]?.pointsA === undefined
    ? selectedFixture : pendingIndex;
  const activeMatch = lastRound && activeIndex >= 0 ? lastRound.matches[activeIndex] : null;
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
  function submitGame() {
    if (!activeMatch || (!scoreSport && !parsedSet) || (scoreSport && !scored)) {
      setError('Bitte zuerst ein gültiges Ergebnis eingeben.'); return;
    }
    const a = scoreSport ? Number(scoreA) : parsedSet!.sideAScore;
    const b = scoreSport ? Number(scoreB) : parsedSet!.sideBScore;
    const problem = onResult(activeIndex, a, b);
    if (problem) setError(problem);
    else { clearInputs(); setSelectedFixture(-1); setChosenMode(null); }
  }
  function begin(kind: PlayoffMode) {
    const problem = onBegin(kind);
    if (problem) setError(problem);
    else { setChosenMode(null); setSelectedFixture(-1); clearInputs(); }
  }
  function submitLot() {
    const problem = onLot(selected);
    if (problem) setError(problem);
  }
  function reset() {
    onReset();
    setChosenMode(null);
    setSelectedFixture(-1);
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
              <p id="swiss-cutoff-description">Die letzte Schweizer Runde ist abgeschlossen. Für die nächste Phase {status.tie.slots === 1 ? 'ist' : 'sind'} noch <strong>{status.tie.slots}</strong> {status.tie.slots === 1 ? 'Platz' : 'Plätze'} offen. Die folgenden {status.tie.players.length} Teilnehmenden liegen nach <strong>allen sportlichen Tie-Breakern gleichauf</strong>.</p>
              <p className="muted">Die Phase bleibt gesperrt, bis die Turnierleitung einen Stichentscheid dokumentiert. Die alphabetische Reihenfolge entscheidet nicht über die Qualifikation.</p>
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
                <strong>Wie soll entschieden werden?</strong>
                <div className="swiss-cutoff-choice-actions">
                  {multiPlayer ? (
                    <button type="button" className="btn primary" autoFocus onClick={() => begin('ROUND')}>Weitere Runde ausspielen</button>
                  ) : (
                    <button type="button" className="btn primary" autoFocus onClick={() => { setChosenMode('SET'); clearInputs(); }}>{outcomeType} spielen</button>
                  )}
                  <button type="button" className="btn" onClick={() => { setChosenMode('LOT'); setError(''); }}>Physischer Losentscheid</button>
                  {multiPlayer && <button type="button" className="btn" onClick={() => begin('ROUND_ROBIN')}>Jeder gegen Jeden</button>}
                </div>
              </div>
            )}

            {mode === 'SET' && (
              <div className="swiss-cutoff-mode">
                <h3>{outcomeType} erfassen</h3>
                <p className="muted">Die Entscheidung nutzt dieselbe Eingabe und Gültigkeitsprüfung wie ein normales Spiel. Das Ergebnis zählt ausschließlich für die Qualifikation, nicht für die ursprüngliche Schweizer Tabelle.</p>
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
              <div className="swiss-cutoff-mode">
                <h3>{lastRound.kind === 'ROUND' ? 'Zusätzliche Entscheidungsrunde' : 'Jeder gegen Jeden'}</h3>
                <p className="muted">Alle hier erfassten Ergebnisse fließen nur in die separate Entscheidung ein. Die ursprüngliche Schweizer Wertung und die BHZ bleiben unverändert.</p>
                <div className="swiss-cutoff-fixture-list" aria-label="Entscheidungsspiele">
                  {lastRound.matches.map((match, index) => {
                    const finished = match.pointsA !== undefined && match.pointsB !== undefined;
                    return (
                      <button key={index} type="button" disabled={finished}
                        className={index === activeIndex ? 'swiss-cutoff-fixture current' : 'swiss-cutoff-fixture'}
                        onClick={() => { setSelectedFixture(index); clearInputs(); }}>
                        <span>{match.sideA} – {match.sideB}</span>
                        <strong>{finished ? `${match.pointsA}:${match.pointsB} ✓` : index === activeIndex ? 'Eingabe' : 'Offen'}</strong>
                      </button>
                    );
                  })}
                  {lastRound.bye && <div className="swiss-cutoff-fixture is-bye"><span>{lastRound.bye}</span><strong>Freilos</strong></div>}
                </div>
                {activeMatch && <div className="swiss-cutoff-active-game">
                  <h4>{lastRound.matches.filter((match) => match.pointsA !== undefined).length + 1} von {lastRound.matches.length} Partien</h4>
                  {entry(submitGame, activeMatch.sideA, activeMatch.sideB)}
                </div>}
                <div className="actions"><button type="button" className="btn" onClick={reset}>Zusatzspiele verwerfen und neu wählen</button></div>
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
                <p>Die Auslosung findet <strong>physisch</strong> statt. Trage anschließend ein, welche {status.tie.slots === 1 ? 'Person' : 'Personen'} das Los gezogen {status.tie.slots === 1 ? 'hat' : 'haben'}. Die Software lost nicht selbst.</p>
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
