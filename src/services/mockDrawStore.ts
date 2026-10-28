import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { seededGroupAssignments, seededKnockoutSlots, seededKnockoutSlotsAvoidingGroups, snakeSeededGroupOrder } from '@/engine/seededDraws';
import { isStageCompleted, getPreviousCompetitionStage } from '@/services/mockPhaseLifecycle';
import { getPhaseLifecycle, getStageEntrants, isStageEditable } from '@/services/mockPhaseLifecycle';
import { buildMockGroups, buildSwissStandings } from '@/services/mockCompetitionViews';

const DRAW_KEY = 'online-tournament:mock-draw-config:v1';

interface StageDrawConfig {
  tournamentId: string;
  stageId: string;
  groupAssignments?: Record<string, number>;
  bracketSlots?: string[];
  pinnedBracketSlots?: number[];
  swissOrder?: string[];
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

function bitReversalOrder(size: number) {
  const bits = Math.max(1, Math.log2(size));
  return Array.from({ length: size }, (_, value) => {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | ((value >> bit) & 1);
    }
    return reversed;
  });
}

function balancedBracketSlots(participants: string[], randomize = false) {
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const pairCount = bracketSize / 2;
  const byeCount = bracketSize - participants.length;
  const players = randomize ? shuffled(participants) : stableShuffled(participants);
  const byePairs = new Set(bitReversalOrder(pairCount).slice(0, byeCount));

  const slots = Array<string>(bracketSize).fill('');
  let playerIndex = 0;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const slotA = pairIndex * 2;
    const slotB = slotA + 1;
    if (byePairs.has(pairIndex)) {
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
  const remainingConfig = (existing.bracketSlots || existing.swissOrder)
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

export function getSwissOrder(tournament: DemoTournament, stage: TournamentStage) {
  const participants = getStageEntrants(tournament, stage);
  const existing = findConfig(tournament.id, stage.id)?.swissOrder;
  if (existing?.length === participants.length && participants.every((participant) => existing.includes(participant))) {
    return [...existing];
  }
  return stableShuffled(participants);
}

export function randomizeSwissOrder(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const participants = getStageEntrants(tournament, stage);
  const config = findConfig(tournament.id, stage.id);
  upsert({
    tournamentId: tournament.id,
    stageId: stage.id,
    groupAssignments: config?.groupAssignments,
    bracketSlots: config?.bracketSlots,
    swissOrder: shuffled(participants),
  });
  return true;
}

/** Seed the Swiss opening order from the completed groups using snake ranks. */
export function applySeededSwissOrder(tournament: DemoTournament, stage: TournamentStage, rankedGroups: string[][]) {
  const previous = getPreviousCompetitionStage(tournament, stage);
  if (stage.type !== 'SWISS' || previous?.type !== 'GROUPS' || !isStageCompleted(tournament, previous) || !canEditDraw(tournament, stage)) return false;
  const entrants = getStageEntrants(tournament, stage);
  const order = snakeSeededGroupOrder(rankedGroups, entrants);
  if (order.length !== entrants.length || new Set(order).size !== entrants.length) return false;
  upsert({ ...findConfig(tournament.id, stage.id), tournamentId: tournament.id, stageId: stage.id, swissOrder: order });
  return true;
}

/** Group draw from previous completed Swiss ranking: A-B-C-D / D-C-B-A. */
export function applySeededGroupAssignments(tournament: DemoTournament, stage: TournamentStage) {
  const previous = getPreviousCompetitionStage(tournament, stage);
  if (stage.type !== 'GROUPS' || previous?.type !== 'SWISS' || !isStageCompleted(tournament, previous) || !canEditDraw(tournament, stage)) return false;
  const entrants = getStageEntrants(tournament, stage);
  // Read the displayed Swiss table rather than relying on registration order
  // or a stored entrant array that may have a different tie-break ordering.
  const eligible = new Set(entrants);
  const ranked = buildSwissStandings(tournament, previous).map((row) => row.name).filter((name) => eligible.has(name));
  const missing = entrants.filter((name) => !ranked.includes(name));
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const assignments = seededGroupAssignments([...ranked, ...missing], groupCount);
  if (Object.keys(assignments).length !== entrants.length) return false;
  upsert({ ...findConfig(tournament.id, stage.id), tournamentId: tournament.id, stageId: stage.id, groupAssignments: assignments });
  return true;
}

/** Apply conventional ranking seeds from the preceding completed phase. */
export function applySeededBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  const previous = getPreviousCompetitionStage(tournament, stage);
  if (stage.type !== 'KNOCKOUT' || !previous || !['GROUPS', 'SWISS'].includes(previous.type) || !isStageCompleted(tournament, previous) || !canEditDraw(tournament, stage)) return false;
  // Qualifier ordering is the ranking order of the completed prior stage.
  const entrants = getStageEntrants(tournament, stage);
  const groupByPlayer: Record<string, string> = {};
  if (previous.type === 'GROUPS') {
    buildMockGroups(tournament, previous).forEach((group) => group.standings.forEach((row) => {
      groupByPlayer[row.name] = group.label;
    }));
  }
  const slots = previous.type === 'GROUPS'
    ? seededKnockoutSlotsAvoidingGroups(entrants, groupByPlayer)
    : seededKnockoutSlots(entrants);
  if (!validBracketConstraints(entrants, slots)) return false;
  // An explicit re-seeding supersedes old manual positions and pins.
  upsert({ ...findConfig(tournament.id, stage.id), tournamentId: tournament.id, stageId: stage.id, bracketSlots: slots, pinnedBracketSlots: [] });
  return true;
}

export function getPinnedBracketSlots(tournament: DemoTournament, stage: TournamentStage): number[] {
  const slots = getBracketSlots(tournament, stage);
  return (findConfig(tournament.id, stage.id)?.pinnedBracketSlots ?? [])
    .filter((index) => Number.isInteger(index) && index >= 0 && index < slots.length && slots[index] !== 'Freilos');
}

export function toggleBracketPin(tournament: DemoTournament, stage: TournamentStage, index: number) {
  if (!canEditDraw(tournament, stage)) return false;
  const slots = getBracketSlots(tournament, stage);
  if (index < 0 || index >= slots.length || slots[index] === 'Freilos') return false;
  const old = findConfig(tournament.id, stage.id);
  const pinned = new Set(getPinnedBracketSlots(tournament, stage));
  if (pinned.has(index)) pinned.delete(index); else pinned.add(index);
  upsert({ ...old, tournamentId: tournament.id, stageId: stage.id, bracketSlots: slots, pinnedBracketSlots: [...pinned] });
  return true;
}

export function getBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  const participants = getStageEntrants(tournament, stage);
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const existing = findConfig(tournament.id, stage.id)?.bracketSlots;
  if (existing?.length === bracketSize && validBracketConstraints(participants, existing)) return [...existing];
  return balancedBracketSlots(participants);
}

export function setBracketSlot(
  tournament: DemoTournament,
  stage: TournamentStage,
  slotIndex: number,
  value: string,
  sourceSlotIndex?: number,
) {
  if (!canEditDraw(tournament, stage)) return false;
  const participants = getStageEntrants(tournament, stage);
  const slots = getBracketSlots(tournament, stage);
  if (slotIndex < 0 || slotIndex >= slots.length) return false;
  if (sourceSlotIndex === slotIndex) return true;

  const previous = slots[slotIndex];
  const pinned = new Set(getPinnedBracketSlots(tournament, stage));
  if (pinned.has(slotIndex)) return false;
  let sourceIndex = Number.isInteger(sourceSlotIndex) ? sourceSlotIndex! : -1;
  if (sourceIndex < 0 || sourceIndex >= slots.length || slots[sourceIndex] !== value) {
    sourceIndex = slots.findIndex((item, index) => index !== slotIndex && item === value);
  }
  if (sourceIndex < 0 || pinned.has(sourceIndex)) return false;

  slots[slotIndex] = value;
  slots[sourceIndex] = previous;
  if (!validBracketConstraints(participants, slots)) return false;
  upsert({ ...findConfig(tournament.id, stage.id), tournamentId: tournament.id, stageId: stage.id, bracketSlots: slots });
  return true;
}

export function randomizeBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const original = getBracketSlots(tournament, stage);
  const pinned = getPinnedBracketSlots(tournament, stage);
  const pinnedIndexes = new Set(pinned);

  // Freilose sind feste Positionen im Baum. Nur nicht fixierte Spieler
  // werden neu verteilt. Dadurch bleiben das Freilosmuster und die
  // Balance beider Hälften auch beim erneuten Würfeln unverändert.
  const movableIndexes = original.map((name, index) => ({ name, index }))
    .filter(({ name, index }) => name !== 'Freilos' && !pinnedIndexes.has(index))
    .map(({ index }) => index);
  const shuffledPlayers = shuffled(movableIndexes.map((index) => original[index]));
  const next = [...original];
  movableIndexes.forEach((index, position) => {
    next[index] = shuffledPlayers[position];
  });

  if (!validBracketConstraints(getStageEntrants(tournament, stage), next)) return false;
  upsert({
    ...findConfig(tournament.id, stage.id),
    tournamentId: tournament.id,
    stageId: stage.id,
    bracketSlots: next,
    pinnedBracketSlots: pinned,
  });
  return true;
}

export function resetBracketSlots(tournament: DemoTournament, stage: TournamentStage) {
  if (!canEditDraw(tournament, stage)) return false;
  const current = readAll();
  const existing = findConfig(tournament.id, stage.id);
  if (!existing) return true;
  const remainingConfig = (existing.groupAssignments || existing.swissOrder)
    ? { ...existing, bracketSlots: undefined, pinnedBracketSlots: undefined }
    : null;
  writeAll([
    ...(remainingConfig ? [remainingConfig] : []),
    ...current.filter((item) => !(item.tournamentId === tournament.id && item.stageId === stage.id)),
  ]);
  return true;
}

/** Keep optional pre-start draw edits consistent when the roster changes.
 * Group placements of remaining players survive; outdated bracket pins do not.
 */
export function reconcilePrestartDraws(tournament: DemoTournament) {
  if (tournament.hasStarted || getPhaseLifecycle(tournament).startedStageIds.length) return;
  const configs = readAll();
  const next = configs.map((config) => {
    if (config.tournamentId !== tournament.id) return config;
    const stage = tournament.stages.find((entry) => entry.id === config.stageId);
    if (!stage) return config;
    const entrants = getStageEntrants(tournament, stage);
    const valid = new Set(entrants);
    const assignments = config.groupAssignments
      ? Object.fromEntries(Object.entries(config.groupAssignments).filter(([name]) => valid.has(name)))
      : undefined;
    const swissOrder = config.swissOrder
      ? [...config.swissOrder.filter((name) => valid.has(name)), ...entrants.filter((name) => !config.swissOrder!.includes(name))]
      : undefined;
    const oldSlots = config.bracketSlots;
    const bracketValid = oldSlots
      && oldSlots.length === nextPowerOfTwo(Math.max(2, entrants.length))
      && validBracketConstraints(entrants, oldSlots);
    return {
      ...config,
      groupAssignments: assignments,
      swissOrder,
      bracketSlots: oldSlots ? (bracketValid ? oldSlots : balancedBracketSlots(entrants)) : undefined,
      pinnedBracketSlots: bracketValid ? config.pinnedBracketSlots : [],
    };
  });
  if (configs.some((config) => config.tournamentId === tournament.id)) writeAll(next);
}

export function clearMockDraws() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAW_KEY);
}
