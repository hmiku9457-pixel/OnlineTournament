import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import type { Discipline } from '@/domain/types';

interface Props {
  previousDiscipline: string;
  nextDiscipline: string;
  currentDiscipline: Discipline;
  nextDisciplineId: Discipline;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Explicit confirmation for reinterpreting an existing participant roster. */
export function DisciplineChangeDialog({
  previousDiscipline, nextDiscipline, currentDiscipline, nextDisciplineId, onCancel, onConfirm,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onCancel]);
  const changingTeams = currentDiscipline === 'TEAMS' || nextDisciplineId === 'TEAMS';
  const droppingPartner = currentDiscipline === 'DOUBLES' && nextDisciplineId !== 'DOUBLES';
  function keepFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault(); buttons[buttons.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      event.preventDefault(); buttons[0].focus();
    }
  }
  return (
    <div className="sport-change-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="sport-change-dialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keepFocus}>
        <div className="sport-change-dialog-heading">
          <span className="sport-change-warning-icon" aria-hidden="true">!</span>
          <div>
            <h2 id={titleId}>Wettbewerbsart wechseln?</h2>
            <p id={descriptionId}>Von <strong>{previousDiscipline}</strong> zu <strong>{nextDiscipline}</strong> wechseln?</p>
          </div>
        </div>
        <div className="sport-change-dialog-notes">
          <p>Die gespeicherten Teilnehmer bleiben erhalten, ihre Felder werden jedoch nach der neuen Wettbewerbsart ausgewertet. Unvollständige oder doppelte Einträge blockieren die Erstellung, bis sie korrigiert wurden.</p>
          {changingTeams && <p>Mannschaftsnamen und Spielernamen werden unterschiedlich angezeigt. Ursprüngliche Vor- und Nachnamen bleiben getrennt gespeichert und beim Zurückwechseln erhalten. Prüfe die Teilnehmerliste vor Turnierstart.</p>}
          {droppingPartner && <p>Beim Wechsel von Doppel zu Einzel wird nur Spieler 1 als Teilnehmer angezeigt. Die bisherigen Partnerdaten bleiben intern gespeichert, erscheinen aber nicht in der Einzel-Liste.</p>}
          {nextDisciplineId === 'DOUBLES' && <p>Bei Doppel müssen anschließend für jeden Eintrag beide Partner vollständig erfasst werden.</p>}
        </div>
        <div className="sport-change-dialog-actions">
          <button ref={cancelButton} type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn danger" onClick={onConfirm}>Wettbewerbsart wechseln</button>
        </div>
      </section>
    </div>
  );
}
