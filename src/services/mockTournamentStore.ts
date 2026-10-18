import type { VenueLayout } from '@/domain/venueLayout';
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
  const stages = input.phases.map((phase, index) => toStage(id, phase, index, input.phases[index + 1]?.entrantCount));
  const tournament: DemoTournament = {
    id,
    name: input.name.trim(),
    subtitle: `${input.discipline === 'DOUBLES' ? 'Doppel' : 'Einzel'} · ${phaseLabel(input.phases)}`,
    status: 'READY',
    visibility: 'PRIVATE',
    sport: input.sport === 'table_tennis' ? 'Tischtennis' : input.sport,
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
    isLocalPrototype: true,
    hasStarted: false,
    venueLayout: input.venueLayout,
  };

  const existing = readLocalTournaments();
  writeLocalTournaments([tournament, ...existing.filter((item) => item.id !== id)]);
  return tournament;
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
    const updated = {
      ...localTournament,
      status,
      hasStarted: localTournament.hasStarted || status === 'RUNNING',
      lastUpdate: 'gerade eben',
    };
    writeLocalTournaments(local.map((item) => item.id === tournamentId ? updated : item));
    return updated;
  }

  const demo = getMockTournament(tournamentId);
  return { ...demo, status, lastUpdate: 'gerade eben' };
}

export function updateMockParticipantName(tournamentId: string, oldName: string, firstName: string, lastName: string, code: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  const name = `${first} ${last}`;
  if (!first || !last || !/^\d{4,8}$/.test(code.trim())) return false;
  const tournaments = readLocalTournaments();
  const tournament = tournaments.find((item) => item.id === tournamentId);
  if (!tournament || !tournament.participantNames?.includes(oldName)) return false;
  if (name !== oldName && tournament.participantNames.includes(name)) return false;

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

export function removeLocalPrototypeTournaments() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem('online-tournament:mock-match-results:v2');
  window.localStorage.removeItem('online-tournament:mock-match-runtime:v1');
  window.localStorage.removeItem('online-tournament:mock-blocked-tables:v1');
  window.localStorage.removeItem('online-tournament:mock-draw-config:v1');
  window.localStorage.removeItem('online-tournament:mock-phase-lifecycle:v1');
  window.localStorage.removeItem('online-tournament:withdrawn-participants:v1');
  window.localStorage.removeItem('online-tournament:swiss-round-fixtures:v1');
}

export function countActiveMockTournaments() {
  return getAllMockTournaments().filter((item) => ['REGISTRATION', 'READY', 'RUNNING', 'PAUSED'].includes(item.status)).length;
}
