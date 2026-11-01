import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import type { Discipline } from '@/domain/types';

interface Props {
  discipline: Discipline;
  existingCount: number;
  incompleteCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirm adding demo entrants without using the browser's native confirm dialog. */
export function TestParticipantsDialog({ discipline, existingCount, incompleteCount = 0, onCancel, onConfirm }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const remaining = Math.max(0, 19 - existingCount);
  const noun = discipline === 'TEAMS' ? 'Testmannschaften'
    : discipline === 'DOUBLES' ? 'Testdoppel' : 'Testspieler';

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
        aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keepFocusInside}>
        <div className="sport-change-dialog-heading">
          <span className="test-participants-dialog-icon" aria-hidden="true">+</span>
          <div>
            <h2 id={titleId}>19 {noun} erzeugen?</h2>
            <p id={descriptionId}>Die Liste wird auf 19 vollständige Testteilnehmer aufgefüllt.</p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          <div className="test-participants-dialog-preview">
            <span>Bereits vollständig: <strong>{existingCount}</strong></span>
            <span>Werden ergänzt: <strong>{remaining}</strong></span>
            <span>Danach vollständig: <strong>19</strong></span>
            {incompleteCount > 0 && <span>Zusätzlich unvollständig: <strong>{incompleteCount}</strong></span>
          </div>
          <p>Vorhandene Teilnehmer bleiben unverändert. Die neuen Testeinträge erhalten eindeutige Namen und können später wieder entfernt werden.</p>
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={remaining === 0}>
            {remaining} {noun} hinzufügen
          </button>
        </div>
      </section>
    </div>
  );
}
