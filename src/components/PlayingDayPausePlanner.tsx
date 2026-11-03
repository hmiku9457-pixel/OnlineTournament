import { CalendarDatePicker } from './CalendarDatePicker';
import { ClockTimePicker } from './ClockTimePicker';
import { RecommendationNumberStepper } from './RecommendationNumberStepper';
import { followingPlayingDate, type PlayingDayBreak, type PlayingRoundPause } from '@/domain/playingDays';
import type { PlannedTimeline } from '@/domain/tournamentSchedule';

export interface PlanningPause extends PlayingRoundPause {
  source: 'legacy' | 'extra';
  index: number;
}

interface Props {
  phaseId: string;
  phaseIndex: number;
  roundCount: number;
  scheduledStart: string;
  phaseStart: string;
  dayBreaks: PlayingDayBreak[];
  pauses: PlanningPause[];
  timeline: PlannedTimeline;
  maximumDaysReached: boolean;
  maximumScheduleReached: boolean;
  onDayEndChange: (dayIndex: number, round: number) => void;
  onDayRemove: (boundaryIndex: number) => void;
  onDayChange: (boundaryIndex: number, patch: Partial<PlayingDayBreak>) => void;
  onAddPause: (afterRound: number) => void;
  onPauseChange: (pause: PlanningPause, patch: Partial<PlayingRoundPause>) => void;
  onPauseRemove: (pause: PlanningPause) => void;
}

/** The playing-day cards are a view of the round boundaries. No duplicated
 * day-count state is stored; choosing "bis Runde" produces the following day. */
export function PlayingDayPausePlanner({
  phaseId, phaseIndex, roundCount, scheduledStart, phaseStart, dayBreaks, pauses, timeline,
  maximumDaysReached, maximumScheduleReached, onDayEndChange, onDayRemove, onDayChange,
  onAddPause, onPauseChange, onPauseRemove,
}: Props) {
  const boundaries = [...dayBreaks].sort((a, b) => a.afterRound - b.afterRound);
  const occupied = new Set([...boundaries.map((item) => item.afterRound),
    ...pauses.map((item) => item.afterRound)]);
  const allRounds = (from: number, through: number) =>
    Array.from({ length: Math.max(0, through - from + 1) }, (_, i) => i + from);

  return (
    <section className="phase-day-planner" aria-label="Spieltage und Zwischenpausen">
      <header className="phase-day-planner-head">
        <div>
          <strong>Spieltage und Zwischenpausen</strong>
          <p className="field-hint">Lege fest, nach welcher Runde ein Spieltag endet und wann der nächste beginnt.
            Zwischenpausen kannst du jedem Spieltag einzeln zuordnen.</p>
        </div>
      </header>
      <div className="phase-day-list">
        {Array.from({ length: boundaries.length + 1 }, (_, dayIndex) => {
          const previous = boundaries[dayIndex - 1];
          const boundary = boundaries[dayIndex];
          const beginning = (previous?.afterRound ?? 0) + 1;
          const ending = boundary?.afterRound ?? roundCount;
          const followingBoundary = boundaries[dayIndex + 1];
          const options = boundary
            ? allRounds(beginning, (followingBoundary?.afterRound ?? roundCount) - 1)
            : [...(!maximumDaysReached && !maximumScheduleReached
              ? allRounds(beginning, roundCount - 1) : []), roundCount];
          const possibleEnds = options.filter((round) => round === ending || !occupied.has(round));
          const dayPauses = pauses.filter((pause) => pause.afterRound >= beginning
            && pause.afterRound < ending).sort((a, b) => a.afterRound - b.afterRound);
          const availablePauses = allRounds(beginning, Math.min(roundCount - 1, ending - 1))
            .filter((round) => !occupied.has(round));
          const startDate = previous?.date ?? (phaseStart || scheduledStart).slice(0, 10);
          const transitionStart = previous && timeline.items.find((item) =>
            item.id === `day-break-${phaseIndex + 1}-${previous.afterRound}`)?.at;
          const minimumStartDate = transitionStart
            ? followingPlayingDate(transitionStart.slice(0, 10), 1)
            : followingPlayingDate((phaseStart || scheduledStart).slice(0, 10), 1);
          return (
            <article className="phase-day-card" key={previous?.afterRound ?? 'first'}>
              <div className="phase-day-card-title">
                <strong>Spieltag {dayIndex + 1}</strong>
                <span>Runden {beginning}{ending !== beginning ? `–${ending}` : ''}</span>
                {previous && <button type="button" className="btn small danger-outline"
                  onClick={() => onDayRemove(dayIndex - 1)}>Spieltagswechsel entfernen</button>}
              </div>
              {previous && (
                <div className="phase-day-start">
                  <span className="phase-day-start-label">Beginnt am</span>
                  <div className="phase-day-date-fields">
                    <CalendarDatePicker id={`day-break-date-${phaseId}-${dayIndex - 1}`}
                      label={`Datum Spieltag ${dayIndex + 1}`} value={startDate}
                      minDate={minimumStartDate}
                      onChange={(date) => onDayChange(dayIndex - 1, { date })}/>
                    <ClockTimePicker id={`day-break-time-${phaseId}-${dayIndex - 1}`}
                      label={`Uhrzeit Spieltag ${dayIndex + 1}`} value={previous.time}
                      onChange={(time) => onDayChange(dayIndex - 1, { time })}/>
                  </div>
                </div>
              )}
              <div className="phase-day-round-settings">
                <label className="field" htmlFor={`day-end-round-${phaseId}-${dayIndex}`}>
                  Bis Runde
                  <select id={`day-end-round-${phaseId}-${dayIndex}`} value={ending}
                    disabled={possibleEnds.length <= 1}
                    onChange={(event) => onDayEndChange(dayIndex, Number(event.target.value))}>
                    {possibleEnds.map((round) => <option key={round} value={round}>
                      {round === roundCount && !boundary ? `Runde ${roundCount} (Phasenende)` : `Runde ${round}`}
                    </option>)}
                  </select>
                </label>
                <span className="field-hint">
                  {boundary ? `Nach Runde ${ending} folgt Spieltag ${dayIndex + 2}.`
                    : 'Wähle eine frühere Runde, um einen weiteren Spieltag anzulegen.'}
                </span>
              </div>
              {dayPauses.length > 0 && (
                <div className="phase-day-pauses">
                  {dayPauses.map((pause) => {
                    const otherOccupied = new Set([...occupied].filter((round) => round !== pause.afterRound));
                    const availableRoundOptions = allRounds(beginning, Math.min(roundCount - 1, ending - 1))
                      .filter((round) => !otherOccupied.has(round));
                    const pauseStart = timeline.items.find((item) => item.id === (pause.source === 'legacy'
                      ? `inline-break-${phaseIndex + 1}`
                      : `inline-break-${phaseIndex + 1}-${pause.afterRound}`))?.at;
                    return <div className="phase-day-pause" key={`${pause.source}-${pause.index}`}>
                      <div className="phase-day-pause-title"><strong>Zwischenpause</strong>
                        <button type="button" className="btn small danger-outline"
                          onClick={() => onPauseRemove(pause)}>Entfernen</button>
                      </div>
                      <div className="phase-day-pause-fields">
                        <label className="field">Unterbrechung nach
                          <select value={pause.afterRound}
                            onChange={(event) => onPauseChange(pause, { afterRound: Number(event.target.value) })}>
                            {availableRoundOptions.map((round) =>
                              <option key={round} value={round}>Runde {round}</option>)}
                          </select>
                        </label>
                        {pause.kind === 'minutes' ? (
                          <div className="field phase-pause-minutes">
                            <label htmlFor={`day-pause-minutes-${phaseId}-${pause.source}-${pause.index}`}>Pause in Minuten</label>
                            <RecommendationNumberStepper
                              id={`day-pause-minutes-${phaseId}-${pause.source}-${pause.index}`}
                              label="Zwischenpausendauer in Minuten" value={pause.minutes} min={1} max={1440}
                              onChange={(minutes) => onPauseChange(pause, { minutes })}/>
                          </div>
                        ) : (
                          <div className="phase-day-date-fields">
                            <CalendarDatePicker id={`day-pause-date-${phaseId}-${pause.source}-${pause.index}`}
                              label="Pausenende Datum" value={pause.untilDate || pauseStart?.slice(0, 10) || startDate}
                              minDate={pauseStart?.slice(0, 10) || startDate}
                              onChange={(untilDate) => onPauseChange(pause, { untilDate })}/>
                            <ClockTimePicker id={`day-pause-time-${phaseId}-${pause.source}-${pause.index}`}
                              label="Pausenende Uhrzeit" value={pause.until}
                              onChange={(until) => onPauseChange(pause, { until })}/>
                          </div>
                        )}
                        <fieldset className="break-phase-choice break-phase-choice-segmented phase-day-pause-type">
                          <legend>Art der Zwischenpause</legend>
                          <div className="break-phase-choice-options">
                            <label><input type="radio" name={`day-pause-kind-${phaseId}-${pause.source}-${pause.index}`}
                              aria-label="Pause in Minuten" checked={pause.kind === 'minutes'}
                              onChange={() => onPauseChange(pause, { kind: 'minutes' })}/>
                              <span>Dauer (Min.)</span></label>
                            <label><input type="radio" name={`day-pause-kind-${phaseId}-${pause.source}-${pause.index}`}
                              aria-label="Pause bis" checked={pause.kind === 'until'}
                              onChange={() => onPauseChange(pause, { kind: 'until',
                                untilDate: pause.untilDate || pauseStart?.slice(0, 10) || startDate })}/>
                              <span>Bis Datum/Uhrzeit</span></label>
                          </div>
                        </fieldset>
                      </div>
                    </div>;
                  })}
                </div>
              )}
              <button type="button" className="btn small phase-day-add-pause"
                disabled={availablePauses.length === 0 || maximumScheduleReached}
                title={availablePauses.length === 0 ? 'Alle freien Rundengrenzen an diesem Spieltag sind belegt.'
                  : maximumScheduleReached ? 'Maximal 80 Zeitplaneinträge zulässig.' : undefined}
                onClick={() => onAddPause(availablePauses[0])}>+ Zwischenpause einfügen</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
