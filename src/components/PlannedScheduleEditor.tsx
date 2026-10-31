import type { PlannedTimeline, PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { formatPlannedBreakDuration, formatPlannedClockTime, groupPlannedScheduleDays, parseLocalDateTime } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart: string;
  timeline: PlannedTimeline;
  awardsEnabled: boolean;
  awardsAt: string;
  onToggleAwards: (enabled: boolean) => void;
  onAwardsAtChange: (value: string) => void;
}

/** Phase starts and pause lengths come from the same non-binding timeline. */
export function PlannedScheduleEditor({
  scheduledStart, timeline, awardsEnabled, awardsAt, onToggleAwards, onAwardsAtChange,
}: Props) {
  const expectedEnd = parseLocalDateTime(timeline.estimatedEnd);
  const ceremony = parseLocalDateTime(awardsAt);
  const ceremonyTooEarly = awardsEnabled && Boolean(expectedEnd && ceremony && ceremony < expectedEnd);
  const entries: PlannedScheduleItem[] = [
    { id: 'scheduled-start', at: scheduledStart, title: 'Turnierbeginn', type: 'other' },
    ...timeline.items,
    ...(timeline.estimatedEnd
      ? [{ id: 'estimated-finish', at: timeline.estimatedEnd, title: 'Voraussichtliches Turnierende', type: 'other' as const }]
      : []),
    ...(awardsEnabled
      ? [{ id: 'awards-ceremony', at: awardsAt, title: 'Siegerehrung', type: 'other' as const }]
      : []),
  ];
  const grouped = groupPlannedScheduleDays(entries, scheduledStart);
  const renderRow = (item: PlannedScheduleItem) => {
    const isStart = item.id === 'scheduled-start';
    const isFinish = item.id === 'estimated-finish';
    const isCeremony = item.id === 'awards-ceremony';
    const isBreak = item.type === 'break';
    const hint = isStart ? 'Geplanter Start'
      : isFinish ? 'Nach der letzten Turnierphase'
        : isCeremony ? 'Optionaler Abschluss · geplante Uhrzeit'
          : isBreak ? item.durationApproximate ? 'Pause · geschätzte Dauer (abhängig vom Spielverlauf)' : 'Pause · geplante Dauer'
            : item.id.startsWith('inline-resume-') ? 'Voraussichtliche Fortsetzung'
              : 'Voraussichtlicher Phasenbeginn';
    const phaseIndex = item.id.startsWith('inline-break-') || item.id.startsWith('inline-resume-')
      ? Number(item.id.split('-').at(-1)) - 1
      : item.id.startsWith('phase-') ? Number(item.id.slice(6)) - 1 : -1;
    return (
      <li key={item.id} className={`planned-schedule-phase-row${isStart ? ' is-start' : isFinish ? ' is-finish' : isCeremony ? ' is-ceremony' : isBreak ? ' is-break' : ''}`}>
        {isBreak
          ? <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>
          : <time dateTime={item.at}>{formatPlannedClockTime(item.at)}</time>}
        <div>
          <strong>{item.title}</strong>
          <small>{hint}</small>
          {timeline.warnings.filter((warning) => warning.phaseIndex === phaseIndex && (
            item.id === `phase-${phaseIndex + 1}` || item.id === `inline-break-${phaseIndex + 1}`
          )).map((warning) => (
            <p className="planned-schedule-phase-warning" role="alert" key={warning.message}>{warning.message}</p>
          ))}
        </div>
      </li>
    );
  };
  return (
    <div className="planned-schedule-editor">
      <div className="planned-schedule-editor-intro">
        <div>
          <h3>Voraussichtlicher Ablauf</h3>
          <p className="muted">Phasen und Pausen werden automatisch aus deiner Planung übernommen. Uhrzeiten und Pausendauern sind unverbindliche Richtwerte.</p>
        </div>
      </div>
      <ol className="planned-schedule-phase-list">
        {grouped.days.map((day) => (
          <li className="planned-schedule-day-group" key={day.date}>
            {grouped.multipleDays && <h4 className="planned-schedule-day-heading">{day.label}</h4>}
            <ol className="planned-schedule-day-entries">{day.items.map(renderRow)}</ol>
          </li>
        ))}
      </ol>
      <section className="planned-schedule-ceremony">
        <div>
          <strong>Siegerehrung <span className="wizard-optional-tag">Optional</span></strong>
          <p className="muted">Auf Wunsch direkt nach dem geschätzten Turnierende. Die Uhrzeit kannst du anschließend auf einen späteren Zeitpunkt verschieben.</p>
        </div>
        {!awardsEnabled ? (
          <button type="button" className="btn primary" onClick={() => onToggleAwards(true)}>+ Siegerehrung hinzufügen</button>
        ) : (
          <div className="planned-schedule-ceremony-actions">
            <label>Geplanter Beginn der Siegerehrung
              <div className="planned-schedule-ceremony-datetime">
                <input aria-label="Datum der Siegerehrung" type="date" required min={timeline.estimatedEnd.slice(0, 10) || undefined}
                  value={awardsAt.slice(0, 10)} onChange={(event) => onAwardsAtChange(`${event.target.value}T${awardsAt.slice(11, 16) || '00:00'}`)}/>
                <ClockTimePicker id="awards-ceremony-time" label="Uhrzeit der Siegerehrung"
                  value={awardsAt.slice(11, 16)} onChange={(time) => onAwardsAtChange(`${awardsAt.slice(0, 10)}T${time}`)} />
              </div>
            </label>
            <button type="button" className="btn small" onClick={() => onToggleAwards(false)}>Siegerehrung entfernen</button>
            {ceremonyTooEarly && <p role="alert" className="planned-schedule-phase-warning">Die Siegerehrung darf nicht vor dem voraussichtlichen Turnierende beginnen.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
