import type { Discipline, TournamentStage, TournamentStatus, Visibility } from '@/domain/types';

export interface DemoArea {
  name: string;
  tables: string;
  preferred: string;
  mode: string;
}

export interface DemoTournament {
  id: string;
  name: string;
  subtitle: string;
  status: TournamentStatus;
  visibility: Visibility;
  sport: string;
  discipline: Discipline;
  participants: number;
  tables: number;
  activeTables: number;
  runningMatches: number;
  openConfirmations: number;
  phasesLabel: string;
  estimatedDuration: string;
  lastUpdate: string;
  stages: TournamentStage[];
  areas: DemoArea[];
}

const demoOwner = 'demo-owner';

function stage(
  tournamentId: string,
  id: string,
  name: string,
  type: TournamentStage['type'],
  orderIndex: number,
  bestOf: number,
  settings: TournamentStage['settings'],
  advancement: TournamentStage['advancement'],
): TournamentStage {
  return { id, tournamentId, name, type, orderIndex, bestOf, settings, advancement };
}

export const demoTournaments: DemoTournament[] = [
  {
    id: 'vm-2027',
    name: 'Vereinsmeisterschaft 2027',
    subtitle: 'Einzel · Gruppenphase → K.-o.',
    status: 'RUNNING',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 24,
    tables: 8,
    activeTables: 6,
    runningMatches: 6,
    openConfirmations: 2,
    phasesLabel: 'Gruppen → K.-o.',
    estimatedDuration: 'ca. 6h 10min',
    lastUpdate: 'vor 2 Minuten',
    stages: [
      stage('vm-2027', 'vm-2027-groups', 'Gruppenphase', 'GROUPS', 0, 1, { groups: 4, groupSize: 6 }, { type: 'top_n', value: 8 }),
      stage('vm-2027', 'vm-2027-ko', 'K.-o.-Phase', 'KNOCKOUT', 1, 5, { entrants: 8, byes: 0, avoidPriorOpponents: true }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Hauptfeld', tables: '1–4', preferred: 'Gruppe A, B', mode: 'bevorzugt' },
      { name: 'Nebenfeld', tables: '5–8', preferred: 'Gruppe C, D', mode: 'bevorzugt' },
    ],
  },
  {
    id: 'herbstcup-swiss',
    name: 'Herbstcup',
    subtitle: 'Einzel · Schweizer System → K.-o.',
    status: 'RUNNING',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 32,
    tables: 10,
    activeTables: 8,
    runningMatches: 8,
    openConfirmations: 4,
    phasesLabel: 'Schweizer System → K.-o.',
    estimatedDuration: 'ca. 7h 00min',
    lastUpdate: 'gerade eben',
    stages: [
      stage('herbstcup-swiss', 'herbstcup-swiss-swiss', 'Schweizer System', 'SWISS', 0, 3, { rounds: 5 }, { type: 'top_n', value: 8 }),
      stage('herbstcup-swiss', 'herbstcup-swiss-ko', 'Finalrunde', 'KNOCKOUT', 1, 5, { entrants: 8, byes: 0, avoidPriorOpponents: true }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Center Court', tables: '1–2', preferred: 'Top-Matches', mode: 'bevorzugt' },
      { name: 'Feld A', tables: '3–6', preferred: 'Swiss Runden', mode: 'offen' },
      { name: 'Feld B', tables: '7–10', preferred: 'Swiss Runden', mode: 'offen' },
    ],
  },
  {
    id: 'fruehjahr-roundrobin',
    name: 'Frühjahrsrangliste',
    subtitle: 'Einzel · Jeder gegen jeden',
    status: 'READY',
    visibility: 'UNLISTED',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 8,
    tables: 4,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Jeder gegen jeden',
    estimatedDuration: 'ca. 3h 30min',
    lastUpdate: 'vor 11 Minuten',
    stages: [
      stage('fruehjahr-roundrobin', 'fruehjahr-roundrobin-rr', 'Jeder gegen jeden', 'ROUND_ROBIN', 0, 3, { entrants: 8 }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Halle', tables: '1–4', preferred: 'Alle Spiele', mode: 'offen' },
    ],
  },
  {
    id: 'stadtpokal-ko',
    name: 'Stadtpokal',
    subtitle: 'Einzel · K.-o.-Baum mit Freilosen',
    status: 'RUNNING',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 12,
    tables: 6,
    activeTables: 4,
    runningMatches: 4,
    openConfirmations: 1,
    phasesLabel: 'K.-o.',
    estimatedDuration: 'ca. 3h 45min',
    lastUpdate: 'vor 5 Minuten',
    stages: [
      stage('stadtpokal-ko', 'stadtpokal-ko-stage', 'K.-o.-Hauptfeld', 'KNOCKOUT', 0, 5, { entrants: 12, byes: 4, avoidPriorOpponents: false }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Show Court', tables: '1', preferred: 'Halbfinale & Finale', mode: 'nur diese Tische' },
      { name: 'Vorrunde', tables: '2–6', preferred: 'Erste Runde', mode: 'offen' },
    ],
  },
  {
    id: 'doppel-night',
    name: 'Doppel Night Cup',
    subtitle: 'Doppel · Schweizer System → K.-o.',
    status: 'RUNNING',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'DOUBLES',
    participants: 16,
    tables: 6,
    activeTables: 5,
    runningMatches: 5,
    openConfirmations: 3,
    phasesLabel: 'Schweizer System → K.-o.',
    estimatedDuration: 'ca. 4h 20min',
    lastUpdate: 'vor 4 Minuten',
    stages: [
      stage('doppel-night', 'doppel-night-swiss', 'Schweizer System', 'SWISS', 0, 1, { rounds: 4 }, { type: 'top_n', value: 4 }),
      stage('doppel-night', 'doppel-night-ko', 'Final Four', 'KNOCKOUT', 1, 3, { entrants: 4, byes: 0, avoidPriorOpponents: true }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Block A', tables: '1–3', preferred: 'Swiss Runde', mode: 'offen' },
      { name: 'Block B', tables: '4–6', preferred: 'Swiss Runde', mode: 'offen' },
    ],
  },
  {
    id: 'jugend-open',
    name: 'Jugend Open U19',
    subtitle: 'Einzel · Gruppenphase → Platzierung',
    status: 'PAUSED',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 20,
    tables: 8,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Gruppen → Platzierung',
    estimatedDuration: 'ca. 5h 25min',
    lastUpdate: 'Pause seit 18 Minuten',
    stages: [
      stage('jugend-open', 'jugend-open-groups', 'Gruppenphase', 'GROUPS', 0, 1, { groups: 5, groupSize: 4 }, { type: 'top_n', value: 8 }),
      stage('jugend-open', 'jugend-open-placement', 'Platzierungsspiele', 'PLACEMENT', 1, 3, { entrants: 8, places: '1–8' }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Jugendfeld 1', tables: '1–4', preferred: 'Gruppen A–C', mode: 'bevorzugt' },
      { name: 'Jugendfeld 2', tables: '5–8', preferred: 'Gruppen D–E', mode: 'bevorzugt' },
    ],
  },
  {
    id: 'saisonstart-de',
    name: 'Saisonstart Masters',
    subtitle: 'Einzel · Doppel-K.-o.',
    status: 'READY',
    visibility: 'PRIVATE',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 8,
    tables: 4,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Doppel-K.-o.',
    estimatedDuration: 'ca. 4h 40min',
    lastUpdate: 'vor 27 Minuten',
    stages: [
      stage('saisonstart-de', 'saisonstart-de-main', 'Doppel-K.-o.-Baum', 'DOUBLE_ELIMINATION', 0, 5, { entrants: 8 }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Arena', tables: '1–4', preferred: 'Gewinner- und Verliererbaum', mode: 'offen' },
    ],
  },
  {
    id: 'clubcup-gs',
    name: 'Club Cup Series',
    subtitle: 'Einzel · Gruppenphase → Schweizer System',
    status: 'REGISTRATION',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 18,
    tables: 6,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Gruppen → Schweizer System',
    estimatedDuration: 'ca. 5h 50min',
    lastUpdate: 'Anmeldung offen',
    stages: [
      stage('clubcup-gs', 'clubcup-gs-groups', 'Seeding Gruppen', 'GROUPS', 0, 1, { groups: 3, groupSize: 6 }, { type: 'top_n', value: 12 }),
      stage('clubcup-gs', 'clubcup-gs-swiss', 'Hauptrunde', 'SWISS', 1, 3, { rounds: 4 }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Block A', tables: '1–3', preferred: 'Gruppen', mode: 'bevorzugt' },
      { name: 'Block B', tables: '4–6', preferred: 'Swiss Runde', mode: 'offen' },
    ],
  },
  {
    id: 'afterwork-ko',
    name: 'After Work Blitz',
    subtitle: 'Einzel · K.-o. Kurzformat',
    status: 'RUNNING',
    visibility: 'UNLISTED',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 16,
    tables: 8,
    activeTables: 8,
    runningMatches: 8,
    openConfirmations: 5,
    phasesLabel: 'K.-o.',
    estimatedDuration: 'ca. 2h 10min',
    lastUpdate: 'vor 1 Minute',
    stages: [
      stage('afterwork-ko', 'afterwork-ko-stage', 'K.-o.-Phase', 'KNOCKOUT', 0, 3, { entrants: 16, byes: 0, avoidPriorOpponents: false }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Schnellturnier', tables: '1–8', preferred: 'Alle Matches', mode: 'offen' },
    ],
  },
  {
    id: 'winter-series',
    name: 'Winter Series #3',
    subtitle: 'Einzel · Schweizer System',
    status: 'RUNNING',
    visibility: 'PUBLIC',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 22,
    tables: 7,
    activeTables: 7,
    runningMatches: 7,
    openConfirmations: 2,
    phasesLabel: 'Schweizer System',
    estimatedDuration: 'ca. 5h 10min',
    lastUpdate: 'vor 3 Minuten',
    stages: [
      stage('winter-series', 'winter-series-swiss', 'Schweizer System', 'SWISS', 0, 3, { rounds: 5 }, { type: 'manual', value: 0 }),
    ],
    areas: [
      { name: 'Block 1', tables: '1–4', preferred: 'Runde 1–5', mode: 'offen' },
      { name: 'Block 2', tables: '5–7', preferred: 'Runde 1–5', mode: 'offen' },
    ],
  },
];

export function getDemoTournament(tournamentId?: string) {
  return demoTournaments.find((item) => item.id === tournamentId) ?? demoTournaments[0];
}

export function countActiveTournaments() {
  return demoTournaments.filter((item) => ['REGISTRATION', 'READY', 'RUNNING', 'PAUSED'].includes(item.status)).length;
}
