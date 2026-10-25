import { useId, useState, type KeyboardEvent } from 'react';
import { parseSportSet, setTarget, sportScoring } from '@/domain/sportScoring';

/** Shared input used for normal set-by-set play and independent qualification sets. */
interface Props {
  sport: string;
  bestOf: number;
  setIndex: number;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  compact?: boolean;
  confirmLabel?: string;
}

export function MatchSetInput({ sport, bestOf, setIndex, value, onChange, onConfirm, compact = false, confirmLabel }: Props) {
  const [quickHelpOpen, setQuickHelpOpen] = useState(false);
  const quickHelpId = useId();
  const rules = sportScoring(sport);
  const target = setTarget(sport, setIndex, bestOf);
  const parsed = parseSportSet(sport, bestOf, setIndex, value);
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (parsed) onConfirm();
  }

  return <div className="current-set-entry-group">
    <div className={compact ? 'current-set-entry-row has-entry-help' : 'current-set-entry-row'}>
      <label className="current-set-field">
        <span>Satz {setIndex + 1}</span>
        <input
          aria-label={`Satz ${setIndex + 1}`}
          inputMode="numeric"
          placeholder={rules.shortSetEntry ? '7 / -7' : `${target}:18`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          title={rules.shortSetEntry ? '7 = 11:7, -7 = 7:11' : 'Satzpunkte links:rechts eingeben'}
        />
      </label>
      <button className="btn small primary" type="button" disabled={!parsed} onClick={onConfirm}>
        {confirmLabel ?? `Satz ${setIndex + 1} bestätigen`}
      </button>
      {compact && (
        <div className="set-entry-help" onKeyDown={(event) => {
          if (event.key === 'Escape') setQuickHelpOpen(false);
        }}>
          <button
            className="set-entry-help-button"
            type="button"
            aria-label="Hilfe zur Satzeingabe"
            aria-expanded={quickHelpOpen}
            aria-controls={quickHelpId}
            onClick={() => setQuickHelpOpen((open) => !open)}
            title="Eingabehilfe anzeigen"
          >?</button>
          {quickHelpOpen && (
            <div className="set-entry-help-tooltip" id={quickHelpId} role="tooltip">
              {rules.shortSetEntry
                ? 'Kurzform (linker Spieler): 7 = 11:7 · -7 = 7:11 · 10 = 12:10.'
                : `${sport}: Satzergebnis als ${target}:18 eingeben.`}
              <span>Enter bestätigt den Satz.</span>
            </div>
          )}
        </div>
      )}
    </div>
  </div>;
}
