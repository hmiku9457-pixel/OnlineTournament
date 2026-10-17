import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockRuntime';
import { isStageEditable } from '@/services/mockPhaseLifecycle';

const DRAW_KEY = 'online-tournament:mock-draw-config:v1';

interface StageDrawConfig {
  tournamentId: string;
  stageId: string;
  groupAssignments?: Record<string, number>;
  bracketSlots?: string[];
}

function readAll(): StageDrawConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAW_KEY) ?? '[]') as StageDrawConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(configs: StageDrawConfig[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DRAW_KEY, JSON.stringify(configs));
  window.dispatchEvent(new CustomEvent('mock-draw-change'));
}

function upsert(config: StageDrawConfig) {
  const current = readAll();
  writeAll([config, ...current.filter((item) => !(item.tournamentId === config.tournamentId && item.stageId === config.stageId))]);
}

function findConfig(tournamentId: string, stageId: string) {
  return readAll().find((item) => item.tournamentId === tournamentId && item.stageId === stageId);
}

function nextPowerOfTwo(value: number) {
  let result = 2;
  while (result < value) result *= 2;
  return result;
}

export function canEditDraw(tournament: DemoTournament, stage: TournamentStage) {
  return isStageEditable(tournament, stage);
}

export function getGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  const names = getRuntimeParticipantNames(tournament);
  const entrantCount = Math.max(1, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrantCount);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const existing = findConfig(tournament.id, stage.id)?.groupAssignments;
  if (existing) {
    const complete: Record<string, number> = {};
    participants.forEach((name, index) => {
      const groupIndex = existing[name];
      complete[name] = Number.isInteger(groupIndex) && groupIndex >= 0 && groupIndex < groupCount ? groupIndex : index % groupCount;
    });
    return complete;
  }

  return Object.fromEntries(participants.map((name, index) => [name, index % groupCount]));
}

export function setParticipantGroup(tournament: DemoTournament, stage: TournamentStage, participant: string, groupIndex: number) {
  if (!canEditDraw(tournament, stage)) return false;
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  if (groupIndex < 0 || groupIndex >= groupCount) return false;
  const current = getGroupAssignments(tournament, stage);
  current[participant] = groupIndex;
  upsert({ tournamentId: tournament.id, stageId: stage.id, groupAssignments: current });
  return true;
}

export function resetGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const current = readAll();
  const existing = findConfig(tournament.id, stage.id);
  if (!existing) return true;
  const remainingConfig = existing.bracketSlots
    ? { ...existing, groupAssignments: undefined }
    : null;
  writeAll([
    ...(remainingConfig ? [remainingConfig] : []),
    ...current.filter((item) => !(item.tournamentId === tournament.id && item.stageId === stage.id)),
  ]);
  return true;
}

export function getBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const bracketSize = nextPowerOfTwo(entrants);
  const existing = findConfig(tournament.id, stage.id)?.bracketSlots;
  if (existing?.length === bracketSize) return [...existing];
  return Array.from({ length: bracketSize }, (_, index) => names[index] ?? 'Freilos');
}

export function setBracketSlot(tournament: DemoTournament, stage: TournamentStage, slotIndex: number, value: string) {
  if (!canEditDraw(tournament, stage)) return false;
  const slots = getBracketSlots(tournament, stage);
  if (slotIndex < 0 || slotIndex >= slots.length) return false;

  const previous = slots[slotIndex];
  if (value === 'Freilos') {
    const existingByeIndex = slots.findIndex((item, index) => index !== slotIndex && item === 'Freilos');
    if (existingByeIndex < 0) return false;
    slots[existingByeIndex] = previous;
  } else {
    const existingIndex = slots.findIndex((item, index) => index !== slotIndex && item === value);
    if (existingIndex >= 0) slots[existingIndex] = previous;
  }
  slots[slotIndex] = value;
  upsert({ tournamentId: tournament.id, stageId: stage.id, bracketSlots: slots });
  return true;
}

export function resetBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const current = readAll();
  const existing = findConfig(tournament.id, stage.id);
  if (!existing) return true;
  const remainingConfig = existing.groupAssignments
    ? { ...existing, bracketSlots: undefined }
    : null;
  writeAll([
    ...(remainingConfig ? [remainingConfig] : []),
    ...current.filter((item) => !(item.tournamentId === tournament.id && item.stageId === stage.id)),
  ]);
  return true;
}

export function clearMockDraws() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAW_KEY);
}
