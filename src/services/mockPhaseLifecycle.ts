import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';

const PHASE_KEY = 'online-tournament:mock-phase-lifecycle:v1';

interface PhaseLifecycleState {
  tournamentId: string;
  startedStageIds: string[];
  completedStageIds: string[];
  stageEntrants?: Record<string, string[]>;
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
    stageEntrants: {},
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
  const stored = state.stageEntrants?.[stage.id];
  if (stored?.length) return [...stored];

  const names = getRuntimeParticipantNames(tournament);
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
  if (!isStageEditable(tournament, stage)) return false;
  const state = getPhaseLifecycle(tournament);
  saveState(tournament, {
    ...state,
    startedStageIds: [...new Set([...state.startedStageIds, stage.id])],
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

export function getNextStartableStage(tournament: DemoTournament) {
  return tournament.stages.find((stage) => isStageEditable(tournament, stage) && getStageIndex(tournament, stage) > 0);
}

export function clearMockPhaseLifecycle() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PHASE_KEY);
}
