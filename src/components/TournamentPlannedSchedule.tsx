import type { PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { formatPlannedBreakDuration, formatPlannedClockTime, groupPlannedScheduleDays, isValidLocalDateTime } from '@/domain/tournamentSchedule';

export interface TimetableStage {
  id: string;
  name: string;
  type: string;
  status: 'live' | 'completed' | 'pending';
  details?: string;
  advancement?: string;
}

interface Props {
  scheduledStart?: string;
  items?: PlannedScheduleItem[];
  title?: string;
  stages?: TimetableStage[];
  onStage?: (stageId: string) => void;
}

/** A non-binding timetable. Optional real stage links and status never affect phase lifecycle. */
export function TournamentPlannedSchedule({
  scheduledStart, items = [], title = 'Geplanter Zeitplan', stages, onStage,
}: Props) {
  if (!scheduledStart && items.length === 0 && !stages?.length) return null;

  // Schedule entries created by the wizard retain phase-1, phase-2, etc.
  // Use actual stage data as the source of truth for labels and status; after
  // pre-start edits, extra stages still appear even if no timetable was saved.
  const plannedIndices = new Set<number>();
  const combined: PlannedScheduleItem[] = items.map((item) => {
    const match = /^phase-(\d+)$/.exec(item.id);
    const index = match ? Number(match[1]) - 1 : -1;
    const stage = index >= 0 ? stages?.[index] : undefined;
    if (!stage) return item;
    plannedIndices.add(index);
    return { ...item, title: stage.name, type: stage.type === 'BREAK' ? 'break' : 'competition' };
  });
  stages?.forEach((stage, index) => {
    if (!plannedIndices.has(index)) {
      combined.push({
        id: `phase-${index + 1}`,
        at: '',
        title: stage.name,
        type: stage.type === 'BREAK' ? 'break' : 'competition',
      });
    }
  });

  const grouped = groupPlannedScheduleDays(combined, scheduledStart);
  const stageFor = (item: PlannedScheduleItem): TimetableStage | undefined => {
    const match = /^phase-(\d+)$/.exec(item.id);
    return match ? stages?.[Number(match[1]) - 1] : undefined;
  };
  const timeLabel = (item: PlannedScheduleItem) => {
    if (!isValidLocalDateTime(item.at)) return <span className="planned-schedule-duration">Zeit noch offen</span>;
    if (item.type === 'break' && item.breakKind === 'overnight') {
      return <span className="planned-schedule-duration">Ende ca. {formatPlannedClockTime(item.at)}</span>;
    }
    if (item.type === 'break') {
      return <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>;
    }
    return <time dateTime={item.at}>{formatPlannedClockTime(item.at)}</time>;
  };

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
      <p className="muted planned-schedule-disclaimer">
        {stages?.length
          ? 'Uhrzeiten und Pausen sind unverbindlich. Wähle eine Phase, um ihren Turnierverlauf zu öffnen.'
          : 'Orientierung für Teilnehmer und Gäste. Spielbeginn, Phasen und Pausen können am Turniertag abweichen; maßgeblich ist die aktuelle Turnierleitung.'}
      </p>
      {combined.length > 0 && <ol className="planned-schedule-list">
        {grouped.days.map((day) => (
          <li className="planned-schedule-day-group" key={day.date}>
            {grouped.multipleDays && <h3 className="planned-schedule-day-heading">{day.label}</h3>}
            <ol className="planned-schedule-day-entries">{day.items.map((item) => {
              const stage = stageFor(item);
              const stateLabel = stage?.status === 'live' ? 'Läuft gerade'
                : stage?.status === 'completed' ? 'Abgeschlossen' : 'Ausstehend';
              return (
                <li className={`planned-schedule-item planned-schedule-${item.type}${stage ? ` planned-schedule-stage is-${stage.status}` : ''}`} key={item.id}>
                  {stage && onStage ? (
                    <button type="button" className="planned-schedule-stage-button"
                      aria-label={`${stage.name}, ${stateLabel}. Im Turnierverlauf öffnen`}
                      onClick={() => onStage(stage.id)}>
                      {timeLabel(item)}
                      <span className="planned-schedule-stage-content">
                        <span className="planned-schedule-stage-title">
                          <strong>{item.title}</strong>
                          <span className={`planned-schedule-stage-status status-${stage.status}`}>
                            {stage.status === 'live' && <span className="planned-schedule-live-dot" aria-hidden="true" />}
                            {stateLabel}
                          </span>
                        </span>
                        {stage.details && <span className="planned-schedule-stage-detail">{stage.details}</span>}
                        {stage.advancement && <span className="planned-schedule-stage-advancement">{stage.advancement}</span>}
                        {item.note && <span className="planned-schedule-stage-note">{item.note}</span>}
                      </span>
                    </button>
                  ) : (
                    <>
                      {timeLabel(item)}
                      <div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>
                    </>
                  )}
                </li>
              );
            })}</ol>
          </li>
        ))}
      </ol>}
      {combined.length === 0 && <p className="muted planned-schedule-empty">Für dieses Turnier wurde kein detaillierter Ablauf veröffentlicht.</p>}
    </section>
  );
}
