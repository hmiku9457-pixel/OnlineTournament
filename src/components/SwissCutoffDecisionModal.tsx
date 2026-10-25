import { useState } from 'react';
import type { DemoTournament } from '@/data/demoTournaments';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { SwissBuchholzHelpModal } from '@/components/SwissBuchholzHelpModal';
import { getSwissCutoffPair, type SwissCutoffStatus } from '@/services/mockRuntime';
import { buildSwissStandings, getSwissUnplayedWinWinners } from '@/services/mockCompetitionViews';
import { getSwissCutoffRowIndex } from '@/components/SwissQualificationCutoff';
import { getStageWithdrawalLabel } from '@/services/mockWithdrawals';
import { sportScoring } from '@/domain/sportScoring';
import { playoffBoundaryTie, playoffRoundFinished, playoffScores, type PlayoffMode } from '@/domain/swissCutoffPlayoff';

interface Props {
  status: SwissCutoffStatus;
  tournament: DemoTournament;
  onBeginSet: () => string | null;
  onLot: (winners: string[]) => string | null;
  onBegin: (kind: PlayoffMode) => string | null;
  onOpenControl?: () => void;
  onReset: () => void;
}

/** Mandatory manual qualification decision with the unchanged Swiss table as context. */
export function SwissCutoffDecisionModal({ status, tournament, onBeginSet, onLot, onBegin, onReset, onOpenControl }: Props) {
  const [chosenMode, setChosenMode] = useState<'SET' | 'LOT' | null>(null);
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
  // A deadlocked complete round robin cannot launch another sporting round:
  // when direct comparisons cannot split the cutoff, a physical draw is mandatory.
  const requiredDraw = lastRound?.kind === 'ROUND_ROBIN' && roundFinishedButTied
    ? playoffBoundaryTie(status.tie.players, status.tie.slots, extraRounds, tournament.sport)
    : null;
  const mode = requiredDraw ? 'LOT' : isRoundRunning ? lastRound!.kind : status.decision?.mode === 'SET' ? 'SET' : chosenMode;
  const drawPlayers = requiredDraw?.players ?? status.tie.players;
  const drawSlots = requiredDraw?.slots ?? status.tie.slots;
  const multiPlayer = status.tie.players.length > 2;
  const selectedPlayers = new Set(status.tie.players);
  const eliminated = new Set(status.decision?.eliminated ?? []);
  const remaining = status.tie.players.filter((name) => !eliminated.has(name));
  const outcomeType = scoreSport ? 'Entscheidungsspiel' : 'Entscheidungssatz';

  function startSetMatch() {
    const problem = onBeginSet();
    if (problem) setError(problem);
    else onOpenControl?.();
  }
  function begin(kind: PlayoffMode) {
    const problem = onBegin(kind);
    if (problem) setError(problem);
    else { setChosenMode(null); setError(''); }
  }
  function submitLot() {
    const problem = onLot(selected);
    if (problem) setError(problem);
  }
  function reset() {
    onReset();
    setChosenMode(null);
    setSelected([]);
    setError('');
  }


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
              <p className="swiss-cutoff-still-tied" role="status">{requiredDraw
                ? 'Alle Spiele sind beendet. Auch der direkte Vergleich führt zu keiner eindeutigen Qualifikation. Deshalb ist jetzt ein physischer Losentscheid zwingend erforderlich.'
                : 'Die Zusatzspiele sind abgeschlossen, aber an der Qualifikationsgrenze besteht weiterhin Gleichstand. Bitte eine weitere Entscheidung auswählen.'}</p>
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
                    <button type="button" className="swiss-cutoff-method" autoFocus onClick={startSetMatch}>
                      <strong>{outcomeType} spielen</strong>
                      <span>Den Entscheidungssatz einem freien Tisch zuweisen und dort wie ein normales Spiel erfassen.</span>
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
                <h3>{outcomeType} an einem Tisch</h3>
                <p>Der Entscheidungssatz ist für die reguläre Tischverwaltung vorgemerkt.
                  Weist einen freien Tisch zu und erfasst den Satz über die gewohnte Spielkarte.
                  Das Ergebnis zählt ausschließlich für die Qualifikation, nicht für die Schweizer Wertung.</p>
                {played.length > 0 && (
                  <div className="swiss-cutoff-history">
                    <strong>Bereits entschieden</strong>
                    {played.map((set, index) => <div key={index}>{set.sideA} – {set.sideB}: {set.pointsA}:{set.pointsB} · Sieger: <strong>{set.winner}</strong></div>)}
                  </div>
                )}
                <div className="actions">
                  {onOpenControl && <button type="button" className="btn primary" onClick={onOpenControl}>Zur Tischzuweisung</button>}
                  <button type="button" className="btn" onClick={reset}>Stichentscheid zurücksetzen</button>
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

            {extraRounds.length > 0 && !extraRounds.some((round) => round.kind === 'ROUND_ROBIN') && (
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
                <p>Zieht die Lose <strong>vor Ort</strong>. Markiert danach {drawSlots === 1 ? 'die qualifizierte Person' : `die ${drawSlots} qualifizierten Personen`}. Die Software führt selbst keine Auslosung durch.</p>
                {requiredDraw && <p className="swiss-cutoff-draw-explanation">
                  Alle sportlichen Kriterien einschließlich des direkten Vergleichs sind ausgeschöpft.
                  {requiredDraw.alreadyQualified.length > 0 && <> Bereits sportlich qualifiziert: <strong>{requiredDraw.alreadyQualified.join(', ')}</strong>.
                  Diese Plätze bleiben unberührt.</>}
                  {' '}Nur die noch gleichplatzierten Spieler nehmen an der Auslosung teil.
                </p>}
                <div className="swiss-cutoff-lot-choices" role="group" aria-label="Ausgeloste Qualifizierte">
                  {drawPlayers.map((name) => (
                    <label key={name}>
                      <input type="checkbox" checked={selected.includes(name)} onChange={(event) => {
                        setSelected((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name));
                        setError('');
                      }} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
                <p className="muted">{selected.length} von {drawSlots} offenen Losplätzen ausgewählt</p>
                <div className="actions">
                  <button type="button" className="btn primary" disabled={selected.length !== drawSlots} onClick={submitLot}>Losentscheid verbindlich bestätigen</button>
                  {!requiredDraw && <button type="button" className="btn" onClick={() => { setChosenMode(null); setSelected([]); setError(''); }}>Zurück zur Auswahl</button>}
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
