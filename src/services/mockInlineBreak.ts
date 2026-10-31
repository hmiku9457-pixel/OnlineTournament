import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { computeBreakResumeAt, isStageStarted, isSwissRoundApproved, type BreakStartOptions } from '@/services/mockPhaseLifecycle';

const STORAGE_KEY = 'online-tournament:mock-inline-breaks:v1';

interface InlineBreakRecord {
  tournamentId: string;
  stageId: string;
  startedAt?: string;
  resumeAt?: string;
  finishedAt?: string;
}

export interface InlineBreakMatch {
  id: string;
  status: string;
}

export interface InlineBreakConfiguration {
  afterRound: number;
  kind: 'minutes' | 'until';
  minutes: number;
  until: string;
}

function readAll(): InlineBreakRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function save(record: InlineBreakRecord) {
  if (typeof window === 'undefined') return;
  const entries = readAll();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...entries.filter((entry) =>
    !(entry.tournamentId === record.tournamentId && entry.stageId === record.stageId))]));
  window.dispatchEvent(new CustomEvent('mock-phase-change'));
}

export function getInlineBreakConfig(stage: TournamentStage): InlineBreakConfiguration | null {
  if (stage.type !== 'SWISS' && stage.type !== 'KNOCKOUT') return null;
  const afterRound = Number(stage.settings.inlineBreakAfterRound) || 0;
  const rounds = stage.type === 'SWISS'
    ? Math.max(1, Number(stage.settings.rounds) || 1)
    : Math.ceil(Math.log2(Math.max(2, Number(stage.settings.entrants) || 2)));
  if (!Number.isInteger(afterRound) || afterRound < 1 || afterRound >= rounds) return null;
  return {
    afterRound,
    kind: stage.settings.inlineBreakKind === 'minutes' ? 'minutes' : 'until',
    minutes: Math.max(1, Number(stage.settings.inlineBreakMinutes) || 15),
    until: String(stage.settings.inlineBreakUntil ?? '13:00'),
  };
}

export function isInlineBreakReleased(tournament: DemoTournament, stage: TournamentStage): boolean {
  return Boolean(readAll().find((item) => item.tournamentId === tournament.id && item.stageId === stage.id)?.finishedAt);
}

export type InlineBreakState = 'upcoming' | 'ready' | 'running' | 'completed';
export interface InlineBreakStatus {
  state: InlineBreakState;
  config: InlineBreakConfiguration;
  resumeAt: Date | null;
}

/** KO readiness requires ALL matches of the specified bracket round to finish;
 * Swiss readiness follows the tournament-director's round approval. */
export function getInlineBreakStatus(
  tournament: DemoTournament,
  stage: TournamentStage,
  stageMatches: readonly InlineBreakMatch[] = [],
): InlineBreakStatus | null {
  const config = getInlineBreakConfig(stage);
  if (!config || !isStageStarted(tournament, stage)) return null;
  const record = readAll().find((item) => item.tournamentId === tournament.id && item.stageId === stage.id);
  const resumeAt = record?.resumeAt ? new Date(record.resumeAt) : null;
  if (record?.finishedAt) return { state: 'completed', config, resumeAt };
  if (record?.startedAt) return { state: 'running', config, resumeAt };
  const ready = stage.type === 'SWISS'
    ? isSwissRoundApproved(tournament, stage, config.afterRound)
    : (() => {
      const roundMatches = stageMatches.filter((match) => match.id.includes(`-r${config.afterRound}-m`));
      return roundMatches.length > 0 && roundMatches.every((match) => match.status === 'FINISHED');
    })();
  return { state: ready ? 'ready' : 'upcoming', config, resumeAt: null };
}

export function startInlineBreak(
  tournament: DemoTournament,
  stage: TournamentStage,
  stageMatches: readonly InlineBreakMatch[] = [],
  override?: BreakStartOptions,
): boolean {
  if (tournament.status !== 'RUNNING') return false;
  const status = getInlineBreakStatus(tournament, stage, stageMatches);
  if (status?.state !== 'ready') return false;
  const started = new Date();
  const options = override ?? (status.config.kind === 'until'
    ? { kind: 'clock' as const, time: status.config.until }
    : { kind: 'minutes' as const, minutes: status.config.minutes });
  const resume = computeBreakResumeAt(started, options);
  if (!resume) return false;
  save({ tournamentId: tournament.id, stageId: stage.id, startedAt: started.toISOString(), resumeAt: resume.toISOString() });
  return true;
}

export function canFinishInlineBreak(tournament: DemoTournament, stage: TournamentStage, now = new Date(), early = false): boolean {
  if (tournament.status === 'ABORTED' || tournament.status === 'FINISHED') return false;
  const status = getInlineBreakStatus(tournament, stage);
  return status?.state === 'running'
    && Boolean(status.resumeAt && (early || now.getTime() >= status.resumeAt.getTime()));
}

export function finishInlineBreak(tournament: DemoTournament, stage: TournamentStage, early = false): boolean {
  if (!canFinishInlineBreak(tournament, stage, new Date(), early)) return false;
  const prev = readAll().find((item) => item.tournamentId === tournament.id && item.stageId === stage.id);
  if (!prev) return false;
  save({ ...prev, finishedAt: new Date().toISOString() });
  return true;
}

/** KO drawing may display later rounds but may not assign them until the
 * scheduled break has been started AND released. */
export function blocksInlineBreakRound(tournament: DemoTournament, stage: TournamentStage, matchId: string): boolean {
  const config = getInlineBreakConfig(stage);
  if (!config || isInlineBreakReleased(tournament, stage)) return false;
  const nextRound = Number(matchId.match(/-r(\d+)-m\d+$/)?.[1] ?? 0);
  return nextRound > config.afterRound || (stage.type === 'KNOCKOUT' && matchId.endsWith('-third-place'));
}
