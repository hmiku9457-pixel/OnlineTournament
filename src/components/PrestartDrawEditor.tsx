import { useMemo, useState } from 'react';
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
import { getRuntimeParticipantNames } from '@/services/mockRuntime';

interface Props {
  tournament: DemoTournament;
  stage: TournamentStage;
  onChanged: () => void;
}

function groupLabel(index: number) {
  return `Gruppe ${String.fromCharCode(65 + index)}`;
}

export function PrestartDrawEditor({ tournament, stage, onChanged }: Props) {
  const [revision, setRevision] = useState(0);
  const editable = canEditDraw(tournament);
  const participants = useMemo(() => getRuntimeParticipantNames(tournament), [tournament, revision]);

  function changed() {
    setRevision((value) => value + 1);
    onChanged();
  }

  if (!['GROUPS', 'KNOCKOUT', 'DOUBLE_ELIMINATION'].includes(stage.type)) return null;

  if (!editable) {
    return (
      <div className="draw-lock-note">
        <strong>Auslosung gesperrt</strong>
        <span>Seit dem ersten Turnierstart können Gruppen und Setzungen nicht mehr verändert werden.</span>
      </div>
    );
  }

  if (stage.type === 'GROUPS') {
    const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
    const entrantCount = Math.max(1, Math.min(participants.length, Number(stage.settings.entrants) || participants.length));
    const entrants = participants.slice(0, entrantCount);
    const assignments = getGroupAssignments(tournament, stage);

    return (
      <section className="draw-editor-card">
        <div className="draw-editor-head">
          <div>
            <span className="badge">VOR DEM START BEARBEITBAR</span>
            <h4>Gruppenauslosung</h4>
            <p className="muted">Jeden Teilnehmer einer Gruppe zuordnen. Die Änderung wird rechts bzw. darunter sofort in der Gruppendarstellung sichtbar.</p>
          </div>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              resetGroupAssignments(tournament, stage);
              changed();
            }}
          >
            Automatische Verteilung wiederherstellen
          </button>
        </div>
        <div className="group-draw-grid">
          {entrants.map((participant, index) => (
            <label className="group-draw-row" key={`${participant}-${index}`}>
              <span><strong>{index + 1}.</strong> {participant}</span>
              <select
                value={assignments[participant] ?? (index % groupCount)}
                onChange={(event) => {
                  setParticipantGroup(tournament, stage, participant, Number(event.target.value));
                  changed();
                }}
              >
                {Array.from({ length: groupCount }, (_, groupIndex) => (
                  <option value={groupIndex} key={groupIndex}>{groupLabel(groupIndex)}</option>
                ))}
              </select>
            </label>
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
          <span className="badge">VOR DEM START BEARBEITBAR</span>
          <h4>{stage.type === 'DOUBLE_ELIMINATION' ? 'Doppel-K.-o.-Setzung' : 'K.-o.-Setzung'}</h4>
          <p className="muted">Startplätze im Turnierbaum festlegen. Wird ein bereits gesetzter Teilnehmer gewählt, tauschen die beiden Plätze automatisch.</p>
        </div>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            resetBracketSlots(tournament, stage);
            changed();
          }}
        >
          Automatische Setzung wiederherstellen
        </button>
      </div>
      <div className="draw-editor-summary">
        <span><strong>{slots.length}</strong> Startplätze</span>
        <span><strong>{allowedParticipants.length}</strong> Teilnehmer</span>
        <span><strong>{byeCount}</strong> Freilose</span>
      </div>
      <div className="bracket-seed-grid">
        {slots.map((slot, index) => (
          <label className="bracket-seed-row" key={`slot-${index + 1}`}>
            <span className="seed-number">#{index + 1}</span>
            <select
              value={slot}
              onChange={(event) => {
                setBracketSlot(tournament, stage, index, event.target.value);
                changed();
              }}
            >
              {byeCount > 0 && <option value="Freilos">Freilos</option>}
              {allowedParticipants.map((participant) => (
                <option value={participant} key={participant}>{participant}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
