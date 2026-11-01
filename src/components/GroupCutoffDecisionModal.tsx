import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { GroupCutoffStatus } from '@/services/mockRuntime';

/** A sporting tie at the qualification boundary must be explicitly resolved
 * by the director. No alphabetical tiebreak is applied. */
export function GroupCutoffDecisionModal({ status, onResolve, onClose }: {
  status: GroupCutoffStatus;
  onResolve: (winners: string[], method: 'PLAYOFF' | 'LOT', explanation: string) => string | null;
  onClose: () => void;
}) {
  const title = useId();
  const first = useRef<HTMLSelectElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState<'PLAYOFF' | 'LOT'>('PLAYOFF');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    first.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);
  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable[focusable.length - 1]?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault(); focusable[0]?.focus();
    }
  }
  function toggle(name: string) {
    setError(null);
    setChosen((old) => old.includes(name) ? old.filter((entry) => entry !== name)
      : old.length < status.tie.slots ? [...old, name] : old);
  }
  return (
    <div className="prototype-modal-backdrop group-cutoff-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="prototype-modal group-cutoff-dialog" role="dialog" aria-modal="true" aria-labelledby={title} onKeyDown={trapFocus}>
        <span className="badge">QUALIFIKATION ENTSCHEIDEN</span>
        <h2 id={title}>Sportlicher Gleichstand am Qualifikationsplatz</h2>
        <p>Die Gruppenphase ist abgeschlossen. {status.tie.players.length} Teilnehmer sind in allen sportlichen Vergleichskriterien gleichauf. Für {status.tie.slots} {status.tie.slots === 1 ? 'freien Platz' : 'freie Plätze'} muss die Turnierleitung einen Stichentscheid dokumentieren.</p>
        <p className="muted">Alphabetische Sortierung entscheidet nicht über das Weiterkommen. Das gewöhnliche Gruppenergebnis bleibt unverändert.</p>
        <div className="field">
          <label htmlFor="group-cutoff-method">Entscheidungsverfahren</label>
          <select ref={first} id="group-cutoff-method" value={method} onChange={(event) => setMethod(event.target.value as 'PLAYOFF' | 'LOT')}>
            <option value="PLAYOFF">Zusätzlich ausgetragener Stichentscheid</option>
            <option value="LOT">Losentscheid nach Turnierregel</option>
          </select>
        </div>
        <fieldset className="group-cutoff-choice">
          <legend>Qualifizierte auswählen ({chosen.length}/{status.tie.slots})</legend>
          {status.tie.players.map((player) => (
            <label key={player}>
              <input type="checkbox" checked={chosen.includes(player)} disabled={!chosen.includes(player) && chosen.length >= status.tie.slots}
                onChange={() => toggle(player)}/>
              <span>{player}</span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="group-cutoff-explanation">{method === 'PLAYOFF' ? 'Ergebnisse der Entscheidungsspiele dokumentieren' : 'Losverfahren und Ergebnis dokumentieren'}</label>
          <textarea id="group-cutoff-explanation" rows={3} maxLength={600} value={explanation}
            placeholder={method === 'PLAYOFF' ? 'Beispiel: Entscheidungsspiel ...; Ergebnis ...' : 'Beispiel: Losziehung durch ...; Ergebnis ...'}
            onChange={(event) => { setExplanation(event.target.value); setError(null); }} />
        </div>
        <p className="muted">Der Stichentscheid wird als Entscheidung der Turnierleitung im Protokoll festgehalten und ist bei späteren Ergebniskorrekturen erneut zu prüfen.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" type="button"
            disabled={chosen.length !== status.tie.slots || explanation.trim().length < 3}
            onClick={() => setError(onResolve(chosen, method, explanation))}>
            Entscheidung dokumentieren und Qualifikation freigeben
          </button>
          <button className="btn" type="button" onClick={onClose}>Später entscheiden</button>
        </div>
      </section>
    </div>
  );
}
