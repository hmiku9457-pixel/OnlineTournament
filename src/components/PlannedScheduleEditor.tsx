import { useState } from 'react';
import type { PlannedScheduleItem } from '@/domain/tournamentSchedule';

interface Props {
  scheduledStart: string;
  entries: PlannedScheduleItem[];
  onChange: (entries: PlannedScheduleItem[]) => void;
  suggestions: () => PlannedScheduleItem[];
}

export function PlannedScheduleEditor({ scheduledStart, entries, onChange, suggestions }: Props) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  const update = (id: string, patch: Partial<PlannedScheduleItem>) => {
    setConfirmReplace(false);
    onChange(entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };
  const generate = () => {
    if (entries.length && !confirmReplace) { setConfirmReplace(true); return; }
    onChange(suggestions()); setConfirmReplace(false);
  };
  const add = () => {
    if (entries.length >= 80) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setConfirmReplace(false);
    onChange([...entries, { id, at: scheduledStart, title: 'Programmpunkt', type: 'other' }]);
  };
  return (
    <div className="planned-schedule-editor">
      <div className="planned-schedule-editor-intro">
        <div>
          <h3>Programmpunkte</h3>
          <p className="muted">Die Vorschlagszeiten basieren auf der groben Dauer der Phasen. Verschiebe einzelne Termine frei oder ergänze eigene Punkte wie Einlass, Siegerehrung oder Verpflegung.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={generate}>
            {confirmReplace ? 'Ja, bisherigen Zeitplan ersetzen' : entries.length ? 'Vorschlag neu erzeugen' : 'Vorschlag aus Phasen erzeugen'}
          </button>
          <button type="button" className="btn primary" onClick={add} disabled={entries.length >= 80}>+ Programmpunkt</button>
          {confirmReplace && <button type="button" className="btn" onClick={() => setConfirmReplace(false)}>Abbrechen</button>}
        </div>
      </div>
      {confirmReplace && <p className="planned-schedule-replace-warning" role="alert">Beim erneuten Erzeugen werden die bisherigen Zeitplaneinträge ersetzt. Andere Einstellungen bleiben erhalten.</p>}
      {entries.length === 0 ? (
        <div className="planned-schedule-empty-editor">
          <strong>Noch kein Zeitplan angelegt.</strong>
          <span>Du kannst einen Vorschlag erzeugen, eigene Programmpunkte hinzufügen oder den Schritt ohne Zeitplan abschließen.</span>
        </div>
      ) : (
        <div className="planned-schedule-editor-entries">
          {entries.map((entry, index) => (
            <article className="planned-schedule-editor-entry" key={entry.id}>
              <div className="planned-schedule-entry-head">
                <strong>Programmpunkt {index + 1}</strong>
                <button type="button" className="btn small" onClick={() => { setConfirmReplace(false); onChange(entries.filter((item) => item.id !== entry.id)); }}>Entfernen</button>
              </div>
              <div className="planned-schedule-entry-fields">
                <label>Datum und Uhrzeit
                  <input type="datetime-local" required value={entry.at} onChange={(event) => update(entry.id, { at: event.target.value })}/>
                </label>
                <label>Bezeichnung
                  <input type="text" maxLength={80} required value={entry.title} onChange={(event) => update(entry.id, { title: event.target.value })}/>
                </label>
                <label>Art
                  <select value={entry.type} onChange={(event) => update(entry.id, { type: event.target.value as PlannedScheduleItem['type'] })}>
                    <option value="competition">Turnierphase</option>
                    <option value="break">Pause</option>
                    <option value="other">Organisatorisches</option>
                  </select>
                </label>
                <label className="planned-schedule-entry-note">Hinweis (optional)
                  <textarea rows={2} maxLength={400} value={entry.note ?? ''} placeholder="z. B. Alle Teilnehmer bitte 15 Minuten vorher bereithalten" onChange={(event) => update(entry.id, { note: event.target.value })}/>
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
