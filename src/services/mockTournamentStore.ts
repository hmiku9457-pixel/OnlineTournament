import { getPhaseLifecycle, resetPrestartPhaseLifecycle } from '@/services/mockPhaseLifecycle';
import { generatePlayerCodes, generateUniquePlayerCode } from '@/services/mockPlayerCodes';
import { recordMockAudit } from '@/services/mockAudit';
import { hasStartedAnyStage, validatePrestartPhases, estimatePrestartDuration, type PrestartPhaseDraft } from '@/domain/prestartPhasePlanning';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { isParticipantWithdrawn } from '@/services/mockWithdrawals';
import { reconcilePrestartDraws, clearPrestartTournamentDraws } from '@/services/mockDrawStore';
import type { VenueLayout } from '@/domain/venueLayout';
import { disciplineLabel, getSportLabel } from '@/domain/sports';
import { type DemoTournament } from '@/data/demoTournaments';
import type { Discipline, StageType, TournamentStage, TournamentStatus } from '@/domain/types';

const STORAGE_KEY = 'online-tournament:local-prototype-tournaments:v1';

export interface MockPhaseInput {
  type: StageType;
  label: string;
  bestOf: number;
  entrantCount: number;
  groupCount: number;
  swissRounds: number;
  knockoutBestOf: number[];
  breakKind?: 'minutes' | 'overnight';
  breakMinutes?: number;
  nextDayStart?: string;
  note?: string;
}

export interface CreateMockTournamentInput {
  name: string;
  sport: string;
  discipline: Discipline;
  tables: number;
  minimumMatches: number;
  participantNames: string[];
  phases: MockPhaseInput[];
  estimatedDurationMinutes: number;
  venueLayout?: VenueLayout;
  matchDurationMinutes?: number;
  venueTurnoverMinutes?: number;
}

function readLocalTournaments(): DemoTournament[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoTournament[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalTournaments(tournaments: DemoTournament[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
}

function durationLabel(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (hours === 0) return `ca. ${remainder}min`;
  if (remainder === 0) return `ca. ${hours}h`;
  return `ca. ${hours}h ${remainder}min`;
}

function phaseLabel(phases: MockPhaseInput[]) {
  return phases.map((phase) => phase.label).join(' → ');
}

function toStage(tournamentId: string, phase: MockPhaseInput, index: number, nextEntrants?: number): TournamentStage {
  const settings: Record<string, string | number | boolean> = { entrants: phase.entrantCount };
  if (phase.type === 'GROUPS') settings.groups = phase.groupCount;
  if (phase.type === 'BREAK') {
    settings.breakKind = phase.breakKind ?? 'minutes';
    settings.breakMinutes = phase.breakMinutes ?? 15;
    settings.nextDayStart = phase.nextDayStart ?? '09:00';
    settings.note = phase.note ?? '';
  }
  if (phase.type === 'SWISS') settings.rounds = phase.swissRounds;
  if (phase.type === 'KNOCKOUT') {
    settings.avoidPriorOpponents = true;
    settings.roundBestOf = phase.knockoutBestOf.join(',');
  }

  return {
    id: `${tournamentId}-phase-${index + 1}`,
    tournamentId,
    name: phase.label,
    type: phase.type,
    orderIndex: index,
    bestOf: phase.bestOf,
    settings,
    advancement: nextEntrants
      ? { type: 'top_n', value: nextEntrants }
      : { type: 'manual', value: 0 },
  };
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMockTournament(input: CreateMockTournamentInput): DemoTournament {
  const id = createId();
  const stages = input.phases.map((phase, index) => {
    const nextCompetition = input.phases.slice(index + 1).find((next) => next.type !== 'BREAK');
    return toStage(id, phase, index, nextCompetition?.entrantCount);
  });
  const tournament: DemoTournament = {
    id,
    name: input.name.trim(),
    subtitle: `${disciplineLabel(input.discipline)} · ${phaseLabel(input.phases)}`,
    status: 'READY',
    visibility: 'PRIVATE',
    sport: getSportLabel(input.sport),
    discipline: input.discipline,
    participants: input.participantNames.length,
    tables: input.tables,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: phaseLabel(input.phases),
    estimatedDuration: durationLabel(input.estimatedDurationMinutes),
    lastUpdate: 'gerade erstellt',
    stages,
    areas: [{ name: 'Standardbereich', tables: `1–${input.tables}`, preferred: 'Automatische Zuweisung', mode: 'offen' }],
    participantNames: input.participantNames,
    participantCodes: generatePlayerCodes(input.participantNames),
    isLocalPrototype: true,
    hasStarted: false,
    venueLayout: input.venueLayout,
    matchDurationMinutes: input.matchDurationMinutes ?? 15,
    venueTurnoverMinutes: input.venueTurnoverMinutes ?? 0,
  };

  const existing = readLocalTournaments();
  writeLocalTournaments([tournament, ...existing.filter((item) => item.id !== id)]);
  return tournament;
}

/** Reconfigure a local tournament only until its very first start.
 * Active participants are computed again at save-time to reject stale edits.
 * Draws and lifecycle snapshots are discarded, but registration/codes/withdrawals
 * and other tournaments are untouched.
 */
export function updatePrestartTournamentPhases(
  tournamentId: string,
  drafts: PrestartPhaseDraft[],
): { ok: boolean; error?: string; tournament?: DemoTournament } {
  const all = readLocalTournaments();
  const previous = all.find((item) => item.id === tournamentId);
  if (!previous) return { ok: false, error: 'Turnier nicht gefunden.' };
  if (hasStartedAnyStage(previous, getPhaseLifecycle(previous).startedStageIds)) {
    return { ok: false, error: 'Die Phasen lassen sich nur vor dem ersten Turnierstart ändern.' };
  }

  const active = getRuntimeParticipantNames(previous).filter((name) => !isParticipantWithdrawn(previous, name));
  const errors = validatePrestartPhases(drafts, active.length);
  if (errors.length) return { ok: false, error: errors[0] };

  const phases: MockPhaseInput[] = drafts.map((phase) => ({
    type: phase.type, label: phase.label.trim(), entrantCount: phase.entrantCount,
    groupCount: phase.groupCount, swissRounds: phase.swissRounds,
    bestOf: phase.bestOf, knockoutBestOf: [...phase.knockoutBestOf],
    breakKind: phase.breakKind, breakMinutes: phase.breakMinutes,
    nextDayStart: phase.nextDayStart, note: phase.note,
  }));
  const stages = phases.map((phase, index) => {
    const nextPlaying = phases.slice(index + 1).find((item) => item.type !== 'BREAK');
    return toStage(previous.id, phase, index, nextPlaying?.entrantCount);
  });
  const label = phaseLabel(phases);
  const updated: DemoTournament = {
    ...previous,
    stages,
    phasesLabel: label,
    subtitle: `${disciplineLabel(previous.discipline)} · ${label}`,
    estimatedDuration: durationLabel(estimatePrestartDuration(previous, drafts)),
    lastUpdate: 'gerade eben',
  };

  // A failed storage write must not invalidate a previously saved draw.
  try {
    writeLocalTournaments(all.map((item) => item.id === tournamentId ? updated : item));
    clearPrestartTournamentDraws(tournamentId);
    resetPrestartPhaseLifecycle(previous);
    recordMockAudit({
      tournamentId, actor: 'Turnierleitung (lokal)', action: 'PRESTART_PHASES_CHANGED',
      description: `Phasenplanung vor Turnierstart angepasst: ${active.length} aktive Teilnehmer; neue Auslosung erforderlich.`,
      before: previous.phasesLabel, after: label,
    });
    window.dispatchEvent(new CustomEvent('mock-runtime-change'));
    return { ok: true, tournament: updated };
  } catch {
    return { ok: false, error: 'Die Änderungen konnten im Browser nicht vollständig gespeichert werden. Bitte Seite neu laden und den Stand prüfen.' };
  }
}

export function getAllMockTournaments(): DemoTournament[] {
  return readLocalTournaments();
}

export function getMockTournament(tournamentId?: string): DemoTournament {
  const local = readLocalTournaments().find((item) => item.id === tournamentId);
  if (local) return local;
  const firstLocal = readLocalTournaments()[0];
  if (firstLocal) return firstLocal;
  return {
    id: tournamentId ?? 'local-empty',
    name: 'Noch kein Turnier erstellt',
    subtitle: 'Erstelle zuerst ein lokales Testturnier.',
    status: 'DRAFT',
    visibility: 'PRIVATE',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 0,
    tables: 1,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Keine Phasen',
    estimatedDuration: '–',
    lastUpdate: '–',
    stages: [],
    areas: [{ name: 'Standardbereich', tables: '1', preferred: '–', mode: 'offen' }],
    participantNames: [],
    isLocalPrototype: true,
    hasStarted: false,
  };
}

export function updateMockTournamentStatus(tournamentId: string, status: TournamentStatus): DemoTournament {
  const local = readLocalTournaments();
  const localTournament = local.find((item) => item.id === tournamentId);
  if (localTournament) {
    if (localTournament.status === 'ABORTED' && status !== 'ABORTED') return localTournament;
    const updated = {
      ...localTournament,
      status,
      hasStarted: localTournament.hasStarted || status === 'RUNNING',
      lastUpdate: 'gerade eben',
    };
    writeLocalTournaments(local.map((item) => item.id === tournamentId ? updated : item));
    if (localTournament.status !== status && (status === 'PAUSED' || (status === 'RUNNING' && localTournament.status === 'PAUSED'))) {
      recordMockAudit({ tournamentId, actor: 'Turnierleitung (lokal)', action: status === 'PAUSED' ? 'TOURNAMENT_PAUSED' : 'TOURNAMENT_RESUMED', description: status === 'PAUSED' ? 'Turnier pausiert – neue Zuweisungen gesperrt' : 'Turnier fortgesetzt', before: localTournament.status, after: status });
    }
    return updated;
  }

  const demo = getMockTournament(tournamentId);
  return { ...demo, status, lastUpdate: 'gerade eben' };
}

export function updateMockParticipantName(tournamentId: string, oldName: string, firstName: string, lastName: string, code: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  const tournaments = readLocalTournaments();
  const tournament = tournaments.find((item) => item.id === tournamentId);
  if (!tournament || !tournament.participantNames?.includes(oldName)) return false;
  const teamMode = tournament.discipline === 'TEAMS';
  const name = teamMode ? first : `${first} ${last}`;
  if (!first || (!teamMode && !last) || !/^\d{4,8}$/.test(code.trim())) return false;
  if (name !== oldName && tournament.participantNames.includes(name)) return false;
  // Ein Spielercode darf immer nur einem Teilnehmer des Turniers gehören.
  if (Object.entries(tournament.participantCodes ?? {}).some(([participant, existingCode]) =>
    participant !== oldName && existingCode === code.trim())) return false;

  // Für den lokalen Prototypen verwenden die Auslosungsdaten Namen als IDs.
  // Deshalb müssen bei Umbenennung auch die bereits gespeicherten Referenzen
  // in den Phasenzuordnungen und Schweizer Runden konsistent bleiben.
  if (name !== oldName) {
    const configKeys = ['online-tournament:mock-draw-config:v1', 'online-tournament:mock-phase-lifecycle:v1', 'online-tournament:swiss-round-fixtures:v1'];
    const renameValue = (value: unknown): unknown => {
      if (typeof value === 'string') return value === oldName ? name : value;
      if (Array.isArray(value)) return value.map(renameValue);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === oldName ? name : key, renameValue(item)]));
      }
      return value;
    };
    configKeys.forEach((key) => {
      try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
        if (!Array.isArray(parsed)) return;
        const renamed = parsed.map((entry: { tournamentId?: string }) => entry.tournamentId === tournamentId ? renameValue(entry) : entry);
        window.localStorage.setItem(key, JSON.stringify(renamed));
      } catch { /* Alte, fehlerhafte Testdaten nicht übernehmen. */ }
    });
  }

  if (name !== oldName) {
    try {
      const withdrawn = JSON.parse(window.localStorage.getItem('online-tournament:withdrawn-participants:v1') ?? '{}') as Record<string, string[]>;
      if (withdrawn[tournamentId]) {
        withdrawn[tournamentId] = withdrawn[tournamentId].map((entry) => entry === oldName ? name : entry);
        window.localStorage.setItem('online-tournament:withdrawn-participants:v1', JSON.stringify(withdrawn));
      }
    } catch { /* Keine gespeicherten Rückzüge vorhanden. */ }
  }
  if (name !== oldName) {
    try {
      const timingKey = 'online-tournament:withdrawal-timing:v1';
      const timings = JSON.parse(window.localStorage.getItem(timingKey) ?? '{}') as Record<string, Record<string, unknown>>;
      if (timings[tournamentId]?.[oldName]) {
        timings[tournamentId][name] = timings[tournamentId][oldName];
        delete timings[tournamentId][oldName];
        window.localStorage.setItem(timingKey, JSON.stringify(timings));
      }
    } catch { /* No recorded withdrawal timing. */ }
  }
  if (name !== oldName) {
    try {
      const key = 'online-tournament:withdrawal-restore:v1';
      const records = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>>;
      const current = records[tournamentId];
      if (current?.[oldName]) {
        current[name] = current[oldName];
        delete current[oldName];
        window.localStorage.setItem(key, JSON.stringify(records));
      }
    } catch { /* Ignore broken legacy mock data. */ }
  }
  const oldCodes = tournament.participantCodes ?? {};
  const { [oldName]: _oldCode, ...restCodes } = oldCodes;
  void _oldCode;
  const updated: DemoTournament = {
    ...tournament,
    participantNames: tournament.participantNames.map((entry) => entry === oldName ? name : entry),
    participantCodes: { ...restCodes, [name]: code.trim() },
  };
  writeLocalTournaments(tournaments.map((entry) => entry.id === tournamentId ? updated : entry));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return true;
}

/** Local prototype: registration closes permanently with the first tournament start. */
export function addMockParticipant(
  tournamentId: string,
  firstName: string,
  lastName: string,
  partnerFirstName = '',
  partnerLastName = '',
): { ok: boolean; error?: string } {
  const tournaments = readLocalTournaments();
  const tournament = tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return { ok: false, error: 'Turnier nicht gefunden.' };
  if (tournament.hasStarted || getPhaseLifecycle(tournament).startedStageIds.length > 0
    || !['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status)) {
    return { ok: false, error: 'Nachmeldungen sind nur vor dem ersten Turnierstart möglich.' };
  }
  const first = firstName.trim();
  const last = lastName.trim();
  const teamMode = tournament.discipline === 'TEAMS';
  if (!first || (!teamMode && !last)) return {
    ok: false, error: teamMode ? 'Ein Mannschaftsname ist erforderlich.' : 'Vorname und Nachname sind erforderlich.',
  };
  const person = teamMode ? first : `${first} ${last}`;
  let displayName = person;
  if (tournament.discipline === 'DOUBLES') {
    const partnerFirst = partnerFirstName.trim();
    const partnerLast = partnerLastName.trim();
    if (!partnerFirst || !partnerLast) return { ok: false, error: 'Für Doppel werden beide vollständigen Namen benötigt.' };
    const partner = `${partnerFirst} ${partnerLast}`;
    const normalize = (text: string) => text.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
    if (normalize(person) === normalize(partner)) return { ok: false, error: 'Ein Spieler kann nicht sein eigener Doppelpartner sein.' };
    const registered = new Set((tournament.participantNames ?? []).flatMap((pair) => pair.split(/\s+\/\s+/)).map(normalize));
    if (registered.has(normalize(person)) || registered.has(normalize(partner))) {
      return { ok: false, error: 'Einer der beiden Spieler ist bereits angemeldet.' };
    }
    displayName = `${person} / ${partner}`;
  } else if ((tournament.participantNames ?? []).some((name) =>
    name.toLocaleLowerCase('de') === person.toLocaleLowerCase('de'))) {
    return { ok: false, error: teamMode ? 'Diese Mannschaft ist bereits angemeldet.' : 'Dieser Spieler ist bereits angemeldet.' };
  }

  const occupied = new Set(Object.values(tournament.participantCodes ?? {}));
  const code = generateUniquePlayerCode(occupied);
  const updated: DemoTournament = {
    ...tournament,
    participantNames: [...(tournament.participantNames ?? []), displayName],
    participantCodes: { ...(tournament.participantCodes ?? {}), [displayName]: code },
    participants: (tournament.participantNames ?? []).length + 1,
    lastUpdate: 'gerade eben',
  };
  writeLocalTournaments(tournaments.map((entry) => entry.id === tournamentId ? updated : entry));
  reconcilePrestartDraws(updated);
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return { ok: true };
}

export function removeLocalPrototypeTournaments() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem('online-tournament:mock-audit:v1');
  window.localStorage.removeItem('online-tournament:mock-match-results:v2');
  window.localStorage.removeItem('online-tournament:mock-match-runtime:v1');
  window.localStorage.removeItem('online-tournament:mock-blocked-tables:v1');
  window.localStorage.removeItem('online-tournament:mock-draw-config:v1');
  window.localStorage.removeItem('online-tournament:mock-phase-lifecycle:v1');
  window.localStorage.removeItem('online-tournament:withdrawn-participants:v1');
  window.localStorage.removeItem('online-tournament:withdrawal-restore:v1');
  window.localStorage.removeItem('online-tournament:withdrawal-timing:v1');
  window.localStorage.removeItem('online-tournament:swiss-round-fixtures:v1');
  window.localStorage.removeItem('online-tournament:swiss-cutoff-decisions:v1');
  window.localStorage.removeItem('online-tournament:swiss-extra-rounds:v1');
  window.localStorage.removeItem('online-tournament:swiss-round-robin-history:v1');
}

export function countActiveMockTournaments() {
  return getAllMockTournaments().filter((item) => ['REGISTRATION', 'READY', 'RUNNING', 'PAUSED'].includes(item.status)).length;
}
