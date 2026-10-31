import { formatBreakCountdown } from '@/services/mockPhaseLifecycle';

interface Props {
  stageName: string;
  overnight: boolean;
  note?: string;
  resumeAt: Date | null;
  ready: boolean;
  now: number;
  onViewDetails: () => void;
  onFinish: () => void;
}

/** Persistent, high-visibility pause control across every director tab.
 * The countdown is presentational only; phase completion remains an explicit
 * director action, including after the planned time has elapsed.
 */
export function TournamentPauseBanner({
  stageName, overnight, note, resumeAt, ready, now, onViewDetails, onFinish,
}: Props) {
  const resumeLabel = resumeAt
    ? resumeAt.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Noch nicht festgelegt';
  const countdown = formatBreakCountdown(resumeAt, now);
  return (
    <section className={`control-pause-alert no-print${ready ? ' is-ready' : ''}`}
      aria-label="Laufende Turnierpause" data-testid="director-pause-banner">
      <div className="control-pause-alert-symbol" aria-hidden="true" />
      <div className="control-pause-alert-description">
        <div className="control-pause-alert-eyebrow">
          <span className="control-pause-alert-indicator" aria-hidden="true" />
          {ready ? 'PAUSENZEIT ABGELAUFEN' : overnight ? 'SPIELTAGSENDE AKTIV' : 'TURNIERPAUSE LÄUFT'}
        </div>
        <strong className="control-pause-alert-title">{stageName}</strong>
        <span className="control-pause-alert-schedule">Geplante Fortsetzung: <strong>{resumeLabel} Uhr</strong></span>
        {note?.trim() && <span className="control-pause-alert-note">{note.trim()}</span>}
      </div>
      <div className="control-pause-alert-timer" role="timer" aria-label="Verbleibende Pausenzeit" aria-live="off">
        <span>{ready ? 'Freigabe möglich' : 'Noch verbleibend'}</span>
        <strong>{countdown}</strong>
      </div>
      <div className="control-pause-alert-actions">
        <button className="btn control-pause-alert-action" type="button" onClick={onFinish}>
          {ready ? 'Pause beenden' : 'Vorzeitig beenden'}
        </button>
        <button className="btn control-pause-alert-details" type="button" onClick={onViewDetails}>
          Pausendetails
        </button>
      </div>
    </section>
  );
}
