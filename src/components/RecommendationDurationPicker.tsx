import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ClockTimeDial, type ClockMode } from '@/components/ClockTimePicker';

export const MIN_RECOMMENDATION_DURATION = 15;
export const MAX_RECOMMENDATION_DURATION = 14 * 24 * 60 - 1;
export const MAX_SINGLE_DAY_DURATION = 23 * 60 + 59;
export const DEFAULT_RECOMMENDATION_DURATION = 210;

export function formatRecommendationDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} Std. ${rest ? `${rest} Min.` : ''}`.trim() : `${rest} Min.`;
}

export function normalizeRecommendationDuration(hours: number, minutes: number, maximum = MAX_SINGLE_DAY_DURATION): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > Math.floor(maximum / 60)
    || minutes < 0 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total >= MIN_RECOMMENDATION_DURATION && total <= maximum ? total : null;
}

interface Props {
  value: number;
  onChange: (minutes: number) => void;
  multiDay?: boolean;
}

/** Duration instead of a clock time, with familiar clock dial and precise HH:MM fields. */
export function RecommendationDurationPicker({ value, onChange, multiDay = false }: Props) {
  const maximum = multiDay ? MAX_RECOMMENDATION_DURATION : MAX_SINGLE_DAY_DURATION;
  const maxHours = Math.floor(maximum / 60);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ClockMode>('hours');
  const [hoursText, setHoursText] = useState('03');
  const [minutesText, setMinutesText] = useState('30');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstTabRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const hours = /^\d{1,3}$/.test(hoursText) && Number(hoursText) <= maxHours ? Number(hoursText) : null;
  const minutes = /^\d{1,2}$/.test(minutesText) && Number(minutesText) <= 59 ? Number(minutesText) : null;
  const candidate = hours === null || minutes === null ? null : normalizeRecommendationDuration(hours, minutes, maximum);

  function openDialog() {
    setHoursText(String(Math.floor(value / 60)).padStart(2, '0'));
    setMinutesText(String(value % 60).padStart(2, '0'));
    setMode('hours');
    setOpen(true);
  }
  function closeDialog() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function submit() {
    if (candidate === null) return;
    onChange(candidate);
    closeDialog();
  }
  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstTabRef.current?.focus();
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function containFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []);
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault(); focusable[0].focus();
    }
  }

  return (
    <>
      <button type="button" id="preferred-duration" className="recommendation-duration-trigger"
        ref={triggerRef} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Geplante Turnierdauer einstellen, aktuell ${formatRecommendationDuration(value)}`}
        onClick={openDialog}>
        <strong>{String(Math.floor(value / 60)).padStart(2, '0')}:{String(value % 60).padStart(2, '0')}</strong>
        <span aria-hidden="true"> <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l4 2.5"/></svg></span>
      </button>
      {open && (
        <div className="clock-picker-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <section ref={dialogRef} className="clock-picker-dialog recommendation-duration-dialog"
            role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={containFocus}>
            <div className="clock-picker-dialog-header">
              <h2 id={titleId}>Geplante Turnierdauer</h2>
              <button type="button" className="clock-picker-close" aria-label="Schließen" onClick={closeDialog}>×</button>
            </div>
            <p className="clock-picker-dialog-note">Gewünschte Dauer in Stunden und Minuten wählen – keine Uhrzeit.</p>
            <div className="clock-picker-digital" role="group" aria-label="Stunden oder Minuten der Turnierdauer">
              <button type="button" ref={firstTabRef} aria-pressed={mode === 'hours'}
                className={mode === 'hours' ? 'is-active' : ''} onClick={() => setMode('hours')}>
                {hours === null ? '--' : String(hours).padStart(2, '0')}
              </button>
              <span aria-hidden="true">:</span>
              <button type="button" aria-pressed={mode === 'minutes'}
                className={mode === 'minutes' ? 'is-active' : ''} onClick={() => setMode('minutes')}>
                {minutes === null ? '--' : String(minutes).padStart(2, '0')}
              </button>
            </div>
            <ClockTimeDial mode={mode} hour={(hours ?? 0) % 24} minute={minutes ?? 0}
              onPickHour={(next) => { setHoursText(String(next).padStart(2, '0')); setMode('minutes'); }}
              onPickMinute={(next) => setMinutesText(String(next).padStart(2, '0'))}/>
            <p className="clock-picker-ring-hint">{mode === 'hours'
              ? 'Stunden auf dem Zifferblatt auswählen (0–23); für mehrtägige Turniere höhere Werte unten eingeben.'
              : 'Minuten in 5er-Schritten auswählen oder unten genau eingeben.'}</p>
            <div className="clock-picker-manual">
              <label>Stunden (0–{maxHours})
                <input type="number" min="0" max={maxHours} inputMode="numeric" value={hoursText}
                  onChange={(event) => { setHoursText(event.target.value); setMode('hours'); }} />
              </label>
              <label>Minuten (0–59)
                <input type="number" min="0" max="59" inputMode="numeric" value={minutesText}
                  onChange={(event) => { setMinutesText(event.target.value); setMode('minutes'); }} />
              </label>
            </div>
            {candidate === null && <p className="clock-picker-minimum-hint" role="status">Bitte eine Dauer zwischen 15 Minuten und {formatRecommendationDuration(maximum)} eingeben.</p>}
            <div className="clock-picker-actions">
              <button type="button" className="btn" onClick={closeDialog}>Abbrechen</button>
              <button type="button" className="btn primary" disabled={candidate === null} onClick={submit}>Übernehmen</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
