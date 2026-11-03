import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

export function toCalendarDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return [String(date.getFullYear()).padStart(4, '0'), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

export function nextCalendarDate(date: string): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return '';
  parsed.setDate(parsed.getDate() + 1);
  return toCalendarDate(parsed);
}

export function calendarMonthDays(year: number, month: number): (number | null)[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

interface CalendarDatePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  minDate?: string;
  required?: boolean;
}

export function CalendarDatePicker({
  id, value, onChange, label = 'Datum', minDate, required = false,
}: CalendarDatePickerProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(0);
  const [viewYear, setViewYear] = useState(2026);
  const [yearInput, setYearInput] = useState('2026');
  const selected = parseCalendarDate(value);
  const minimum = minDate && parseCalendarDate(minDate) ? minDate : '';
  const today = toCalendarDate(new Date());
  const displayDate = (date: Date) => date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const days = calendarMonthDays(viewYear, viewMonth);
  const previousMonthUnavailable = Boolean(minimum && `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}` <= minimum.slice(0, 7));

  function show() {
    const initial = selected && (!minimum || value >= minimum) ? selected : parseCalendarDate(minimum) ?? new Date();
    setViewMonth(initial.getMonth());
    setViewYear(initial.getFullYear());
    setYearInput(String(initial.getFullYear()));
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function navigateMonths(delta: number) {
    const date = new Date(viewYear, viewMonth + delta, 1);
    if (date.getFullYear() > 9999 || date.getFullYear() < 1
      || (minimum && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` < minimum.slice(0, 7))) return;
    setViewYear(date.getFullYear());
    setYearInput(String(date.getFullYear()));
    setViewMonth(date.getMonth());
  }
  function commitYear() {
    const value = Number(yearInput);
    const firstYear = minimum ? Number(minimum.slice(0, 4)) : 1;
    if (!/^\d{1,4}$/.test(yearInput) || !Number.isInteger(value)
      || value < firstYear || value > 9999) {
      setYearInput(String(viewYear));
      return;
    }
    setViewYear(value);
    setYearInput(String(value));
    if (minimum && value === firstYear && viewMonth < Number(minimum.slice(5, 7)) - 1) {
      setViewMonth(Number(minimum.slice(5, 7)) - 1);
    }
  }
  function choose(date: string) {
    if (minimum && date < minimum) return;
    if (!parseCalendarDate(date)) return;
    onChange(date);
    close();
  }
  useEffect(() => {
    if (!open) return;
    firstFocusRef.current?.focus();
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open]);
  function containFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []);
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
      <button id={id} ref={triggerRef} type="button" className="calendar-picker-trigger"
        aria-haspopup="dialog" aria-expanded={open} aria-required={required}
        aria-label={label + ' auswählen' + (selected ? ', aktuell ' + displayDate(selected) : ', noch nicht festgelegt')}
        onClick={show}>
        <span className={selected ? 'calendar-picker-value' : 'calendar-picker-placeholder'}>
          {selected ? displayDate(selected) : 'TT.MM.JJJJ'}
        </span>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-13 4h1m3 0h1m3 0h1m-9 4h1m3 0h1"/>
        </svg>
      </button>
      {open && (
        <div className="calendar-picker-backdrop" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={dialogRef} className="calendar-picker-dialog" role="dialog" aria-modal="true"
            aria-labelledby={titleId} onKeyDown={containFocus}>
            <div className="calendar-picker-dialog-head">
              <div>
                <h2 id={titleId}>{label} auswählen</h2>
                <p>Wähle einen Tag im Kalender.</p>
              </div>
              <button type="button" ref={firstFocusRef} className="calendar-picker-close" aria-label="Schließen" onClick={close}>×</button>
            </div>
            <div className="calendar-picker-month-nav">
              <button type="button" aria-label="Vorheriger Monat" disabled={previousMonthUnavailable} onClick={() => navigateMonths(-1)}>‹</button>
              <select aria-label="Monat" value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))}>
                {months.map((month, index) => <option key={month} value={index} disabled={Boolean(minimum && `${viewYear}-${String(index + 1).padStart(2, "0")}` < minimum.slice(0, 7))}>{month}</option>)}
              </select>
              <input type="number" aria-label="Jahr" min={minimum ? Number(minimum.slice(0, 4)) : 1}
                max={9999} value={yearInput} onChange={(event) => {
                  const typed = event.target.value;
                  setYearInput(typed);
                  // Update the month selector when a complete valid year is typed.
                  // Partial input remains editable until blur/Enter.
                  if (/^\d{4}$/.test(typed)) {
                    const value = Number(typed);
                    const firstYear = minimum ? Number(minimum.slice(0, 4)) : 1;
                    if (value >= firstYear && value <= 9999) {
                      setViewYear(value);
                      if (minimum && value === firstYear && viewMonth < Number(minimum.slice(5, 7)) - 1) {
                        setViewMonth(Number(minimum.slice(5, 7)) - 1);
                      }
                    }
                  }
                }}
                onBlur={commitYear} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
              <button type="button" aria-label="Nächster Monat" disabled={viewYear === 9999 && viewMonth === 11} onClick={() => navigateMonths(1)}>›</button>
            </div>
            <div className="calendar-picker-grid" role="group" aria-label={months[viewMonth] + ' ' + viewYear}>
              {weekdays.map((day) => <span className="calendar-picker-weekday" key={day}>{day}</span>)}
              {days.map((day, index) => {
                if (day === null) return <span key={'empty-' + index} aria-hidden="true"/>;
                const date = String(viewYear).padStart(4, '0') + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                return (
                  <button key={date} type="button" className={'calendar-picker-day' + (value === date ? ' is-selected' : '') + (today === date ? ' is-today' : '')}
                    aria-label={new Date(viewYear, viewMonth, day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    aria-pressed={value === date} disabled={Boolean(minimum && date < minimum)} onClick={() => choose(date)}>
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="calendar-picker-dialog-foot">
              {minimum && <span>Frühestens: {displayDate(parseCalendarDate(minimum)!)}</span>}
              <button type="button" className="btn small" disabled={Boolean(minimum && today < minimum)}
                onClick={() => choose(today)}>Heute</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
