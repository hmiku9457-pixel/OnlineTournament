import { localTournamentStorage } from '@/services/localTournamentStorage';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { computeBreakResumeAt, isStageStarted, isSwissRoundApproved, type BreakStartOptions } from '@/services/mockPhaseLifecycle';
import { parseSavedPlayingDayBreaks, playingRounds } from '@/domain/playingDays';

const STORAGE_KEY = 'online-tournament:mock-inline-breaks:v2';

interface InlineBreakRecord {
  tournamentId: string;
  stageId: string;
  afterRound: number;
  startedAt?: string;
  resumeAt?: string;
  finishedAt?: string;
}
export interface InlineBreakMatch {
  id: string;
  status: string;
  round?: string;
  matchDay?: number;
}
export interface InlineBreakConfiguration {
  afterRound: number;
  kind: 'minutes' | 'until' | 'overnight';
  minutes: number;
  until: string;
  untilDate?: string;
}
function readAll(): InlineBreakRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(localTournamentStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value as InlineBreakRecord[] : [];
  } catch { return []; }
}
function matchRecord(record: InlineBreakRecord, tournament: DemoTournament, stage: TournamentStage, round: number) {
  return record.tournamentId === tournament.id && record.stageId === stage.id && record.afterRound === round;
}
function recordedBreak(tournament: DemoTournament, stage: TournamentStage, round: number) {
  return readAll().find((record) => matchRecord(record, tournament, stage, round));
}
function save(record: InlineBreakRecord) {
  if (typeof window === 'undefined') return;
  const entries = readAll();
  localTournamentStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...entries.filter((entry) =>
    !(entry.tournamentId === record.tournamentId && entry.stageId === record.stageId && entry.afterRound === record.afterRound))]));
  window.dispatchEvent(new CustomEvent('mock-phase-change'));
}
export function getInlineBreakConfigs(stage: TournamentStage): InlineBreakConfiguration[] {
  const rounds = playingRounds({
    type: stage.type, entrantCount: Math.max(2, Number(stage.settings.entrants) || 2),
    groupCount: Math.max(2, Number(stage.settings.groups) || 2),
    swissRounds: Math.max(1, Number(stage.settings.rounds) || 1),
  });
  if (rounds < 2) return [];
  const configs: InlineBreakConfiguration[] = [];
  if (stage.type === 'SWISS' || stage.type === 'KNOCKOUT') {
    const afterRound = Number(stage.settings.inlineBreakAfterRound) || 0;
    if (Number.isInteger(afterRound) && afterRound > 0 && afterRound < rounds) {
      configs.push({
        afterRound,
        kind: stage.settings.inlineBreakKind === 'minutes' ? 'minutes' : 'until',
        minutes: Math.max(1, Number(stage.settings.inlineBreakMinutes) || 15),
        until: String(stage.settings.inlineBreakUntil ?? '13:00'),
        untilDate: String(stage.settings.inlineBreakUntilDate ?? '') || undefined,
      });
    }
  }
  for (const boundary of parseSavedPlayingDayBreaks(stage.settings.dayBreaks)) {
    if (boundary.afterRound < 1 || boundary.afterRound >= rounds
      || configs.some((config) => config.afterRound === boundary.afterRound)) continue;
    configs.push({
      afterRound: boundary.afterRound, kind: 'overnight', minutes: 0,
      until: boundary.time, untilDate: boundary.date,
    });
  }
  return configs.sort((a, b) => a.afterRound - b.afterRound);
}
/** Legacy single-configuration callers receive the first scheduled interruption. */
export function getInlineBreakConfig(stage: TournamentStage): InlineBreakConfiguration | null {
  return getInlineBreakConfigs(stage)[0] ?? null;
}
export function isInlineBreakReleased(tournament: DemoTournament, stage: TournamentStage): boolean {
  const configs = getInlineBreakConfigs(stage);
  return configs.length > 0 && configs.every((config) => Boolean(recordedBreak(tournament, stage, config.afterRound)?.finishedAt));
}
export function isScheduledInlineBreakPending(tournament: DemoTournament, stage: TournamentStage, afterRound: number): boolean {
  return getInlineBreakConfigs(stage).some((config) => config.afterRound === afterRound
    && !recordedBreak(tournament, stage, config.afterRound)?.finishedAt);
}
export type InlineBreakState = 'upcoming' | 'ready' | 'running' | 'completed';
export interface InlineBreakStatus {
  state: InlineBreakState;
  config: InlineBreakConfiguration;
  resumeAt: Date | null;
}
export function getInlineBreakStatus(
  tournament: DemoTournament, stage: TournamentStage, stageMatches: readonly InlineBreakMatch[] = [],
): InlineBreakStatus | null {
  const configs = getInlineBreakConfigs(stage);
  if (!configs.length || !isStageStarted(tournament, stage)) return null;
  const config = configs.find((item) => !recordedBreak(tournament, stage, item.afterRound)?.finishedAt)
    ?? configs[configs.length - 1];
  const record = recordedBreak(tournament, stage, config.afterRound);
  const resumeAt = record?.resumeAt ? new Date(record.resumeAt) : null;
  if (record?.finishedAt) return { state: 'completed', config, resumeAt };
  if (record?.startedAt) return { state: 'running', config, resumeAt };
  const ready = stage.type === 'SWISS'
    ? isSwissRoundApproved(tournament, stage, config.afterRound)
    : stage.type === 'KNOCKOUT'
      ? (() => {
        const roundMatches = stageMatches.filter((match) => match.id.includes(`-r${config.afterRound}-m`));
        return roundMatches.length > 0 && roundMatches.every((match) => match.status === 'FINISHED');
      })()
      : (() => {
        // Matchdays in RR and groups are complete only when every encounter
        // through the selected round is finished, across all groups.
        const played = stageMatches.filter((match) => (match.matchDay ?? 0) <= config.afterRound);
        return played.length > 0 && played.every((match) => match.status === 'FINISHED');
      })();
  return { state: ready ? 'ready' : 'upcoming', config, resumeAt: null };
}
export function startInlineBreak(
  tournament: DemoTournament, stage: TournamentStage, stageMatches: readonly InlineBreakMatch[] = [],
  override?: BreakStartOptions,
): boolean {
  const current = getAllMockTournaments().find((item) => item.id === tournament.id) ?? tournament;
  if (current.status !== 'RUNNING') return false;
  const status = getInlineBreakStatus(current, stage, stageMatches);
  if (status?.state !== 'ready') return false;
  const started = new Date();
  const options = override ?? (status.config.kind !== 'minutes'
    ? { kind: 'clock' as const, time: status.config.until, date: status.config.untilDate }
    : { kind: 'minutes' as const, minutes: status.config.minutes });
  const resume = computeBreakResumeAt(started, options);
  if (!resume) return false;
  save({ tournamentId: tournament.id, stageId: stage.id, afterRound: status.config.afterRound,
    startedAt: started.toISOString(), resumeAt: resume.toISOString() });
  return true;
}
export function canFinishInlineBreak(tournament: DemoTournament, stage: TournamentStage, now = new Date(), early = false): boolean {
  const current = getAllMockTournaments().find((item) => item.id === tournament.id) ?? tournament;
  if (current.status === 'ABORTED' || current.status === 'FINISHED') return false;
  const status = getInlineBreakStatus(current, stage);
  return status?.state === 'running'
    && Boolean(status.resumeAt && (early || now.getTime() >= status.resumeAt.getTime()));
}
export function finishInlineBreak(tournament: DemoTournament, stage: TournamentStage, early = false): boolean {
  if (!canFinishInlineBreak(tournament, stage, new Date(), early)) return false;
  const status = getInlineBreakStatus(tournament, stage);
  if (!status) return false;
  const prev = recordedBreak(tournament, stage, status.config.afterRound);
  if (!prev) return false;
  save({ ...prev, finishedAt: new Date().toISOString() });
  return true;
}
/** No game from a later round may be assigned until ALL preceding planned
 * pauses, including overnight transitions, have been explicitly released. */
export function blocksInlineBreakRound(tournament: DemoTournament, stage: TournamentStage, matchId: string): boolean {
  const nextRound = stage.type === 'GROUPS' || stage.type === 'ROUND_ROBIN'
    ? Number(matchId.match(/-d(\d+)-m\d+$/)?.[1] ?? 0)
    : Number(matchId.match(/-r(\d+)-m\d+$/)?.[1] ?? 0);
  return getInlineBreakConfigs(stage).some((config) =>
    !recordedBreak(tournament, stage, config.afterRound)?.finishedAt
      && (nextRound > config.afterRound || (stage.type === 'KNOCKOUT' && matchId.endsWith('-third-place'))));
}
