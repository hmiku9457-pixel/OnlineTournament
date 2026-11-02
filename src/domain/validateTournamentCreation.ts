import { isAllowedParticipantName, participantNameKey } from '@/domain/participantNames';
import { disciplineOptionsForSport } from '@/domain/sports';
import { hasValidBreakStageOrder, hasValidTerminalStageOrder, isValidSwissRoundCount, knockoutRoundLabels } from '@/domain/tournamentCreation';
import { validatePlannedSchedule, type PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { validateVenueLayout, type VenueLayout } from '@/domain/venueLayout';
import type { Discipline, StageType } from '@/domain/types';

/** Shared creation rules: the wizard and the final write must agree. */
export interface CreationValidationPhase {
  type: StageType;
  label: string;
  entrantCount: number;
  groupCount: number;
  swissRounds: number;
  bestOf: number;
  knockoutBestOf: number[];
  breakKind?: 'minutes' | 'until' | 'overnight';
  breakMinutes?: number;
  nextDayStart?: string;
  nextDayDate?: string;
  breakUntil?: string;
  note?: string;
  inlineBreakAfterRound?: number;
  inlineBreakKind?: 'minutes' | 'until';
  inlineBreakMinutes?: number;
  inlineBreakUntil?: string;
}
export interface CreationValidationInput {
  name: string;
  sport: string;
  discipline: Discipline;
  tables: number;
  minimumMatches: number;
  participantNames: readonly string[];
  phases: readonly CreationValidationPhase[];
  plannedSchedule?: PlannedScheduleItem[];
  venueLayout?: VenueLayout;
  matchDurationMinutes?: number;
  venueTurnoverMinutes?: number;
}

/** Validate tournament semantics, including constraints that UI components
 * normally enforce. No old format support or migration is involved. */
export function validateTournamentCreation(input: CreationValidationInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim() || input.name.trim().length > 120) errors.push('Der Turniername muss 1 bis 120 Zeichen lang sein.');
  if (!disciplineOptionsForSport(input.sport).some((option) => option.value === input.discipline)) {
    errors.push('Ungültige Sportart oder Wettbewerbsart.');
  }
  if (!Number.isSafeInteger(input.tables) || input.tables < 1 || input.tables > 9999) errors.push('Ungültige Spielflächenanzahl.');
  if (!Number.isSafeInteger(input.minimumMatches) || input.minimumMatches < 1 || input.minimumMatches > 100) errors.push('Ungültige Mindestspielzahl.');
  const names = new Set<string>();
  if (input.participantNames.length < 2 || input.participantNames.length > 10000) errors.push('Es müssen 2 bis 10.000 Teilnehmer vorhanden sein.');
  for (const name of input.participantNames) {
    const key = participantNameKey(name);
    if (!key || names.has(key)) {
      errors.push('Teilnehmernamen dürfen nicht leer oder doppelt vorhanden sein.');
      break;
    }
    names.add(key);
  }
  if (input.venueLayout) errors.push(...validateVenueLayout(input.venueLayout, input.tables));
  if (input.matchDurationMinutes !== undefined && (!Number.isInteger(input.matchDurationMinutes)
    || input.matchDurationMinutes < 1 || input.matchDurationMinutes > 1440)) errors.push('Ungültige Spieldauer.');
  if (input.venueTurnoverMinutes !== undefined && (!Number.isInteger(input.venueTurnoverMinutes)
    || input.venueTurnoverMinutes < 0 || input.venueTurnoverMinutes > 240)) errors.push('Ungültiger Spielflächenwechselpuffer.');
  if (!input.phases.some((phase) => phase.type !== 'BREAK')) errors.push('Mindestens eine Spielphase ist erforderlich.');
  if (input.phases.length > 80) errors.push('Es dürfen höchstens 80 Phasen angelegt werden.');
  if (!hasValidTerminalStageOrder(input.phases.map((phase) => phase.type))) errors.push('K.-o. muss die letzte Phase sein.');
  if (!hasValidBreakStageOrder(input.phases.map((phase) => phase.type))) errors.push('Pausen dürfen nur zwischen Spielphasen liegen.');
  let available = input.participantNames.length;
  let firstPlaying = true;
  input.phases.forEach((phase, index) => {
    const prefix = `Phase ${index + 1}`;
    if (!phase.label.trim() || phase.label.length > 80) errors.push(`${prefix}: Ungültiger Phasenname.`);
    if (phase.type === 'BREAK') {
      if (phase.entrantCount !== available) errors.push(`${prefix}: Eine Pause darf die Teilnehmerzahl nicht verändern.`);
      if ((phase.note?.length ?? 0) > 600) errors.push(`${prefix}: Hinweistext zu lang.`);
      if (phase.breakKind === 'minutes' && (!Number.isInteger(phase.breakMinutes) || (phase.breakMinutes ?? 0) < 1 || (phase.breakMinutes ?? 0) > 1440))
        errors.push(`${prefix}: Ungültige Pausendauer.`);
      if (phase.breakKind === 'until' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.breakUntil ?? '')) errors.push(`${prefix}: Ungültige Pausenuhrzeit.`);
      if (phase.breakKind === 'overnight' && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.nextDayStart ?? '')
        || (phase.nextDayDate && !/^\d{4}-\d{2}-\d{2}$/.test(phase.nextDayDate)))) errors.push(`${prefix}: Ungültige Fortsetzung.`);
      if (!['minutes', 'until', 'overnight'].includes(phase.breakKind ?? '')) errors.push(`${prefix}: Unbekannte Unterbrechungsart.`);
      return;
    }
    if (!Number.isSafeInteger(phase.entrantCount) || phase.entrantCount < 2 || phase.entrantCount > available
      || (firstPlaying && phase.entrantCount !== available)) errors.push(`${prefix}: Ungültige Teilnehmerzahl.`);
    firstPlaying = false;
    available = phase.entrantCount;
    if (phase.type === 'GROUPS' && (!Number.isSafeInteger(phase.groupCount)
      || phase.groupCount < 2 || phase.groupCount > Math.floor(phase.entrantCount / 2))) errors.push(`${prefix}: Ungültige Gruppenanzahl.`);
    if (phase.type === 'SWISS' && !isValidSwissRoundCount(phase.swissRounds, phase.entrantCount)) errors.push(`${prefix}: Ungültige Schweizer Rundenanzahl.`);
    if (!Number.isInteger(phase.bestOf) || phase.bestOf < 1 || phase.bestOf % 2 === 0) errors.push(`${prefix}: Ungültiges Best-of.`);
    if (phase.type === 'KNOCKOUT' && (!Array.isArray(phase.knockoutBestOf)
      || phase.knockoutBestOf.length !== knockoutRoundLabels(phase.entrantCount).length
      || phase.knockoutBestOf.some((best) => !Number.isInteger(best) || best < 1 || best % 2 === 0))) errors.push(`${prefix}: Ungültiges K.-o.-Best-of.`);
    if ((phase.type === 'SWISS' || phase.type === 'KNOCKOUT') && (phase.inlineBreakAfterRound ?? 0) > 0) {
      const rounds = phase.type === 'SWISS' ? phase.swissRounds : knockoutRoundLabels(phase.entrantCount).length;
      if (!Number.isInteger(phase.inlineBreakAfterRound) || (phase.inlineBreakAfterRound ?? 0) >= rounds)
        errors.push(`${prefix}: Ungültige Position der Zwischenpause.`);
      if (phase.inlineBreakKind === 'minutes' && (!Number.isInteger(phase.inlineBreakMinutes)
        || (phase.inlineBreakMinutes ?? 0) < 1 || (phase.inlineBreakMinutes ?? 0) > 1440))
        errors.push(`${prefix}: Ungültige Zwischenpausendauer.`);
      if (phase.inlineBreakKind === 'until' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(phase.inlineBreakUntil ?? ''))
        errors.push(`${prefix}: Ungültige Zwischenpausenuhrzeit.`);
    }
  });
  errors.push(...validatePlannedSchedule(input.plannedSchedule ?? []));
  return errors;
}
