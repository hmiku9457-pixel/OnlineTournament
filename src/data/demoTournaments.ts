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
  participantNames?: string[];
  participantCodes?: Record<string, string>;
  isLocalPrototype?: boolean;
  hasStarted?: boolean;
}

// Statische Testturniere wurden bewusst entfernt. Der UI-Prototyp arbeitet ab jetzt
// ausschließlich mit Turnieren, die lokal über den Erstellungs-Wizard angelegt werden.
export const demoTournaments: DemoTournament[] = [];

export function findDemoTournament() {
  return undefined;
}
