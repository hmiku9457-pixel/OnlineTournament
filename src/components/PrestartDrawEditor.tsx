import { useMemo, useState, type DragEvent } from 'react';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import {
  canEditDraw,
  getBracketSlots,
  getGroupAssignments,
  resetBracketSlots,
  resetGroupAssignments,
  setBracketSlot,
  setParticipantGroup,
} from '@/services/mockDrawStore';
import { isStageCompleted, isStageLockedWaiting, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockRuntime';

interface Props {
  tournament: DemoTournament;
  stage: TournamentStage;
  onChanged: () => void;
}

const DRAG_TYPE = 'text/online-tournament-draw';

function groupLabel(index: number) {
  return `Gruppe ${String.fromCharCode(65 + index)}`;
}

function setDragValue(event: DragEvent, value: string) {
  event.dataTransfer.setData(DRAG_TYPE, value);
  event.dataTransfer.effectAllowed = 'move';
}

function getDragValue(event: DragEvent) {
  return event.dataTransfer.getData(DRAG_TYPE);
}

export function PrestartDrawEditor({ tournament, stage, onChanged }: Props) {
  const [revision, setRevision] = useState(0);
  const editable = canEditDraw(tournament, stage);
  const participants = useMemo(() => getRuntimeParticipantNames(tournament), [tournament, revision]);
  const started = isStageStarted(tournament, stage);
  const completed = isStageCompleted(tournament, stage);
  const waitingForPrevious = isStageLockedWaiting(tournament, stage);

  function changed() {
    setRevision((value) => value + 1);
    onChanged();
  }

  if (!['GROUPS', 'KNOCKOUT', 'DOUBLE_ELIMINATION'].includes(stage.type)) return null;

  if (!editable) {
    return (
      <div className={completed ? 'draw-lock-note complete' : 'draw-lock-note'}>
        <strong>{completed ? 'Phase beendet' : started ? 'Setzung eingefroren' : 'Noch nicht bearbeitbar'}</strong>
        <span>
          {completed
            ? 'Die Phase ist abgeschlossen und bleibt unverändert.'
            : started
              ? 'Seit dem Start dieser Phase können Gruppen bzw. K.-o.-Startplätze nicht mehr verändert werden.'
              : waitingForPrevious
                ? 'Diese Phase wird erst bearbeitbar, sobald die vorherige Phase beendet wurde.'
                : 'Die Auslosung ist aktuell gesperrt.'}
        </span>
      </div>
    );
  }

  if (stage.type === 'GROUPS') {
    const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
    const entrantCount = Math.max(1, Math.min(participants.length, Number(stage.settings.entrants) || participants.length));
    const entrants = participants.slice(0, entrantCount);
    const assignments = getGroupAssignments(tournament, stage);
    const groups = Array.from({ length: groupCount }, (_, groupIndex) => ({
      groupIndex,
      participants: entrants.filter((participant) => assignments[participant] === groupIndex),
    }));

    return (
      <section className="draw-editor-card">
        <div className="draw-editor-head">
          <div>
            <span className="badge ready">BEARBEITBAR</span>
            <h4>Gruppenauslosung per Drag & Drop</h4>
            <p className="muted">Teilnehmer direkt greifen und in die gewünschte Gruppe ziehen. Der Stand wird sofort gespeichert.</p>
          </div>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              resetGroupAssignments(tournament, stage);
              changed();
            }}
          >
            Automatische Verteilung
          </button>
        </div>
        <div className="group-dnd-grid">
          {groups.map((group) => (
            <article
              className="group-dnd-column"
              key={group.groupIndex}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const participant = getDragValue(event);
                if (!participant || !entrants.includes(participant)) return;
                if (setParticipantGroup(tournament, stage, participant, group.groupIndex)) changed();
              }}
            >
              <div className="group-dnd-head">
                <strong>{groupLabel(group.groupIndex)}</strong>
                <span className="badge">{group.participants.length}</span>
              </div>
              <div className="group-dnd-dropzone">
                {group.participants.map((participant) => (
                  <div
                    className="draw-player-chip"
                    key={participant}
                    draggable
                    onDragStart={(event) => setDragValue(event, participant)}
                  >
                    <span className="draw-drag-handle">⋮⋮</span>
                    <strong>{participant}</strong>
                  </div>
                ))}
                {group.participants.length === 0 && <span className="muted group-dnd-empty">Spieler hierher ziehen</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const slots = getBracketSlots(tournament, stage);
  const allowedParticipants = participants.slice(0, Math.max(2, Math.min(participants.length, Number(stage.settings.entrants) || participants.length)));
  const byeCount = slots.filter((item) => item === 'Freilos').length;

  return (
    <section className="draw-editor-card">
      <div className="draw-editor-head">
        <div>
          <span className="badge ready">BEARBEITBAR</span>
          <h4>{stage.type === 'DOUBLE_ELIMINATION' ? 'Doppel-K.-o.-Setzung per Drag & Drop' : 'K.-o.-Setzung per Drag & Drop'}</h4>
          <p className="muted">Teilnehmer oder Freilos direkt auf einen anderen Startplatz ziehen. Belegte Plätze werden automatisch getauscht.</p>
        </div>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            resetBracketSlots(tournament, stage);
            changed();
          }}
        >
          Automatische Setzung
        </button>
      </div>
      <div className="draw-editor-summary">
        <span><strong>{slots.length}</strong> Startplätze</span>
        <span><strong>{allowedParticipants.length}</strong> Teilnehmer</span>
        <span><strong>{byeCount}</strong> Freilose</span>
      </div>
      <div className="bracket-dnd-grid">
        {Array.from({ length: slots.length / 2 }, (_, matchIndex) => (
          <article className="bracket-dnd-match" key={`match-${matchIndex + 1}`}>
            <span className="bracket-dnd-match-label">Startmatch {matchIndex + 1}</span>
            {[matchIndex * 2, matchIndex * 2 + 1].map((slotIndex) => {
              const slot = slots[slotIndex];
              return (
                <div
                  className={slot === 'Freilos' ? 'bracket-dnd-slot bye' : 'bracket-dnd-slot'}
                  key={`slot-${slotIndex + 1}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedValue = getDragValue(event);
                    if (!draggedValue || (!allowedParticipants.includes(draggedValue) && draggedValue !== 'Freilos')) return;
                    if (setBracketSlot(tournament, stage, slotIndex, draggedValue)) changed();
                  }}
                >
                  <span className="seed-number">#{slotIndex + 1}</span>
                  <div
                    className={slot === 'Freilos' ? 'draw-player-chip bye-chip' : 'draw-player-chip'}
                    draggable
                    onDragStart={(event) => setDragValue(event, slot)}
                  >
                    <span className="draw-drag-handle">⋮⋮</span>
                    <strong>{slot}</strong>
                  </div>
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </section>
  );
}
