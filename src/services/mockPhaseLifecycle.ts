import { participantId, participantName } from '@/domain/participantIdentity';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { localTournamentStorage } from '@/services/localTournamentStorage';
import { groupLetter } from '@/domain/groupLabels';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { getGroupAssignments, compactStartedGroupAssignments } from '@/services/mockDrawStore';
import { isParticipantWithdrawn } from '@/services/mockWithdrawals';
import { estimatePhaseMetrics } from '@/domain/tournamentCreation';
import { planningMinutesPerSet } from '@/domain/sports';
import { sportScoring } from '@/domain/sportScoring';

const PHASE_KEY = 'online-tournament:mock-phase-lifecycle:v1';

interface PhaseLifecycleState {
  tournamentId: string;
  startedStageIds: string[];
  completedStageIds: string[];
  approvedSwissRounds?: Record<string, number[]>;
  stageEntrants?: Record<string, string[]>;
  stageStartedAt?: Record<string, string>;
  /** Additional projected time caused by actual conditions at phase start. */
  stageExtraMinutes?: Record<string, number>;
  /** Exact clock target chosen when beginning a break; stable on reload. */
  breakResumeAt?: Record<string, string>;
}

function readAll(): PhaseLifecycleState[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localTournamentStorage.getItem(PHASE_KEY) ?? '[]') as PhaseLifecycleState[];
    if (!Array.isArray(parsed)) return [];
    const tournaments = new Map(getAllMockTournaments().map((item) => [item.id, item]));
    return parsed.map((entry) => {
      const tournament = tournaments.get(entry.tournamentId);
      return !tournament || !entry.stageEntrants ? entry : {
        ...entry,
        stageEntrants: Object.fromEntries(Object.entries(entry.stageEntrants)
          .map(([stageId, ids]) => [stageId, ids.map((id) => participantName(tournament, id))])),
      };
    });
  } catch {
    return [];
  }
}

function writeAll(states: PhaseLifecycleState[]) {
  if (typeof window === 'undefined') return;
  const tournaments = new Map(getAllMockTournaments().map((item) => [item.id, item]));
  const persisted = states.map((entry) => {
    const tournament = tournaments.get(entry.tournamentId);
    return !tournament || !entry.stageEntrants ? entry : {
      ...entry,
      stageEntrants: Object.fromEntries(Object.entries(entry.stageEntrants)
        .map(([stageId, names]) => [stageId, names.map((name) => participantId(tournament, name))])),
    };
  });
  localTournamentStorage.setItem(PHASE_KEY, JSON.stringify(persisted));
  window.dispatchEvent(new CustomEvent('mock-phase-change'));
}

function baseState(tournament: DemoTournament): PhaseLifecycleState {
  const firstStageId = tournament.stages[0]?.id;
  return {
    tournamentId: tournament.id,
    startedStageIds: tournament.hasStarted && firstStageId ? [firstStageId] : [],
    completedStageIds: [],
    approvedSwissRounds: {},
    stageEntrants: {},
    stageStartedAt: {},
  };
}

export function getPhaseLifecycle(tournament: DemoTournament): PhaseLifecycleState {
  return readAll().find((item) => item.tournamentId === tournament.id) ?? baseState(tournament);
}

function saveState(tournament: DemoTournament, state: PhaseLifecycleState) {
  const all = readAll();
  writeAll([state, ...all.filter((item) => item.tournamentId !== tournament.id)]);
  return state;
}

export function getStageEntrants(tournament: DemoTournament, stage: TournamentStage) {
  const state = getPhaseLifecycle(tournament);
  const stageIndex = getStageIndex(tournament, stage);
  const started = state.startedStageIds.includes(stage.id);
  // Vor dem ersten Turnierstart bilden alle aktuell teilnahmeberechtigten
  // Anmeldungen die erste Phase. Nachmeldungen und Rückzüge ändern so
  // unmittelbar die Gruppenauslosung sowie den K.-o.-Baum.
  if (stageIndex === 0 && !started && !tournament.hasStarted) {
    return getRuntimeParticipantNames(tournament).filter((name) => !isParticipantWithdrawn(tournament, name));
  }
  const stored = state.stageEntrants?.[stage.id];
  if (stored) return started ? [...stored] : stored.filter((name) => !isParticipantWithdrawn(tournament, name));

  const names = getRuntimeParticipantNames(tournament).filter((name) => started || !isParticipantWithdrawn(tournament, name));
  const configured = Math.max(1, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  return names.slice(0, configured);
}

export function setStageEntrants(tournament: DemoTournament, stage: TournamentStage, entrants: string[]) {
  const state = getPhaseLifecycle(tournament);
  saveState(tournament, {
    ...state,
    stageEntrants: { ...(state.stageEntrants ?? {}), [stage.id]: [...entrants] },
  });
}

export function getStageIndex(tournament: DemoTournament, stage: TournamentStage) {
  return tournament.stages.findIndex((item) => item.id === stage.id);
}

/** Skip schedule-only breaks when querying competitive phase neighbors. */
export function getPreviousCompetitionStage(tournament: DemoTournament, stage: TournamentStage): TournamentStage | undefined {
  const index = getStageIndex(tournament, stage);
  return index <= 0 ? undefined : tournament.stages.slice(0, index).reverse().find((candidate) => candidate.type !== 'BREAK');
}

export function getNextCompetitionStage(tournament: DemoTournament, stage: TournamentStage): TournamentStage | undefined {
  const index = getStageIndex(tournament, stage);
  return index < 0 ? undefined : tournament.stages.slice(index + 1).find((candidate) => candidate.type !== 'BREAK');
}

export function getActiveStage(tournament: DemoTournament) {
  const state = getPhaseLifecycle(tournament);
  return tournament.stages.find((stage) => state.startedStageIds.includes(stage.id) && !state.completedStageIds.includes(stage.id));
}

export function isStageStarted(tournament: DemoTournament, stage: TournamentStage) {
  return getPhaseLifecycle(tournament).startedStageIds.includes(stage.id);
}

export function isStageCompleted(tournament: DemoTournament, stage: TournamentStage) {
  return getPhaseLifecycle(tournament).completedStageIds.includes(stage.id);
}

export function isStageEditable(tournament: DemoTournament, stage: TournamentStage) {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED') return false;
  const index = getStageIndex(tournament, stage);
  if (index < 0 || isStageStarted(tournament, stage)) return false;
  if (index === 0) return !tournament.hasStarted && ['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status);
  // A corrected competition can be reopened while a scheduled break is
  // already active; do not start later phases until it is reapproved.
  return tournament.stages.slice(0, index).every((previous) => isStageCompleted(tournament, previous));
}

export function isStageLockedWaiting(tournament: DemoTournament, stage: TournamentStage) {
  const index = getStageIndex(tournament, stage);
  if (index <= 0 || isStageStarted(tournament, stage)) return false;
  const previous = tournament.stages[index - 1];
  return Boolean(previous && !isStageCompleted(tournament, previous));
}

/** A group may be empty while arranging the draw; a singleton group
 * cannot play any fixture and must never be started. */
export function getStageStartIssue(tournament: DemoTournament, stage: TournamentStage): string | null {
  const entrants = getStageEntrants(tournament, stage);
  if (entrants.length < 2) return 'Zum Starten müssen mindestens zwei aktive Teilnehmer vorhanden sein. Bitte Teilnehmer oder Phasenplanung prüfen; andernfalls kann das Turnier abgebrochen werden.';
  // The wizard already disallows <2 rounds. The runtime must guard the
  // participant-dependent upper bound again after late withdrawals.
  if (stage.type === 'SWISS' && (entrants.length < 3
    || Number(stage.settings.rounds) > entrants.length - 1)) {
    return entrants.length < 3
      ? 'Für das Schweizer System müssen mindestens drei aktive Teilnehmer vorhanden sein.'
      : `Bei ${entrants.length} aktiven Teilnehmern sind höchstens ${entrants.length - 1} Schweizer Runden zulässig. Bitte die Phasenplanung vor dem Start korrigieren.`;
  }
  if (stage.type === 'GROUPS') {
    const assignments = getGroupAssignments(tournament, stage);
    const counts = Array<number>(Math.max(1, Number(stage.settings.groups) || 1)).fill(0);
    entrants.forEach((participant) => { counts[assignments[participant] ?? 0] += 1; });
    const singleton = counts.findIndex((count) => count === 1);
    if (singleton !== -1) {
      return `Gruppe ${groupLetter(singleton)} enthält nur einen Teilnehmer. Leere Gruppen sind erlaubt; bitte den einzelnen Teilnehmer einer anderen Gruppe zuordnen.`;
    }
  }
  return null;
}

export interface BreakStartOptions {
  kind: 'minutes' | 'clock';
  minutes?: number;
  time?: string;
  /** Exact local calendar day for a fixed clock target. */
  date?: string;
}

export function computeBreakResumeAt(start: Date, options: BreakStartOptions): Date | null {
  if (Number.isNaN(start.getTime())) return null;
  if (options.kind === 'minutes') {
    if (!Number.isInteger(options.minutes) || options.minutes! < 1 || options.minutes! > 1440) return null;
    return new Date(start.getTime() + options.minutes! * 60000);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time ?? '')) return null;
  const [hour, minute] = options.time!.split(':').map(Number);
  const target = new Date(start);
  if (options.date) {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(options.date);
    if (!day) return null;
    target.setFullYear(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    if (target.getFullYear() !== Number(day[1]) || target.getMonth() !== Number(day[2]) - 1
      || target.getDate() !== Number(day[3])) return null;
  }
  target.setHours(hour, minute, 0, 0);
  // An elapsed deadline must never silently turn into a 24-hour pause.
  return target.getTime() <= start.getTime() ? null : target;
}

/** Respect an explicit return date even for multi-day tournament interruptions.
 * If play overruns that date, do not silently postpone another full day. */
function computeDayEndResumeAt(start: Date, dateText: string, timeText: string): Date | null {
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText);
  if (!time) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const resume = new Date(start);
  if (dateText && !day) return null;
  if (day) {
    resume.setFullYear(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    if (resume.getFullYear() !== Number(day[1]) || resume.getMonth() !== Number(day[2]) - 1 || resume.getDate() !== Number(day[3])) return null;
  } else resume.setDate(resume.getDate() + 1);
  resume.setHours(Number(time[1]), Number(time[2]), 0, 0);
  // A missed day-end deadline requires an explicit director decision.
  return resume <= start ? null : resume;
}

export function startStage(tournament: DemoTournament, stage: TournamentStage, pauseOptions?: BreakStartOptions) {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED' || !isStageEditable(tournament, stage)) return false;
  if (getStageStartIssue(tournament, stage)) return false;
  const entrants = getStageEntrants(tournament, stage);
  const state = getPhaseLifecycle(tournament);
  const startDate = new Date();
  let pauseResume: Date | null = null;
  if (stage.type === 'BREAK') {
    const options: BreakStartOptions = pauseOptions ?? (stage.settings.breakKind === 'overnight'
      ? { kind: 'clock', time: String(stage.settings.nextDayStart ?? '09:00') }
      : stage.settings.breakKind === 'until'
        ? { kind: 'clock', time: String(stage.settings.breakUntil ?? '12:00'),
            date: String(stage.settings.breakUntilDate ?? '') || undefined }
        : { kind: 'minutes', minutes: Number(stage.settings.breakMinutes) || 15 });
    pauseResume = stage.settings.breakKind === 'overnight' && !pauseOptions
      ? computeDayEndResumeAt(startDate, String(stage.settings.nextDayDate ?? ''), String(stage.settings.nextDayStart ?? '09:00'))
      : computeBreakResumeAt(startDate, options);
    if (!pauseResume) return false;
  }
  let additionalMinutes = 0;
  if (stage.type === 'GROUPS') {
    const groups = Math.max(1, Number(stage.settings.groups) || 1);
    const assignments = getGroupAssignments(tournament, stage);
    const sizes = Array<number>(groups).fill(0);
    entrants.forEach((name) => { sizes[assignments[name] ?? 0] += 1; });
    const scoring = sportScoring(tournament.sport);
    const timing = scoring.mode === 'score'
      ? { matchDurationMinutes: tournament.matchDurationMinutes ?? 15,
          venueTurnoverMinutes: tournament.venueTurnoverMinutes ?? 0 }
      : { minutesPerSet: planningMinutesPerSet(tournament.sport) };
    const baseline = estimatePhaseMetrics({
      type: 'GROUPS', entrantCount: entrants.length, groupCount: groups, bestOf: stage.bestOf,
    }, tournament.tables, timing).estimatedDurationMinutes;
    const actual = estimatePhaseMetrics({
      type: 'GROUPS', entrantCount: entrants.length, groupCount: groups, groupSizes: sizes,
      bestOf: stage.bestOf,
    }, tournament.tables, timing).estimatedDurationMinutes;
    additionalMinutes = Math.max(0, actual - baseline);
    compactStartedGroupAssignments(tournament, stage, entrants);
  }
  // Die vor dem Start gültige Auslosung einfrieren. Ansonsten würden bei
  // einem späteren Lesen die ursprüngliche Teilnehmerzahl aus dem Wizard
  // erneut greifen und Nachmeldungen verschwinden / Rückzüge zurückkehren.
  saveState(tournament, {
    ...state,
    startedStageIds: [...new Set([...state.startedStageIds, stage.id])],
    stageEntrants: { ...(state.stageEntrants ?? {}), [stage.id]: entrants },
    stageStartedAt: { ...(state.stageStartedAt ?? {}), [stage.id]: startDate.toISOString() },
    stageExtraMinutes: { ...(state.stageExtraMinutes ?? {}), [stage.id]: additionalMinutes },
    breakResumeAt: pauseResume ? { ...(state.breakResumeAt ?? {}), [stage.id]: pauseResume.toISOString() } : state.breakResumeAt,
  });
  return true;
}

export function startFirstStage(tournament: DemoTournament) {
  const first = tournament.stages[0];
  if (!first) return false;
  if (isStageStarted(tournament, first)) return true;
  return startStage(tournament, first);
}

export function completeStage(tournament: DemoTournament, stage: TournamentStage, qualifiedForNext: string[] = [], earlyBreak = false) {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED') return false;
  const state = getPhaseLifecycle(tournament);
  if (!state.startedStageIds.includes(stage.id)) return false;
  if (stage.type === 'BREAK' && !canFinishBreak(tournament, stage, new Date(), earlyBreak)) return false;
  const stageIndex = getStageIndex(tournament, stage);
  const nextStage = tournament.stages[stageIndex + 1];
  const stageEntrants = { ...(state.stageEntrants ?? {}) };
  if (qualifiedForNext.length) {
    for (const following of tournament.stages.slice(stageIndex + 1)) {
      stageEntrants[following.id] = [...qualifiedForNext];
      if (following.type !== 'BREAK') break;
    }
  }

  saveState(tournament, {
    ...state,
    completedStageIds: [...new Set([...state.completedStageIds, stage.id])],
    stageEntrants,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mock-phase-completed', {
      detail: { tournamentId: tournament.id, stageId: stage.id, nextStageId: nextStage?.id ?? null },
    }));
  }
  return true;
}

/** Planned resumption in the local timezone of the tournament computer.
 * For a day-end break, the target is the following calendar day at the
 * specified wall-clock time; UTC offsets are handled by the Date object.
 */
export function getBreakResumeAt(tournament: DemoTournament, stage: TournamentStage): Date | null {
  if (stage.type !== 'BREAK') return null;
  const state = getPhaseLifecycle(tournament);
  const savedResume = state.breakResumeAt?.[stage.id];
  if (savedResume) {
    const exact = new Date(savedResume);
    if (!Number.isNaN(exact.getTime())) return exact;
  }
  const startedAt = state.stageStartedAt?.[stage.id];
  if (!startedAt) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  if (stage.settings.breakKind === 'overnight') {
    return computeDayEndResumeAt(start, String(stage.settings.nextDayDate ?? ''), String(stage.settings.nextDayStart ?? '09:00'));
  }
  if (stage.settings.breakKind === 'until') {
    return computeBreakResumeAt(start, { kind: 'clock', time: String(stage.settings.breakUntil ?? '12:00'),
      date: String(stage.settings.breakUntilDate ?? '') || undefined });
  }
  return new Date(start.getTime() + Math.max(1, Number(stage.settings.breakMinutes) || 15) * 60000);
}

export function canFinishBreak(tournament: DemoTournament, stage: TournamentStage, at = new Date(), early = false): boolean {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED'
    || stage.type !== 'BREAK' || !isStageStarted(tournament, stage) || isStageCompleted(tournament, stage)) return false;
  const resume = getBreakResumeAt(tournament, stage);
  return Boolean(resume && (early || at.getTime() >= resume.getTime()));
}

/** Show the first visible unit without leading zeros; keep later units two digits.
 * Right-aligned monospace layout keeps the remaining colons in place.
 * The displayed range is capped at 999 days to fit the existing timer width. */
export function formatBreakCountdown(resume: Date | null, now = Date.now()): string {
  if (!resume || Number.isNaN(resume.getTime())) return '--:--';
  const maxSeconds = 1000 * 86400 - 1;
  const totalSeconds = Math.min(maxSeconds, Math.max(0, Math.ceil((resume.getTime() - now) / 1000)));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const suffix = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (days > 0) return `${days}:${String(hours).padStart(2, '0')}:${suffix}`;
  if (hours > 0) return `${hours}:${suffix}`;
  return suffix;
}

/** Reopen a completed stage if a correction invalidates a previously resolved
 * qualifying cutoff, as long as the subsequent stage has not started. */
export function reopenStageForQualification(tournament: DemoTournament, stage: TournamentStage): boolean {
  const state = getPhaseLifecycle(tournament);
  if (!state.completedStageIds.includes(stage.id)) return false;
  const nextCompetition = getNextCompetitionStage(tournament, stage);
  if (!nextCompetition || state.startedStageIds.includes(nextCompetition.id)) return false;
  const entrants = { ...(state.stageEntrants ?? {}) };
  // Running breaks retain their snapshot until the competition is reapproved.
  for (const next of tournament.stages.slice(getStageIndex(tournament, stage) + 1)) {
    if (!state.startedStageIds.includes(next.id)) delete entrants[next.id];
    if (next.type !== 'BREAK') break;
  }
  saveState(tournament, {
    ...state,
    completedStageIds: state.completedStageIds.filter((id) => id !== stage.id),
    stageEntrants: entrants,
  });
  return true;
}

/** Die naechste Schweizer Runde darf erst nach Freigabe angesetzt werden. */
export function isSwissRoundApproved(tournament: DemoTournament, stage: TournamentStage, round: number): boolean {
  return Boolean(getPhaseLifecycle(tournament).approvedSwissRounds?.[stage.id]?.includes(round));
}

export function approveSwissRound(tournament: DemoTournament, stage: TournamentStage, round: number): boolean {
  if (stage.type !== 'SWISS' || !isStageStarted(tournament, stage) || round < 1) return false;
  const state = getPhaseLifecycle(tournament);
  const approved = state.approvedSwissRounds?.[stage.id] ?? [];
  if (approved.includes(round)) return true;
  saveState(tournament, {
    ...state,
    approvedSwissRounds: { ...state.approvedSwissRounds, [stage.id]: [...approved, round] },
  });
  return true;
}

export function revokeSwissRoundApprovals(tournament: DemoTournament, stage: TournamentStage, fromRound: number): boolean {
  const state = getPhaseLifecycle(tournament);
  const approved = state.approvedSwissRounds?.[stage.id] ?? [];
  if (!approved.some((round) => round >= fromRound)) return false;
  saveState(tournament, {
    ...state,
    approvedSwissRounds: { ...state.approvedSwissRounds, [stage.id]: approved.filter((round) => round < fromRound) },
  });
  return true;
}

/** Eine geaenderte Partie muss vor dem Start der Folgephase neu freigegeben werden. */
export function reopenStageAfterCorrection(tournament: DemoTournament, stage: TournamentStage): boolean {
  const state = getPhaseLifecycle(tournament);
  if (!state.completedStageIds.includes(stage.id)) return false;
  const nextCompetition = getNextCompetitionStage(tournament, stage);
  if (nextCompetition && state.startedStageIds.includes(nextCompetition.id)) return false;
  const entrants = { ...(state.stageEntrants ?? {}) };
  for (const next of tournament.stages.slice(getStageIndex(tournament, stage) + 1)) {
    if (!state.startedStageIds.includes(next.id)) delete entrants[next.id];
    if (next.type !== 'BREAK') break;
  }
  saveState(tournament, {
    ...state,
    completedStageIds: state.completedStageIds.filter((id) => id !== stage.id),
    stageEntrants: entrants,
  });
  return true;
}

export function getNextStartableStage(tournament: DemoTournament) {
  return tournament.stages.find((stage) => isStageEditable(tournament, stage) && getStageIndex(tournament, stage) > 0);
}

/** Clear stale stage entrant snapshots after a pre-start format change. */
export function resetPrestartPhaseLifecycle(tournament: DemoTournament): void {
  const state = getPhaseLifecycle(tournament);
  if (tournament.hasStarted || state.startedStageIds.length > 0) return;
  const all = readAll();
  writeAll(all.filter((entry) => entry.tournamentId !== tournament.id));
}

export function clearMockPhaseLifecycle() {
  if (typeof window === 'undefined') return;
  localTournamentStorage.removeItem(PHASE_KEY);
}
