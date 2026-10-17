import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getStageEntrants, isStageEditable } from '@/services/mockPhaseLifecycle';

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

function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function stableShuffled(values: string[]) {
  return [...values].sort((a, b) => {
    const hash = (value: string) => [...value].reduce((sum, char) => ((sum * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
    return hash(a) - hash(b) || a.localeCompare(b, 'de');
  });
}

function balancedBracketSlots(participants: string[], randomize = false) {
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const pairCount = bracketSize / 2;
  const byeCount = bracketSize - participants.length;
  const players = randomize ? shuffled(participants) : stableShuffled(participants);
  const byePairs: number[] = [];
  const halfPairs = pairCount / 2;

  for (let offset = 0; byePairs.length < byeCount; offset += 1) {
    const left = offset % Math.max(1, halfPairs);
    const right = halfPairs + (offset % Math.max(1, halfPairs));
    if (left < pairCount && !byePairs.includes(left)) byePairs.push(left);
    if (byePairs.length < byeCount && right < pairCount && !byePairs.includes(right)) byePairs.push(right);
  }

  const slots = Array<string>(bracketSize).fill('');
  let playerIndex = 0;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const slotA = pairIndex * 2;
    const slotB = slotA + 1;
    if (byePairs.includes(pairIndex)) {
      slots[slotA] = players[playerIndex++] ?? 'Freilos';
      slots[slotB] = 'Freilos';
    } else {
      slots[slotA] = players[playerIndex++] ?? 'Freilos';
      slots[slotB] = players[playerIndex++] ?? 'Freilos';
    }
  }
  return slots;
}

function validBracketConstraints(participants: string[], slots: string[]) {
  if (slots.length < 2) return false;
  const expectedByeCount = Math.max(0, slots.length - participants.length);
  if (slots.filter((slot) => slot === 'Freilos').length !== expectedByeCount) return false;
  const playerSlots = slots.filter((slot) => slot !== 'Freilos');
  if (playerSlots.length !== participants.length) return false;
  if (new Set(playerSlots).size !== participants.length) return false;
  if (participants.some((participant) => !playerSlots.includes(participant))) return false;
  for (let index = 0; index < slots.length; index += 2) {
    if (slots[index] === 'Freilos' && slots[index + 1] === 'Freilos') return false;
  }

  const midpoint = slots.length / 2;
  const playersFirstHalf = slots.slice(0, midpoint).filter((slot) => slot !== 'Freilos').length;
  const playersSecondHalf = slots.slice(midpoint).filter((slot) => slot !== 'Freilos').length;
  return Math.abs(playersFirstHalf - playersSecondHalf) <= 1;
}

export function canEditDraw(tournament: DemoTournament, stage: TournamentStage) {
  return isStageEditable(tournament, stage);
}

export function getGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  const participants = getStageEntrants(tournament, stage);
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

export function randomizeGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const participants = getStageEntrants(tournament, stage);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const randomized = shuffled(participants);
  const assignments = Object.fromEntries(randomized.map((participant, index) => [participant, index % groupCount]));
  upsert({ tournamentId: tournament.id, stageId: stage.id, groupAssignments: assignments });
  return true;
}

export function getBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  const participants = getStageEntrants(tournament, stage);
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const existing = findConfig(tournament.id, stage.id)?.bracketSlots;
  if (existing?.length === bracketSize && validBracketConstraints(participants, existing)) return [...existing];
  return balancedBracketSlots(participants);
}

export function setBracketSlot(tournament: DemoTournament, stage: TournamentStage, slotIndex: number, value: string) {
  if (!canEditDraw(tournament, stage)) return false;
  const participants = getStageEntrants(tournament, stage);
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
  if (!validBracketConstraints(participants, slots)) return false;
  upsert({ tournamentId: tournament.id, stageId: stage.id, bracketSlots: slots });
  return true;
}

export function randomizeBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const participants = getStageEntrants(tournament, stage);
  const slots = balancedBracketSlots(participants, true);
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
