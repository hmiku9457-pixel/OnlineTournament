import { CalendarDatePicker } from '@/components/CalendarDatePicker';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { toLocalDateTime } from '@/domain/tournamentSchedule';

export type BreakStartMode = 'minutes' | 'clock';

export const MIN_BREAK_MINUTES = 1;
export const MAX_BREAK_MINUTES = 1440;
export const BREAK_MINUTE_STEPS = [1, 5, 15, 60] as const;

/** The quick-add controls must never produce an invalid pause duration. */
export function addBreakMinutes(current: number, delta: number): number {
  const base = Number.isInteger(current) && current >= MIN_BREAK_MINUTES && current <= MAX_BREAK_MINUTES ? current : 0;
  return Math.max(MIN_BREAK_MINUTES, Math.min(MAX_BREAK_MINUTES, base + delta));
}

interface BreakStartSettingsProps {
  mode: BreakStartMode;
  minutes: number;
  date: string;
  time: string;
  onModeChange: (mode: BreakStartMode) => void;
  onMinutesChange: (value: number) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  plannedHint?: string;
  error?: string | null;
}

export function BreakStartSettings({
  mode, minutes, date, time, onModeChange, onMinutesChange, onDateChange, onTimeChange, plannedHint, error,
}: BreakStartSettingsProps) {
  const today = toLocalDateTime(new Date()).slice(0, 10);
  return (
    <div className="break-start-settings">
      <div className="break-start-settings-heading">
        <strong>Wann soll die Pause enden?</strong>
        <span>Die Einstellung kann vor dem Start noch geändert werden.</span>
      </div>
      {plannedHint && <p className="break-start-planned-hint"><span>Aus der Turnierplanung</span>{plannedHint.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1')}</p>}
      <div className="break-start-mode-switch" role="group" aria-label="Art des Pausenendes">
        <button type="button" className={mode === 'minutes' ? 'is-active' : ''}
          aria-pressed={mode === 'minutes'} onClick={() => onModeChange('minutes')}>Dauer in Minuten</button>
        <button type="button" className={mode === 'clock' ? 'is-active' : ''}
          aria-pressed={mode === 'clock'} onClick={() => onModeChange('clock')}>Bis Datum und Uhrzeit</button>
      </div>
      {mode === 'minutes' ? (
        <div className="break-start-duration">
          <label htmlFor="break-start-duration-minutes">Pausendauer</label>
          <div className="break-start-duration-input">
            <input id="break-start-duration-minutes" type="number" min={MIN_BREAK_MINUTES} max={MAX_BREAK_MINUTES} step={1}
              inputMode="numeric" value={minutes} onChange={(event) => onMinutesChange(Number(event.target.value))}/>
            <span>Minuten</span>
          </div>
          <div className="break-start-duration-quick-buttons" role="group" aria-label="Pausendauer verlängern">
            {BREAK_MINUTE_STEPS.map((delta) => (
              <button key={delta} type="button" className="recommendation-duration-adjust-button"
                disabled={Number.isInteger(minutes) && minutes >= MIN_BREAK_MINUTES && minutes + delta > MAX_BREAK_MINUTES}
                onClick={() => onMinutesChange(addBreakMinutes(minutes, delta))}>
                +{delta === 60 ? '1 Std.' : `${delta} Min.`}
              </button>
            ))}
          </div>
          <p className="break-start-field-hint">Der Countdown beginnt erst beim tatsächlichen Start der Pause.</p>
        </div>
      ) : (
        <div className="break-start-clock">
          <div className="break-start-clock-fields">
            <div className="break-start-clock-field">
              <label htmlFor="break-start-date">Datum</label>
              <CalendarDatePicker id="break-start-date" label="Datum" value={date} onChange={onDateChange} minDate={today} required />
            </div>
            <div className="break-start-clock-field">
              <label htmlFor="break-start-time">Fortsetzung um</label>
              <ClockTimePicker id="break-start-time" label="Fortsetzung um" value={time} onChange={onTimeChange} />
            </div>
          </div>
          <p className="break-start-field-hint">Datum und Uhrzeit müssen in der Zukunft liegen. Vergangene Termine werden nicht automatisch verschoben.</p>
        </div>
      )}
      {error && <p className="break-start-error" role="alert">{error}</p>}
    </div>
  );
}
