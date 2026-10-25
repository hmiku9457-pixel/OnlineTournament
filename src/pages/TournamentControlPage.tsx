import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PrestartDrawEditor } from '@/components/PrestartDrawEditor';
import { DrawActionButton } from '@/components/DrawActionButton';
import { StageCard } from '@/components/StageCard';
import { SportResultEntry } from '@/components/SportResultEntry';
import { requiresFinalApproval } from '@/domain/matchFinalization';
import { scoreDecisionSuffix, sportScoring } from '@/domain/sportScoring';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { GroupMatchDayList } from '@/components/GroupMatchDayList';
import { BracketLiveStatus, BracketScoreCells, BracketSetScores, BracketStageHeader, BracketStageValues } from '@/components/BracketScoreStages';
import { BracketRoundViewport } from '@/components/BracketRoundViewport';
import { SwissRoundCard } from '@/components/SwissRoundCard';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { SwissBuchholzHelpModal } from '@/components/SwissBuchholzHelpModal';
import { SwissCutoffDecisionModal } from '@/components/SwissCutoffDecisionModal';
import { SwissRoundRobinHistory } from '@/components/SwissRoundRobinHistory';
import { RegularRoundRobinView } from '@/components/RegularRoundRobinView';
import { getSwissCutoffRowIndex } from '@/components/SwissQualificationCutoff';
import { getBracketScoreStages } from '@/domain/bracketScoreStages';
import { PlayerGameOutcome } from '@/components/PlayerGameOutcome';
import { summarizeParticipantStatuses } from '@/domain/participantStatistics';
import { getGroupQualificationHints } from '@/domain/groupQualification';
import { filterControlMatches, filterControlQueueMatches, summarizeControlProgress, type ControlMatchFilters, type ControlMatchFilter, type ControlQueueFilters, type ControlQueueStatusFilter } from '@/domain/controlOverview';
import { resultForMatchParticipant } from '@/services/matchPresentation';
import type { TournamentStage, TournamentStatus } from '@/domain/types';
import { buildMockBracket, buildMockGroups, buildSwissStandings, getPreviousStageFinishLabels, getSwissUnplayedWinWinners } from '@/services/mockCompetitionViews';
import { getActiveSwissRecordLookup } from '@/services/activeSwissRecords';
import { assignMockMatchToTable, unassignMockMatch, moveMockMatchToTable, getSwissRecordBeforeRound, getSwissCurrentRecord, formatMockMatchRest, restoreMockCorrectedResult, findMockRuntimeMatch, getMockAssignmentBlockReason, getMockParticipantTableConflicts, getMockQueueAssignableTables, formatPlayerRest, getMockRuntimeMatches, getMockStageBaseMatches, getMockStageMatches, getSwissRoundRobinMatches, getSwissCutoffSetMatches, getRuntimeParticipantNames, getTotalSwissRoundCount, getSwissCutoffHistory, refreshCompletedStageQualifiers, canEditMockMatch, reconcileWithdrawalsForTournament, getPendingSwissCutoff, getPendingMockApproval, approveMockProgress, abortMockTournament, beginSwissCutoffSetMatch, recordSwissCutoffLot, beginSwissCutoffPlayoff, resetSwissCutoffSets } from '@/services/mockRuntime';
import { canWithdrawMockParticipant, withdrawMockParticipant, canRestoreMockParticipant, restoreMockParticipant, isMockThirdPlaceMatch, skipMockThirdPlaceMatch } from '@/services/mockRuntime';
import { getStageWithdrawalLabel, getWithdrawalLabel } from '@/services/mockWithdrawals';
import { getMockConfirmedFinalStandings, getMockParticipantProgress } from '@/services/mockParticipantProgress';
import { FinalStandingsList } from '@/components/FinalStandingsList';
import { VenueLayoutMini } from '@/components/VenueLayout';
import { displayVenueMessage, displayVenueName, getVenueTerminology } from '@/domain/venueTerminology';
import { TableStateLegend, TournamentHallView } from '@/components/TournamentHallView';
import { ControlHelpButton, TournamentControlHelp } from '@/components/TournamentControlHelp';
import type { ControlHelpTopic } from '@/domain/controlGuide';
import { canEditDraw, getBracketSlots, getPinnedBracketSlots, randomizeBracketSlots, randomizeSwissOrder, applySeededBracketSlots, setBracketSlot, toggleBracketPin } from '@/services/mockDrawStore';
import { addMockParticipant, updateMockParticipantName, getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { generateUniquePlayerCode } from '@/services/mockPlayerCodes';
import { getStageEntrants, getActiveStage, getNextStartableStage, isStageCompleted, isStageEditable, isStageLockedWaiting, isStageStarted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';
import { getBlockedMockTables, setMockTableBlocked } from '@/services/mockTableLocks';
import { estimateRemainingTournamentMinutes, formatRemainingTournamentDuration } from '@/services/mockDuration';
import { getMockAudit } from '@/services/mockAudit';
import type { MockAuditEntry } from '@/services/mockAudit';

type ControlTab = 'overview' | 'flow' | 'matches' | 'participants' | 'final' | 'audit';

const tabs: Array<{ id: ControlTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'flow', label: 'Turnierverlauf' },
  { id: 'participants', label: 'Teilnehmer' },
  { id: 'matches', label: 'Spiele' },
  { id: 'audit', label: 'Protokoll' },
];

const matchFilterOptions: Array<{ value: ControlMatchFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'live', label: 'Laufend / zugewiesen' },
  { value: 'waiting', label: 'Wartend' },
  { value: 'finished', label: 'Abgeschlossen' },
];

const queueStatusOptions: Array<{ value: ControlQueueStatusFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'assignable', label: 'Zuweisbar' },
  { value: 'blocked', label: 'Aktuell blockiert' },
];

const emptyQueueFilters: ControlQueueFilters = { status: 'all', group: '', matchDay: '', search: '' };

interface CorrectionNotice { key: string; message: string; undoAuditId?: string; error?: boolean }

function statusLabel(status: TournamentStatus) {
  switch (status) {
    case 'READY': return 'Bereit';
    case 'RUNNING': return 'Läuft';
    case 'PAUSED': return 'Pausiert';
    case 'REGISTRATION': return 'Anmeldung';
    case 'FINISHED': return 'Beendet';
    case 'ABORTED': return 'Abgebrochen';
    default: return status;
  }
}

function matchStatusLabel(status: string) {
  switch (status) {
    case 'WAITING': return 'Wartet';
    case 'READY': return 'Bereit';
    case 'LIVE': return 'Läuft';
    case 'CONFIRMATION': return 'Endergebnis prüfen';
    case 'FINISHED': return 'Abgeschlossen';
    case 'CANCELLED': return 'Nicht ausgetragen';
    default: return status;
  }
}

function StandingRatio({ value }: { value: string }) {
  const [left = '0', right = '0'] = value.split(':');
  return <span className="standing-ratio"><span>{left}</span><span>:</span><span>{right}</span></span>;
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
  const [showSwissBuchholzHelp, setShowSwissBuchholzHelp] = useState(false);
  const [swissDrawNotice, setSwissDrawNotice] = useState<string | null>(null);
  const previousFinishLabels = getPreviousStageFinishLabels(tournament, stage);
  const scoreSport = sportScoring(tournament.sport).mode === 'score';
  const scoreUnit = sportScoring(tournament.sport).plural;

  if (stage.type === 'ROUND_ROBIN') {
    return <RegularRoundRobinView tournament={tournament} stage={stage} onEditResult={onEditResult} />;
  }

  if (stage.type === 'GROUPS') {
    const groups = buildMockGroups(tournament, stage);
    const nextStage = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
    const qualificationCount = nextStage
      ? stage.advancement.type === 'top_n' && stage.advancement.value > 0
        ? stage.advancement.value : Math.max(1, Number(nextStage.settings.entrants) || 1)
      : 0;
    const stageFinished = isStageCompleted(tournament, stage);
    const withdrawn = new Set(groups.flatMap((group) => group.standings.map((row) => row.name))
      .filter((name) => Boolean(getStageWithdrawalLabel(tournament, name, stage.id))));
    const qualificationHints = getGroupQualificationHints(groups, qualificationCount, withdrawn);
    const actualQualified = stageFinished && nextStage ? new Set(getStageEntrants(tournament, nextStage)) : null;
    return (
      <section className="competition-stage-section" id={`${tournamentId}-${stage.id}`}>
        <div className="competition-stage-head"><div><span className="badge">GRUPPEN</span><h3>{stage.name}</h3></div><span className="muted">{groups.length} Gruppen</span></div>
        {nextStage && qualificationCount > 0 && (
          <div className="group-qualification-legend" aria-label="Kennzeichnung der Qualifikationsplätze">
            <span><i className="group-qualification-key qualified" aria-hidden="true" />{stageFinished ? 'Qualifiziert' : 'Aktuell auf Qualifikationsplatz'}</span>
            {!stageFinished && qualificationHints.possible.size > 0 && <span><i className="group-qualification-key possible" aria-hidden="true" />Weitere Plätze im Gruppenvergleich möglich</span>}
            {!stageFinished && <small>Vorläufig bis zum Abschluss der Gruppenphase</small>}
          </div>
        )}
        <div className="group-overview-grid">
          {groups.map((group) => (
            <article className="card group-overview-card" key={group.id}>
              <h4>{group.label}</h4>
              <div className={scoreSport ? 'mini-standing-table detailed score-standing-table' : 'mini-standing-table detailed'}>
                <div className="mini-standing-head"><span>#</span><span>Spieler</span><span>Sp.</span><span>S</span><span>{scoreSport ? 'U' : 'N'}</span><span>{scoreSport ? 'N' : 'Sätze'}</span><span>{scoreSport ? scoreUnit : '±'}</span><span>{scoreSport ? '±' : 'Bälle'}</span><span>{scoreSport ? 'Pkt.' : '±'}</span></div>
                {group.standings.map((row) => {
                  const isQualified = actualQualified ? actualQualified.has(row.name) : qualificationHints.projected.has(row.name);
                  const isPossible = !actualQualified && qualificationHints.possible.has(row.name);
                  return (
                    <div className={`mini-standing-row${isQualified ? ' qualification-zone' : isPossible ? ' qualification-possible' : ''}`} key={row.name}
                      title={isQualified ? stageFinished ? 'Für die nächste Phase qualifiziert' : 'Aktuell auf einem vorläufigen Qualifikationsplatz' : isPossible ? 'Weitere Qualifikationsplätze werden gruppenübergreifend vergeben' : undefined}>
                      <span>{row.rank}</span><button className="standing-player-button" type="button" onClick={() => setSelectedGroupPlayer({ groupLabel: group.label, player: row.name })}><strong>{row.name}</strong>{getStageWithdrawalLabel(tournament, row.name, stage.id) && <span className="standing-withdrawn" title="Zeitpunkt des Rückzugs">{getStageWithdrawalLabel(tournament, row.name, stage.id)}</span>}{previousFinishLabels[row.name] && <small>{previousFinishLabels[row.name]}</small>}</button><span>{row.played}</span><span>{row.wins}</span><span>{scoreSport ? row.draws : row.losses}</span>{scoreSport ? <><span>{row.losses}</span><StandingRatio value={row.balls} /><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span><strong>{row.points}</strong></> : <><StandingRatio value={row.sets} /><span>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</span><StandingRatio value={row.balls} /><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span></>}
                    </div>
                  );
                })}
              </div>
              <GroupMatchDayList
                matches={group.matches}
                sport={tournament.sport}
                onEditResult={onEditResult}
                sideLabel={(name, match) => match.score === 'W.O.' && getStageWithdrawalLabel(tournament, name, stage.id)
                  ? `Rückzug (${name})` : name}
              />
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
                    const displayedResult = resultForMatchParticipant({ ...match, sport: tournament.sport }, selectedGroupPlayer.player);
                    return (
                      <div className="player-game-row" key={match.id}>
                        <span className="muted">Spieltag {match.matchDay}</span>
                        <strong>vs. {opponent}</strong>
                        <span className="player-game-result-cell">
                          <PlayerGameOutcome score={displayedResult.score} finished={match.status === 'played'} />
                          <MatchResultDetails score={displayedResult.score} sets={displayedResult.sets} sport={tournament.sport} onOpenResult={match.status !== 'open' && onEditResult ? () => { setSelectedGroupPlayer(null); onEditResult(match.id); } : undefined} />
                        </span>
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
    const swissEditable = canEditDraw(tournament, stage);
    const swissRoundFixtures = getMockStageBaseMatches(tournament, stage);
    const swissUnplayedWinners = new Set(getSwissUnplayedWinWinners(tournament, stage));
    const nextStage = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
    const qualifyingPlaces = nextStage
      ? stage.advancement.type === 'top_n' && stage.advancement.value > 0
        ? stage.advancement.value : Math.max(1, Number(nextStage.settings.entrants) || 1)
      : 0;
    const withdrawnSwissPlayers = new Set(standings
      .filter((row) => Boolean(getStageWithdrawalLabel(tournament, row.name, stage.id)))
      .map((row) => row.name));
    const swissCutoffIndex = getSwissCutoffRowIndex(standings, qualifyingPlaces, withdrawnSwissPlayers);
    const swissFinished = isStageCompleted(tournament, stage);
    const cutoffHistory = getSwissCutoffHistory(tournament, stage);
    const lotPlayers = cutoffHistory?.mode === 'LOT'
      ? new Set(cutoffHistory.lotPlayers ?? cutoffHistory.eliminated.concat(cutoffHistory.winners ?? [])) : undefined;
    const lotWinners = cutoffHistory?.mode === 'LOT'
      ? new Set(cutoffHistory.lotWinners ?? cutoffHistory.winners ?? []) : undefined;
    const decisionTags: Record<string, { label: string; qualified: boolean }> = {};
    if (cutoffHistory?.winners?.length && cutoffHistory.mode !== 'LOT') {
      const chosen = new Set(cutoffHistory.winners);
      const isRoundRobin = cutoffHistory.mode === 'ROUND_ROBIN';
      const affected = isRoundRobin
        ? [...new Set(cutoffHistory.extraRounds?.flatMap((round) => round.matches.flatMap((match) => [match.sideA, match.sideB])) ?? [])]
        : [...new Set([...cutoffHistory.eliminated, ...cutoffHistory.winners])];
      affected.forEach((name) => {
        decisionTags[name] = { label: isRoundRobin ? 'Jeder gegen Jeden' : 'Entscheidungsspiel', qualified: chosen.has(name) };
      });
    }
    return (
      <section className="competition-stage-section">
        <div className="competition-stage-head"><div><span className="badge">SCHWEIZER SYSTEM</span><h3>{stage.name}</h3></div><div className="actions"><span className="muted">{getTotalSwissRoundCount(tournament, stage)} Runden</span>{swissEditable && <button className="btn small" type="button" onClick={() => {
                  if (randomizeSwissOrder(tournament, stage)) {
                    setSwissDrawNotice('Neue Zufallsreihenfolge gespeichert.');
                    onDrawChanged?.();
                  }
                }}>Neue Zufallsreihenfolge</button>}</div></div>
        {!swissEditable && isStageStarted(tournament, stage) && (
          <p className="swiss-draw-lock-note">Die Startreihenfolge ist seit Beginn des Schweizer Systems eingefroren. Sie kann nur vor dem Phasenstart verändert werden.</p>
        )}
        <div className="swiss-progress-layout">
          <SwissStandingsTable
            standings={standings}
            scoreSport={scoreSport}
            scoreUnit={scoreUnit}
            unplayedWinners={swissUnplayedWinners}
            previousFinishLabels={previousFinishLabels}
            withdrawalLabel={(name) => getStageWithdrawalLabel(tournament, name, stage.id)}
            qualifyingPlaces={qualifyingPlaces}
            cutoffIndex={swissCutoffIndex}
            finalized={swissFinished}
            onSelectPlayer={setSelectedSwissPlayer}
            onShowBuchholz={() => setShowSwissBuchholzHelp(true)}
            lotParticipants={lotPlayers}
            lotWinners={lotWinners}
            decisionTags={decisionTags}
          />
          <SwissRoundCard
            fixtures={swissRoundFixtures}
            matches={swissMatches}
            standings={standings}
            sport={tournament.sport}
            editable={swissEditable}
            notice={swissDrawNotice}
            venueName={(name) => displayVenueName(tournament.sport, name)}
            onEditResult={onEditResult}
            canEditResult={(matchId) => canEditMockMatch(tournament, matchId)}
          />
        </div>
        {showSwissBuchholzHelp && <SwissBuchholzHelpModal rounds={Number(stage.settings.rounds) || 4} onClose={() => setShowSwissBuchholzHelp(false)} />}
        {selectedSwissPlayer && (
          <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedSwissPlayer(null)}>
            <div className="prototype-modal player-games-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="player-games-modal-head"><h2>{selectedSwissPlayer} · Partien</h2><button className="btn small" type="button" onClick={() => setSelectedSwissPlayer(null)}>Schließen</button></div>
              <div className="player-games-list swiss-history-list">
                <div className="swiss-history-head" aria-hidden="true"><span>Runde</span><span>Gegner · Bilanz vor Runde / Aktuelle Bilanz</span><span>Ausgang</span><span>Ergebnis</span></div>
                {swissMatches.filter((match) => match.sideA === selectedSwissPlayer || match.sideB === selectedSwissPlayer).map((match) => {
                  const opponent = match.sideA === selectedSwissPlayer ? match.sideB : match.sideA;
                  const roundNumber = Number(match.round.match(/\d+/)?.[0]) || 1;
                  const opponentRecord = getSwissRecordBeforeRound(tournament, stage, opponent, roundNumber);
                  const opponentCurrentRecord = getSwissCurrentRecord(tournament, stage, opponent);
                  const result = resultForMatchParticipant({ ...match, score: match.status === 'FINISHED' ? match.score : '–' }, selectedSwissPlayer);
                  return <div className="player-game-row swiss-player-game-row" key={match.id}>
                    <span className="muted swiss-history-round">{match.round}</span>
                    <span className="swiss-history-opponent"><strong>{opponent}</strong><span className="swiss-record" title="Bilanz des Gegners vor der Runde">{opponentRecord}</span><span className="swiss-record swiss-record-current" title="Aktuelle Bilanz des Gegners">{opponentCurrentRecord}</span></span>
                    <PlayerGameOutcome score={result.score} finished={match.status === 'FINISHED'} wonByDecision={match.decisionSide ? match.decisionSide === (match.sideA === selectedSwissPlayer ? 'A' : 'B') : undefined} />
                    <MatchResultDetails score={result.score} sets={result.sets} sport={tournament.sport} decision={match.decision} decisionReversed={match.sideB === selectedSwissPlayer} onOpenResult={['LIVE', 'READY', 'CONFIRMATION', 'FINISHED'].includes(match.status) && onEditResult ? () => { setSelectedSwissPlayer(null); onEditResult(match.id); } : undefined} />
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
            <div className="actions">
              {stage.type === 'KNOCKOUT' && ['GROUPS', 'SWISS'].includes(tournament.stages[tournament.stages.findIndex((entry) => entry.id === stage.id) - 1]?.type ?? '') && (
                <DrawActionButton
                  label="Brackets nach Seeding zuteilen"
                  title="Setzliste aus der Vorphase: P1 gegen Pn, P1/P2 in verschiedenen Hälften; Freilose an die bestplatzierten Teilnehmer. Vorherige Pins werden gelöst."
                  onAction={() => applySeededBracketSlots(tournament, stage)}
                  onChanged={() => onDrawChanged?.()}
                />
              )}
              <DrawActionButton
                label="Neue Zufallsverteilung"
                onAction={() => randomizeBracketSlots(tournament, stage)}
                onChanged={() => onDrawChanged?.()}
              />
            </div>
          )}
        </div>
        <BracketRoundViewport key={stage.id} rounds={rounds} className={editable ? 'bracket-board editable' : 'bracket-board'} editable={editable}
          renderRound={(round, roundIndex) => (
              <div className="bracket-round" key={round.label}>
                <h4>{round.label}</h4>
                <div className={roundIndex === rounds.length - 1 ? 'bracket-round-matches bracket-final-round-matches' : 'bracket-round-matches'}>
                  {round.matches.map((match, matchIndex) => {
                    const scoreStages = scoreSport ? getBracketScoreStages(match.sets, match.decision, match.extraTimeProgress, match.winner, match.sideA, match.sideB, match.live) : [];
                    const openBracketResult = onEditResult && (match.live || (match.score && match.score !== 'Freilos' && match.score !== 'Beide Platz 3'))
                      ? () => onEditResult(match.id) : undefined;
                    return (
                      <article className={match.live ? 'bracket-match is-live' : 'bracket-match'} key={match.id}>
                        <BracketLiveStatus live={match.live} />
                        {match.score === 'W.O.' && <span className="bracket-walkover-label" title="Kampflos entschiedene Partie (Walkover, z. B. bei Rückzug)">Kampflos</span>}
                        {match.score === 'Beide Platz 3' && <span className="bracket-walkover-label">Gemeinsamer 3. Platz · nicht ausgetragen</span>}
                        <BracketStageHeader stages={scoreStages} />
                        {[match.sideA, match.sideB].map((side, sideIndex) => {
                          const slotIndex = matchIndex * 2 + sideIndex;
                          const isEditableSlot = editable && roundIndex === 0 && slotIndex < slots.length;
                          const winner = match.winner === side;
                          return (
                            <div
                              className={`${winner ? 'winner ' : ''}${!scoreSport && match.sets?.length ? 'bracket-set-row ' : ''}${scoreStages.length ? 'bracket-stage-row ' : ''}${isEditableSlot ? 'editable-bracket-slot' : ''}${isEditableSlot && pinnedSlots.has(slotIndex) ? ' pinned-slot' : ''}${side === 'Freilos' ? ' bye' : ''}`.trim()}
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
                                <span className="bracket-name-inline">{match.score === 'W.O.' && getStageWithdrawalLabel(tournament, side, stage.id) ? `Rückzug (${side})` : side}{isEditableSlot && side !== 'Freilos' && (
                                  <button className={pinnedSlots.has(slotIndex) ? 'bracket-pin pinned' : 'bracket-pin'} type="button"
                                    aria-label={`${side} ${pinnedSlots.has(slotIndex) ? 'lösen' : 'fixieren'}`}
                                    title={pinnedSlots.has(slotIndex) ? 'Fixierung lösen' : 'Platz fixieren'}
                                    onClick={() => { if (toggleBracketPin(tournament, stage, slotIndex)) onDrawChanged?.(); }}>
                                    {pinnedSlots.has(slotIndex) ? '📌' : '📍'}
                                  </button>
                                )}</span>
                                {previousFinishLabels[side] && <small className="participant-origin">{previousFinishLabels[side]}</small>}
                              </span>
                              {scoreStages.length ? <BracketStageValues stages={scoreStages} sideIndex={sideIndex as 0 | 1} onOpenResult={openBracketResult} /> : <BracketScoreCells onOpenResult={openBracketResult}>
                                {!scoreSport && <BracketSetScores sets={match.sets ?? []} sideIndex={sideIndex as 0 | 1} />}
                                <strong>{match.score === 'W.O.' ? (winner ? '✓' : '–') : match.score === 'Beide Platz 3' ? '3.' : match.score && match.score !== 'Freilos' ? match.score.split(':')[sideIndex] : match.score === 'Freilos' && side === 'Freilos' ? 'BYE' : ''}</strong>
                              </BracketScoreCells>}
                            </div>
                          );
                        })}
                      </article>
                    );
                  })}
                {roundIndex === rounds.length - 1 && thirdPlaceRound && (
                  <div className="bracket-third-place-block">
                    <h4>Spiel um Platz 3</h4>
                    {thirdPlaceRound.matches.map((match) => {
                      const scoreStages = scoreSport ? getBracketScoreStages(match.sets, match.decision, match.extraTimeProgress, match.winner, match.sideA, match.sideB, match.live) : [];
                      const openBracketResult = onEditResult && (match.live || (match.score && match.score !== 'Freilos' && match.score !== 'Beide Platz 3'))
                        ? () => onEditResult(match.id) : undefined;
                      return (
                        <article className={match.live ? 'bracket-match is-live' : 'bracket-match'} key={match.id}>
                          <BracketLiveStatus live={match.live} />
                          {match.score === 'Beide Platz 3' && <span className="bracket-walkover-label">Gemeinsamer 3. Platz · nicht ausgetragen</span>}
                          <BracketStageHeader stages={scoreStages} />
                          {[match.sideA, match.sideB].map((side, sideIndex) => (
                            <div className={`${match.winner === side ? 'winner ' : ''}${!scoreSport && match.sets?.length ? 'bracket-set-row ' : ''}${scoreStages.length ? 'bracket-stage-row' : ''}`.trim()} key={`${match.id}-${sideIndex}`}>
                              <span>{side}</span>
                              {scoreStages.length ? <BracketStageValues stages={scoreStages} sideIndex={sideIndex as 0 | 1} onOpenResult={openBracketResult} /> : <BracketScoreCells onOpenResult={openBracketResult}>
                                {!scoreSport && <BracketSetScores sets={match.sets ?? []} sideIndex={sideIndex as 0 | 1} />}
                                <strong>{match.score === 'Beide Platz 3' ? '3.' : match.score && match.score !== 'Freilos' ? match.score.split(':')[sideIndex] : ''}</strong>
                              </BracketScoreCells>}
                            </div>
                          ))}
                        </article>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
          )}
        />
      </section>
    );
  }

  return <StageCard stage={stage} />;
}

function ParticipantEditFields({ name, code, usedCodes, onSave, onCancel }: {
  name: string;
  code: string;
  usedCodes: ReadonlySet<string>;
  onSave: (firstName: string, lastName: string, playerCode: string) => boolean;
  onCancel: () => void;
}) {
  const nameParts = name.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] ?? '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [playerCode, setPlayerCode] = useState(code);
  const [error, setError] = useState('');
  function generateNewCode() {
    try {
      setPlayerCode(generateUniquePlayerCode(new Set([...usedCodes, code, playerCode])));
      setError('');
    } catch {
      setError('Es konnte kein neuer Spielercode erzeugt werden.');
    }
  }
  return (
    <form className="participant-edit-grid" onSubmit={(event) => {
      event.preventDefault();
      const trimmedCode = playerCode.trim();
      if (!/^\d{4,8}$/.test(trimmedCode)) {
        setError('Der Spielercode muss aus 4 bis 8 Ziffern bestehen.');
        return;
      }
      if (usedCodes.has(trimmedCode)) {
        setError('Dieser Spielercode ist bereits vergeben. Bitte einen anderen Code verwenden.');
        return;
      }
      if (!onSave(firstName, lastName, trimmedCode)) setError('Bitte vollständigen, eindeutigen Teilnehmernamen und einen gültigen Spielercode angeben.');
    }}>
      <label className="field"><span>Vorname</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="off" /></label>
      <label className="field"><span>Nachname</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="off" /></label>
      <div className="field participant-code-field">
        <label htmlFor="participant-edit-code">Spielercode</label>
        <div className="participant-code-controls">
          <input id="participant-edit-code" value={playerCode} onChange={(event) => { setPlayerCode(event.target.value); setError(''); }} inputMode="numeric" autoComplete="off" />
          <button className="btn small" type="button" onClick={generateNewCode}>Neuer Code</button>
        </div>
      </div>
      <div className="actions participant-edit-actions">
        <button className="btn small primary" type="submit">Speichern</button>
        <button className="btn small" type="button" onClick={onCancel}>Abbrechen</button>
      </div>
      {error && <span role="alert" className="field-error participant-edit-error">{error}</span>}
    </form>
  );
}

export function TournamentControlPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const initialTournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const [tournament, setTournament] = useState(initialTournament);
  const venue = getVenueTerminology(tournament.sport);
  const venueName = (name: string) => displayVenueName(tournament.sport, name);
  const venueMessage = (message: string) => displayVenueMessage(tournament.sport, message);
  const [tab, setTab] = useState<ControlTab>('overview');
  const [tableView, setTableView] = useState<'cards' | 'hall'>('cards');
  const [selectedHallTable, setSelectedHallTable] = useState<string | null>(null);
  const [helpTopic, setHelpTopic] = useState<ControlHelpTopic | null>(null);
  const [hallAssignMatchId, setHallAssignMatchId] = useState('');
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [restClockTick, setRestClockTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setRestClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);
  const [drawVersion, setDrawVersion] = useState(0);
  const [phaseVersion, setPhaseVersion] = useState(0);
  const [participantPanel, setParticipantPanel] = useState<{ name: string; mode: 'edit' | 'games' } | null>(null);
  const [participantQuery, setParticipantQuery] = useState('');
  const [participantStatusFilter, setParticipantStatusFilter] = useState<'all' | 'active' | 'playing' | 'eliminated' | 'withdrawn'>('all');
  const participantModalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!participantPanel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    participantModalRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setParticipantPanel(null);
        return;
      }
      if (event.key !== 'Tab' || !participantModalRef.current) return;
      const focusable = Array.from(participantModalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !participantModalRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !participantModalRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [participantPanel]);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<string | null>(null);
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
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [abortModalOpen, setAbortModalOpen] = useState(false);
  const [abortReason, setAbortReason] = useState('');
  const [skipThirdMatchId, setSkipThirdMatchId] = useState<string | null>(null);
  const [adminEditMatchId, setAdminEditMatchId] = useState<string | null>(null);
  const [matchFilters, setMatchFilters] = useState<ControlMatchFilters>({ status: 'all', phase: '', table: '', search: '' });
  const [queueFilters, setQueueFilters] = useState<ControlQueueFilters>(emptyQueueFilters);
  const [correctionNotice, setCorrectionNotice] = useState<CorrectionNotice | null>(null);
  // Die Mock-Services lesen mutable localStorage-Daten. Diese Snapshots
  // halten die bisherigen Cache-Invalidierungen durch Versionsänderungen bei,
  // selbst wenn die Tournament-Referenz gleich bleibt.
  const phaseSource = useMemo(() => ({ tournament, phaseVersion }), [tournament, phaseVersion]);
  const runtimeSource = useMemo(() => ({ tournament, runtimeVersion }), [tournament, runtimeVersion]);
  const clockSource = useMemo(() => ({ ...runtimeSource, restClockTick }), [runtimeSource, restClockTick]);
  const phaseRuntimeSource = useMemo(() => ({ ...runtimeSource, phaseVersion }), [runtimeSource, phaseVersion]);
  const phaseClockSource = useMemo(() => ({ ...phaseRuntimeSource, restClockTick }), [phaseRuntimeSource, restClockTick]);
  const participantSource = useMemo(() => ({ tournament, participantVersion }), [tournament, participantVersion]);
  const progressSource = useMemo(() => ({ ...phaseRuntimeSource, drawVersion }), [phaseRuntimeSource, drawVersion]);
  const standingsSource = useMemo(() => ({ ...phaseRuntimeSource, participantVersion }), [phaseRuntimeSource, participantVersion]);

  const matches = useMemo(() => getMockRuntimeMatches(clockSource.tournament), [clockSource]);
  const queueAssignableTables = useMemo(() => getMockQueueAssignableTables(phaseRuntimeSource.tournament), [phaseRuntimeSource]);
  const blockedTables = useMemo(() => new Set(getBlockedMockTables(runtimeSource.tournament)), [runtimeSource]);
  const restTimeLabel = useMemo(
    () => formatRemainingTournamentDuration(estimateRemainingTournamentMinutes(phaseRuntimeSource.tournament), getVenueTerminology(phaseRuntimeSource.tournament.sport).plural),
    [phaseRuntimeSource],
  );
  const auditEntries = useMemo(() => getMockAudit(runtimeSource.tournament.id), [runtimeSource]);
  const allTournamentMatches = useMemo(() => phaseClockSource.tournament.stages.filter((stage) => isStageStarted(phaseClockSource.tournament, stage)).flatMap((stage) => [
    ...getMockStageMatches(phaseClockSource.tournament, stage),
    ...(stage.type === 'SWISS' ? [
      ...getSwissRoundRobinMatches(phaseClockSource.tournament, stage),
      ...getSwissCutoffSetMatches(phaseClockSource.tournament, stage),
    ] : []),
  ]), [phaseClockSource]);
  const filteredTournamentMatches = useMemo(() => filterControlMatches(allTournamentMatches, matchFilters), [allTournamentMatches, matchFilters]);
  const matchFilterPhases = useMemo(() => [...new Set(allTournamentMatches.map((match) => match.phase))], [allTournamentMatches]);
  const matchFilterTables = useMemo(() => [...new Set(allTournamentMatches.map((match) => match.table).filter((table) => table.startsWith('Tisch ')))], [allTournamentMatches]);
  const participants = useMemo(() => getRuntimeParticipantNames(participantSource.tournament), [participantSource]);
  const participantProgress = useMemo(() => participants.map((name) => ({
    name,
    progress: getMockParticipantProgress(progressSource.tournament, name),
  })), [participants, progressSource]);
  const participantStatistics = useMemo(() => summarizeParticipantStatuses(
    participantProgress.map(({ progress }) => progress.status),
  ), [participantProgress]);
  const anyCompletedPhase = tournament.stages.some((stage) => isStageCompleted(tournament, stage));
  const finalStandings = useMemo(() => getMockConfirmedFinalStandings(standingsSource.tournament), [standingsSource]);
  const nextMatches = matches.filter((match) => match.status === 'WAITING');
  const assignableWaitingMatches = nextMatches.filter((match) => (queueAssignableTables.get(match.id)?.length ?? 0) > 0);
  const assignableWaitingIds = new Set(assignableWaitingMatches.map((match) => match.id));
  const filteredNextMatches = filterControlQueueMatches(nextMatches, queueFilters, assignableWaitingIds);
  const queuePositions = new Map(nextMatches.map((match, index) => [match.id, index + 1]));
  const queueGroups = useMemo(() => [...new Set(matches.filter((match) => match.status === 'WAITING' && match.round.startsWith('Gruppe ')).map((match) => match.round))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })), [matches]);
  const queueMatchDays = useMemo(() => [...new Set(matches.filter((match) => match.status === 'WAITING').map((match) => match.matchDay).filter((day): day is number => typeof day === 'number'))].sort((a, b) => a - b), [matches]);
  const tableMatches = matches.filter((match) => ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) && match.table.startsWith('Tisch '));
  const filteredParticipantProgress = participantProgress.map(({ name, progress }, index) => ({ name, progress, index }))
    .filter(({ name, progress, index }) => {
      const query = participantQuery.trim().toLocaleLowerCase('de');
      const code = tournament.participantCodes?.[name] ?? String(4100 + index).slice(-4);
      if (query && !name.toLocaleLowerCase('de').includes(query) && !code.includes(query)) return false;
      const isPlaying = tableMatches.some((match) => match.sideA === name || match.sideB === name);
      switch (participantStatusFilter) {
        case 'active': return progress.status === 'Aktiv';
        case 'playing': return isPlaying;
        case 'eliminated': return progress.status === 'Ausgeschieden';
        case 'withdrawn': return progress.status === 'Zurückgezogen';
        default: return true;
      }
    });
  const selectedParticipantIndex = participants.indexOf(participantPanel?.name ?? '');
  const selectedParticipantMatches = participantPanel?.mode === 'games'
    ? allTournamentMatches.filter((match) => match.sideA === participantPanel.name || match.sideB === participantPanel.name)
    : [];
  const matchesByTable = new Map(tableMatches.map((match) => [match.table, match]));
  const freeTables = Array.from({ length: tournament.tables }, (_, index) => `Tisch ${index + 1}`).filter((table) => !matchesByTable.has(table) && !blockedTables.has(table));
  const activeStage = useMemo(() => getActiveStage(phaseSource.tournament), [phaseSource]);
  const pendingApproval = useMemo(() => getPendingMockApproval(phaseRuntimeSource.tournament), [phaseRuntimeSource]);
  const reviewMatches = pendingApproval && activeStage
    ? getMockStageMatches(tournament, activeStage).filter((match) => pendingApproval.kind === 'STAGE'
      || Number(match.id.match(/-sw-r(\d+)-m\d+$/)?.[1] ?? 0) === pendingApproval.round)
    : [];
  const pendingSwissCutoff = useMemo(() => getPendingSwissCutoff(phaseRuntimeSource.tournament), [phaseRuntimeSource]);
  // Intermediate round-robin fixtures run on the ordinary tournament tables;
  // the choice dialog only reappears if all playoff games remain deadlocked.
  const activeRoundRobinPlayoff = Boolean(pendingSwissCutoff?.decision?.extraRounds?.some(
    (round) => round.kind === 'ROUND_ROBIN' && round.matches.some((match) => match.pointsA === undefined),
  ));
  const activeCutoffSetMatch = pendingSwissCutoff?.decision?.mode === 'SET';
  const swissSource = useMemo(() => ({ ...runtimeSource, activeStage }), [runtimeSource, activeStage]);
  const swissRecordFor = useMemo(() => getActiveSwissRecordLookup(swissSource.tournament), [swissSource]);
  const nextStartableStage = useMemo(() => getNextStartableStage(phaseSource.tournament), [phaseSource]);
  const editableStage = useMemo(() => phaseSource.tournament.stages.find((stage) => isStageEditable(phaseSource.tournament, stage)), [phaseSource]);
  const selectedRoundRobinStage = tournament.stages.find((stage) => selectedStageId === `${stage.id}::rr`);
  const selectedRoundRobinDecision = selectedRoundRobinStage ? getSwissCutoffHistory(tournament, selectedRoundRobinStage) : null;
  const selectedStage = useMemo(() => tournament.stages.find((stage) => stage.id === selectedStageId) ?? (selectedStageId.endsWith('::rr') ? undefined : tournament.stages[0]), [tournament, selectedStageId]);
  const tournamentProgress = useMemo(() => summarizeControlProgress(
    phaseRuntimeSource.tournament.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      started: isStageStarted(phaseRuntimeSource.tournament, stage),
      completed: isStageCompleted(phaseRuntimeSource.tournament, stage),
    })),
    activeStage?.id ?? null,
    activeStage ? getMockStageMatches(phaseRuntimeSource.tournament, activeStage) : [],
  ), [phaseRuntimeSource, activeStage]);
  const refreshRuntime = useCallback(() => {
    setTournament(getMockTournament(tournament.id));
    setRuntimeVersion((value) => value + 1);
    setPhaseVersion((value) => value + 1);
  }, [tournament.id]);

  useEffect(() => {
    setQueueFilters((current) => {
      const group = current.group && !queueGroups.includes(current.group) ? '' : current.group;
      const matchDay = current.matchDay && !queueMatchDays.includes(Number(current.matchDay)) ? '' : current.matchDay;
      return group === current.group && matchDay === current.matchDay ? current : { ...current, group, matchDay };
    });
  }, [queueGroups, queueMatchDays]);

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

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || (event.key && !event.key.startsWith('online-tournament:'))) return;
      // Änderungen aus einem anderen Tab dürfen keine veralteten Wartelisten anzeigen.
      refreshRuntime();
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshRuntime]);

  useEffect(() => {
    const onAuditChange = (event: Event) => {
      const entry = (event as CustomEvent<MockAuditEntry>).detail;
      if (!entry || entry.tournamentId !== tournament.id) return;
      if (entry.action === 'RESULT_CORRECTED') {
        setCorrectionNotice({ key: entry.id, message: 'Endergebnis korrigiert.', undoAuditId: entry.id });
      } else if (entry.action === 'RESULT_RESTORED') {
        setCorrectionNotice({ key: entry.id, message: 'Die Ergebniskorrektur wurde zurückgenommen.' });
      }
    };
    window.addEventListener('mock-audit-change', onAuditChange);
    return () => window.removeEventListener('mock-audit-change', onAuditChange);
  }, [tournament.id]);

  useEffect(() => {
    if (!correctionNotice) return;
    const timeout = window.setTimeout(() => setCorrectionNotice((current) => current?.key === correctionNotice.key ? null : current), 15000);
    return () => window.clearTimeout(timeout);
  }, [correctionNotice]);

  function setStatus(status: TournamentStatus) {
    setTournament(updateMockTournamentStatus(tournament.id, status));
  }

  function confirmPendingApproval() {
    const approved = approveMockProgress(tournament);
    if (!approved) {
      setApprovalModalOpen(false);
      setAssignmentMessage('Die Freigabe ist nicht mehr möglich. Bitte aktuelle Spiele und Ergebnisse prüfen.');
      refreshRuntime();
      return;
    }
    setApprovalModalOpen(false);
    refreshRuntime();
    if (approved.kind === 'ROUND') setSelectedStageId(approved.stageId);
  }

  function confirmTournamentAbort() {
    if (!abortMockTournament(tournament, abortReason)) {
      setAssignmentMessage('Das Turnier konnte nicht abgebrochen werden.');
      return;
    }
    setAbortModalOpen(false);
    setApprovalModalOpen(false);
    setAbortReason('');
    refreshRuntime();
  }

  function openWaitingQueue() {
    setQueueFilters(emptyQueueFilters);
    setTab('overview');
    window.requestAnimationFrame(() => document.getElementById('control-next-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function undoCorrection(auditId: string) {
    if (restoreMockCorrectedResult(tournament, auditId)) {
      refreshRuntime();
    } else {
      setCorrectionNotice({ key: `failed-${auditId}`, message: 'Rückgängig ist nicht mehr möglich. Prüfe die Partie im Protokoll.', error: true });
    }
  }

  function requestParticipantWithdrawal(name: string) {
    if (!canWithdrawMockParticipant(tournament, name)) return;
    // Only an ongoing phase needs the explicit destructive-action warning.
    if (getActiveStage(tournament)) {
      setPendingWithdrawal(name);
      return;
    }
    if (withdrawMockParticipant(tournament, name)) refreshRuntime();
  }

  function confirmParticipantWithdrawal() {
    const name = pendingWithdrawal;
    if (!name) return;
    setPendingWithdrawal(null);
    if (withdrawMockParticipant(tournament, name)) refreshRuntime();
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
      setAssignmentMessage(venueMessage(blockReason));
      refreshRuntime();
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
    setAssignmentMessage('Zuweisung aufgehoben. Bereits eingegebene Ergebnisse bleiben erhalten.');
    setMovingMatchId(null);
    refreshRuntime();
  }

  function moveToTable(matchId: string, table: string) {
    if (!moveMockMatchToTable(tournament, matchId, table)) {
      setAssignmentMessage(`${venue.singular}wechsel nicht möglich: Ziel ist nicht frei oder gesperrt.`);
      return;
    }
    setMovingMatchId(null);
    setAssignmentMessage(`Partie nach ${venueName(table)} verlegt. Satzergebnisse und ursprüngliche Pausenzeit bleiben erhalten.`);
    refreshRuntime();
  }

  function autoAssignMatch(matchId: string) {
    for (const table of queueAssignableTables.get(matchId) ?? []) {
      if (assignToTable(matchId, table)) return;
    }

    const firstReason = freeTables
      .map((table) => getMockAssignmentBlockReason(tournament, matchId, table))
      .find((reason) => reason);
    setAssignmentMessage(firstReason ? venueMessage(firstReason) : `Aktuell ist kein geeigneter ${venue.singular} frei.`);
    refreshRuntime();
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

  // Gemeinsame Tischbedienung für Karte und Hallen-Modal.
  const tableCards = (
            <div className={tableView === 'hall' && tournament.venueLayout ? 'overview-table-grid hall-table-detail' : 'overview-table-grid'}>
              {Array.from({ length: tournament.tables }, (_, index) => {
                const tableName = `Tisch ${index + 1}`;
                if (tableView === 'hall' && tournament.venueLayout && tableName !== selectedHallTable) return null;
                const match = matchesByTable.get(tableName);
                const isLive = match?.status === 'LIVE' || match?.status === 'CONFIRMATION' || match?.status === 'READY';
                const isBlocked = blockedTables.has(tableName);
                return (
                  <article
                    className={`card overview-table-card ${match ? 'busy' : isBlocked ? 'blocked' : 'table-drop-target'}${match && sportScoring(match.sport).mode === 'sets' && requiresFinalApproval(match.bestOf, match.sets ?? [], (activeStage?.type === 'SWISS' || activeStage?.type === 'KNOCKOUT')) && match.status !== 'FINISHED' ? ' awaiting-approval' : ''}`}
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
                      <strong>{venueName(tableName)}</strong>
                      <div className="table-head-controls">
                        <span className={isLive ? 'badge live' : isBlocked ? 'badge blocked-badge' : 'badge'}>{isLive ? 'läuft' : isBlocked ? 'gesperrt' : 'frei'}</span>
                        {isLive && isBlocked && <span className="badge blocked-badge">gesperrt</span>}
                        <button
                          className="btn small table-lock-button"
                          type="button"
                          aria-label={`${venueName(tableName)} ${isBlocked ? 'freigeben' : 'sperren'}`}
                          aria-pressed={isBlocked}
                          onClick={() => toggleTableLock(tableName)}
                        >{isBlocked ? 'Freigeben' : 'Sperren'}</button>
                      </div>
                    </div>
                    {match ? (
                      <>
                        <span className="muted">{match.phase} · {match.round}{sportScoring(match.sport).mode === 'sets' ? ` · BO${match.bestOf}` : ''}</span>
                        <SportResultEntry
                          match={match}
                          swissAdminEntry={(activeStage?.type === 'SWISS' || activeStage?.type === 'KNOCKOUT')}
                          directorEntry
                          onSaved={refreshRuntime}
                          onCompleted={() => {
                            // Only close the hall's table modal after the match has actually finished.
                            // Saving a live set or interim score must leave the entry open.
                            if (tableView === 'hall' && tournament.venueLayout) {
                              setSelectedHallTable(null);
                              setMovingMatchId(null);
                            }
                          }}
                          compact
                          sideARecord={swissRecordFor(match, match.sideA)}
                          sideBRecord={swissRecordFor(match, match.sideB)}
                        />
                        {!(sportScoring(match.sport).mode === 'sets' && requiresFinalApproval(match.bestOf, match.sets ?? [], (activeStage?.type === 'SWISS' || activeStage?.type === 'KNOCKOUT')) && match.status !== 'FINISHED') && (
                          <div className="table-operational-actions">
                            <button className="btn small" type="button" onClick={() => setMovingMatchId((old) => old === match.id ? null : match.id)}>{venue.singular} wechseln</button>
                            <button className="btn small" type="button" onClick={() => unassignFromTable(match.id)}>Zuweisung aufheben</button>
                          </div>
                        )}
                        {movingMatchId === match.id && !(sportScoring(match.sport).mode === 'sets' && requiresFinalApproval(match.bestOf, match.sets ?? [], (activeStage?.type === 'SWISS' || activeStage?.type === 'KNOCKOUT')) && match.status !== 'FINISHED') && (
                          <div className="table-assignment-picker" role="group" aria-label="Neuen Spielort auswählen">
                            {freeTables.length ? freeTables.map((table) => (
                              <button key={table} className="btn small" type="button" onClick={() => moveToTable(match.id, table)}>{venueName(table)}</button>
                            )) : <span className="muted">Keine andere freie Spielfläche.</span>}
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
                        <span>{isBlocked ? 'Keine automatische oder manuelle Zuweisung möglich.' : tableView === 'hall' ? 'Wartende Partie direkt zuweisen oder auf die Spielfläche im Plan ziehen.' : 'Spiel hierher ziehen oder über „Zuweisen“ auswählen.'}</span>
                        {tableView === 'hall' && tournament.venueLayout && !isBlocked && tournament.status === 'RUNNING' && (
                          <div className="hall-table-modal-assign">
                            <label htmlFor={`hall-assign-${index}`}>Wartendes Spiel</label>
                            <div className="hall-table-modal-assign-controls">
                              <select id={`hall-assign-${index}`} value={hallAssignMatchId} onChange={(event) => setHallAssignMatchId(event.target.value)}>
                                <option value="">Partie auswählen</option>
                                {nextMatches.filter((waiting) => !getMockAssignmentBlockReason(tournament, waiting.id, tableName)).map((waiting) => (
                                  <option key={waiting.id} value={waiting.id}>{waiting.sideA} – {waiting.sideB} · {waiting.round}</option>
                                ))}
                              </select>
                              <button className="btn small primary" type="button" disabled={!hallAssignMatchId} onClick={() => {
                                if (hallAssignMatchId && assignToTable(hallAssignMatchId, tableName)) setHallAssignMatchId('');
                              }}>Zuweisen</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
  );

  return (
    <>
      <header className="control-head">
        <div className="control-hero-bar">
          <div className="control-identity">
            <div className="control-kicker">Turnierleitung</div>
            <div className="tournament-page-status-row">
              <h1>{tournament.name}</h1>
              <span className={`badge control-tournament-status status-${tournament.status.toLowerCase()}`}>Status: {statusLabel(tournament.status)}</span>
            </div>
            <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer · {tournament.tables} {venue.plural}</p>
          </div>
          <div className="control-header-tools no-print">
            <div className="actions control-primary-actions">
            {editableStage && ['GROUPS', 'SWISS', 'KNOCKOUT', 'DOUBLE_ELIMINATION'].includes(editableStage.type) && (
              <button className={tab === 'flow' ? 'btn control-edit-phase-active' : 'btn'} type="button" aria-current={tab === 'flow' ? 'page' : undefined} onClick={() => setTab('flow')}>Aktuelle Phase bearbeiten</button>
            )}
            {!tournament.hasStarted && !['FINISHED', 'ABORTED'].includes(tournament.status) && (
              <button className="btn primary" type="button" onClick={requestStartTournament}
                disabled={!tournament.stages[0] || getStageEntrants(tournament, tournament.stages[0]).length < 2}
                title={tournament.stages[0] && getStageEntrants(tournament, tournament.stages[0]).length < 2 ? 'Mindestens zwei aktive Teilnehmer erforderlich' : undefined}>Turnier starten</button>
            )}
            {tournament.hasStarted && activeStage && !['FINISHED', 'ABORTED'].includes(tournament.status) && (
              <>
                {tournament.status === 'RUNNING' ? (
                  <button className="btn" type="button" onClick={() => setStatus('PAUSED')}>Turnier pausieren</button>
                ) : (
                  <button className="btn" type="button" onClick={() => setStatus('RUNNING')}>Turnier fortsetzen</button>
                )}
              </>
            )}
            {tournament.hasStarted && !activeStage && nextStartableStage && !['FINISHED', 'ABORTED'].includes(tournament.status) && (
              <button className="btn primary" type="button" onClick={requestStartNextPhase}>Nächste Phase starten</button>
            )}
            {pendingApproval && <button className="btn primary" type="button" onClick={() => setApprovalModalOpen(true)}>
              {pendingApproval.kind === 'ROUND' ? `Runde ${pendingApproval.round} prüfen` : 'Phase freigeben'}
            </button>}
            {!['FINISHED', 'ABORTED'].includes(tournament.status) && (
              <button className="btn small" type="button" onClick={() => setAbortModalOpen(true)}>Turnier abbrechen</button>
            )}
            </div>
            <div className="control-utility-bar">
              <button className="btn small control-back-button" type="button" onClick={() => navigate(-1)}>← Zurück</button>
              <div className="control-utility-links">
                <Link className="btn small" to={`/player/${tournament.id}`}>Spieleransicht</Link>
                <Link className="btn small" to={`/live/${tournament.id}`}>Zuschaueransicht</Link>
                <button className="btn small control-help-main-button" type="button" onClick={() => setHelpTopic('start')}>Anleitung & Hilfe</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="control-tabs" aria-label="Turnierleitungsbereiche">
        {(anyCompletedPhase ? [...tabs, { id: 'final' as const, label: 'Endplatzierungen' }] : tabs).map((item) => (
          <button className={tab === item.id ? 'control-tab active' : 'control-tab'} key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      {pendingApproval && <div className="control-review-alert no-print" role="status">
        <div><strong>{pendingApproval.kind === 'ROUND'
          ? `Schweizer Runde ${pendingApproval.round} ist abgeschlossen – Freigabe erforderlich`
          : `${pendingApproval.stageName} ist abgeschlossen – Abschlusskontrolle erforderlich`}</strong>
          <p>Alle {pendingApproval.completedMatches} Begegnungen sind abgeschlossen. Die Turnierleitung muss die Ergebnisse prüfen, bevor das Turnier fortgesetzt wird.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setApprovalModalOpen(true)}>Ergebnisse prüfen und freigeben</button>
      </div>}

      {tab === 'overview' && (
        <section className="control-overview-stack">
          <div>
            <div className="control-section-head control-table-section-head">
              <div>
                <div className="control-help-title"><h2>{venue.plural}</h2><ControlHelpButton topic="tables" onOpen={setHelpTopic} /></div>
                <p className="muted">{tableView === 'hall' && tournament.venueLayout ? 'Spielübersicht nach den tatsächlichen Positionen im Plan.' : `Alle Spielorte auf einen Blick – auch freie ${venue.plural} bleiben sichtbar.`}</p>
              </div>
              <div className="control-table-head-actions">
                {tournament.venueLayout && (
                  <div className="table-view-switch" role="group" aria-label="Darstellung der Spielflächen">
                    <button type="button" className={tableView === 'cards' ? 'active' : ''} aria-pressed={tableView === 'cards'} onClick={() => { setTableView('cards'); setSelectedHallTable(null); setMovingMatchId(null); }}>Kartenansicht</button>
                    <button type="button" className={tableView === 'hall' ? 'active' : ''} aria-pressed={tableView === 'hall'} onClick={() => { setTableView('hall'); setSelectedHallTable(null); setMovingMatchId(null); }}>Planansicht</button>
                  </div>
                )}
                <span className="badge live">{tableMatches.length} laufend</span>
                <button
                  className="btn small primary"
                  type="button"
                  disabled={assignableWaitingMatches.length === 0}
                  onClick={autoAssignWaitingMatches}
                >
                  Automatisch zuweisen
                </button>
              </div>
            </div>
            {tournament.status === 'PAUSED' && <div className="assignment-message" role="status">Turnier pausiert: Neue Zuweisungen sind gesperrt. Laufende Spiele dürfen beendet werden.</div>}
            {assignmentMessage && <div className="assignment-message" role="status">{assignmentMessage}</div>}
            <div className="control-table-legend"><TableStateLegend sport={tournament.sport} /></div>
            {tableView === 'hall' && tournament.venueLayout && (
              <TournamentHallView
                layout={tournament.venueLayout}
                sport={tournament.sport}
                matchesByTable={matchesByTable}
                blockedTables={blockedTables}
                selectedTable={selectedHallTable}
                canAssign={tournament.status === 'RUNNING'}
                onSelectTable={(table) => { setSelectedHallTable(table); setHallAssignMatchId(''); setMovingMatchId(null); }}
                onAssignToTable={assignToTable}
              />
            )}
            {tableView === 'hall' && tournament.venueLayout ? (
              selectedHallTable && (
                <div className="prototype-modal-backdrop hall-table-modal-backdrop" role="presentation" onMouseDown={() => { setSelectedHallTable(null); setMovingMatchId(null); }}>
                  <section
                    className="prototype-modal hall-table-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="hall-table-modal-title"
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && !(event.target as HTMLElement).closest('.result-correction-modal')) {
                        event.stopPropagation();
                        setSelectedHallTable(null);
                        setMovingMatchId(null);
                      }
                    }}
                  >
                    <div className="hall-table-modal-head">
                      <div>
                        <span className="badge">PLANANSICHT</span>
                        <h2 id="hall-table-modal-title">{venueName(selectedHallTable)} · Bedienung</h2>
                      </div>
                      <button className="btn small" type="button" autoFocus onClick={() => { setSelectedHallTable(null); setMovingMatchId(null); }}>Schließen</button>
                    </div>
                    <details className="control-inline-help">
                      <summary>Wie bediene ich diese Spielfläche?</summary>
                      <p>Freie Spielflächen: Partie auswählen und „Zuweisen“ drücken – das Spiel beginnt sofort. Laufende Partien: {sportScoring(tournament.sport).mode === 'score' ? 'Tore bzw. Punkte beider Seiten erfassen und das Spiel abschließen.' : sportScoring(tournament.sport).shortSetEntry ? 'Sätze aus Sicht des linken Spielers eingeben (7 = 11:7, −7 = 7:11), danach das Endergebnis bestätigen.' : 'Sätze als Punkte links:rechts eingeben und das Endergebnis abschließen.'} Spielortwechsel und aufgehobene Zuweisungen behalten erfasste Ergebnisse.</p>
                    </details>
                    <div className="hall-table-modal-content">{tableCards}</div>
                  </section>
                </div>
              )
            ) : tableCards}

          </div>

          <div className="control-overview-columns">
            <main>
              <div className="control-section-head control-section-spaced" id="control-next-matches"><div><div className="control-help-title"><h2>Nächste Spiele</h2><ControlHelpButton topic="queue" onOpen={setHelpTopic} /></div><p className="muted">Pausenzeit seit dem letzten tatsächlich gespielten Match; aktualisiert sich automatisch.</p></div></div>
              {nextMatches.length > 0 && (
                <div className="control-match-filters control-queue-filters" role="search" aria-label="Nächste Spiele filtern">
                  <div className="control-match-status-filters" role="group" aria-label="Zuweisungsstatus">
                    {queueStatusOptions.map((option) => (
                      <button key={option.value} type="button" className={queueFilters.status === option.value ? 'active' : ''}
                        aria-pressed={queueFilters.status === option.value}
                        onClick={() => setQueueFilters((current) => ({ ...current, status: option.value }))}>
                        {option.label} ({option.value === 'all' ? nextMatches.length : option.value === 'assignable' ? assignableWaitingMatches.length : nextMatches.length - assignableWaitingMatches.length})
                      </button>
                    ))}
                  </div>
                  <div className="control-match-filter-fields">
                    <label>Spieler suchen<input type="search" value={queueFilters.search} placeholder="Name eingeben …" onChange={(event) => setQueueFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                    <label>Gruppe<select value={queueFilters.group} disabled={queueGroups.length === 0} onChange={(event) => setQueueFilters((current) => ({ ...current, group: event.target.value }))}><option value="">Alle Gruppen</option>{queueGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
                    <label>Spieltag<select value={queueFilters.matchDay} disabled={queueMatchDays.length === 0} onChange={(event) => setQueueFilters((current) => ({ ...current, matchDay: event.target.value }))}><option value="">Alle Spieltage</option>{queueMatchDays.map((day) => <option key={day} value={String(day)}>Spieltag {day}</option>)}</select></label>
                  </div>
                  <div className="control-match-filter-summary" aria-live="polite">
                    <span>{filteredNextMatches.length} von {nextMatches.length} wartenden Spielen</span>
                    {(queueFilters.status !== 'all' || queueFilters.group || queueFilters.matchDay || queueFilters.search) && <button className="btn small" type="button" onClick={() => setQueueFilters(emptyQueueFilters)}>Filter zurücksetzen</button>}
                  </div>
                </div>
              )}
              <div className="match-queue">
                {nextMatches.length === 0 && <div className="control-empty-message">{!tournament.hasStarted ? 'Noch keine wartenden Spiele. Starte zuerst das Turnier.' : activeStage ? 'Zurzeit wartet keine Partie auf eine Zuweisung.' : 'Aktuell keine wartenden Spiele. Prüfe den Turnierverlauf für die nächste Phase.'}</div>}
                {nextMatches.length > 0 && filteredNextMatches.length === 0 && <div className="control-empty-message">Keine wartenden Spiele passen zu diesen Filtern. Passe die Auswahl an oder setze die Filter zurück.</div>}
                {filteredNextMatches.map((match) => {
                  const busyPlayers = getMockParticipantTableConflicts(match, matches);
                  const busyA = busyPlayers.find((entry) => entry.participant === match.sideA);
                  const busyB = busyPlayers.find((entry) => entry.participant === match.sideB);
                  const isBusy = busyPlayers.length > 0;
                  const eligibleTables = queueAssignableTables.get(match.id) ?? [];
                  const canAssign = eligibleTables.length > 0;
                  const otherBlockReason = !isBusy && !canAssign && freeTables.length > 0 && tournament.status === 'RUNNING'
                    ? getMockAssignmentBlockReason(tournament, match.id, freeTables[0]) : null;
                  return (
                  <article
                    className={`match-queue-row expanded draggable-match${isBusy ? ' participant-busy' : ''}`}
                    key={match.id}
                    draggable={canAssign && !isMockThirdPlaceMatch(match.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/mock-match-id', match.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <span className="queue-position" title="Ursprüngliche Position in der Warteliste">{queuePositions.get(match.id)}</span>
                    <div className="match-queue-main">
                      <strong>{match.sideA}{swissRecordFor(match, match.sideA) && <span className="swiss-record">{swissRecordFor(match, match.sideA)}</span>} <em className="pause-time">{formatPlayerRest(match.pauseA)}</em>{busyA && <span className="queue-player-table-flag">Bereits an {venueName(busyA.table)}</span>}</strong>
                      <strong>{match.sideB}{swissRecordFor(match, match.sideB) && <span className="swiss-record">{swissRecordFor(match, match.sideB)}</span>} <em className="pause-time">{formatPlayerRest(match.pauseB)}</em>{busyB && <span className="queue-player-table-flag">Bereits an {venueName(busyB.table)}</span>}</strong>
                      <span className="muted">{match.phase} · {match.round}{match.matchDay ? ` · Spieltag ${match.matchDay}` : ''}{match.note ? ` · ${venueMessage(match.note)}` : ''}</span>
                      {isBusy && <span className="queue-conflict-hint">Zuweisung möglich, sobald {busyPlayers.length === 1 ? 'dieser Teilnehmer wieder frei ist.' : 'beide Teilnehmer wieder frei sind.'}</span>}
                      {otherBlockReason && <span className="queue-conflict-hint">Derzeit nicht zuweisbar: {venueMessage(otherBlockReason)}</span>}
                      {assigningMatchId === match.id && canAssign && (
                        <div className="table-assignment-picker">
                          {eligibleTables.map((table) => (
                            <button className="btn small" type="button" key={table} onClick={() => assignToTable(match.id, table)}>{venueName(table)}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="badge">{venueMessage(match.table)}</span>
                    <div className="queue-row-actions">
                      <>
                        {isMockThirdPlaceMatch(match.id) && (
                          <button className="btn small third-place-skip" type="button" onClick={() => setSkipThirdMatchId(match.id)} title="Kein Spiel um Platz 3: beide Halbfinalverlierer werden als Dritte gewertet.">
                            Nicht austragen · beide Platz 3
                          </button>
                        )}
                        <button className="btn small primary" type="button" disabled={!canAssign} onClick={() => autoAssignMatch(match.id)}>Automatisch zuweisen</button>
                        <button className="btn small" type="button" disabled={!canAssign} onClick={() => setAssigningMatchId((current) => current === match.id ? null : match.id)}>Zuweisen</button>
                      </>
                    </div>
                  </article>
                  );
                })}
              </div>
            </main>
            <aside className="control-side">
              <div className="card control-status-card">
                <div className="control-help-title"><h3>Turnierstatus</h3><ControlHelpButton topic="queue" onOpen={setHelpTopic} /></div>
                <div className="control-metrics-grid">
                  <div><span className="muted">{venue.singular}belegung</span><strong>{tableMatches.length}/{tournament.tables} · {blockedTables.size} gesperrt</strong></div>
                  <div><button className="control-metric-link" type="button" disabled={nextMatches.length === 0} onClick={() => openWaitingQueue()} title={nextMatches.length ? 'Zu den wartenden Spielen springen' : undefined}><span className="muted">Wartende Spiele</span><strong>{nextMatches.length}</strong></button></div>
                  <div><span className="muted">Restzeit grob</span><strong title={`Prognose aus offenen Spielen, Best-of und verfügbaren ${venue.dativePlural} (bei Tischtennis 15 Minuten je Satz).`}>{restTimeLabel}</strong></div>
                </div>
              </div>
              <div className="card control-progress-card">
                <div className="control-progress-heading"><h3>Turnierfortschritt</h3><strong>{tournamentProgress.percent} %</strong></div>
                <div className="control-progress-track" role="progressbar" aria-label="Ungefährer Turnierfortschritt nach Phasen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tournamentProgress.percent}>
                  <div className="control-progress-fill" style={{ width: `${tournamentProgress.percent}%` }} />
                </div>
                <div className="control-progress-details">
                  <strong>{tournament.status === 'FINISHED' ? 'Turnier beendet' : tournamentProgress.currentPhaseName || 'Noch keine Phase'}</strong>
                  <span>{tournamentProgress.completedPhases}/{tournamentProgress.totalPhases} Phasen abgeschlossen</span>
                  {activeStage && tournamentProgress.matchesInPhase > 0 && <span>{tournamentProgress.completedMatches}/{tournamentProgress.matchesInPhase} derzeit angesetzte Spiele abgeschlossen</span>}
                  {!activeStage && nextStartableStage && <span>Als Nächstes: {nextStartableStage.name}</span>}
                </div>
                <small className="muted" title="Der Balken gewichtet die Phasen gleich. Neu entstehende Begegnungen können den Zwischenstand innerhalb der aktiven Phase verändern.">Näherung nach Phasen, keine feste Gesamtspielzahl.</small>
              </div>
              {tournament.venueLayout && tableView === 'cards' && (
                <div className="card control-hall-layout">
                  <h3>Spielflächenplan</h3>
                  <VenueLayoutMini layout={tournament.venueLayout} sport={tournament.sport} />
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      {tab === 'audit' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><div className="control-help-title"><h2>Änderungsprotokoll</h2><ControlHelpButton topic="audit" onOpen={setHelpTopic} /></div><p className="muted">Nachvollziehbare lokale Änderungen an Spielflächen, Ergebnissen, Bestätigungen und Turnierpause. „Turnierleitung (lokal)“ ist im Prototyp keine verifizierte Benutzeridentität.</p></div></div>
          <div className="audit-list">
            {auditEntries.length === 0 && <p className="muted">Noch keine Aktionen protokolliert.</p>}
            {auditEntries.map((entry) => (
              <article className="audit-row" key={entry.id}>
                <span className="muted">{new Date(entry.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })}</span>
                <div><strong>{venueMessage(entry.description)}</strong><div className="muted">{entry.actor}{entry.matchId ? ` · ${entry.matchId}` : ''}</div>
                  {(entry.before || entry.after) && <div className="audit-values"><span>Vorher: {venueMessage(entry.before ?? '–')}</span><span>Nachher: {venueMessage(entry.after ?? '–')}</span></div>}
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
              <div className="control-help-title"><h2>Turnierverlauf</h2><ControlHelpButton topic="phases" onOpen={setHelpTopic} /></div>
              <p className="muted">Nach jeder Schweizer Runde und jeder Phase prüft die Turnierleitung die Ergebnisse und gibt den nächsten Schritt ausdrücklich frei. Mit dem Start einer Phase wird die Auslosung eingefroren.</p>
            </div>
          </div>
          <div className="phase-lifecycle-strip phase-navigation-strip">
            {tournament.stages.map((stage, index) => {
              const completed = isStageCompleted(tournament, stage);
              const started = isStageStarted(tournament, stage);
              const editable = isStageEditable(tournament, stage);
              const state = completed ? 'Beendet' : tournament.status === 'ABORTED' ? 'Abgebrochen' : pendingApproval?.stageId === stage.id ? 'Freigabe offen' : started ? 'Läuft' : editable ? 'Bearbeitbar' : 'Gesperrt';
              const decision = stage.type === 'SWISS' ? getSwissCutoffHistory(tournament, stage) : null;
              const roundRobin = decision?.extraRounds?.some((round) => round.kind === 'ROUND_ROBIN');
              return (
                <Fragment key={stage.id}>
                  <button
                    className={`phase-lifecycle-item phase-nav-button ${state.toLowerCase()} ${selectedStage?.id === stage.id ? 'selected' : ''}`}
                    type="button"
                    onClick={() => setSelectedStageId(stage.id)}
                  >
                    <span className="phase-nav-topline">
                      <span className="phase-nav-index">Phase {index + 1}</span>
                      <span className="badge phase-nav-status">{state}</span>
                    </span>
                    <strong className="phase-nav-name">{stage.name}</strong>
                  </button>
                  {roundRobin && <button
                    className={`phase-lifecycle-item phase-nav-button swiss-intermediate-nav ${decision?.winners?.length ? 'beendet' : 'läuft'} ${selectedStageId === `${stage.id}::rr` ? 'selected' : ''}`}
                    type="button"
                    onClick={() => setSelectedStageId(`${stage.id}::rr`)}
                  >
                    <span className="phase-nav-topline"><span className="phase-nav-index">Phase {index + 1}.5</span>
                      <span className="badge phase-nav-status">{decision?.winners?.length ? 'Entschieden' : 'In Entscheidung'}</span>
                    </span>
                    <strong className="phase-nav-name">Jeder gegen Jeden</strong>
                  </button>}
                </Fragment>
              );
            })}
          </div>
          {selectedRoundRobinStage && selectedRoundRobinDecision && (
            <SwissRoundRobinHistory
              phaseNumber={`${tournament.stages.indexOf(selectedRoundRobinStage) + 1}.5`}
              decision={selectedRoundRobinDecision}
              sport={tournament.sport}
              matches={getSwissRoundRobinMatches(tournament, selectedRoundRobinStage)}
              onEditResult={setAdminEditMatchId}
              onOpenControl={() => setTab('overview')}
            />
          )}
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
          <div className="control-section-head"><div><div className="control-help-title"><h2>Alle Spiele</h2><ControlHelpButton topic="matches" onOpen={setHelpTopic} /></div><p className="muted">Partien nach Status, Phase, Spielort oder Teilnehmer eingrenzen.</p></div></div>
          {allTournamentMatches.length === 0 && <p className="muted">Noch keine Spiele verfügbar. Die Paarungen erscheinen hier, sobald du die erste Phase gestartet hast. Die Auslosung kannst du vorher im Turnierverlauf bearbeiten.</p>}
          {allTournamentMatches.length > 0 && <>
            <div className="control-match-filters" role="search" aria-label="Spiele filtern">
              <div className="control-match-status-filters" role="group" aria-label="Spielstatus">
                {matchFilterOptions.map((option) => <button
                  key={option.value}
                  type="button"
                  className={matchFilters.status === option.value ? 'active' : ''}
                  aria-pressed={matchFilters.status === option.value}
                  onClick={() => setMatchFilters((current) => ({ ...current, status: option.value }))}
                >{option.label}</button>)}
              </div>
              <div className="control-match-filter-fields">
                <label>Teilnehmer suchen<input type="search" value={matchFilters.search} placeholder="Name eingeben …" onChange={(event) => setMatchFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                <label>Phase<select value={matchFilters.phase} onChange={(event) => setMatchFilters((current) => ({ ...current, phase: event.target.value }))}><option value="">Alle Phasen</option>{matchFilterPhases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
                <label>{venue.singular}<select value={matchFilters.table} onChange={(event) => setMatchFilters((current) => ({ ...current, table: event.target.value }))}><option value="">Alle {venue.plural}</option>{matchFilterTables.map((table) => <option key={table} value={table}>{venueName(table)}</option>)}</select></label>
              </div>
              <div className="control-match-filter-summary"><span>{filteredTournamentMatches.length} von {allTournamentMatches.length} Spielen</span>{(matchFilters.status !== 'all' || matchFilters.phase || matchFilters.table || matchFilters.search) && <button type="button" className="btn small" onClick={() => setMatchFilters({ status: 'all', phase: '', table: '', search: '' })}>Filter zurücksetzen</button>}</div>
            </div>
            {filteredTournamentMatches.length === 0 && <div className="control-empty-message control-matches-empty">Keine Spiele passen zu diesen Filtern. Versuche andere Suchbegriffe oder setze die Filter zurück.</div>}
            {filteredTournamentMatches.length > 0 && <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Phase</th><th>Spiel</th><th>Pausenzeit</th><th>{venue.singular}</th><th>Stand</th><th></th></tr></thead>
              <tbody>{filteredTournamentMatches.map((match) => (
                <tr key={match.id}>
                  <td><span className={match.status === 'LIVE' ? 'badge live' : match.status === 'READY' ? 'badge ready' : 'badge'}>{matchStatusLabel(match.status)}</span></td>
                  <td>{match.phase}<div className="muted">{match.round}</div></td>
                  <td><strong>{match.sideA}{swissRecordFor(match, match.sideA) && <span className="swiss-record">{swissRecordFor(match, match.sideA)}</span>}</strong><div>{match.sideB}{swissRecordFor(match, match.sideB) && <span className="swiss-record">{swissRecordFor(match, match.sideB)}</span>}</div></td>
                  <td>{formatMockMatchRest(match, 'A')} / {formatMockMatchRest(match, 'B')}</td>
                  <td>{venueMessage(match.table)}</td><td>{match.score} {match.extraTimeProgress ? 'n.V. · LIVE' : scoreDecisionSuffix(match.decision)}</td>
                  <td><div className="actions compact-actions"><button className="btn small" type="button" onClick={() => setAdminEditMatchId(match.id)}>Ergebnis anzeigen</button>{match.status === 'FINISHED' && canEditMockMatch(tournament, match.id) && <button className="btn small" type="button" onClick={() => setAdminEditMatchId(match.id)}>Bearbeiten</button>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          </>}
        </section>
      )}

      {tab === 'final' && anyCompletedPhase && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Endplatzierungen</h2>
            <p className="muted">{tournament.status === 'FINISHED'
              ? 'Turnierweite Gesamtplatzierungen über alle Phasen. Gleiche Gruppenränge teilen sich einen Platzierungsbereich; Rückzüge werden gemäß ihrer letzten erreichten Phase eingeordnet.'
              : 'Bereits feststehende Endplatzierungen ausgeschiedener Teilnehmer. Alle Spieler, die noch im Turnier sind, bleiben bis zu ihrem Ausscheiden oder dem Turnierende ohne endgültige Platzierung.'}</p>
          </div></div>
          {finalStandings.length === 0 && <p className="muted">Noch keine endgültigen Platzierungen: Die nächste Phase steht für alle Teilnehmer noch offen.</p>}
          <FinalStandingsList standings={finalStandings} phaseNames={tournament.stages.map((stage) => stage.name)}
            withdrawalLabels={Object.fromEntries(finalStandings.filter((row) => row.status === 'Zurückgezogen').map((row) => [row.name, getWithdrawalLabel(tournament, row.name) ?? 'Zurückgezogen']))} />
        </section>
      )}

      {tab === 'participants' && (
        <section className="card control-tab-panel">
          <div className="control-section-head">
            <div><div className="control-help-title"><h2>Teilnehmer</h2><ControlHelpButton topic="participants" onOpen={setHelpTopic} /></div><p className="muted">Spielercodes, Daten, Spiele und Rückzug an einer Stelle.</p></div>
            {!tournament.hasStarted && ['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status) && (
              <button className="btn primary" type="button" onClick={() => { setShowParticipantAdd((current) => !current); setParticipantAddError(''); }}>
                {showParticipantAdd ? 'Nachmeldung schließen' : '+ Teilnehmer nachtragen'}
              </button>
            )}
          </div>
          <div className="participant-summary-toolbar">
            <div className="participant-statistics" role="group" aria-label="Teilnehmerstatistik">
              <div><strong>{participantStatistics.total}</strong><span>Teilnehmer gesamt</span></div>
              <div><strong>{participantStatistics.remaining}</strong><span>Noch im Turnier</span></div>
              <div><strong>{participantStatistics.eliminated}</strong><span>Ausgeschieden</span></div>
              <div><strong>{participantStatistics.withdrawn}</strong><span>Zurückgezogen</span></div>
            </div>
            <div className="participant-search-bar no-print">
              <label>Teilnehmer suchen
                <input type="search" value={participantQuery} placeholder="Name oder Spielercode …" onChange={(event) => setParticipantQuery(event.target.value)} />
              </label>
              <label>Status
                <select value={participantStatusFilter} onChange={(event) => setParticipantStatusFilter(event.target.value as typeof participantStatusFilter)}>
                  <option value="all">Alle Teilnehmer</option>
                  <option value="active">Aktiv</option>
                  <option value="playing">Spielt gerade</option>
                  <option value="eliminated">Ausgeschieden</option>
                  <option value="withdrawn">Zurückgezogen</option>
                </select>
              </label>
              <div className="participant-filter-meta">
                <span className="participant-filter-count" role="status">{filteredParticipantProgress.length} von {participantProgress.length} Teilnehmern</span>
                {(participantQuery || participantStatusFilter !== 'all') && <button className="btn small" type="button" onClick={() => { setParticipantQuery(''); setParticipantStatusFilter('all'); }}>Zurücksetzen</button>}
              </div>
            </div>
          </div>
          {showParticipantAdd && !tournament.hasStarted && (
            <form className={`participant-add-panel${tournament.discipline === 'DOUBLES' ? ' is-doubles' : ''}`} onSubmit={(event) => { event.preventDefault(); handleAddParticipant(); }}>
              <div className="participant-add-heading">
                <strong>{tournament.discipline === 'DOUBLES' ? 'Doppelpaar nachtragen' : 'Spieler nachtragen'}</strong>
                <span className="field-hint">Neue Teilnehmer werden vor Turnierstart direkt in die Auslosung aufgenommen.</span>
              </div>
              <div className="participant-add-body">
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
                <div className="actions participant-add-actions">
                  <button className="btn small primary" type="submit">Nachtragen</button>
                  <button className="btn small" type="button" onClick={() => setShowParticipantAdd(false)}>Abbrechen</button>
                </div>
              </div>
              {participantAddError && <p role="alert" className="field-error">{participantAddError}</p>}
            </form>
          )}

          {filteredParticipantProgress.length === 0 && <p className="participant-filter-empty">Keine Teilnehmer gefunden. Suchbegriff oder Statusfilter anpassen.</p>}
          <div className="participant-control-list participant-control-grid">
            {filteredParticipantProgress.map(({ name: participant, progress, index }) => {
              const isWithdrawn = progress.status === 'Zurückgezogen';
              const statusText = isWithdrawn ? getWithdrawalLabel(tournament, participant) ?? 'Zurückgezogen'
                : progress.status === 'Aktiv' && tableMatches.some((match) => match.sideA === participant || match.sideB === participant) ? 'Spielt gerade' : progress.status;
              return (
                <article className={isWithdrawn ? 'participant-control-row withdrawn' : 'participant-control-row'} key={`${participant}-${index}`}>
                  <span className="participant-list-number">{index + 1}</span>
                  <div className="participant-control-identity"><strong>{participant}</strong><span className={`participant-inline-status${statusText === 'Spielt gerade' ? ' playing' : statusText === 'Aktiv' ? 'active' : isWithdrawn ? ' withdrawn' : progress.status === 'Ausgeschieden' ? ' eliminated' : ''}`}>{statusText}</span>{progress.placement && <span className="participant-placement">{progress.placement}</span>}</div>
                  <code>{tournament.participantCodes?.[participant] ?? String(4100 + index).slice(-4)}</code>
                  <div className="participant-row-actions">
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'edit' })}>Daten bearbeiten</button>
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'games' })}>Spielübersicht</button>
                    {isWithdrawn ? (
                      canRestoreMockParticipant(tournament, participant)
                        ? <button className="btn small" type="button" onClick={() => { if (restoreMockParticipant(tournament, participant)) { setParticipantVersion((value) => value + 1); setDrawVersion((value) => value + 1); refreshRuntime(); } }}>Rückzug rückgängig</button>
                        : <span className="btn small withdrawal-locked" aria-disabled="true" title="Nur vor einem Phasenstart und bei vorheriger Qualifikation möglich; nicht bei Rückzug während einer Runde.">Rückzug gesperrt</span>
                    ) : progress.status === 'Ausgeschieden' || progress.status === 'Beendet' || progress.status === 'Turniersieger' || !canWithdrawMockParticipant(tournament, participant)
                      ? <span className="btn small withdrawal-locked" aria-disabled="true" title="Nach einem Ausscheiden in der K.-o.-Phase ist kein Rückzug mehr möglich.">Rückzug gesperrt</span>
                      : <button className="btn small danger-outline" type="button" onClick={() => requestParticipantWithdrawal(participant)}>Zurückziehen</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'participants' && participantPanel && selectedParticipantIndex >= 0 && (
        <div className="prototype-modal-backdrop participant-management-backdrop" role="presentation" onMouseDown={() => setParticipantPanel(null)}>
          <section ref={participantModalRef} tabIndex={-1}
            className={`prototype-modal participant-management-modal${participantPanel.mode === 'games' ? ' is-games' : ''}`}
            role="dialog" aria-modal="true" aria-labelledby="participant-management-title"
            onMouseDown={(event) => event.stopPropagation()}>
            <div className="participant-management-heading">
              <div>
                <h2 id="participant-management-title">{participantPanel.mode === 'edit' ? 'Teilnehmer bearbeiten' : 'Spielübersicht'}</h2>
                <p>{participantPanel.name} · Code {tournament.participantCodes?.[participantPanel.name] ?? String(4100 + selectedParticipantIndex).slice(-4)}</p>
              </div>
              <button type="button" className="btn small" onClick={() => setParticipantPanel(null)} aria-label="Fenster schließen">Schließen</button>
            </div>
            {participantPanel.mode === 'edit' ? (
              <>
                <ParticipantEditFields key={participantPanel.name} name={participantPanel.name}
                  code={tournament.participantCodes?.[participantPanel.name] ?? String(4100 + selectedParticipantIndex).slice(-4)}
                  usedCodes={new Set(Object.entries(tournament.participantCodes ?? {}).filter(([owner]) => owner !== participantPanel.name).map(([, code]) => code))}
                  onSave={(first, last, code) => {
                    if (!updateMockParticipantName(tournament.id, participantPanel.name, first, last, code)) return false;
                    setParticipantPanel(null);
                    setParticipantVersion((value) => value + 1);
                    refreshRuntime();
                    return true;
                  }}
                  onCancel={() => setParticipantPanel(null)} />
                <p className="participant-code-note">„Neuer Code“ erzeugt einen freien Code. Erst mit „Speichern“ wird er übernommen.</p>
              </>
            ) : (
              <>
                {selectedParticipantMatches.length === 0 ? (
                  <p className="participant-filter-empty">Für diesen Teilnehmer sind noch keine Spiele verfügbar.</p>
                ) : (
                  <div className="participant-games-table table-wrap">
                    <table>
                      <thead><tr><th>Phase</th><th>Runde</th><th>Gegner</th><th>Status</th><th>Ergebnis</th><th>Aktion</th></tr></thead>
                      <tbody>{selectedParticipantMatches.map((match) => {
                        const stage = tournament.stages.find((item) => item.id === match.stageId);
                        return <tr key={match.id}>
                          <td>{match.phase}</td>
                          <td>{match.round}</td>
                          <td>{match.sideA === participantPanel.name ? match.sideB : match.sideA}</td>
                          <td>{matchStatusLabel(match.status)}</td>
                          <td><MatchResultDetails {...resultForMatchParticipant(match, participantPanel.name)} sport={tournament.sport} decision={match.decision} decisionReversed={match.sideB === participantPanel.name} /></td>
                          <td>{match.status === 'FINISHED' && stage && canEditMockMatch(tournament, match.id)
                            ? <button className="btn small" type="button" onClick={() => { setParticipantPanel(null); setAdminEditMatchId(match.id); }}>Spiel bearbeiten</button>
                            : stage && isStageStarted(tournament, stage) && match.status !== 'FINISHED'
                              ? <Link className="btn small" to={`/score/${match.id}`}>Spiel bearbeiten</Link>
                              : <span className="muted">{match.status === 'FINISHED' ? 'Gesperrt' : 'Phase noch nicht gestartet'}</span>}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {pendingWithdrawal && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setPendingWithdrawal(null)}>
          <section className="prototype-modal" role="alertdialog" aria-modal="true" aria-labelledby="withdrawal-warning-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="badge">RÜCKZUG WÄHREND EINER PHASE</span>
            <h2 id="withdrawal-warning-title">{pendingWithdrawal} zurückziehen?</h2>
            <p>Die aktuelle Phase läuft bereits. Der Rückzug kann danach nicht mehr rückgängig gemacht werden. Betroffene Spiele werden kampflos gewertet.</p>
            {activeStage?.type === 'GROUPS' && <p className="muted">In der Gruppenphase werden auch bereits gespielte Begegnungen mit 0:11 je Satz gegen diesen Teilnehmer gewertet. Tabellen und Qualifikation ändern sich entsprechend.</p>}
            <div className="actions">
              <button className="btn danger" type="button" onClick={confirmParticipantWithdrawal}>Zurückziehen</button>
              <button className="btn" type="button" onClick={() => setPendingWithdrawal(null)}>Abbrechen</button>
            </div>
          </section>
        </div>
      )}
      {adminEditMatchId && (() => {
        const found = findMockRuntimeMatch(adminEditMatchId);
        if (!found) return null;
        const stage = found.tournament.stages.find((item) => item.id === found.match.stageId);
        return (
          <div className="prototype-modal-backdrop" role="presentation">
            <section className="prototype-modal admin-result-modal" role="dialog" aria-modal="true">
              <div className="player-games-modal-head">
                <div><span className="badge">TURNIERLEITUNG</span><h2>{found.match.status === 'FINISHED' && !canEditMockMatch(tournament, found.match.id) ? 'Ergebnis anzeigen' : 'Spiel bearbeiten / Ergebnis anzeigen'}</h2></div>
                <button className="btn small" type="button" onClick={() => setAdminEditMatchId(null)}>Schließen</button>
              </div>
              <p className="muted">{found.match.sideA} gegen {found.match.sideB} · {found.match.round}{sportScoring(found.match.sport).mode === 'sets' ? ` · Best-of-${found.match.bestOf}` : ''}</p>
              <SportResultEntry
                match={found.match}
                swissAdminEntry={stage?.type === 'SWISS' || stage?.type === 'KNOCKOUT'}
                directorEntry
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
      {approvalModalOpen && pendingApproval && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setApprovalModalOpen(false)}>
          <section className="prototype-modal control-approval-modal" role="dialog" aria-modal="true" aria-labelledby="control-approval-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="badge ready">ABSCHLUSSKONTROLLE</span>
            <h2 id="control-approval-title">{pendingApproval.kind === 'ROUND'
              ? `Schweizer Runde ${pendingApproval.round} freigeben?`
              : `${pendingApproval.stageName} abschließen?`}</h2>
            <p>Bitte kontrolliere die folgenden {reviewMatches.length} Begegnungen. Mit der Freigabe bestätigt die Turnierleitung deren Ergebnisse verbindlich.</p>
            <div className="control-approval-results">
              {reviewMatches.map((match) => (
                <div className="control-approval-result" key={match.id}>
                  <span>{match.sideA} – {match.sideB}</span>
                  <strong>{match.score}</strong>
                </div>
              ))}
            </div>
            {pendingApproval.kind === 'STAGE' && <p className="muted">
              {pendingApproval.isLastStage
                ? 'Nach der Bestätigung wird das gesamte Turnier regulär beendet und die Endplatzierung verbindlich.'
                : `Danach stehen die Qualifikanten für „${pendingApproval.nextStageName}“ fest. Diese Folgephase kann anschließend vorbereitet werden.`}
            </p>}
            {pendingApproval.kind === 'ROUND' && <p className="muted">Anschließend werden die Paarungen der nächsten Schweizer Runde erstellt. Bei einer Korrektur vor deren Spielbeginn muss diese Runde erneut freigegeben werden.</p>}
            <div className="actions">
              <button className="btn primary" type="button" onClick={confirmPendingApproval}>
                {pendingApproval.kind === 'ROUND' ? 'Runde verbindlich freigeben' : pendingApproval.isLastStage ? 'Phase bestätigen und Turnier beenden' : 'Phase verbindlich freigeben'}
              </button>
              <button className="btn" type="button" onClick={() => { setSelectedStageId(pendingApproval.stageId); setTab('flow'); setApprovalModalOpen(false); }}>Im Turnierverlauf prüfen</button>
              <button className="btn" type="button" onClick={() => setApprovalModalOpen(false)}>Später</button>
            </div>
          </section>
        </div>
      )}
      {abortModalOpen && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setAbortModalOpen(false)}>
          <section className="prototype-modal control-abort-modal" role="dialog" aria-modal="true" aria-labelledby="control-abort-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="badge">TURNIERVERWALTUNG</span>
            <h2 id="control-abort-title">Turnier wirklich abbrechen?</h2>
            <p>Offene Spiele werden ohne Sieger beendet. Bereits eingetragene Ergebnisse und der Turnierverlauf bleiben erhalten. Es wird kein regulärer Turniersieger ermittelt.</p>
            <label htmlFor="control-abort-reason">Begründung (optional)</label>
            <textarea id="control-abort-reason" rows={3} value={abortReason} onChange={(event) => setAbortReason(event.target.value)}
              placeholder="Beispielsweise: Turnier vorzeitig wegen Hallenschließung beendet" />
            <div className="actions">
              <button className="btn danger" type="button" onClick={confirmTournamentAbort}>Turnier endgültig abbrechen</button>
              <button className="btn" type="button" onClick={() => setAbortModalOpen(false)}>Zurück</button>
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
      {pendingSwissCutoff && !activeRoundRobinPlayoff && !activeCutoffSetMatch && <SwissCutoffDecisionModal
        status={pendingSwissCutoff}
        tournament={tournament}
        onBeginSet={() => {
          const error = beginSwissCutoffSetMatch(tournament);
          if (!error) { refreshRuntime(); setTab('overview'); }
          return error;
        }}
        onLot={(winners) => { const error = recordSwissCutoffLot(tournament, winners); if (!error) refreshRuntime(); return error; }}
        onBegin={(kind) => { const error = beginSwissCutoffPlayoff(tournament, kind); if (!error) {
          refreshRuntime();
          if (kind === 'ROUND_ROBIN') { setTab('overview'); setSelectedStageId(`${pendingSwissCutoff.stageId}::rr`); }
        } return error; }}
        onOpenControl={() => setTab('overview')}
        onReset={() => { resetSwissCutoffSets(tournament); refreshRuntime(); }}
      />}
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
      {helpTopic && <TournamentControlHelp sport={tournament.sport} initialTopic={helpTopic} onClose={() => setHelpTopic(null)} />}
      {correctionNotice && <div className={`control-correction-toast ${correctionNotice.error ? 'error' : ''}`} role="status">
        <span className="control-correction-toast-icon" aria-hidden="true">{correctionNotice.error ? '!' : '✓'}</span>
        <strong>{correctionNotice.message}</strong>
        {correctionNotice.undoAuditId && <button className="btn small" type="button" onClick={() => undoCorrection(correctionNotice.undoAuditId!)}>Rückgängig</button>}
        <button className="control-toast-close" type="button" aria-label="Hinweis schließen" onClick={() => setCorrectionNotice(null)}>×</button>
      </div>}
    </>
  );
}
