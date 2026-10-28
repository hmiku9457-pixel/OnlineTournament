export type UUID = string;

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'ABORTED'
  | 'FINISHED'
  | 'ARCHIVED';

export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
export type Discipline = 'SINGLES' | 'DOUBLES' | 'TEAMS';
export type ParticipantStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED' | 'FINISHED';
export type StageType = 'ROUND_ROBIN' | 'GROUPS' | 'SWISS' | 'KNOCKOUT' | 'DOUBLE_ELIMINATION' | 'PLACEMENT';
export type MatchStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CONFIRMED' | 'WALKOVER' | 'CANCELLED';

export interface Tournament {
  id: UUID;
  name: string;
  sport: string;
  discipline: Discipline;
  status: TournamentStatus;
  visibility: Visibility;
  ownerId: UUID;
  bestOf: number;
  pointsToWinSet: number;
  winBy: number;
}

export interface Person {
  id: UUID;
  tournamentId: UUID;
  firstName: string;
  lastName: string;
  status: ParticipantStatus;
  club?: string;
  rating?: number;
  birthYear?: number;
}

export interface Participant {
  id: UUID;
  tournamentId: UUID;
  discipline: Discipline;
  displayName: string;
  memberPersonIds: UUID[];
  seed?: number;
  status: ParticipantStatus;
}

export interface StageAdvancement {
  type: 'top_n' | 'percentage' | 'manual';
  value: number;
}

export interface TournamentStage {
  id: UUID;
  tournamentId: UUID;
  name: string;
  type: StageType;
  orderIndex: number;
  bestOf: number;
  settings: Record<string, string | number | boolean>;
  advancement: StageAdvancement;
}

export interface MatchSet {
  number: number;
  sideAScore: number;
  sideBScore: number;
}

export interface Match {
  id: UUID;
  tournamentId: UUID;
  stageId: UUID;
  roundNumber: number;
  sideAId?: UUID;
  sideBId?: UUID;
  winnerSideId?: UUID;
  status: MatchStatus;
  bestOf: number;
  sets: MatchSet[];
  tableId?: UUID;
  finishedAt?: string;
}

export interface StandingRow {
  participantId: UUID;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDifference: number;
  buchholz: number;
}

export interface PriorMeeting {
  a: UUID;
  b: UUID;
}

export interface TableResource {
  id: UUID;
  areaId: UUID;
  label: string;
  active: boolean;
}
