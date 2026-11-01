import { useEffect, useId, useRef, useState } from 'react';
import type { GroupCutoffStatus } from '@/services/mockRuntime';

/** A sporting tie at the qualification boundary must be explicitly resolved
 * by the director. No alphabetical tiebreak is applied. */
export function GroupCutoffDecisionModal({ status, onResolve }: {
  status: GroupCutoffStatus;
  onResolve: (winners: string[], method: 'PLAYOFF' | 'LOT', explanation: string) => string | null;
}) {
  const title = useId();
  const first = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState<'PLAYOFF' | 'LOT'>('PLAYOFF');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  function toggle(name: string) {
    setError(null);
    setChosen((old) => old.includes(name) ? old.filter((entry) => entry !== name)
      : old.length < status.tie.slots ? [...old, name] : old);
  }
  return (
    <div className="prototype-modal-backdrop group-cutoff-backdrop" role="presentation">
      <section className="prototype-modal group-cutoff-dialog" role="dialog" aria-modal="true" aria-labelledby={title}>
        <span className="badge">QUALIFIKATION ENTSCHEIDEN</span>
        <h2 id={title}>Sportlicher Gleichstand am Qualifikationsplatz</h2>
        <p>Die Gruppenphase ist abgeschlossen. {status.tie.players.length} Teilnehmer sind in allen sportlichen Vergleichskriterien gleichauf. Für {status.tie.slots} {status.tie.slots === 1 ? 'freien Platz' : 'freie Plätze'} muss die Turnierleitung einen Stichentscheid dokumentieren.</p>
        <p className="muted">Alphabetische Sortierung entscheidet nicht über das Weiterkommen. Das gewöhnliche Gruppenergebnis bleibt unverändert.</p>
        <div className="field">
          <label htmlFor="group-cutoff-method">Entscheidungsverfahren</label>
          <select id="group-cutoff-method" value={method} onChange={(event) => setMethod(event.target.value as 'PLAYOFF' | 'LOT')}>
            <option value="PLAYOFF">Zusätzlich ausgetragener Stichentscheid</option>
            <option value="LOT">Losentscheid nach Turnierregel</option>
          </select>
        </div>
        <fieldset className="group-cutoff-choice">
          <legend>Qualifizierte auswählen ({chosen.length}/{status.tie.slots})</legend>
          {status.tie.players.map((player, index) => (
            <label key={player}>
              <input type="checkbox" checked={chosen.includes(player)} disabled={!chosen.includes(player) && chosen.length >= status.tie.slots}
                onChange={() => toggle(player)} ref={index === 0 ? undefined : undefined}/>
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
          <button ref={first} className="btn primary" type="button"
            disabled={chosen.length !== status.tie.slots || explanation.trim().length < 3}
            onClick={() => setError(onResolve(chosen, method, explanation))}>
            Entscheidung dokumentieren und Qualifikation freigeben
          </button>
        </div>
      </section>
    </div>
  );
}
