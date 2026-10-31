import type { PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { formatPlannedBreakDuration, formatPlannedClockTime, groupPlannedScheduleDays } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart?: string;
  items?: PlannedScheduleItem[];
  title?: string;
}

/** Informational only: independent of actual match and phase starts. */
export function TournamentPlannedSchedule({ scheduledStart, items = [], title = 'Geplanter Zeitplan' }: Props) {
  if (!scheduledStart && items.length === 0) return null;
  const grouped = groupPlannedScheduleDays(items, scheduledStart);
  return (
    <section className="card tournament-planned-schedule" aria-label="Unverbindlicher Zeitplan">
      <div className="planned-schedule-heading">
        <div>
          <span className="planned-schedule-eyebrow">Vorabinformation · unverbindlich</span>
          <h2>{title}</h2>
        </div>
        {scheduledStart && <div className="planned-schedule-start">
          <span>Geplanter Turnierbeginn</span>
          <strong>{formatPlannedClockTime(scheduledStart)}</strong>
        </div>}
      </div>
      <p className="muted planned-schedule-disclaimer">Orientierung für Teilnehmer und Gäste. Spielbeginn, Phasen und Pausen können am Turniertag abweichen; maßgeblich ist die aktuelle Turnierleitung.</p>
      {items.length > 0 && <ol className="planned-schedule-list">
        {grouped.days.map((day) => (
          <li className="planned-schedule-day-group" key={day.date}>
            {grouped.multipleDays && <h3 className="planned-schedule-day-heading">{day.label}</h3>}
            <ol className="planned-schedule-day-entries">{day.items.map((item) => (
              <li className={`planned-schedule-item planned-schedule-${item.type}`} key={item.id}>
                {item.type === 'break'
                  ? <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>
                  : <time dateTime={item.at}>{formatPlannedClockTime(item.at)}</time>}
                <div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>
              </li>
            ))}</ol>
          </li>
        ))}
      </ol>}
      {items.length === 0 && <p className="muted planned-schedule-empty">Für dieses Turnier wurde kein detaillierter Ablauf veröffentlicht.</p>}
    </section>
  );
}
