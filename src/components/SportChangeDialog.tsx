import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface SportChangeDialogProps {
  previousSport: string;
  nextSport: string;
  hasParticipants: boolean;
  hasPhases: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SportChangeDialog({
  previousSport, nextSport, hasParticipants, hasPhases, onCancel, onConfirm,
}: SportChangeDialogProps) {
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

  function keepFocusInDialog(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (buttons.length === 0) return;
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
        aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keepFocusInDialog}>
        <div className="sport-change-dialog-heading">
          <span className="sport-change-warning-icon" aria-hidden="true">!</span>
          <div>
            <h2 id={titleId}>Sportart wechseln?</h2>
            <p id={descriptionId}>
              Du möchtest von <strong>{previousSport}</strong> zu <strong>{nextSport}</strong> wechseln.
            </p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          {hasParticipants && (
            <p>Bereits erfasste Teilnehmer bleiben erhalten, müssen aber möglicherweise überprüft werden.</p>
          )}
          {hasPhases && (
            <p>Die Best-of-Einstellungen bestehender Phasen werden an die neue Sportart angepasst.</p>
          )}
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn danger" onClick={onConfirm}>Sportart wechseln</button>
        </div>
      </section>
    </div>
  );
}
