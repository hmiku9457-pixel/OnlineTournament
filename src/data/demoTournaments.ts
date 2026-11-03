import type { VenueLayout } from '@/domain/venueLayout';
import type { PlannedScheduleItem } from '@/domain/tournamentSchedule';
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
  /** Stable identity assigned on registration; only keys (visible names) change. */
  participantIds?: Record<string, string>;
  participantCodes?: Record<string, string>;
  isLocalPrototype?: boolean;
  hasStarted?: boolean;
  venueLayout?: VenueLayout;
  matchDurationMinutes?: number;
  venueTurnoverMinutes?: number;
  /** Planning target carried into later pre-start changes. */
  minimumMatches?: number;
  tournamentMode?: 'single' | 'multi';
  plannedDays?: number;
  /** Planned timestamps use this IANA zone, independent of the director's browser. */
  timeZone?: 'Europe/Berlin';
  /** Local wall-clock date/time, YYYY-MM-DDTHH:mm (not a UTC instant). */
  scheduledStart?: string;
  /** Optional, non-binding public itinerary; never controls stage starts. */
  plannedSchedule?: PlannedScheduleItem[];
}

// Statische Testturniere wurden bewusst entfernt. Der UI-Prototyp arbeitet ab jetzt
// ausschließlich mit Turnieren, die lokal über den Erstellungs-Wizard angelegt werden.
export const demoTournaments: DemoTournament[] = [];

export function findDemoTournament() {
  return undefined;
}
