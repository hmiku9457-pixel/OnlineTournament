import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PrestartDrawEditor } from '@/components/PrestartDrawEditor';
import { StageCard } from '@/components/StageCard';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import { requiresFinalApproval } from '@/domain/matchFinalization';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { resultForParticipant } from '@/services/matchPresentation';
import type { TournamentStage, TournamentStatus } from '@/domain/types';
import { buildMockBracket, buildMockGroups, buildSwissStandings, getPreviousStageFinishLabels } from '@/services/mockCompetitionViews';
import { assignMockMatchToTable, unassignMockMatch, moveMockMatchToTable, countMockOpenConfirmations, adminConfirmMockMatch, getMockMatchConfirmation, getSwissRecordBeforeRound, formatMockMatchRest, restoreMockCorrectedResult, findMockRuntimeMatch, getMockAssignmentBlockReason, formatPlayerRest, getMockRuntimeMatches, getMockStageMatches, getRuntimeParticipantNames, refreshCompletedStageQualifiers, canEditMockMatch, reconcileWithdrawalsForTournament } from '@/services/mockRuntime';
import { isMockParticipantWithdrawn, withdrawMockParticipant, canRestoreMockParticipant, restoreMockParticipant, isMockThirdPlaceMatch, skipMockThirdPlaceMatch } from '@/services/mockRuntime';
import { getMockFinalStandings, getMockParticipantProgress } from '@/services/mockParticipantProgress';
import { VenueLayoutMini } from '@/components/VenueLayout';
import { canEditDraw, getBracketSlots, getPinnedBracketSlots, randomizeBracketSlots, randomizeSwissOrder, setBracketSlot, toggleBracketPin } from '@/services/mockDrawStore';
import { addMockParticipant, updateMockParticipantName, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageEntrants, getActiveStage, getNextStartableStage, isStageCompleted, isStageEditable, isStageLockedWaiting, isStageStarted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';
import { getBlockedMockTables, setMockTableBlocked } from '@/services/mockTableLocks';
import { estimateRemainingTournamentMinutes, formatRemainingTournamentDuration } from '@/services/mockDuration';
import { getMockAudit } from '@/services/mockAudit';

type ControlTab = 'overview' | 'flow' | 'matches' | 'participants' | 'final' | 'audit';

const tabs: Array<{ id: ControlTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'flow', label: 'Turnierverlauf' },
  { id: 'participants', label: 'Teilnehmer' },
  { id: 'matches', label: 'Spiele' },
  { id: 'audit', label: 'Protokoll' },
];

function statusLabel(status: TournamentStatus) {
  switch (status) {
    case 'READY': return 'Bereit';
    case 'RUNNING': return 'Läuft';
    case 'PAUSED': return 'Pausiert';
    case 'REGISTRATION': return 'Anmeldung';
    case 'FINISHED': return 'Beendet';
    default: return status;
  }
}

const BRACKET_DRAG_TYPE = 'text/online-tournament-bracket-slot';


function StageCompetitionView({
  tournamentId,
  stage,
  tournament,
  onDrawChanged,
  onEditResult,
}: {
  tournamentId: string;
  stage: TournamentStage;
  tournament: ReturnType<typeof getMockTournament>;
  onDrawChanged?: () => void;
  onEditResult?: (matchId: string) => void;
}) {
  const [selectedGroupPlayer, setSelectedGroupPlayer] = useState<{ groupLabel: string; player: string } | null>(null);
  const [selectedSwissPlayer, setSelectedSwissPlayer] = useState<string | null>(null);
  const previousFinishLabels = getPreviousStageFinishLabels(tournament, stage);

  if (stage.type === 'GROUPS') {
    const groups = buildMockGroups(tournament, stage);
    return (
      <section className="competition-stage-section" id={`${tournamentId}-${stage.id}`}>
        <div className="competition-stage-head"><div><span className="badge">GRUPPEN</span><h3>{stage.name}</h3></div><span className="muted">{groups.length} Gruppen</span></div>
        <div className="group-overview-grid">
          {groups.map((group) => (
            <article className="card group-overview-card" key={group.id}>
              <h4>{group.label}</h4>
              <div className="mini-standing-table detailed">
                <div className="mini-standing-head"><span>#</span><span>Spieler</span><span>Sp.</span><span>S</span><span>N</span><span>Sätze</span><span>±</span><span>Bälle</span><span>±</span></div>
                {group.standings.map((row) => (
                  <div className="mini-standing-row" key={row.name}>
                    <span>{row.rank}</span><button className="standing-player-button" type="button" onClick={() => setSelectedGroupPlayer({ groupLabel: group.label, player: row.name })}><strong>{row.name}</strong>{isMockParticipantWithdrawn(tournament, row.name) && <span className="standing-withdrawn" title="Teilnehmer zurückgezogen">Zurückgezogen</span>}{previousFinishLabels[row.name] && <small>{previousFinishLabels[row.name]}</small>}</button><span>{row.played}</span><span>{row.wins}</span><span>{row.losses}</span><span>{row.sets}</span><span>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</span><span>{row.balls}</span><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span>
                  </div>
                ))}
              </div>
              <div className="group-match-list">
                {[...new Set(group.matches.map((match) => match.matchDay ?? 0))].map((matchDay) => (
                  <div className="group-match-day" key={`${group.id}-day-${matchDay}`}>
                    <strong className="group-match-day-label">Spieltag {matchDay}</strong>
                    {group.matches.filter((match) => (match.matchDay ?? 0) === matchDay).map((match) => (
                      <div className={match.status === 'live' ? 'group-match-row live' : 'group-match-row'} key={match.id}>
                        <span title={match.sideA}>{match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, match.sideA) ? `Rückzug (${match.sideA})` : match.sideA}</span><MatchResultDetails score={match.score} sets={match.sets} onEdit={match.status === 'played' && canEditMockMatch(tournament, match.id) ? () => onEditResult?.(match.id) : undefined} /><span title={match.sideB}>{match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, match.sideB) ? `Rückzug (${match.sideB})` : match.sideB}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        {selectedGroupPlayer && (() => {
          const selectedGroup = groups.find((group) => group.label === selectedGroupPlayer.groupLabel);
          const playerMatches = selectedGroup?.matches.filter((match) => match.sideA === selectedGroupPlayer.player || match.sideB === selectedGroupPlayer.player) ?? [];
          return (
            <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedGroupPlayer(null)}>
              <div className="prototype-modal player-games-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                <div className="player-games-modal-head">
                  <div><span className="badge">{selectedGroupPlayer.groupLabel}</span><h2>{selectedGroupPlayer.player}</h2></div>
                  <button className="btn small" type="button" onClick={() => setSelectedGroupPlayer(null)}>Schließen</button>
                </div>
                <div className="player-games-list">
                  {playerMatches.map((match) => {
                    const opponent = match.sideA === selectedGroupPlayer.player ? match.sideB : match.sideA;
                    const displayedResult = resultForParticipant(match.score, match.sets, match.sideB === selectedGroupPlayer.player);
                    return (
                      <div className="player-game-row" key={match.id}>
                        <span className="muted">Spieltag {match.matchDay}</span>
                        <strong>vs. {opponent}</strong>
                        <MatchResultDetails score={displayedResult.score} sets={displayedResult.sets} onEdit={match.status === 'played' && canEditMockMatch(tournament, match.id) ? () => onEditResult?.(match.id) : undefined} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </section>
    );
  }

  if (stage.type === 'SWISS') {
    const standings = buildSwissStandings(tournament, stage);
    const swissMatches = getMockStageMatches(tournament, stage);
    return (
      <section className="competition-stage-section">
        <div className="competition-stage-head"><div><span className="badge">SCHWEIZER SYSTEM</span><h3>{stage.name}</h3></div><div className="actions"><span className="muted">{Number(stage.settings.rounds) || 4} Runden</span>{canEditDraw(tournament, stage) && <button className="btn small" type="button" onClick={() => { if (randomizeSwissOrder(tournament, stage)) onDrawChanged?.(); }}>Neue Zufallsreihenfolge</button>}</div></div>
        <div className="card table-wrap">
          <table className="compact-table">
            <thead><tr><th>#</th><th>Teilnehmer</th><th>Spiele</th><th>Siege</th><th>Niederlagen</th><th>Sätze</th><th>Satz ±</th><th>Bälle</th><th>Ball ±</th></tr></thead>
            <tbody>{standings.map((row) => <tr key={row.name}><td>{row.rank}</td><td><button className="standing-player-button" type="button" onClick={() => setSelectedSwissPlayer(row.name)}><strong>{row.name}</strong></button>{isMockParticipantWithdrawn(tournament, row.name) && <span className="standing-withdrawn" title="Teilnehmer zurückgezogen">Zurückgezogen</span>} {previousFinishLabels[row.name] && <small className="participant-origin">{previousFinishLabels[row.name]}</small>}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.sets}</td><td>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</td><td>{row.balls}</td><td>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</td></tr>)}</tbody>
          </table>
        </div>
        {selectedSwissPlayer && (
          <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedSwissPlayer(null)}>
            <div className="prototype-modal player-games-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="player-games-modal-head"><h2>{selectedSwissPlayer} · Partien</h2><button className="btn small" type="button" onClick={() => setSelectedSwissPlayer(null)}>Schließen</button></div>
              <div className="player-games-list">
                {swissMatches.filter((match) => match.sideA === selectedSwissPlayer || match.sideB === selectedSwissPlayer).map((match) => {
                  const result = resultForParticipant(match.status === 'FINISHED' ? match.score : '–', match.sets, match.sideB === selectedSwissPlayer);
                  const score = /^\d+\s*:\s*\d+$/.exec(result.score);
                  const [own, other] = score ? result.score.split(':').map(Number) : [0, 0];
                  const label = match.status !== 'FINISHED' ? 'Offen' : score ? (own > other ? 'Sieg' : own < other ? 'Niederlage' : 'Unentschieden') : 'Kampflos';
                  return <div className="player-game-row swiss-player-game-row" key={match.id}>
                    <span className="muted">{match.round}</span>
                    <strong>vs. {match.sideA === selectedSwissPlayer ? match.sideB : match.sideA} <span className="swiss-opponent-record">vs. {getSwissRecordBeforeRound(tournament, stage, match.sideA === selectedSwissPlayer ? match.sideB : match.sideA, Number(match.round.match(/\d+/)?.[0]) || 1)}</span></strong>
                    <span className="swiss-game-result"><span className="swiss-game-label">{label}</span><MatchResultDetails score={result.score} sets={result.sets} onEdit={match.status === 'FINISHED' && canEditMockMatch(tournament, match.id) ? () => onEditResult?.(match.id) : undefined} /></span>
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') {
    const fullBracket = buildMockBracket(tournament, stage);
    const rounds = fullBracket.filter((round) => round.label !== 'Spiel um Platz 3');
    const thirdPlaceRound = fullBracket.find((round) => round.label === 'Spiel um Platz 3');
    const editable = canEditDraw(tournament, stage) && (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION');
    const slots = editable ? getBracketSlots(tournament, stage) : [];
    const pinnedSlots = editable ? new Set(getPinnedBracketSlots(tournament, stage)) : new Set<number>();
    function handleBracketDrop(event: DragEvent<HTMLDivElement>, slotIndex: number) {
      if (!editable) return;
      event.preventDefault();
      const raw = event.dataTransfer.getData(BRACKET_DRAG_TYPE);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as { value: string; sourceSlotIndex: number };
        if (payload.value && setBracketSlot(tournament, stage, slotIndex, payload.value, payload.sourceSlotIndex)) onDrawChanged?.();
      } catch {
        if (setBracketSlot(tournament, stage, slotIndex, raw)) onDrawChanged?.();
      }
    }

    return (
      <section className="competition-stage-section">
        <div className="competition-stage-head">
          <div>
            <span className="badge">{stage.type === 'DOUBLE_ELIMINATION' ? 'DOPPEL-K.-O.' : 'K.-O.'}</span>
            <h3>{stage.name}</h3>
            {editable && <p className="muted bracket-edit-hint">Startplätze per Drag & Drop verschieben oder mit der Stecknadel fixieren.</p>}
          </div>
          {editable && (
            <button className="btn small" type="button" onClick={() => { if (randomizeBracketSlots(tournament, stage)) onDrawChanged?.(); }}>
              Neue Zufallsverteilung
            </button>
          )}
        </div>
        <div className="bracket-scroll">
          <div className={editable ? 'bracket-board editable' : 'bracket-board'}>
            {rounds.map((round, roundIndex) => (
              <div className="bracket-round" key={round.label}>
                <h4>{round.label}</h4>
                <div className="bracket-round-matches">
                  {round.matches.map((match, matchIndex) => (
                    <article className="bracket-match" key={match.id}>
                      {match.score === 'W.O.' && <span className="bracket-walkover-label" title="Kampflos entschiedene Partie (Walkover, z. B. bei Rückzug)">Kampflos</span>}
                      {match.score === 'Beide Platz 3' && <span className="bracket-walkover-label">Gemeinsamer 3. Platz · nicht ausgetragen</span>}
                      {[match.sideA, match.sideB].map((side, sideIndex) => {
                        const slotIndex = matchIndex * 2 + sideIndex;
                        const isEditableSlot = editable && roundIndex === 0 && slotIndex < slots.length;
                        const winner = match.winner === side;
                        return (
                          <div
                            className={`${winner ? 'winner ' : ''}${isEditableSlot ? 'editable-bracket-slot' : ''}${isEditableSlot && pinnedSlots.has(slotIndex) ? ' pinned-slot' : ''}${side === 'Freilos' ? ' bye' : ''}`.trim()}
                            key={`${match.id}-${sideIndex}`}
                            draggable={isEditableSlot && !pinnedSlots.has(slotIndex)}
                            onDragStart={(event) => {
                              if (!isEditableSlot || pinnedSlots.has(slotIndex)) return;
                              event.dataTransfer.setData(BRACKET_DRAG_TYPE, JSON.stringify({ value: side, sourceSlotIndex: slotIndex }));
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(event) => {
                              if (!isEditableSlot) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(event) => handleBracketDrop(event, slotIndex)}
                          >
                            <span>
                              <span className="bracket-name-inline">{match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, side) ? `Rückzug (${side})` : side}{isEditableSlot && side !== 'Freilos' && (
                                <button className={pinnedSlots.has(slotIndex) ? 'bracket-pin pinned' : 'bracket-pin'} type="button"
                                  aria-label={`${side} ${pinnedSlots.has(slotIndex) ? 'lösen' : 'fixieren'}`}
                                  title={pinnedSlots.has(slotIndex) ? 'Fixierung lösen' : 'Platz fixieren'}
                                  onClick={() => { if (toggleBracketPin(tournament, stage, slotIndex)) onDrawChanged?.(); }}>
                                  {pinnedSlots.has(slotIndex) ? '📌' : '📍'}
                                </button>
                              )}</span>
                              {previousFinishLabels[side] && <small className="participant-origin">{previousFinishLabels[side]}</small>}
                            </span>
                            <span className="bracket-score-cells">
                              {(match.sets ?? []).map((set, index) => <span key={index}>{sideIndex === 0 ? set.sideAScore : set.sideBScore}</span>)}
                              <strong>{match.score === 'W.O.' ? (winner ? '✓' : '–') : match.score === 'Beide Platz 3' ? '3.' : match.score && match.score !== 'Freilos' ? match.score.split(':')[sideIndex] : match.score === 'Freilos' && side === 'Freilos' ? 'BYE' : ''}</strong>
                            </span>
                          </div>
                        );
                      })}
                    </article>
                  ))}
                </div>
                {roundIndex === rounds.length - 1 && thirdPlaceRound && (
                  <div className="bracket-third-place-block">
                    <h4>Spiel um Platz 3</h4>
                    {thirdPlaceRound.matches.map((match) => (
                      <article className="bracket-match" key={match.id}>
                        {match.score === 'Beide Platz 3' && <span className="bracket-walkover-label">Gemeinsamer 3. Platz · nicht ausgetragen</span>}
                        {[match.sideA, match.sideB].map((side, sideIndex) => (
                          <div className={match.winner === side ? 'winner' : ''} key={`${match.id}-${sideIndex}`}>
                            <span>{side}</span>
                            <span className="bracket-score-cells">
                              {(match.sets ?? []).map((set, index) => <span key={index}>{sideIndex === 0 ? set.sideAScore : set.sideBScore}</span>)}
                              <strong>{match.score === 'Beide Platz 3' ? '3.' : match.score && match.score !== 'Freilos' ? match.score.split(':')[sideIndex] : ''}</strong>
                            </span>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return <StageCard stage={stage} />;
}

function ParticipantEditFields({ name, code, onSave, onCancel }: {
  name: string;
  code: string;
  onSave: (firstName: string, lastName: string, playerCode: string) => boolean;
  onCancel: () => void;
}) {
  const nameParts = name.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] ?? '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [playerCode, setPlayerCode] = useState(code);
  const [error, setError] = useState('');
  return (
    <div className="participant-edit-grid">
      <label className="field"><span>Vorname</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
      <label className="field"><span>Nachname</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
      <label className="field"><span>Spielercode</span><input value={playerCode} onChange={(event) => setPlayerCode(event.target.value)} inputMode="numeric" /></label>
      <div className="actions"><button className="btn small primary" type="button" onClick={() => { if (!onSave(firstName, lastName, playerCode)) setError('Bitte vollständigen Namen, eindeutigen Teilnehmer und 4–8 Ziffern beim Spielercode angeben.'); }}>Speichern</button>
        <button className="btn small" type="button" onClick={onCancel}>Abbrechen</button></div>
      {error && <span className="field-error participant-edit-error">{error}</span>}
    </div>
  );
}

export function TournamentControlPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const initialTournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const [tournament, setTournament] = useState(initialTournament);
  const [tab, setTab] = useState<ControlTab>('overview');
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [restClockTick, setRestClockTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setRestClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);
  const [drawVersion, setDrawVersion] = useState(0);
  const [phaseVersion, setPhaseVersion] = useState(0);
  const [participantPanel, setParticipantPanel] = useState<{ name: string; mode: 'edit' | 'games' } | null>(null);
  const [participantVersion, setParticipantVersion] = useState(0);
  const [showParticipantAdd, setShowParticipantAdd] = useState(false);
  const [newParticipantFirst, setNewParticipantFirst] = useState('');
  const [newParticipantLast, setNewParticipantLast] = useState('');
  const [newPartnerFirst, setNewPartnerFirst] = useState('');
  const [newPartnerLast, setNewPartnerLast] = useState('');
  const [participantAddError, setParticipantAddError] = useState('');
  const [assigningMatchId, setAssigningMatchId] = useState<string | null>(null);
  const [movingMatchId, setMovingMatchId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string>(() => initialTournament.stages[0]?.id ?? '');
  const [phaseCompletedModal, setPhaseCompletedModal] = useState<{ stageName: string; nextStageName?: string } | null>(null);
  const [startModal, setStartModal] = useState<{ kind: 'tournament' | 'phase'; stageName: string } | null>(null);
  const [skipThirdMatchId, setSkipThirdMatchId] = useState<string | null>(null);
  const [adminEditMatchId, setAdminEditMatchId] = useState<string | null>(null);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament, runtimeVersion, restClockTick]);
  const blockedTables = useMemo(() => new Set(getBlockedMockTables(tournament)), [tournament, runtimeVersion]);
  const restTimeLabel = useMemo(
    () => formatRemainingTournamentDuration(estimateRemainingTournamentMinutes(tournament)),
    [tournament, runtimeVersion, phaseVersion],
  );
  const openConfirmations = useMemo(() => countMockOpenConfirmations(tournament), [tournament, runtimeVersion, phaseVersion]);
  const auditEntries = useMemo(() => getMockAudit(tournament.id), [tournament.id, runtimeVersion]);
  const allTournamentMatches = useMemo(() => tournament.stages.filter((stage) => isStageStarted(tournament, stage)).flatMap((stage) => getMockStageMatches(tournament, stage)), [tournament, runtimeVersion, phaseVersion, restClockTick]);
  const participants = useMemo(() => getRuntimeParticipantNames(tournament), [tournament, participantVersion]);
  const finalStandings = useMemo(() => tournament.status === 'FINISHED' ? getMockFinalStandings(tournament) : [], [tournament, participantVersion, phaseVersion, runtimeVersion]);
  const nextMatches = matches.filter((match) => match.status === 'WAITING');
  const tableMatches = matches.filter((match) => ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) && match.table.startsWith('Tisch '));
  const matchesByTable = new Map(tableMatches.map((match) => [match.table, match]));
  const freeTables = Array.from({ length: tournament.tables }, (_, index) => `Tisch ${index + 1}`).filter((table) => !matchesByTable.has(table) && !blockedTables.has(table));
  const activeStage = useMemo(() => getActiveStage(tournament), [tournament, phaseVersion]);
  const activeSwissRecords = useMemo(() => activeStage?.type === 'SWISS'
    ? new Map(buildSwissStandings(tournament, activeStage).map((row) => [row.name, `${row.wins}:${row.losses}`]))
    : new Map<string, string>(), [tournament, activeStage, runtimeVersion]);
  const nextStartableStage = useMemo(() => getNextStartableStage(tournament), [tournament, phaseVersion]);
  const editableStage = useMemo(() => tournament.stages.find((stage) => isStageEditable(tournament, stage)), [tournament, phaseVersion]);
  const selectedStage = useMemo(() => tournament.stages.find((stage) => stage.id === selectedStageId) ?? tournament.stages[0], [tournament, selectedStageId]);

  useEffect(() => {
    function handlePhaseCompleted(event: Event) {
      const detail = (event as CustomEvent<{ tournamentId: string; stageId: string; nextStageId: string | null }>).detail;
      if (!detail || detail.tournamentId !== tournament.id) return;
      const completedStage = tournament.stages.find((stage) => stage.id === detail.stageId);
      const nextStage = detail.nextStageId ? tournament.stages.find((stage) => stage.id === detail.nextStageId) : undefined;
      if (!completedStage) return;
      setPhaseCompletedModal({ stageName: completedStage.name, nextStageName: nextStage?.name });
      setSelectedStageId(completedStage.id);
      setPhaseVersion((value) => value + 1);
    }
    window.addEventListener('mock-phase-completed', handlePhaseCompleted);
    return () => window.removeEventListener('mock-phase-completed', handlePhaseCompleted);
  }, [tournament]);

  function setStatus(status: TournamentStatus) {
    setTournament(updateMockTournamentStatus(tournament.id, status));
  }

  function refreshRuntime() {
    setTournament(getMockTournament(tournament.id));
    setRuntimeVersion((value) => value + 1);
    setPhaseVersion((value) => value + 1);
  }

  function handleAddParticipant() {
    const result = addMockParticipant(tournament.id, newParticipantFirst, newParticipantLast, newPartnerFirst, newPartnerLast);
    if (!result.ok) {
      setParticipantAddError(result.error ?? 'Nachmeldung konnte nicht gespeichert werden.');
      return;
    }
    setNewParticipantFirst('');
    setNewParticipantLast('');
    setNewPartnerFirst('');
    setNewPartnerLast('');
    setParticipantAddError('');
    setShowParticipantAdd(false);
    setParticipantVersion((value) => value + 1);
    setDrawVersion((value) => value + 1);
    refreshRuntime();
  }

  function performStartTournament() {
    const firstStage = tournament.stages[0];
    if (!firstStage || !startFirstStage(tournament)) return;
    setStartModal(null);
    setPhaseVersion((value) => value + 1);
    setStatus('RUNNING');
    reconcileWithdrawalsForTournament(tournament);
    refreshRuntime();
  }

  function performStartNextPhase() {
    if (!nextStartableStage || !startStage(tournament, nextStartableStage)) return;
    const startedId = nextStartableStage.id;
    setStartModal(null);
    setPhaseVersion((value) => value + 1);
    setStatus('RUNNING');
    reconcileWithdrawalsForTournament(tournament);
    refreshRuntime();
    setSelectedStageId(startedId);
    setTab('overview');
  }

  function requestStartTournament() {
    const firstStage = tournament.stages[0];
    if (firstStage && getStageEntrants(tournament, firstStage).length >= 2) {
      setStartModal({ kind: 'tournament', stageName: firstStage.name });
    }
  }

  function requestStartNextPhase() {
    if (nextStartableStage) setStartModal({ kind: 'phase', stageName: nextStartableStage.name });
  }

  function toggleTableLock(table: string) {
    const willBlock = !blockedTables.has(table);
    if (!setMockTableBlocked(tournament, table, willBlock)) return;
    setAssignmentMessage(willBlock ? `${table} wurde gesperrt. Bereits laufende Spiele bleiben aktiv.` : `${table} wurde wieder freigegeben.`);
    refreshRuntime();
  }

  function assignToTable(matchId: string, table: string) {
    const blockReason = getMockAssignmentBlockReason(tournament, matchId, table);
    if (blockReason) {
      setAssignmentMessage(blockReason);
      return false;
    }
    if (!assignMockMatchToTable(tournament, matchId, table)) return false;
    setAssignmentMessage(null);
    setAssigningMatchId(null);
    refreshRuntime();
    return true;
  }

  function unassignFromTable(matchId: string) {
    if (!unassignMockMatch(tournament, matchId)) return;
    setAssignmentMessage('Zuweisung aufgehoben. Bereits eingegebene Sätze bleiben erhalten.');
    setMovingMatchId(null);
    refreshRuntime();
  }

  function moveToTable(matchId: string, table: string) {
    if (!moveMockMatchToTable(tournament, matchId, table)) {
      setAssignmentMessage('Tischwechsel nicht möglich: Ziel ist nicht frei oder gesperrt.');
      return;
    }
    setMovingMatchId(null);
    setAssignmentMessage(`Partie nach ${table} verlegt. Satzergebnisse und ursprüngliche Pausenzeit bleiben erhalten.`);
    refreshRuntime();
  }

  function autoAssignMatch(matchId: string) {
    for (const table of freeTables) {
      if (assignToTable(matchId, table)) return;
    }

    const firstReason = freeTables
      .map((table) => getMockAssignmentBlockReason(tournament, matchId, table))
      .find((reason) => reason);
    setAssignmentMessage(firstReason ?? 'Aktuell ist kein geeigneter Tisch frei.');
  }

  function autoAssignWaitingMatches() {
    const waitingMatches = nextMatches.filter((match) => match.status === 'WAITING');
    let assigned = 0;

    for (const match of waitingMatches) {
      const currentMatches = getMockRuntimeMatches(tournament);
      const currentOccupied = new Set(
        currentMatches
          .filter((item) => ['LIVE', 'READY', 'CONFIRMATION'].includes(item.status) && item.table.startsWith('Tisch '))
          .map((item) => item.table),
      );
      const availableTables = Array.from({ length: tournament.tables }, (_, index) => `Tisch ${index + 1}`)
        .filter((table) => !currentOccupied.has(table) && !blockedTables.has(table));

      const targetTable = availableTables.find((table) => !getMockAssignmentBlockReason(tournament, match.id, table));
      if (targetTable && assignMockMatchToTable(tournament, match.id, targetTable)) assigned += 1;
    }

    setAssignmentMessage(assigned > 0 ? `${assigned} Spiel${assigned === 1 ? '' : 'e'} automatisch zugewiesen und gestartet.` : 'Aktuell konnte kein wartendes Spiel konfliktfrei zugewiesen werden.');
    setAssigningMatchId(null);
    refreshRuntime();
  }

  return (
    <>
      <header className="control-head">
        <div>
          <button className="btn small control-back-button" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          <div className="control-kicker">Turnierleitung</div>
          <div className="tournament-page-status-row">
            <h1>{tournament.name}</h1>
            <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{statusLabel(tournament.status)}</span>
          </div>
          <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer · {tournament.tables} Tische</p>
        </div>
        <div className="actions no-print">
          <Link className="btn" to={`/player/${tournament.id}`}>Spieleransicht</Link>
          <Link className="btn" to={`/live/${tournament.id}`}>Zuschaueransicht</Link>
          {editableStage && ['GROUPS', 'KNOCKOUT', 'DOUBLE_ELIMINATION'].includes(editableStage.type) && (
            <button className="btn" type="button" onClick={() => setTab('flow')}>Aktuelle Phase bearbeiten</button>
          )}
          {!tournament.hasStarted && tournament.status !== 'FINISHED' && (
            <button className="btn primary" type="button" onClick={requestStartTournament}
              disabled={!tournament.stages[0] || getStageEntrants(tournament, tournament.stages[0]).length < 2}
              title={tournament.stages[0] && getStageEntrants(tournament, tournament.stages[0]).length < 2 ? 'Mindestens zwei aktive Teilnehmer erforderlich' : undefined}>Turnier starten</button>
          )}
          {tournament.hasStarted && activeStage && tournament.status !== 'FINISHED' && (
            <>
              {tournament.status === 'RUNNING' ? (
                <button className="btn" type="button" onClick={() => setStatus('PAUSED')}>Turnier pausieren</button>
              ) : (
                <button className="btn" type="button" onClick={() => setStatus('RUNNING')}>Turnier fortsetzen</button>
              )}
            </>
          )}
          {tournament.hasStarted && !activeStage && nextStartableStage && tournament.status !== 'FINISHED' && (
            <button className="btn primary" type="button" onClick={requestStartNextPhase}>Nächste Phase starten</button>
          )}
        </div>
      </header>

      <nav className="control-tabs" aria-label="Turnierleitungsbereiche">
        {(tournament.status === 'FINISHED' ? [...tabs, { id: 'final' as const, label: 'Endplatzierungen' }] : tabs).map((item) => (
          <button className={tab === item.id ? 'control-tab active' : 'control-tab'} key={item.id} type="button" onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="control-overview-stack">
          <div>
            <div className="control-section-head control-table-section-head">
              <div>
                <h2>Tische</h2>
                <p className="muted">Alle Spielorte auf einen Blick – auch freie Tische bleiben sichtbar.</p>
              </div>
              <div className="control-table-head-actions">
                <span className="badge live">{tableMatches.length} laufend</span>
                <button
                  className="btn small primary"
                  type="button"
                  disabled={tournament.status !== 'RUNNING' || freeTables.length === 0 || !nextMatches.some((match) => match.status === 'WAITING')}
                  onClick={autoAssignWaitingMatches}
                >
                  Automatisch zuweisen
                </button>
              </div>
            </div>
            {tournament.status === 'PAUSED' && <div className="assignment-message" role="status">Turnier pausiert: Neue Tischzuweisungen sind gesperrt. Laufende Spiele dürfen beendet werden.</div>}
            {assignmentMessage && <div className="assignment-message" role="status">{assignmentMessage}</div>}
            <div className="overview-table-grid">
              {Array.from({ length: tournament.tables }, (_, index) => {
                const tableName = `Tisch ${index + 1}`;
                const match = matchesByTable.get(tableName);
                const isLive = match?.status === 'LIVE' || match?.status === 'CONFIRMATION' || match?.status === 'READY';
                const isBlocked = blockedTables.has(tableName);
                return (
                  <article
                    className={`card overview-table-card ${match ? 'busy' : isBlocked ? 'blocked' : 'table-drop-target'}${match && requiresFinalApproval(match.bestOf, match.sets ?? [], activeStage?.type === 'SWISS') && match.status !== 'FINISHED' ? ' awaiting-approval' : ''}`}
                    key={tableName}
                    onDragOver={(event) => { if (tournament.status === 'RUNNING' && !match && !isBlocked) event.preventDefault(); }}
                    onDrop={(event) => {
                      if (tournament.status !== 'RUNNING' || match || isBlocked) return;
                      event.preventDefault();
                      const matchId = event.dataTransfer.getData('text/mock-match-id');
                      if (matchId) assignToTable(matchId, tableName);
                    }}
                  >
                    <div className="table-status-top">
                      <strong>{tableName}</strong>
                      <div className="table-head-controls">
                        <span className={isLive ? 'badge live' : isBlocked ? 'badge blocked-badge' : 'badge'}>{isLive ? 'läuft' : isBlocked ? 'gesperrt' : 'frei'}</span>
                        {isLive && isBlocked && <span className="badge blocked-badge">gesperrt</span>}
                        <button
                          className="btn small table-lock-button"
                          type="button"
                          aria-label={`${tableName} ${isBlocked ? 'freigeben' : 'sperren'}`}
                          aria-pressed={isBlocked}
                          onClick={() => toggleTableLock(tableName)}
                        >{isBlocked ? 'Freigeben' : 'Sperren'}</button>
                      </div>
                    </div>
                    {match ? (
                      <>
                        <span className="muted">{match.phase} · {match.round} · BO{match.bestOf}</span>
                        <SetBySetEntry match={match} swissAdminEntry={activeStage?.type === 'SWISS'} onSaved={refreshRuntime} compact sideARecord={activeSwissRecords.get(match.sideA)} sideBRecord={activeSwissRecords.get(match.sideB)} />
                        {!(requiresFinalApproval(match.bestOf, match.sets ?? [], activeStage?.type === 'SWISS') && match.status !== 'FINISHED') && (
                          <div className="table-operational-actions">
                            <button className="btn small" type="button" onClick={() => setMovingMatchId((old) => old === match.id ? null : match.id)}>Tisch wechseln</button>
                            <button className="btn small" type="button" onClick={() => unassignFromTable(match.id)}>Zuweisung aufheben</button>
                          </div>
                        )}
                        {movingMatchId === match.id && !(requiresFinalApproval(match.bestOf, match.sets ?? [], activeStage?.type === 'SWISS') && match.status !== 'FINISHED') && (
                          <div className="table-assignment-picker" role="group" aria-label="Neuen Tisch auswählen">
                            {freeTables.length ? freeTables.map((table) => (
                              <button key={table} className="btn small" type="button" onClick={() => moveToTable(match.id, table)}>{table}</button>
                            )) : <span className="muted">Kein anderer freier Tisch.</span>}
                          </div>
                        )}
                        {isMockThirdPlaceMatch(match.id) && !match.sets?.length && (
                          <button className="btn small third-place-skip" type="button" onClick={() => setSkipThirdMatchId(match.id)}>
                            Nicht austragen · beide Platz 3
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="free-table-message">
                        <strong>{isBlocked ? 'Für dieses Turnier gesperrt' : 'Frei für die nächste Partie'}</strong>
                        <span>{isBlocked ? 'Keine automatische oder manuelle Zuweisung möglich.' : 'Spiel hierher ziehen oder über „Zuweisen“ auswählen.'}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

          </div>

          <div className="control-overview-columns">
            <main>
              <div className="control-section-head control-section-spaced"><div><h2>Nächste Spiele</h2><p className="muted">Pausenzeit seit dem letzten tatsächlich gespielten Match; aktualisiert sich automatisch.</p></div></div>
              <div className="match-queue">
                {nextMatches.map((match, index) => (
                  <article
                    className="match-queue-row expanded draggable-match"
                    key={match.id}
                    draggable={tournament.status === 'RUNNING' && !isMockThirdPlaceMatch(match.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/mock-match-id', match.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <span className="queue-position">{index + 1}</span>
                    <div className="match-queue-main">
                      <strong>{match.sideA}{activeSwissRecords.get(match.sideA) && <span className="swiss-record">{activeSwissRecords.get(match.sideA)}</span>} <em className="pause-time">{formatPlayerRest(match.pauseA)}</em></strong>
                      <strong>{match.sideB}{activeSwissRecords.get(match.sideB) && <span className="swiss-record">{activeSwissRecords.get(match.sideB)}</span>} <em className="pause-time">{formatPlayerRest(match.pauseB)}</em></strong>
                      <span className="muted">{match.phase} · {match.round}{match.matchDay ? ` · Spieltag ${match.matchDay}` : ''}{match.note ? ` · ${match.note}` : ''}</span>
                      {assigningMatchId === match.id && (
                        <div className="table-assignment-picker">
                          {freeTables.length === 0 ? (
                            <span className="muted">Aktuell ist kein Tisch frei.</span>
                          ) : freeTables.map((table) => (
                            <button className="btn small" type="button" key={table} onClick={() => assignToTable(match.id, table)}>{table}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="badge">{match.table}</span>
                    <div className="queue-row-actions">
                      <>
                        {isMockThirdPlaceMatch(match.id) && (
                          <button className="btn small third-place-skip" type="button" onClick={() => setSkipThirdMatchId(match.id)} title="Kein Spiel um Platz 3: beide Halbfinalverlierer werden als Dritte gewertet.">
                            Nicht austragen · beide Platz 3
                          </button>
                        )}
                        <button className="btn small primary" type="button" disabled={tournament.status !== 'RUNNING' || freeTables.length === 0} onClick={() => autoAssignMatch(match.id)}>Automatisch zuweisen</button>
                        <button className="btn small" type="button" disabled={tournament.status !== 'RUNNING'} onClick={() => setAssigningMatchId((current) => current === match.id ? null : match.id)}>Zuweisen</button>
                      </>
                    </div>
                  </article>
                ))}
              </div>
            </main>
            <aside className="control-side">
              <div className="card control-status-card">
                <h3>Turnierstatus</h3>
                <div className="control-metrics-grid">
                  <div><span className="muted">Tischbelegung</span><strong>{tableMatches.length}/{tournament.tables} · {blockedTables.size} gesperrt</strong></div>
                  <div><span className="muted">Wartende Spiele</span><strong>{nextMatches.length}</strong></div>
                  <div><span className="muted">Offene Bestätigungen</span><strong>{openConfirmations}</strong></div>
                  <div><span className="muted">Restzeit grob</span><strong title="Prognose aus offenen Spielen, Best-of und verfügbaren Tischen (15 Minuten je Satz).">{restTimeLabel}</strong></div>
                </div>
              </div>
              {tournament.venueLayout && (
                <div className="card control-hall-layout">
                  <h3>Hallenlayout</h3>
                  <VenueLayoutMini layout={tournament.venueLayout} />
                </div>
              )}
              <div className="card control-alert-card">
                <div className="control-section-head"><h3>Schnellzugriff</h3><span className="badge">Mock</span></div>
                <button className="btn" type="button" onClick={() => setTab('flow')}>Tabellen & Turnierbaum</button>
                <button className="btn" type="button" onClick={() => setTab('participants')}>Teilnehmer verwalten</button>
                <button className="btn" type="button" onClick={() => setTab('matches')}>Alle Spiele</button>
              </div>
            </aside>
          </div>
        </section>
      )}

      {tab === 'audit' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Änderungsprotokoll</h2><p className="muted">Nachvollziehbare lokale Änderungen an Tischen, Ergebnissen, Bestätigungen und Turnierpause. „Turnierleitung (lokal)“ ist im Prototyp keine verifizierte Benutzeridentität.</p></div></div>
          <div className="audit-list">
            {auditEntries.length === 0 && <p className="muted">Noch keine Aktionen protokolliert.</p>}
            {auditEntries.map((entry) => (
              <article className="audit-row" key={entry.id}>
                <span className="muted">{new Date(entry.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })}</span>
                <div><strong>{entry.description}</strong><div className="muted">{entry.actor}{entry.matchId ? ` · ${entry.matchId}` : ''}</div>
                  {(entry.before || entry.after) && <div className="audit-values"><span>Vorher: {entry.before ?? '–'}</span><span>Nachher: {entry.after ?? '–'}</span></div>}
                  {entry.action === 'RESULT_CORRECTED' && auditEntries.find((item) => item.matchId === entry.matchId && ['RESULT_CORRECTED', 'RESULT_RECORDED', 'RESULT_RESTORED'].includes(item.action))?.id === entry.id && <button className="btn small" type="button" onClick={() => { if (restoreMockCorrectedResult(tournament, entry.id)) refreshRuntime(); else setAssignmentMessage('Korrektur ist bereits gesperrt oder wurde zwischenzeitlich geändert.'); }}>Korrektur rückgängig machen</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'flow' && (
        <section className="control-tab-panel competition-flow-page" data-draw-version={drawVersion} data-phase-version={phaseVersion}>
          <div className="control-section-head">
            <div>
              <h2>Turnierverlauf</h2>
              <p className="muted">Eine Phase endet automatisch mit dem letzten abgeschlossenen Spiel. Danach wird die nächste Phase bearbeitbar; mit ihrem Start wird die Auslosung eingefroren.</p>
            </div>
            {nextStartableStage && !activeStage && tournament.hasStarted && (
              <button className="btn primary" type="button" onClick={requestStartNextPhase}>Nächste Phase starten</button>
            )}
          </div>
          <div className="phase-lifecycle-strip phase-navigation-strip">
            {tournament.stages.map((stage, index) => {
              const completed = isStageCompleted(tournament, stage);
              const started = isStageStarted(tournament, stage);
              const editable = isStageEditable(tournament, stage);
              const state = completed ? 'Beendet' : started ? 'Läuft' : editable ? 'Bearbeitbar' : 'Gesperrt';
              return (
                <button
                  className={`phase-lifecycle-item phase-nav-button ${state.toLowerCase()} ${selectedStage?.id === stage.id ? 'selected' : ''}`}
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedStageId(stage.id)}
                >
                  <span>Phase {index + 1}</span>
                  <strong>{stage.name}</strong>
                  <span className="badge">{state}</span>
                </button>
              );
            })}
          </div>
          {selectedStage && (
            <div className="prestart-stage-block" key={selectedStage.id}>
              <PrestartDrawEditor
                tournament={tournament}
                stage={selectedStage}
                onChanged={() => setDrawVersion((value) => value + 1)}
              />
              {isStageLockedWaiting(tournament, selectedStage) ? (
                <div className="card locked-stage-placeholder">
                  <strong>Teilnehmer dieser Phase stehen noch nicht fest.</strong>
                  <span className="muted">Nach Abschluss der vorherigen Phase werden die tatsächlichen Qualifizierten übernommen und die Phase kann vorbereitet werden.</span>
                </div>
              ) : (
                <StageCompetitionView tournamentId={tournament.id} tournament={tournament} stage={selectedStage} onDrawChanged={() => setDrawVersion((value) => value + 1)} onEditResult={setAdminEditMatchId} />
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'matches' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Alle Spiele</h2><p className="muted">Zentrale Liste für laufende und kommende Partien.</p></div></div>
          {allTournamentMatches.length === 0 && <p className="muted">Noch keine Spiele verfügbar. Die Paarungen erscheinen hier, sobald du die erste Phase gestartet hast. Die Auslosung kannst du vorher im Turnierverlauf bearbeiten.</p>}
          {allTournamentMatches.length > 0 && <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Phase</th><th>Spiel</th><th>Pausenzeit</th><th>Tisch</th><th>Stand</th><th></th></tr></thead>
              <tbody>{allTournamentMatches.map((match) => (
                <tr key={match.id}>
                  <td><span className={match.status === 'LIVE' ? 'badge live' : match.status === 'READY' ? 'badge ready' : 'badge'}>{match.status}</span></td>
                  <td>{match.phase}<div className="muted">{match.round}</div></td>
                  <td><strong>{match.sideA}{activeSwissRecords.get(match.sideA) && <span className="swiss-record">{activeSwissRecords.get(match.sideA)}</span>}</strong><div>{match.sideB}{activeSwissRecords.get(match.sideB) && <span className="swiss-record">{activeSwissRecords.get(match.sideB)}</span>}</div></td>
                  <td>{formatMockMatchRest(match, 'A')} / {formatMockMatchRest(match, 'B')}</td>
                  <td>{match.table}</td><td>{match.score}</td>
                  <td><div className="actions compact-actions"><button className="btn small" type="button" onClick={() => setAdminEditMatchId(match.id)}>Ergebnis anzeigen</button>{match.status === 'FINISHED' && (match.sets?.length ?? 0) > 0 && !((getMockMatchConfirmation(match.id)?.confirmedA) && (getMockMatchConfirmation(match.id)?.confirmedB)) && <button className="btn small" type="button" onClick={() => { if (adminConfirmMockMatch(tournament, match.id)) refreshRuntime(); }}>Als Turnierleitung bestätigen</button>}{match.status === 'FINISHED' && canEditMockMatch(tournament, match.id) && <button className="btn small" type="button" onClick={() => setAdminEditMatchId(match.id)}>Bearbeiten</button>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
        </section>
      )}

      {tab === 'final' && tournament.status === 'FINISHED' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Endplatzierungen</h2>
            <p className="muted">Abschlussübersicht aller Teilnehmer. Bei Ausscheiden in früheren Gruppenphasen wird der Gruppenplatz und kein erfundener Gesamtrang angezeigt.</p>
          </div></div>
          <div className="table-wrap final-standings-table"><table>
            <thead><tr><th>Endplatzierung</th><th>Teilnehmer</th><th>Letzte Phase</th><th>Status</th></tr></thead>
            <tbody>{finalStandings.map((row) => (
              <tr key={row.name}>
                <td><strong>{row.placement ?? (row.status === 'Zurückgezogen' ? 'Zurückgezogen' : 'Keine Platzierung')}</strong></td>
                <td>{row.name}</td>
                <td>{tournament.stages[row.stageIndex]?.name ?? '–'}</td>
                <td><span className="badge">{row.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === 'participants' && (
        <section className="card control-tab-panel">
          <div className="control-section-head">
            <div><h2>Teilnehmer</h2><p className="muted">Spielercodes, Daten, Spiele und Rückzug an einer Stelle.</p></div>
            {!tournament.hasStarted && ['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status) && (
              <button className="btn primary" type="button" onClick={() => { setShowParticipantAdd((current) => !current); setParticipantAddError(''); }}>
                {showParticipantAdd ? 'Nachmeldung schließen' : '+ Teilnehmer nachtragen'}
              </button>
            )}
          </div>
          {showParticipantAdd && !tournament.hasStarted && (
            <form className="participant-add-panel" onSubmit={(event) => { event.preventDefault(); handleAddParticipant(); }}>
              <strong>{tournament.discipline === 'DOUBLES' ? 'Doppelpaar nachtragen' : 'Spieler nachtragen'}</strong>
              <div className="participant-add-fields">
                <label className="field">Vorname<input value={newParticipantFirst} onChange={(event) => setNewParticipantFirst(event.target.value)} /></label>
                <label className="field">Nachname<input value={newParticipantLast} onChange={(event) => setNewParticipantLast(event.target.value)} /></label>
                {tournament.discipline === 'DOUBLES' && (
                  <>
                    <label className="field">Partner: Vorname<input value={newPartnerFirst} onChange={(event) => setNewPartnerFirst(event.target.value)} /></label>
                    <label className="field">Partner: Nachname<input value={newPartnerLast} onChange={(event) => setNewPartnerLast(event.target.value)} /></label>
                  </>
                )}
              </div>
              <div className="actions"><button className="btn small primary" type="submit">Nachtragen</button><button className="btn small" type="button" onClick={() => setShowParticipantAdd(false)}>Abbrechen</button></div>
              {participantAddError && <p role="alert" className="field-error">{participantAddError}</p>}
              <p className="field-hint">Neue Teilnehmer werden vor Turnierstart direkt in die Auslosung aufgenommen.</p>
            </form>
          )}
          <div className="participant-control-list">
            {participants.map((participant, index) => {
              const progress = getMockParticipantProgress(tournament, participant);
              const isWithdrawn = progress.status === 'Zurückgezogen';
              const statusText = progress.status === 'Aktiv' && tableMatches.some((match) => match.sideA === participant || match.sideB === participant) ? 'Spielt gerade' : progress.status;
              return (
                <article className={isWithdrawn ? 'participant-control-row withdrawn' : 'participant-control-row'} key={`${participant}-${index}`}>
                  <span className="participant-list-number">{index + 1}</span>
                  <div className="participant-control-identity"><strong>{participant}</strong><span className={isWithdrawn ? "participant-inline-status withdrawn" : progress.status === 'Ausgeschieden' ? 'participant-inline-status eliminated' : 'participant-inline-status'}>{statusText}</span>{progress.placement && <span className="participant-placement">{progress.placement}</span>}</div>
                  <code>{tournament.participantCodes?.[participant] ?? String(4100 + index).slice(-4)}</code>
                  <div className="participant-row-actions">
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'edit' })}>Daten bearbeiten</button>
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'games' })}>Spielübersicht</button>
                    {isWithdrawn ? (
                      canRestoreMockParticipant(tournament, participant)
                        ? <button className="btn small" type="button" onClick={() => { if (restoreMockParticipant(tournament, participant)) { setParticipantVersion((value) => value + 1); setDrawVersion((value) => value + 1); refreshRuntime(); } }}>Rückzug rückgängig</button>
                        : <span className="btn small withdrawal-locked" aria-disabled="true" title="Nur vor einem Phasenstart und bei vorheriger Qualifikation möglich; nicht bei Rückzug während einer Runde.">Rückzug gesperrt</span>
                    ) : progress.status === 'Ausgeschieden'
                      ? <span className="btn small withdrawal-locked" aria-disabled="true" title="Bereits ausgeschiedene Teilnehmer können nicht zurückgezogen werden.">Rückzug gesperrt</span>
                      : <button className="btn small danger-outline" type="button" onClick={() => { if (withdrawMockParticipant(tournament, participant)) refreshRuntime(); }}>Zurückziehen</button>}
                  </div>
                  {participantPanel?.name === participant && (
                    <div className="participant-inline-panel">
                      {participantPanel.mode === 'edit' ? (
                        <>
                          <ParticipantEditFields key={participant} name={participant} code={tournament.participantCodes?.[participant] ?? String(4100 + index).slice(-4)}
                            onSave={(first, last, code) => {
                              if (!updateMockParticipantName(tournament.id, participant, first, last, code)) return false;
                              setParticipantPanel(null);
                              setParticipantVersion((value) => value + 1);
                              refreshRuntime();
                              return true;
                            }} onCancel={() => setParticipantPanel(null)} />
                        </>
                      ) : (
                        <>
                          <strong>Alle Partien von {participant}</strong>
                          <div className="participant-games-table table-wrap">
                            <table><thead><tr><th>Phase</th><th>Runde</th><th>Gegner</th><th>Status</th><th>Ergebnis</th><th>Aktion</th></tr></thead><tbody>
                              {allTournamentMatches.filter((match) => match.sideA === participant || match.sideB === participant).map((match) => {
                                const stage = tournament.stages.find((item) => item.id === match.stageId);
                                return <tr key={match.id}>
                                  <td>{match.phase}</td><td>{match.round}</td>
                                  <td>{match.sideA === participant ? match.sideB : match.sideA}</td>
                                  <td>{match.status}</td><td><MatchResultDetails {...resultForParticipant(match.score, match.sets, match.sideB === participant)} /></td>
                                  <td>{match.status === 'FINISHED' && stage && canEditMockMatch(tournament, match.id)
                                    ? <button className="btn small" type="button" onClick={() => setAdminEditMatchId(match.id)}>Spiel bearbeiten</button>
                                    : stage && isStageStarted(tournament, stage) && match.status !== 'FINISHED'
                                      ? <Link className="btn small" to={`/score/${match.id}`}>Spiel bearbeiten</Link>
                                      : <span className="muted">{match.status === 'FINISHED' ? 'Gesperrt' : 'Phase noch nicht gestartet'}</span>}</td>
                                </tr>;
                              })}
                            </tbody></table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {adminEditMatchId && (() => {
        const found = findMockRuntimeMatch(adminEditMatchId);
        if (!found) return null;
        const stage = found.tournament.stages.find((item) => item.id === found.match.stageId);
        return (
          <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setAdminEditMatchId(null)}>
            <section className="prototype-modal admin-result-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="player-games-modal-head">
                <div><span className="badge">TURNIERLEITUNG</span><h2>{found.match.status === 'FINISHED' && !canEditMockMatch(tournament, found.match.id) ? 'Ergebnis anzeigen' : 'Spiel bearbeiten / Ergebnis anzeigen'}</h2></div>
                <button className="btn small" type="button" onClick={() => setAdminEditMatchId(null)}>Schließen</button>
              </div>
              <p className="muted">{found.match.sideA} gegen {found.match.sideB} · {found.match.round} · Best-of-{found.match.bestOf}</p>
              <SetBySetEntry
                match={found.match}
                swissAdminEntry={stage?.type === 'SWISS'}
                allowEditFinished={canEditMockMatch(tournament, found.match.id)}
                onSaved={refreshRuntime}
                onCompleted={() => {
                  if (stage) refreshCompletedStageQualifiers(tournament, stage);
                  refreshRuntime();
                }}
              />
            </section>
          </div>
        );
      })()}
      {skipThirdMatchId && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSkipThirdMatchId(null)}>
          <section className="prototype-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <span className="badge">SPIEL UM PLATZ 3</span>
            <h2>Spiel nicht austragen?</h2>
            <p>Die beiden Halbfinalverlierer erhalten gemeinsam Platz 3. Ein Platz 4 wird nicht vergeben.</p>
            <div className="actions">
              <button className="btn primary" type="button" onClick={() => { if (skipMockThirdPlaceMatch(tournament, skipThirdMatchId)) refreshRuntime(); setSkipThirdMatchId(null); }}>Beide auf Platz 3 setzen</button>
              <button className="btn" type="button" onClick={() => setSkipThirdMatchId(null)}>Abbrechen</button>
            </div>
          </section>
        </div>
      )}
      {startModal && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setStartModal(null)}>
          <section className="prototype-modal start-phase-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <span className="badge ready">START BESTÄTIGEN</span>
            <h2>{startModal.kind === 'tournament' ? 'Turnier starten?' : 'Nächste Phase starten?'}</h2>
            <p>„{startModal.stageName}“ wird gestartet. Die aktuelle Auslosung bzw. Setzung dieser Phase wird damit eingefroren.</p>
            <p className="muted">Nach dem Start können die Platzierungen dieser Phase nicht mehr per Drag & Drop verändert werden.</p>
            <div className="actions">
              <button className="btn primary" type="button" onClick={startModal.kind === 'tournament' ? performStartTournament : performStartNextPhase}>Jetzt starten</button>
              <button className="btn" type="button" onClick={() => setStartModal(null)}>Abbrechen</button>
            </div>
          </section>
        </div>
      )}
      {phaseCompletedModal && (
        <div className="prototype-modal-backdrop">
          <section className="prototype-modal" role="dialog" aria-modal="true" aria-labelledby="phase-complete-title">
            <span className="badge live">PHASE BEENDET</span>
            <h2 id="phase-complete-title">{phaseCompletedModal.stageName} ist abgeschlossen</h2>
            <p className="muted">{phaseCompletedModal.nextStageName ? `${phaseCompletedModal.nextStageName} kann jetzt im Turnierverlauf vorbereitet werden.` : 'Damit ist auch die letzte Phase des Turniers abgeschlossen.'}</p>
            <div className="actions">
              <button className="btn primary" type="button" onClick={() => { setTab('flow'); setPhaseCompletedModal(null); }}>Zum Turnierverlauf</button>
              <button className="btn" type="button" onClick={() => setPhaseCompletedModal(null)}>Schließen</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
