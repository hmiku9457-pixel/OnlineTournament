import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface DiscardDraftDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirm permanently clearing the current browser's tournament draft. */
export function DiscardDraftDialog({ onCancel, onConfirm }: DiscardDraftDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      event.preventDefault();
      buttons[0].focus();
    }
  }

  return (
    <div className="sport-change-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="sport-change-dialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keepFocusInside}>
        <div className="sport-change-dialog-heading">
          <span className="sport-change-warning-icon" aria-hidden="true">!</span>
          <div>
            <h2 id={titleId}>Entwurf verwerfen?</h2>
            <p id={descriptionId}>Möchtest du den aktuellen Turnierentwurf wirklich löschen?</p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          <p>Alle bisher erfassten Grunddaten, Teilnehmer und Phasen gehen verloren. Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <p>Bereits erstellte Turniere bleiben davon unberührt.</p>
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn danger" onClick={onConfirm}>Entwurf endgültig verwerfen</button>
        </div>
      </section>
    </div>
  );
}
