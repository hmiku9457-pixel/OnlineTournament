import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { isParticipantWithdrawn } from '@/services/mockWithdrawals';

const PHASE_KEY = 'online-tournament:mock-phase-lifecycle:v1';

interface PhaseLifecycleState {
  tournamentId: string;
  startedStageIds: string[];
  completedStageIds: string[];
  approvedSwissRounds?: Record<string, number[]>;
  stageEntrants?: Record<string, string[]>;
  stageStartedAt?: Record<string, string>;
}

function readAll(): PhaseLifecycleState[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PHASE_KEY) ?? '[]') as PhaseLifecycleState[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(states: PhaseLifecycleState[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PHASE_KEY, JSON.stringify(states));
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
  const index = getStageIndex(tournament, stage);
  if (index < 0 || isStageStarted(tournament, stage)) return false;
  if (index === 0) return !tournament.hasStarted && ['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status);
  const previous = tournament.stages[index - 1];
  return Boolean(previous && isStageCompleted(tournament, previous));
}

export function isStageLockedWaiting(tournament: DemoTournament, stage: TournamentStage) {
  const index = getStageIndex(tournament, stage);
  if (index <= 0 || isStageStarted(tournament, stage)) return false;
  const previous = tournament.stages[index - 1];
  return Boolean(previous && !isStageCompleted(tournament, previous));
}

export function startStage(tournament: DemoTournament, stage: TournamentStage) {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED' || !isStageEditable(tournament, stage)) return false;
  const entrants = getStageEntrants(tournament, stage);
  if (entrants.length < 2) return false;
  const state = getPhaseLifecycle(tournament);
  // Die vor dem Start gültige Auslosung einfrieren. Ansonsten würden bei
  // einem späteren Lesen die ursprüngliche Teilnehmerzahl aus dem Wizard
  // erneut greifen und Nachmeldungen verschwinden / Rückzüge zurückkehren.
  saveState(tournament, {
    ...state,
    startedStageIds: [...new Set([...state.startedStageIds, stage.id])],
    stageEntrants: { ...(state.stageEntrants ?? {}), [stage.id]: entrants },
    stageStartedAt: { ...(state.stageStartedAt ?? {}), [stage.id]: new Date().toISOString() },
  });
  return true;
}

export function startFirstStage(tournament: DemoTournament) {
  const first = tournament.stages[0];
  if (!first) return false;
  if (isStageStarted(tournament, first)) return true;
  return startStage(tournament, first);
}

export function completeStage(tournament: DemoTournament, stage: TournamentStage, qualifiedForNext: string[] = []) {
  const state = getPhaseLifecycle(tournament);
  if (!state.startedStageIds.includes(stage.id)) return false;
  if (stage.type === 'BREAK' && !canFinishBreak(tournament, stage)) return false;
  const stageIndex = getStageIndex(tournament, stage);
  const nextStage = tournament.stages[stageIndex + 1];
  const stageEntrants = { ...(state.stageEntrants ?? {}) };
  if (nextStage && qualifiedForNext.length) stageEntrants[nextStage.id] = [...qualifiedForNext];

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
  const startedAt = getPhaseLifecycle(tournament).stageStartedAt?.[stage.id];
  if (!startedAt) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  if (stage.settings.breakKind === 'overnight') {
    const startTime = String(stage.settings.nextDayStart ?? '09:00');
    if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(startTime)) return null;
    const [hours, minutes] = startTime.split(':').map(Number);
    const resume = new Date(start);
    resume.setDate(resume.getDate() + 1);
    resume.setHours(hours, minutes, 0, 0);
    return resume;
  }
  return new Date(start.getTime() + Math.max(1, Number(stage.settings.breakMinutes) || 15) * 60000);
}

export function canFinishBreak(tournament: DemoTournament, stage: TournamentStage, at = new Date()): boolean {
  if (stage.type !== 'BREAK' || !isStageStarted(tournament, stage) || isStageCompleted(tournament, stage)) return false;
  const resume = getBreakResumeAt(tournament, stage);
  return Boolean(resume && at.getTime() >= resume.getTime());
}

/** Reopen a completed stage if a correction invalidates a previously resolved
 * qualifying cutoff, as long as the subsequent stage has not started. */
export function reopenStageForQualification(tournament: DemoTournament, stage: TournamentStage): boolean {
  const state = getPhaseLifecycle(tournament);
  if (!state.completedStageIds.includes(stage.id)) return false;
  const next = tournament.stages[getStageIndex(tournament, stage) + 1];
  if (!next || state.startedStageIds.includes(next.id)) return false;
  const entrants = { ...(state.stageEntrants ?? {}) };
  delete entrants[next.id];
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
  const next = tournament.stages[getStageIndex(tournament, stage) + 1];
  if (next && state.startedStageIds.includes(next.id)) return false;
  const entrants = { ...(state.stageEntrants ?? {}) };
  if (next) delete entrants[next.id];
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

export function clearMockPhaseLifecycle() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PHASE_KEY);
}
