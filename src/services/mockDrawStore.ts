import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockRuntime';
import { generateKnockoutFirstRound } from '@/engine/bracket';
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

function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seededBracketSlots(participants: string[], randomizeRest = false) {
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const byeCount = bracketSize - participants.length;
  const protectedSeedCount = Math.min(participants.length, Math.max(2, byeCount));
  const seededParticipants = randomizeRest
    ? [...participants.slice(0, protectedSeedCount), ...shuffled(participants.slice(protectedSeedCount))]
    : [...participants];

  const pairings = generateKnockoutFirstRound(
    seededParticipants.map((participantId, index) => ({ participantId, seed: index + 1 })),
  );

  return pairings.flatMap((pairing) => [pairing.sideAId ?? 'Freilos', pairing.sideBId ?? 'Freilos']);
}

function pairedSlotIndex(slotIndex: number) {
  return slotIndex % 2 === 0 ? slotIndex + 1 : slotIndex - 1;
}

function validBracketConstraints(participants: string[], slots: string[]) {
  if (slots.length < 2) return false;
  const midpoint = slots.length / 2;
  const seedOne = participants[0];
  const seedTwo = participants[1];
  const seedOneIndex = seedOne ? slots.indexOf(seedOne) : -1;
  const seedTwoIndex = seedTwo ? slots.indexOf(seedTwo) : -1;

  if (seedOneIndex >= 0 && seedTwoIndex >= 0) {
    const seedOneHalf = seedOneIndex < midpoint ? 0 : 1;
    const seedTwoHalf = seedTwoIndex < midpoint ? 0 : 1;
    if (seedOneHalf === seedTwoHalf) return false;
  }

  const byeCount = Math.max(0, slots.length - participants.length);
  for (let seedIndex = 0; seedIndex < byeCount; seedIndex += 1) {
    const participant = participants[seedIndex];
    if (!participant) continue;
    const slotIndex = slots.indexOf(participant);
    if (slotIndex < 0 || slots[pairedSlotIndex(slotIndex)] !== 'Freilos') return false;
  }

  const playersFirstHalf = slots.slice(0, midpoint).filter((slot) => slot !== 'Freilos').length;
  const playersSecondHalf = slots.slice(midpoint).filter((slot) => slot !== 'Freilos').length;
  return Math.abs(playersFirstHalf - playersSecondHalf) <= 1;
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

export function randomizeGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const names = getRuntimeParticipantNames(tournament);
  const entrantCount = Math.max(1, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const randomized = shuffled(names.slice(0, entrantCount));
  const assignments = Object.fromEntries(randomized.map((participant, index) => [participant, index % groupCount]));
  upsert({ tournamentId: tournament.id, stageId: stage.id, groupAssignments: assignments });
  return true;
}

export function getBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrants);
  const bracketSize = nextPowerOfTwo(entrants);
  const existing = findConfig(tournament.id, stage.id)?.bracketSlots;
  if (existing?.length === bracketSize && validBracketConstraints(participants, existing)) return [...existing];
  return seededBracketSlots(participants);
}

export function setBracketSlot(tournament: DemoTournament, stage: TournamentStage, slotIndex: number, value: string) {
  if (!canEditDraw(tournament, stage)) return false;
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrants);
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
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrants);
  const slots = seededBracketSlots(participants, true);
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
