import type { DemoTournament } from '@/data/demoTournaments';
import { getBreakResumeAt } from '@/services/mockPhaseLifecycle';
import { formatPlannedDateTime } from '@/domain/tournamentSchedule';
import { disciplineLabel } from '@/domain/sports';
import type { TournamentStage } from '@/domain/types';
import { getVenueTerminology } from '@/domain/venueTerminology';
import { isStageCompleted, isStageStarted } from '@/services/mockPhaseLifecycle';

interface SummaryProgress {
  percent: number;
  completedPhases: number;
  totalPhases: number;
  matchesInPhase: number;
  completedMatches: number;
}

interface TournamentSummaryProps {
  tournament: DemoTournament;
  participants: number;
  activeMatches: number;
  waitingMatches: number;
  blockedTables: number;
  restTimeLabel: string;
  progress: SummaryProgress;
  activeStage?: TournamentStage;
  nextStage?: TournamentStage;
  pendingApproval: boolean;
  onControl: () => void;
  onParticipants: () => void;
  onStage: (stage: TournamentStage) => void;
  onFinalStandings: () => void;
  onEditPhases?: () => void;
  activeParticipants?: number;
  withdrawnParticipants?: number;
  phasesNeedReview?: boolean;
}

function stageDetails(stage: TournamentStage): string {
  const number = (key: string) => typeof stage.settings[key] === 'number' ? Number(stage.settings[key]) : 0;
  const parts: string[] = [];
  if (stage.type === 'BREAK') {
    return stage.settings.breakKind === 'overnight'
      ? `Spieltagsende · Fortsetzung am Folgetag um ${stage.settings.nextDayStart} Uhr`
      : `${stage.settings.breakMinutes} Minuten Pause`;
  }
  switch (stage.type) {
    case 'ROUND_ROBIN':
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
      parts.push('jeder gegen jeden');
      break;
    case 'GROUPS':
      if (number('groups')) parts.push(`${number('groups')} Gruppen`);
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
      break;
    case 'SWISS':
      if (number('rounds')) parts.push(`${number('rounds')} Runden`);
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
      break;
    case 'KNOCKOUT':
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
      if (number('byes')) parts.push(`${number('byes')} Freilose`);
      break;
    case 'DOUBLE_ELIMINATION':
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
      break;
    default:
      if (number('entrants')) parts.push(`${number('entrants')} Teilnehmer`);
  }
  parts.push(`Best-of-${stage.bestOf}`);
  return parts.join(' · ');
}

function advancementLabel(stage: TournamentStage, isLast: boolean): string {
  if (stage.type === 'BREAK') return 'Keine Spiele · keine Ausscheidung';
  if (isLast) return 'Abschlussphase';
  if (stage.advancement.type === 'top_n') return `${stage.advancement.value} qualifizieren sich`;
  if (stage.advancement.type === 'percentage') return `${stage.advancement.value} % qualifizieren sich`;
  return 'Qualifikation nach Turnierregeln';
}

export function TournamentSummaryPanel({
  tournament, participants, activeMatches, waitingMatches, blockedTables, restTimeLabel,
  progress, activeStage, nextStage, pendingApproval,
  onControl, onParticipants, onStage, onFinalStandings,
  onEditPhases, activeParticipants, withdrawnParticipants, phasesNeedReview,
}: TournamentSummaryProps) {
  const venue = getVenueTerminology(tournament.sport);
  const ended = tournament.status === 'FINISHED' || tournament.status === 'ARCHIVED';
  const aborted = tournament.status === 'ABORTED';
  const beforeStart = !tournament.hasStarted && !ended && !aborted;
  const paused = tournament.status === 'PAUSED';

  let actionTitle = 'Turnier im Blick';
  let actionText = 'Die wichtigsten Angaben und alle Phasen stehen hier auf einen Blick.';
  let actionLabel = 'Zur Turnierleitung';
  let action = onControl;

  if (aborted) {
    actionTitle = 'Turnier abgebrochen';
    actionText = 'Das Turnier wurde beendet und kann nicht fortgesetzt werden.';
    actionLabel = '';
  } else if (ended) {
    actionTitle = 'Turnier abgeschlossen';
    actionText = 'Alle Phasen sind abgeschlossen. Die endgültigen Platzierungen stehen zur Einsicht bereit.';
    actionLabel = 'Endplatzierungen ansehen';
    action = onFinalStandings;
  } else if (pendingApproval) {
    actionTitle = 'Ergebnisse prüfen und freigeben';
    actionText = 'Eine Runde oder Phase ist abgeschlossen. Die Turnierleitung muss die Ergebnisse bestätigen, bevor es weitergeht.';
    actionLabel = 'Zum Turnierverlauf';
    action = () => {
      const stage = activeStage ?? nextStage ?? tournament.stages.find((item) => !isStageCompleted(tournament, item));
      if (stage) onStage(stage);
      else onControl();
    };
  } else if (beforeStart) {
    actionTitle = 'Turnierstart vorbereiten';
    actionText = 'Teilnehmer und Auslosung prüfen. Anschließend das Turnier mit dem grünen Button im Header starten.';
    actionLabel = 'Teilnehmer prüfen';
    action = onParticipants;
  } else if (activeStage?.type === 'BREAK') {
    actionTitle = activeStage.name;
    const resume = getBreakResumeAt(tournament, activeStage);
    actionText = resume
      ? `Die Pause läuft. Geplante Fortsetzung: ${resume.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} Uhr. Der Countdown ist oben jederzeit sichtbar.`
      : 'Die Pause läuft. Den Countdown und die geplante Fortsetzung findest du oben.';
    actionLabel = 'Pausenstatus ansehen';
    action = () => onStage(activeStage);
  } else if (paused) {
    actionTitle = 'Turnier pausiert';
    actionText = 'Laufende Partien können beendet werden. Neue Spielzuweisungen sind bis zur Fortsetzung gesperrt.';
  } else if (activeStage) {
    actionTitle = waitingMatches > 0 ? 'Wartende Spiele zuweisen' : 'Aktuelle Phase begleiten';
    actionText = waitingMatches > 0
      ? `${waitingMatches} ${waitingMatches === 1 ? 'Partie wartet' : 'Partien warten'} auf die nächste Zuweisung. Die Spielsteuerung findest du in der Turnierleitung.`
      : 'Die aktuelle Phase läuft. Spielstände, Belegungen und weitere Zuweisungen werden in der Turnierleitung verwaltet.';
  } else if (nextStage) {
    actionTitle = 'Nächste Phase vorbereiten';
    actionText = `${nextStage.name} kann im Turnierverlauf geprüft und vorbereitet werden.`;
    actionLabel = 'Phase ansehen';
    action = () => onStage(nextStage);
  }

  return (
    <section className="tournament-summary">
      <div className="tournament-summary-heading">
        <div>
          <h2>Übersicht</h2>
          <p className="muted">Turnierstand, nächste Schritte und Phasenplan – ohne zusätzliche Zwischenstation.</p>
        </div>
        <div className="tournament-summary-heading-actions">
          {beforeStart && onEditPhases && <button type="button" className="btn small" onClick={onEditPhases}>Phasen vor Start bearbeiten</button>}
          <span className="tournament-summary-stage-count">{progress.completedPhases} von {progress.totalPhases} Phasen abgeschlossen</span>
          <button className="btn small no-print" type="button" onClick={() => window.print()}>Übersicht drucken</button>
        </div>
      </div>

      {beforeStart && phasesNeedReview && onEditPhases && (
        <div className="tournament-summary-prestart-warning" role="status">
          <div><strong>Phasenplanung nach Teilnehmeränderung prüfen</strong>
            <p>{activeParticipants ?? 0} aktive Teilnehmer · {withdrawnParticipants ?? 0} zurückgezogen. Prüfe bitte die Auslosung und die Folgephasen. Bei gültiger Konstellation kannst du das Turnier ohne erneute Bestätigung der Phasenplanung starten.</p>
          </div>
          <button type="button" className="btn small" onClick={onEditPhases}>Phasen anpassen</button>
        </div>
      )}
      <div className="tournament-summary-top">
        <div className="tournament-summary-next">
          <span className="tournament-summary-eyebrow">Nächster Schritt</span>
          <h3>{actionTitle}</h3>
          <p>{actionText}</p>
          <div className="tournament-summary-actions">
            {actionLabel && <button type="button" className="btn primary" onClick={action}>{actionLabel}</button>}
            {beforeStart && tournament.stages[0] && (
              <button type="button" className="btn" onClick={() => onStage(tournament.stages[0])}>Auslosung ansehen</button>
            )}
          </div>
        </div>
        <div className="tournament-summary-metrics" aria-label="Aktuelle Turnierkennzahlen">
          <div><span>Teilnehmer</span><strong>{participants}</strong></div>
          <div><span>Belegte {venue.plural}</span><strong>{activeMatches}<small> / {tournament.tables}</small></strong></div>
          <div><span>Wartende Spiele</span><strong>{waitingMatches}</strong></div>
          <div><span>{beforeStart ? 'Dauerprognose' : 'Restzeit (Schätzung)'}</span><strong className="tournament-summary-time">{beforeStart ? tournament.estimatedDuration : restTimeLabel}</strong></div>
        </div>
      </div>

      <div className="tournament-summary-progress-head">
        <strong>Turnierfortschritt</strong>
        <span>{progress.percent} % · {progress.completedPhases}/{progress.totalPhases} Phasen</span>
      </div>
      <div className="tournament-summary-progress-bar" role="progressbar"
        aria-label="Geschätzter Turnierfortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      {activeStage && progress.matchesInPhase > 0 && (
        <p className="tournament-summary-progress-note">
          {activeStage.name}: {progress.completedMatches} von {progress.matchesInPhase} derzeit angesetzten Partien abgeschlossen
        </p>
      )}

      <div className="tournament-summary-section-head">
        <div>
          <h3>Phasenplan</h3>
          <p className="muted">Reihenfolge, Spielmodus und Qualifikation. Eine Phase anklicken, um ihren Verlauf zu öffnen.</p>
        </div>
      </div>
      <div className="tournament-summary-phases">
        {tournament.stages.map((stage, index) => {
          const completed = isStageCompleted(tournament, stage);
          const started = isStageStarted(tournament, stage);
          const isCurrent = activeStage?.id === stage.id;
          const state = completed ? 'Abgeschlossen' : isCurrent ? 'Läuft' : started ? 'Gestartet' : 'Ausstehend';
          return (
            <button className={`tournament-summary-phase${isCurrent ? ' is-current' : ''}${completed ? ' is-complete' : ''}`}
              type="button" key={stage.id} onClick={() => onStage(stage)}
              aria-label={`Phase ${index + 1}: ${stage.name}, ${state}. Im Turnierverlauf öffnen`}>
              <span className="tournament-summary-phase-number">{index + 1}</span>
              <span className="tournament-summary-phase-content">
                <span className="tournament-summary-phase-title">{stage.name}</span>
                <span className="tournament-summary-phase-details">{stageDetails(stage)}</span>
                <span className="tournament-summary-phase-advance">{advancementLabel(stage, index === tournament.stages.length - 1)}</span>
              </span>
              <span className={`tournament-summary-phase-state ${completed ? 'complete' : isCurrent ? 'current' : ''}`}>{state}</span>
            </button>
          );
        })}
      </div>

      <div className="tournament-summary-details">
        <h3>Turnierdaten</h3>
        <div className="tournament-summary-facts">
          {tournament.scheduledStart && <div><span>Geplanter Turnierbeginn</span><strong>{formatPlannedDateTime(tournament.scheduledStart)}</strong></div>}
          <div><span>Sportart</span><strong>{tournament.sport}</strong></div>
          <div><span>Disziplin</span><strong>{disciplineLabel(tournament.discipline)}</strong></div>
          <div><span>Sichtbarkeit</span><strong>{tournament.visibility === 'PRIVATE' ? 'Privat' : tournament.visibility === 'PUBLIC' ? 'Öffentlich' : 'Über Link'}</strong></div>
          <div><span>{venue.plural}</span><strong>{tournament.tables}{blockedTables ? ` · ${blockedTables} gesperrt` : ''}</strong></div>
        </div>
        {tournament.areas.length > 0 && (
          <details className="tournament-summary-areas">
            <summary>Spielbereiche anzeigen</summary>
            <div className="tournament-summary-area-list">
              {tournament.areas.map((area) => (
                <div key={area.name}>
                  <strong>{area.name}</strong>
                  <span>{venue.plural}: {area.tables} · {area.preferred}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
