import { useEffect, useId, useRef } from 'react';

/** Confirmation before leaving a participant whose current edits have not been saved. */
export function UnsavedParticipantDialog({ onStay, onDiscard }: {
  onStay: () => void; onDiscard: () => void;
}) {
  const title = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onStay(); }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', escape);
    };
  }, [onStay]);
  return (
    <div className="sport-change-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onStay(); }}>
      <section className="sport-change-dialog" role="dialog" aria-modal="true" aria-labelledby={title}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          if (event.shiftKey && document.activeElement === buttons[0]) {
            event.preventDefault(); buttons[buttons.length - 1].focus();
          } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
            event.preventDefault(); buttons[0].focus();
          }
        }}>
        <div className="sport-change-dialog-heading">
          <span className="sport-change-warning-icon" aria-hidden="true">!</span>
          <div>
            <h2 id={title}>Ungespeicherte Teilnehmerdaten</h2>
            <p>Die aktuellen Eingaben wurden noch nicht in die Teilnehmerliste übernommen.</p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          <p>Beim Wechseln des Schrittes gehen nur diese noch nicht gespeicherten Eingaben verloren. Bereits gespeicherte Teilnehmer bleiben erhalten.</p>
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancel} className="btn" type="button" onClick={onStay}>Weiter bearbeiten</button>
          <button className="btn danger" type="button" onClick={onDiscard}>Eingaben verwerfen</button>
        </div>
      </section>
    </div>
  );
}
