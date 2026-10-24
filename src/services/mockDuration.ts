import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getMockStageBaseMatches, getMockStoredResult } from '@/services/mockRuntime';
import { getStageEntrants, isStageCompleted, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getBlockedMockTables } from '@/services/mockTableLocks';

const MINUTES_PER_SET = 15;

interface DurationJob {
  round: number;
  remainingMinutes: number;
}

function expectedSetCount(bestOf: number) {
  const needed = Math.floor(bestOf / 2) + 1;
  return (needed + bestOf) / 2;
}

function remainingMinutesForMatch(bestOf: number, playedSets: number) {
  return MINUTES_PER_SET * Math.max(1, expectedSetCount(bestOf) - playedSets);
}

// Even when many games can run in parallel, a round has preparation/turnover
// overhead. The work component is proportional to the actual remaining games,
// so the estimate reacts to every completed game instead of staying static.
export function estimateRoundRemainingMinutes(remainingMatchMinutes: number[], tableCount: number) {
  if (!remainingMatchMinutes.length) return 0;
  const capacity = Math.max(1, Math.trunc(tableCount));
  const typicalMatch = Math.max(...remainingMatchMinutes);
  return Math.round(remainingMatchMinutes.reduce((total, value) => total + value, 0) / capacity + typicalMatch * 0.4);
}

function configuredEntrants(stage: TournamentStage, tournament: DemoTournament) {
  // Auch vor dem Start die effektive Teilnehmerliste verwenden, damit
  // Nachmeldungen/Rückzüge die Dauerprognose sofort verändern.
  return Math.max(2, getStageEntrants(tournament, stage).length);
}

function knockoutRoundBestOf(stage: TournamentStage, round: number) {
  const values = typeof stage.settings.roundBestOf === 'string'
    ? stage.settings.roundBestOf.split(',').map(Number)
    : [];
  return values[round - 1] || stage.bestOf;
}

function remainingStageJobs(tournament: DemoTournament, stage: TournamentStage): DurationJob[] {
  if (isStageCompleted(tournament, stage)) return [];
  const entrants = configuredEntrants(stage, tournament);
  const started = isStageStarted(tournament, stage);

  if (stage.type === 'SWISS') {
    const rounds = Math.max(1, Number(stage.settings.rounds) || 1);
    const perRound = Math.floor(entrants / 2);
    const jobs: DurationJob[] = [];
    for (let round = 1; round <= rounds; round += 1) {
      for (let game = 1; game <= perRound; game += 1) {
        const result = started ? getMockStoredResult(`${stage.id}-sw-r${round}-m${game}`) : undefined;
        if (result?.status === 'FINISHED') continue;
        jobs.push({ round, remainingMinutes: remainingMinutesForMatch(stage.bestOf, result?.sets.length ?? 0) });
      }
    }
    return jobs;
  }

  if ((stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') && !started) {
    const bracket = 2 ** Math.ceil(Math.log2(entrants));
    const jobs: DurationJob[] = [];
    let matches = Math.max(0, entrants - bracket / 2);
    for (let round = 1; matches >= 1; round += 1) {
      for (let index = 0; index < matches; index += 1) {
        jobs.push({ round, remainingMinutes: remainingMinutesForMatch(knockoutRoundBestOf(stage, round), 0) });
      }
      matches = round === 1 ? bracket / 4 : matches / 2;
    }
    if (stage.type === 'KNOCKOUT' && entrants >= 4) {
      // Bronze kann parallel zum Finale stattfinden, zählt aber als zusätzliche Partie.
      jobs.push({ round: Math.ceil(Math.log2(bracket)), remainingMinutes: remainingMinutesForMatch(stage.bestOf, 0) });
    }
    return jobs;
  }

  // GROUPS, ROUND_ROBIN and started knockout stages: use the real fixture IDs.
  // K.-o. includes future matches with TBD sides, but excludes automatic byes.
  return getMockStageBaseMatches(tournament, stage)
    .filter((match) => !match.autoWinner && match.sideA !== 'Freilos' && match.sideB !== 'Freilos')
    .flatMap((match) => {
      const result = started ? getMockStoredResult(match.id) : undefined;
      if (result?.status === 'FINISHED') return [];
      const round = (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT')
        ? Number(/-r(\d+)-/.exec(match.id)?.[1] ?? 1)
        : 1;
      return [{ round, remainingMinutes: remainingMinutesForMatch(match.bestOf ?? stage.bestOf, result?.sets.length ?? 0) }];
    });
}

export function estimateRemainingTournamentMinutes(tournament: DemoTournament): number | null {
  const availableTables = tournament.tables - getBlockedMockTables(tournament).length;
  const timedSport = tournament.sport !== 'Tischtennis';
  const gameMinutes = Math.max(1, tournament.matchDurationMinutes ?? 15) + Math.max(0, tournament.venueTurnoverMinutes ?? 0);
  const stageJobs = tournament.stages.map((stage) => ({ stage, jobs: remainingStageJobs(tournament, stage).map((job) => ({
    ...job, remainingMinutes: timedSport ? gameMinutes : job.remainingMinutes,
  })) }));
  if (stageJobs.every(({ jobs }) => jobs.length === 0)) return 0;
  if (availableTables <= 0) return null;

  // Round dependencies in Swiss and knockout phases prevent using every
  // table on every round; group matches can be scheduled more freely.
  const duration = new Map<string, number[]>();
  for (const { stage, jobs } of stageJobs) {
    for (const job of jobs) {
      const key = `${stage.id}:${job.round}`;
      duration.set(key, [...(duration.get(key) ?? []), job.remainingMinutes]);
    }
  }
  return [...duration.values()].reduce((total, round) => total + estimateRoundRemainingMinutes(round, availableTables), 0);
}

export function formatRemainingTournamentDuration(minutes: number | null, venuePlural = 'Tische') {
  if (minutes === null) return `Keine ${venuePlural} verfügbar`;
  if (minutes <= 0) return '0 min';
  const rounded = Math.max(1, Math.ceil(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `ca. ${rest} min`;
  return rest === 0 ? `ca. ${hours} h` : `ca. ${hours} h ${rest} min`;
}
