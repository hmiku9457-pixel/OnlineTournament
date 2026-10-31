import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type ClockMode = 'hours' | 'minutes';

export function parseClockTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function formatClockTime(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Dial coordinate in percent, with zero at 12 o'clock and clockwise progression. */
export function clockDialPosition(tick: number, radiusPercent: number, divisions = 12) {
  const angle = tick / divisions * 2 * Math.PI;
  return { left: 50 + radiusPercent * Math.sin(angle), top: 50 - radiusPercent * Math.cos(angle) };
}

interface ClockDialProps {
  mode: ClockMode;
  hour: number;
  minute: number;
  onPickHour: (hour: number) => void;
  onPickMinute: (minute: number) => void;
}

/** 24-hour clock dial: outer ring 01–12, inner ring 00 and 13–23. */
export function ClockTimeDial({ mode, hour, minute, onPickHour, onPickMinute }: ClockDialProps) {
  const innerHour = hour === 0 || hour >= 13;
  const selected = mode === 'hours'
    ? clockDialPosition(hour % 12, innerHour ? 27 : 41)
    : clockDialPosition(minute, 41, 60);
  return (
    <div className="clock-picker-dial" role="group" aria-label={mode === 'hours' ? 'Stunde auf dem Zifferblatt auswählen' : 'Minute auf dem Zifferblatt auswählen'}>
      <svg viewBox="0 0 100 100" className="clock-picker-hand" aria-hidden="true" focusable="false">
        <line x1="50" y1="50" x2={selected.left} y2={selected.top} />
        <circle cx="50" cy="50" r="2.3" />
        <circle cx={selected.left} cy={selected.top} r="3.5" />
      </svg>
      {mode === 'hours'
        ? Array.from({ length: 24 }, (_, value) => {
          const inner = value === 0 || value >= 13;
          const point = clockDialPosition(value % 12, inner ? 27 : 41);
          return (
            <button className={`clock-picker-mark${hour === value ? ' is-selected' : ''}`}
              type="button" key={value} aria-label={`${value} Uhr`} aria-pressed={hour === value}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
              onClick={() => onPickHour(value)}>{value === 0 ? '00' : String(value)}</button>
          );
        })
        : Array.from({ length: 12 }, (_, tick) => {
          const value = tick * 5;
          const point = clockDialPosition(tick, 41);
          return (
            <button className={`clock-picker-mark${minute === value ? ' is-selected' : ''}`}
              type="button" key={value} aria-label={`${value} Minuten`} aria-pressed={minute === value}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
              onClick={() => onPickMinute(value)}>{String(value).padStart(2, '0')}</button>
          );
        })}
    </div>
  );
}

interface ClockTimePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function ClockTimePicker({ id, value, onChange, label = 'Uhrzeit' }: ClockTimePickerProps) {
  const dialogTitle = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const hoursTabRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ClockMode>('hours');
  const [hourInput, setHourInput] = useState('09');
  const [minuteInput, setMinuteInput] = useState('00');

  const hour = /^\d{1,2}$/.test(hourInput) && Number(hourInput) <= 23 ? Number(hourInput) : null;
  const minute = /^\d{1,2}$/.test(minuteInput) && Number(minuteInput) <= 59 ? Number(minuteInput) : null;
  const formatted = hour === null || minute === null ? null : formatClockTime(hour, minute);

  function show() {
    const parsed = parseClockTime(value) ?? { hour: 9, minute: 0 };
    setHourInput(String(parsed.hour).padStart(2, '0'));
    setMinuteInput(String(parsed.minute).padStart(2, '0'));
    setMode('hours');
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function confirm() {
    if (formatted === null) return;
    onChange(formatted);
    close();
  }
  useEffect(() => {
    if (!open) return;
    hoursTabRef.current?.focus();
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open]);

  function containFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
    if (!elements.length) return;
    if (event.shiftKey && document.activeElement === elements[0]) {
      event.preventDefault();
      elements[elements.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) {
      event.preventDefault();
      elements[0].focus();
    }
  }

  return (
    <>
      <button id={id} ref={triggerRef} type="button" className="clock-picker-trigger"
        aria-haspopup="dialog" aria-expanded={open} aria-label={`${label} einstellen, aktuell ${value} Uhr`}
        onClick={show}>
        <span className="clock-picker-trigger-value">{value}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 6.5V12l3.8 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="clock-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={dialogRef} className="clock-picker-dialog" role="dialog" aria-modal="true"
            aria-labelledby={dialogTitle} onKeyDown={containFocus}>
            <div className="clock-picker-dialog-header">
              <h2 id={dialogTitle}>{label} einstellen</h2>
              <button type="button" className="clock-picker-close" aria-label="Schließen" onClick={close}>×</button>
            </div>
            <p className="clock-picker-dialog-note">Uhrzeit im 24-Stunden-Format auswählen.</p>
            <div className="clock-picker-digital" role="group" aria-label="Stunde oder Minute auswählen">
              <button type="button" ref={hoursTabRef} aria-pressed={mode === 'hours'}
                className={mode === 'hours' ? 'is-active' : ''} onClick={() => setMode('hours')}>
                {hour === null ? '--' : String(hour).padStart(2, '0')}
              </button>
              <span aria-hidden="true">:</span>
              <button type="button" aria-pressed={mode === 'minutes'}
                className={mode === 'minutes' ? 'is-active' : ''} onClick={() => setMode('minutes')}>
                {minute === null ? '--' : String(minute).padStart(2, '0')}
              </button>
            </div>
            <ClockTimeDial mode={mode} hour={hour ?? 9} minute={minute ?? 0}
              onPickHour={(next) => { setHourInput(String(next).padStart(2, '0')); setMode('minutes'); }}
              onPickMinute={(next) => setMinuteInput(String(next).padStart(2, '0'))} />
            <p className="clock-picker-ring-hint">{mode === 'hours'
              ? 'Äußerer Ring: 1–12 Uhr · Innerer Ring: 13–23 Uhr und 00 Uhr'
              : 'Minuten in 5er-Schritten wählen. Einzelne Minuten unten eingeben.'}</p>
            <div className="clock-picker-manual">
              <label>Stunde (0–23)
                <input type="number" inputMode="numeric" min="0" max="23" value={hourInput}
                  onChange={(event) => { setHourInput(event.target.value); setMode('hours'); }} />
              </label>
              <label>Minute (0–59)
                <input type="number" inputMode="numeric" min="0" max="59" value={minuteInput}
                  onChange={(event) => { setMinuteInput(event.target.value); setMode('minutes'); }} />
              </label>
            </div>
            <div className="clock-picker-actions">
              <button type="button" className="btn" onClick={close}>Abbrechen</button>
              <button type="button" className="btn primary" disabled={!formatted} onClick={confirm}>Übernehmen</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
