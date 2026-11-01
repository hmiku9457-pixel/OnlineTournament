import { useState } from 'react';
import type { PlannedTimeline, PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { CalendarDatePicker } from '@/components/CalendarDatePicker';
import { formatPlannedBreakDuration, formatPlannedClockTime, groupPlannedScheduleDays, parseLocalDateTime } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart: string;
  timeline: PlannedTimeline;
  awardsEnabled: boolean;
  awardsAt: string;
  onToggleAwards: (enabled: boolean) => void;
  onAwardsAtChange: (value: string) => void;
}

/** The single non-binding timetable during creation, including inline ceremony editing. */
export function PlannedScheduleEditor({
  scheduledStart, timeline, awardsEnabled, awardsAt, onToggleAwards, onAwardsAtChange,
}: Props) {
  const [ceremonyExpanded, setCeremonyExpanded] = useState(awardsEnabled);
  const expectedEnd = parseLocalDateTime(timeline.estimatedEnd);
  const ceremony = parseLocalDateTime(awardsAt);
  const ceremonyTooEarly = awardsEnabled && Boolean(expectedEnd && ceremony && ceremony < expectedEnd);
  const entries: PlannedScheduleItem[] = [
    { id: 'scheduled-start', at: scheduledStart, title: 'Turnierbeginn', type: 'other' },
    ...timeline.items,
    ...(timeline.estimatedEnd
      ? [{ id: 'estimated-finish', at: timeline.estimatedEnd, title: 'Voraussichtliches Turnierende', type: 'other' as const }]
      : []),
    // Always show the optional ceremony inside this timeline, even before it is enabled.
    { id: 'awards-ceremony', at: awardsEnabled ? awardsAt : (timeline.estimatedEnd || scheduledStart),
      title: 'Siegerehrung', type: 'other' },
  ];
  const grouped = groupPlannedScheduleDays(entries, scheduledStart);
  const renderRow = (item: PlannedScheduleItem) => {
    const isStart = item.id === 'scheduled-start';
    const isFinish = item.id === 'estimated-finish';
    const isCeremony = item.id === 'awards-ceremony';
    const isBreak = item.type === 'break';
    const isDayEnd = isBreak && item.breakKind === 'overnight';
    const hint = isStart ? 'Geplanter Start'
      : isFinish ? 'Nach der letzten Turnierphase'
        : isBreak ? isDayEnd ? 'Spieltagsende · Fortsetzung am geplanten Datum'
          : item.durationApproximate ? 'Pause · geschätzte Dauer (abhängig vom Spielverlauf)' : 'Pause · geplante Dauer'
          : item.id.startsWith('inline-resume-') ? 'Voraussichtliche Fortsetzung'
            : 'Voraussichtlicher Phasenbeginn';
    const phaseIndex = item.id.startsWith('inline-break-') || item.id.startsWith('inline-resume-')
      ? Number(item.id.split('-').at(-1)) - 1
      : item.id.startsWith('phase-') ? Number(item.id.slice(6)) - 1 : -1;

    if (isCeremony) {
      return (
        <li key={item.id} className="planned-schedule-phase-row is-ceremony">
          <button type="button" className="planned-schedule-ceremony-toggle"
            aria-expanded={awardsEnabled && ceremonyExpanded}
            aria-controls="planned-ceremony-settings"
            onClick={() => {
              if (!awardsEnabled) {
                onToggleAwards(true);
                setCeremonyExpanded(true);
              } else setCeremonyExpanded((current) => !current);
            }}>
            <span className="planned-schedule-ceremony-clock">
              {awardsEnabled ? formatPlannedClockTime(item.at) : 'Optional'}
            </span>
            <span className="planned-schedule-ceremony-name">
              <strong>Siegerehrung <span className="wizard-optional-tag">Optional</span></strong>
              <small>{awardsEnabled
                ? 'Geplanter Abschluss · Einstellungen aufklappen'
                : 'Auf Wunsch hinzufügen und Termin auswählen'}</small>
            </span>
            <span className="planned-schedule-ceremony-chevron" aria-hidden="true">
              {awardsEnabled ? (ceremonyExpanded ? '▴' : '▾') : '+ Hinzufügen'}
            </span>
          </button>
          {awardsEnabled && ceremonyExpanded && (
            <div className="planned-schedule-ceremony-details" id="planned-ceremony-settings">
              <div className="planned-schedule-ceremony-fields">
                <div className="field">
                  <label htmlFor="awards-ceremony-date">Datum der Siegerehrung</label>
                  <CalendarDatePicker id="awards-ceremony-date" label="Datum der Siegerehrung"
                    minDate={timeline.estimatedEnd.slice(0, 10)}
                    value={awardsAt.slice(0, 10)}
                    onChange={(date) => onAwardsAtChange(date + 'T' + (awardsAt.slice(11, 16) || '00:00'))} />
                </div>
                <div className="field">
                  <label htmlFor="awards-ceremony-time">Uhrzeit der Siegerehrung</label>
                  <ClockTimePicker id="awards-ceremony-time" label="Uhrzeit der Siegerehrung"
                    value={awardsAt.slice(11, 16)}
                    onChange={(time) => onAwardsAtChange(awardsAt.slice(0, 10) + 'T' + time)} />
                </div>
                <button type="button" className="btn small danger-outline planned-ceremony-remove"
                  onClick={() => { onToggleAwards(false); setCeremonyExpanded(false); }}>
                  Siegerehrung entfernen
                </button>
              </div>
              {ceremonyTooEarly && (
                <p role="alert" className="planned-schedule-phase-warning">
                  Die Siegerehrung darf nicht vor dem voraussichtlichen Turnierende beginnen.
                </p>
              )}
            </div>
          )}
        </li>
      );
    }

    return (
      <li key={item.id} className={'planned-schedule-phase-row' + (isStart ? ' is-start' : isFinish ? ' is-finish' : isBreak ? ' is-break' : '')}>
        {isDayEnd
          ? <span className="planned-schedule-day-end">Ende ca. {formatPlannedClockTime(item.at)}</span>
          : isBreak
            ? <span className="planned-schedule-duration">{formatPlannedBreakDuration(item)}</span>
            : <time dateTime={item.at}>{formatPlannedClockTime(item.at)}</time>}
        <div>
          <strong>{item.title}</strong>
          <small>{hint}</small>
          {timeline.warnings.filter((warning) => warning.phaseIndex === phaseIndex && (
            item.id === 'phase-' + (phaseIndex + 1) || item.id === 'inline-break-' + (phaseIndex + 1)
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
        <h3>Voraussichtlicher Ablauf</h3>
        <p className="muted">Automatisch aus deinen Phasen berechnet · Uhrzeiten und Pausen sind unverbindlich.</p>
      </div>
      <ol className="planned-schedule-phase-list">
        {grouped.days.map((day) => (
          <li className="planned-schedule-day-group" key={day.date}>
            {grouped.multipleDays && <h4 className="planned-schedule-day-heading">{day.label}</h4>}
            <ol className="planned-schedule-day-entries">{day.items.map(renderRow)}</ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
