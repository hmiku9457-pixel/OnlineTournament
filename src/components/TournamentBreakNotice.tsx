import type { DemoTournament } from '@/data/demoTournaments';
import { getActiveStage, getBreakResumeAt, getNextStartableStage } from '@/services/mockPhaseLifecycle';

/** Shared, read-only schedule notice for players and spectators. */
export function TournamentBreakNotice({ tournament }: { tournament: DemoTournament }) {
  const active = getActiveStage(tournament);
  const upcoming = active ? null : getNextStartableStage(tournament);
  const stage = active?.type === 'BREAK' ? active : upcoming?.type === 'BREAK' ? upcoming : null;
  if (!stage) return null;

  const overnight = stage.settings.breakKind === 'overnight';
  const resume = getBreakResumeAt(tournament, stage);
  const planned = overnight
    ? `Fortsetzung am Folgetag um ${String(stage.settings.nextDayStart ?? '09:00')} Uhr`
    : `${Number(stage.settings.breakMinutes) || 15} Minuten Pause`;

  return (
    <section className="tournament-break-notice" role="status" aria-label="Aktuelle Turnierunterbrechung">
      <div className="tournament-break-notice-head">
        <span className="badge">{overnight ? 'Spieltagsende' : 'Turnierpause'}</span>
        <strong>{stage.name}</strong>
      </div>
      <p>{planned}{resume ? ` · Früheste Fortsetzung: ${resume.toLocaleString('de-DE')}` : ''}</p>
      {Boolean(stage.settings.note) && <p className="tournament-break-note">{String(stage.settings.note)}</p>}
    </section>
  );
}
