import type { DragEvent } from 'react';
import { DrawActionButton } from '@/components/DrawActionButton';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import {
  canEditDraw,
  getGroupAssignments,
  randomizeGroupAssignments,
  applySeededGroupAssignments,
  setParticipantGroup,
} from '@/services/mockDrawStore';
import { getStageEntrants, getPreviousCompetitionStage, isStageCompleted, isStageLockedWaiting, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getPreviousStageFinishLabels } from '@/services/mockCompetitionViews';

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
  const editable = canEditDraw(tournament, stage);
  const participants = getStageEntrants(tournament, stage);
  const started = isStageStarted(tournament, stage);
  const precededBySwiss = getPreviousCompetitionStage(tournament, stage)?.type === 'SWISS';
  const previousFinishLabels = getPreviousStageFinishLabels(tournament, stage);
  const completed = isStageCompleted(tournament, stage);
  const waitingForPrevious = isStageLockedWaiting(tournament, stage);

  function changed() {
    onChanged();
  }

  if (stage.type !== 'GROUPS') return null;

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
    // Nachmeldungen erhöhen den aktuellen Kader, ohne die ursprüngliche Phasenplanung zu ändern.
    const entrants = participants;
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
          <div className="actions">
            {precededBySwiss && <DrawActionButton
              label="Tabellen nach Seeding erstellen"
              title="Nach Platzierung der abgeschlossenen Schweizer Phase schlangenförmig auf die Gruppen verteilen"
              onAction={() => applySeededGroupAssignments(tournament, stage)}
              onChanged={changed}
            />}
            <DrawActionButton
              label="Neue Zufallsverteilung"
              onAction={() => randomizeGroupAssignments(tournament, stage)}
              onChanged={changed}
            />
          </div>
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
                    <span className="draw-player-name"><strong>{participant}</strong>{previousFinishLabels[participant] && <small className="participant-origin">{previousFinishLabels[participant]}</small>}</span>
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


  return null;
}
