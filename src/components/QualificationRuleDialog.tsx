import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface Props {
  groupCount: number;
  groupEntrants: number;
  qualifiers: number;
  recommended: number | null;
  onCancel: () => void;
  onApply: (qualifiers: number) => void;
}

/** Why only comparable results count when additional qualifying positions
 * are allocated across unequal groups. */
export function QualificationRuleDialog({
  groupCount, groupEntrants, qualifiers, recommended, onCancel, onApply,
}: Props) {
  const title = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const smallerSize = Math.floor(groupEntrants / groupCount);
  const largerGroups = groupEntrants % groupCount;
  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener('keydown', escape);
    };
  }, [onCancel]);
  function trapFocus(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Tab') return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (e.shiftKey && document.activeElement === buttons[0]) {
      e.preventDefault(); buttons[buttons.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      e.preventDefault(); buttons[0].focus();
    }
  }
  return (
    <div className="sport-change-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="sport-change-dialog qualification-rule-dialog" role="dialog" aria-modal="true"
        aria-labelledby={title} onKeyDown={trapFocus}>
        <div className="sport-change-dialog-heading">
          <span className="sport-change-warning-icon" aria-hidden="true">!</span>
          <div>
            <h2 id={title}>Streichungsregel bei der Qualifikation</h2>
            <p>{groupEntrants} Teilnehmer in {groupCount} unterschiedlich großen Gruppen – {qualifiers} Qualifikationsplätze.</p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          <p>Weil nicht aus jeder Gruppe gleich viele Spieler weiterkommen können, müssen gleich platzierte Spieler verschiedener Gruppen miteinander verglichen werden.</p>
          <p><strong>So funktioniert die Streichungsregel:</strong> Für diesen Vergleich werden bei den größeren Gruppen die Ergebnisse gegen die jeweils Letztplatzierten gestrichen, bis alle verglichenen Spieler dieselbe Anzahl an berücksichtigten Gruppenspielen haben.</p>
          <p>Hier spielen {largerGroups} {largerGroups === 1 ? 'Gruppe' : 'Gruppen'} mit {smallerSize + 1} und {groupCount - largerGroups} mit {smallerSize} Teilnehmern. Die regulären Gruppentabellen bleiben vollständig; gestrichen wird nur für die zusätzliche Qualifikation.</p>
          {recommended !== null && (
            <div className="qualification-rule-recommendation">
              <strong>Empfehlung: {recommended} Qualifikationsplätze</strong>
              <p>Das wären {recommended / groupCount} Plätze je Gruppe. Dadurch entfällt der gruppenübergreifende Vergleich für zusätzliche Qualifikationsplätze.</p>
            </div>
          )}
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancel} className="btn" type="button" onClick={onCancel}>Schließen</button>
          {recommended !== null && recommended !== qualifiers && (
            <button className="btn primary" type="button" onClick={() => onApply(recommended)}>
              {recommended} Qualifikationsplätze übernehmen
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
