import type { PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { formatPlannedBreakDuration, formatPlannedDateTime } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart?: string;
  items?: PlannedScheduleItem[];
  title?: string;
}

/** Informational only: independent of actual match and phase starts. */
export function TournamentPlannedSchedule({ scheduledStart, items = [], title = 'Geplanter Zeitplan' }: Props) {
  if (!scheduledStart && items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <section className="card tournament-planned-schedule" aria-label="Unverbindlicher Zeitplan">
      <div className="planned-schedule-heading">
        <div>
          <span className="planned-schedule-eyebrow">Vorabinformation · unverbindlich</span>
          <h2>{title}</h2>
        </div>
        {scheduledStart && <div className="planned-schedule-start"><span>Geplanter Turnierbeginn</span><strong>{formatPlannedDateTime(scheduledStart)}</strong></div>}
      </div>
      <p className="muted planned-schedule-disclaimer">Orientierung für Teilnehmer und Gäste. Spielbeginn, Phasen und Pausen können am Turniertag abweichen; maßgeblich ist die aktuelle Turnierleitung.</p>
      {sorted.length > 0 && <ol className="planned-schedule-list">
        {sorted.map((item) => (
          <li className={`planned-schedule-item planned-schedule-${item.type}`} key={item.id}>
            {item.type === 'break'
              ? <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>
              : <time dateTime={item.at}>{formatPlannedDateTime(item.at)}</time>}
            <div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>
          </li>
        ))}
      </ol>}
      {sorted.length === 0 && <p className="muted planned-schedule-empty">Für dieses Turnier wurde kein detaillierter Ablauf veröffentlicht.</p>}
    </section>
  );
}
