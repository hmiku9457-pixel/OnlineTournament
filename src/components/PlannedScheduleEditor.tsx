import type { PlannedTimeline } from '@/domain/tournamentSchedule';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { formatPlannedBreakDuration, formatPlannedDateTime, parseLocalDateTime } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart: string;
  timeline: PlannedTimeline;
  awardsEnabled: boolean;
  awardsAt: string;
  onToggleAwards: (enabled: boolean) => void;
  onAwardsAtChange: (value: string) => void;
}

/** Phases come directly from the tournament configuration: no "Programmpunkt"
 * placeholders and no separate generate step. Only the optional ceremony
 * adds an independently adjustable event.
 */
export function PlannedScheduleEditor({
  scheduledStart, timeline, awardsEnabled, awardsAt, onToggleAwards, onAwardsAtChange,
}: Props) {
  const expectedEnd = parseLocalDateTime(timeline.estimatedEnd);
  const ceremony = parseLocalDateTime(awardsAt);
  const ceremonyTooEarly = awardsEnabled && Boolean(expectedEnd && ceremony && ceremony < expectedEnd);
  return (
    <div className="planned-schedule-editor">
      <div className="planned-schedule-editor-intro">
        <div>
          <h3>Voraussichtlicher Ablauf</h3>
          <p className="muted">Die Phasen werden automatisch aus deiner Turnierplanung und den geschätzten Spieldauern übernommen. Die Uhrzeiten sind unverbindlich.</p>
        </div>
      </div>
      <ol className="planned-schedule-phase-list">
        <li className="planned-schedule-phase-row is-start">
          <time dateTime={scheduledStart}>{formatPlannedDateTime(scheduledStart)}</time>
          <div><strong>Turnierbeginn</strong><small>Geplanter Start</small></div>
        </li>
        {timeline.items.map((item, index) => (
          <li key={item.id} className={`planned-schedule-phase-row ${item.type === 'break' ? 'is-break' : ''}`}>
            {item.type === 'break'
              ? <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>
              : <time dateTime={item.at}>{formatPlannedDateTime(item.at)}</time>}
            <div>
              <strong>{item.title}</strong>
              <small>{item.type === 'break'
                ? item.durationApproximate ? 'Geschätzte Pausendauer (abhängig vom Spielverlauf)' : 'Geplante Pausendauer'
                : 'Voraussichtlicher Phasenbeginn'}</small>
              {timeline.warnings.filter((warning) => warning.phaseIndex === index).map((warning) => (
                <p className="planned-schedule-phase-warning" role="alert" key={warning.message}>{warning.message}</p>
              ))}
            </div>
          </li>
        ))}
        {timeline.estimatedEnd && <li className="planned-schedule-phase-row is-finish">
          <time dateTime={timeline.estimatedEnd}>{formatPlannedDateTime(timeline.estimatedEnd)}</time>
          <div><strong>Voraussichtliches Turnierende</strong><small>Nach der letzten Turnierphase</small></div>
        </li>}
        {awardsEnabled && (
          <li className="planned-schedule-phase-row is-ceremony">
            <time dateTime={awardsAt}>{formatPlannedDateTime(awardsAt)}</time>
            <div><strong>Siegerehrung</strong><small>Optionaler Abschluss · geplante Uhrzeit</small></div>
          </li>
        )}
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
