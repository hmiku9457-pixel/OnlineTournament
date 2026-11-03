import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

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
  maximumMinutes?: number;
}

/** Duration editor with explicitly labeled units, not a clock-time picker. */
export function RecommendationDurationPicker({ value, onChange, multiDay = false, maximumMinutes }: Props) {
  const maximum = Math.min(multiDay ? MAX_RECOMMENDATION_DURATION : MAX_SINGLE_DAY_DURATION,
    maximumMinutes ?? MAX_RECOMMENDATION_DURATION);
  const maxHours = Math.floor(maximum / 60);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [hoursText, setHoursText] = useState('03');
  const [minutesText, setMinutesText] = useState('30');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstTabRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const hours = /^\d{1,3}$/.test(hoursText) && Number(hoursText) <= maxHours ? Number(hoursText) : null;
  const minutes = /^\d{1,2}$/.test(minutesText) && Number(minutesText) <= 59 ? Number(minutesText) : null;
  const candidate = hours === null || minutes === null ? null : normalizeRecommendationDuration(hours, minutes, maximum);

  function openDialog() {
    setHoursText(String(Math.floor(value / 60)).padStart(2, '0'));
    setMinutesText(String(value % 60).padStart(2, '0'));
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
  function addDurationMinutes(amount: number) {
    const entered = hours !== null && minutes !== null ? hours * 60 + minutes : value;
    const next = Math.min(maximum, entered + amount);
    setHoursText(String(Math.floor(next / 60)).padStart(2, '0'));
    setMinutesText(String(next % 60).padStart(2, '0'));
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
        aria-label={`Geplante Turnierdauer als Zeitspanne einstellen, aktuell ${formatRecommendationDuration(value)}`}
        onClick={openDialog}>
        <strong>{formatRecommendationDuration(value)}</strong>
        <span aria-hidden="true">✎</span>
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
            <p className="clock-picker-dialog-note">Hier gibst du an, <strong>wie lange</strong> das Turnier dauern soll – keine Start- oder Enduhrzeit.</p>
            <div className="clock-picker-manual recommendation-duration-inputs">
              <label>Stunden (0–{maxHours})
                <input ref={firstTabRef} type="number" min="0" max={maxHours} inputMode="numeric" value={hoursText}
                  onChange={(event) => setHoursText(event.target.value)} />
              </label>
              <label>Minuten (0–59)
                <input type="number" min="0" max="59" inputMode="numeric" value={minutesText}
                  onChange={(event) => setMinutesText(event.target.value)} />
              </label>
            </div>
            <div className="recommendation-duration-quick-add" role="group" aria-label="Turnierdauer schnell erhöhen">
              {([1, 5, 15, 60] as const).map((amount) => (
                <button key={amount} type="button" className="btn"
                  disabled={hours !== null && minutes !== null && hours * 60 + minutes >= maximum}
                  onClick={() => addDurationMinutes(amount)}>
                  +{amount === 60 ? '1 Std.' : `${amount} Min.`}
                </button>
              ))}
            </div>
            {candidate !== null && <p className="recommendation-duration-preview" role="status">Geplante Dauer: <strong>{formatRecommendationDuration(candidate)}</strong></p>}
            {candidate === null && <p className="clock-picker-minimum-hint" role="status">Bitte eine Dauer zwischen 15 Minuten und {formatRecommendationDuration(maximum)} eingeben.</p>}
            <div className="clock-picker-actions">
              <button type="button" className="btn" onClick={closeDialog}>Abbrechen</button>
              <button type="button" className="btn primary" disabled={candidate === null} onClick={submit}>Dauer übernehmen</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
