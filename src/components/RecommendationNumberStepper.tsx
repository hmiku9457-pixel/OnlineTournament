import { useEffect, useState } from 'react';

interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** Editable number field with bound-aware – and + actions on either side. */
export function RecommendationNumberStepper({ id, label, value, min, max, onChange, disabled = false }: Props) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const normalizedMax = Math.max(min, max);

  function change(rawValue: string) {
    setRaw(rawValue);
    if (!/^\d+$/.test(rawValue)) return;
    const candidate = Number(rawValue);
    if (Number.isSafeInteger(candidate) && candidate >= min && candidate <= normalizedMax) onChange(candidate);
  }

  function finish() {
    const candidate = Number(raw);
    const next = raw.trim() !== '' && Number.isFinite(candidate)
      ? Math.max(min, Math.min(normalizedMax, Math.trunc(candidate))) : value;
    setRaw(String(next));
    if (next !== value) onChange(next);
  }

  function adjust(delta: number) {
    const next = Math.max(min, Math.min(normalizedMax, value + delta));
    setRaw(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className="recommendation-number-stepper">
      <button type="button" className="recommendation-number-stepper-button" disabled={disabled || value <= min}
        aria-label={`${label} verringern`} title={`${label}: −1`} onClick={() => adjust(-1)}>−</button>
      <input id={id} type="number" inputMode="numeric" min={min} max={normalizedMax} step="1"
        aria-label={label} value={raw} disabled={disabled}
        onChange={(event) => change(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
      <button type="button" className="recommendation-number-stepper-button" disabled={disabled || value >= normalizedMax}
        aria-label={`${label} erhöhen`} title={`${label}: +1`} onClick={() => adjust(1)}>+</button>
    </div>
  );
}
