import type { DemoTournament } from '@/data/demoTournaments';
import type { StageType } from '@/domain/types';
import {
  estimateTournamentDurationMinutes, hasValidBreakStageOrder,
  hasValidTerminalStageOrder, knockoutRoundLabels, recommendGroupCount,
  recommendedSwissRounds, stageLabel, type TournamentDurationPhaseInput,
} from '@/domain/tournamentCreation';
import { planningMinutesPerSet } from '@/domain/sports';
import { sportScoring } from '@/domain/sportScoring';

/** In-memory pre-start draft. Existing stage identities are not reused on save:
 * their pre-start draw configuration must be regenerated for the new plan.
 */
export interface PrestartPhaseDraft {
  id: string;
  type: StageType;
  label: string;
  entrantCount: number;
  bestOf: number;
  groupCount: number;
  swissRounds: number;
  knockoutBestOf: number[];
  breakKind: 'minutes' | 'until' | 'overnight';
  breakMinutes: number;
  nextDayStart: string;
  breakUntil: string;
  note: string;
}

const competitive = (phase: PrestartPhaseDraft) => phase.type !== 'BREAK';
export const isKnockoutPhase = (type: StageType) => type === 'KNOCKOUT' || type === 'DOUBLE_ELIMINATION';

export function initialPrestartPhases(tournament: DemoTournament): PrestartPhaseDraft[] {
  return tournament.stages.map((stage) => ({
    id: stage.id,
    type: stage.type,
    label: stage.name,
    entrantCount: Number(stage.settings.entrants) || tournament.participants,
    bestOf: stage.bestOf,
    groupCount: Number(stage.settings.groups) || 2,
    swissRounds: Number(stage.settings.rounds) || 1,
    knockoutBestOf: String(stage.settings.roundBestOf ?? '').split(',')
      .map(Number).filter((value) => Number.isInteger(value) && value > 0),
    breakKind: stage.settings.breakKind === 'overnight' ? 'overnight' : stage.settings.breakKind === 'until' ? 'until' : 'minutes',
    breakMinutes: Number(stage.settings.breakMinutes) || 15,
    nextDayStart: String(stage.settings.nextDayStart ?? '09:00'),
    breakUntil: String(stage.settings.breakUntil ?? '12:00'),
    note: String(stage.settings.note ?? ''),
  }));
}

/** Adjust only participant-dependent upper bounds; leave round and group choices
 * for the organizer to accept explicitly from the displayed recommendation.
 */
export function normalizePrestartPhases(phases: PrestartPhaseDraft[], activeCount: number): PrestartPhaseDraft[] {
  let available = Math.max(0, Math.floor(activeCount));
  let firstPlayingPhase = true;
  return phases.map((original) => {
    const phase = { ...original, knockoutBestOf: [...original.knockoutBestOf] };
    if (phase.type === 'BREAK') {
      phase.entrantCount = available;
      return phase;
    }
    // The first playing phase takes everyone still registered. Later phases
    // retain their configured cutoffs, bounded by the previous entrants.
    phase.entrantCount = firstPlayingPhase
      ? available
      : Math.max(2, Math.min(available, phase.entrantCount));
    firstPlayingPhase = false;
    available = phase.entrantCount;
    if (phase.type === 'KNOCKOUT') {
      const rounds = knockoutRoundLabels(Math.max(2, phase.entrantCount)).length;
      phase.knockoutBestOf = Array.from({ length: rounds }, (_, index) => phase.knockoutBestOf[index] ?? phase.bestOf);
    }
    return phase;
  });
}

export function recommendedPrestartGroupCount(phases: PrestartPhaseDraft[], index: number): number {
  const phase = phases[index];
  const following = phases.slice(index + 1).find(competitive);
  return recommendGroupCount(phase.entrantCount, following?.entrantCount);
}

export function validatePrestartPhases(phases: PrestartPhaseDraft[], activeCount: number): string[] {
  const errors: string[] = [];
  if (activeCount < 2) errors.push('Mindestens zwei nicht zurückgezogene Teilnehmer sind erforderlich.');
  if (!phases.some(competitive)) errors.push('Mindestens eine Spielphase ist erforderlich.');
  const types = phases.map((phase) => phase.type);
  if (!hasValidTerminalStageOrder(types)) errors.push('Die K.-o.-Phase muss am Ende stehen.');
  if (!hasValidBreakStageOrder(types)) errors.push('Eine Pause muss zwischen zwei Spielphasen stehen.');
  let available = activeCount;
  let gameIndex = 0;
  phases.forEach((phase, index) => {
    const label = `Phase ${index + 1}`;
    if (!phase.label.trim() || phase.label.length > 80) errors.push(`${label}: Bezeichnung fehlt oder ist zu lang.`);
    if (phase.type === 'BREAK') {
      if (phase.note.length > 600) errors.push(`${label}: Hinweistext darf maximal 600 Zeichen enthalten.`);
      if (phase.breakKind === 'overnight') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.nextDayStart)) errors.push(`${label}: Gültige Startzeit (HH:MM) erforderlich.`);
      } else if (phase.breakKind === 'until') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.breakUntil)) errors.push(`${label}: Für „Pause bis“ ist eine gültige Uhrzeit (HH:MM) erforderlich.`);
      } else if (phase.breakKind === 'minutes') {
        if (!Number.isInteger(phase.breakMinutes) || phase.breakMinutes < 1 || phase.breakMinutes > 1440) errors.push(`${label}: Pausendauer muss zwischen 1 und 1440 Minuten liegen.`);
      } else {
        errors.push(`${label}: Unbekannte Unterbrechungsart.`);
      }
      return;
    }
    if (!Number.isInteger(phase.entrantCount) || phase.entrantCount < 2 || phase.entrantCount > available) {
      errors.push(`${label}: Teilnehmerzahl muss zwischen 2 und ${available} liegen.`);
    }
    if (gameIndex === 0 && phase.entrantCount !== activeCount) errors.push('Die erste Spielphase muss alle aktiven Teilnehmer enthalten.');
    if (phase.type === 'GROUPS') {
      const maxGroups = Math.floor(phase.entrantCount / 2);
      if (!Number.isInteger(phase.groupCount) || phase.groupCount < 2 || phase.groupCount > maxGroups) {
        errors.push(`${label}: Die Gruppenanzahl muss zwischen 2 und ${Math.max(2, maxGroups)} liegen (mindestens zwei pro Gruppe).`);
      }
    }
    if (phase.type === 'SWISS') {
      if (!Number.isInteger(phase.swissRounds) || phase.swissRounds < 1
        || phase.swissRounds > Math.min(30, phase.entrantCount - 1)) {
        errors.push(`${label}: Schweizer Runden müssen zwischen 1 und ${Math.max(1, Math.min(30, phase.entrantCount - 1))} liegen.`);
      }
    }
    if (!Number.isInteger(phase.bestOf) || phase.bestOf < 1 || phase.bestOf % 2 === 0) {
      errors.push(`${label}: Best-of muss eine positive ungerade Zahl sein.`);
    }
    if (phase.type === 'KNOCKOUT' && phase.knockoutBestOf.some((value) => value < 1 || value % 2 === 0)) {
      errors.push(`${label}: Ungültige Best-of-Auswahl für eine K.-o.-Runde.`);
    }
    available = phase.entrantCount;
    gameIndex += 1;
  });
  return errors;
}

export function estimatePrestartDuration(tournament: DemoTournament, phases: PrestartPhaseDraft[]): number {
  const settings = sportScoring(tournament.sport).mode === 'score'
    ? { matchDurationMinutes: tournament.matchDurationMinutes ?? 90, venueTurnoverMinutes: tournament.venueTurnoverMinutes ?? 0 }
    : { minutesPerSet: planningMinutesPerSet(tournament.sport) };
  const inputs: TournamentDurationPhaseInput[] = phases.map((phase) => ({
    type: phase.type, entrantCount: phase.entrantCount, bestOf: phase.bestOf, groupCount: phase.groupCount,
    swissRounds: phase.swissRounds, knockoutBestOf: phase.knockoutBestOf,
    breakKind: phase.breakKind, breakMinutes: phase.breakMinutes,
  }));
  return estimateTournamentDurationMinutes(inputs, tournament.tables, settings);
}

export function createPrestartPhase(type: StageType, participants: number, next?: PrestartPhaseDraft): PrestartPhaseDraft {
  const entrants = Math.max(2, participants);
  const bestOf = type === 'KNOCKOUT' ? 5 : 1;
  return {
    id: `prestart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type, label: stageLabel(type), entrantCount: entrants, bestOf,
    groupCount: recommendGroupCount(entrants, next?.entrantCount),
    swissRounds: recommendedSwissRounds(entrants),
    knockoutBestOf: Array.from({ length: knockoutRoundLabels(entrants).length }, () => bestOf),
    breakKind: 'minutes', breakMinutes: 15, nextDayStart: '09:00', breakUntil: '12:00', note: '',
  };
}

export function hasStartedAnyStage(tournament: DemoTournament, startedIds: string[]): boolean {
  return Boolean(tournament.hasStarted || startedIds.length || !['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status));
}
