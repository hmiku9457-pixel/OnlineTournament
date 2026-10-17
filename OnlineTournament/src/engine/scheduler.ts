import type { Match, TableResource, UUID } from '@/domain/types';

export interface SchedulingContext {
  now: Date;
  preferredTableIds: UUID[];
  strictTableIds: UUID[];
  lastFinishedAtByParticipant: Map<UUID, Date>;
  minimumRestMinutes: number;
}

export interface SchedulingCandidate {
  matchId: UUID;
  tableId: UUID;
  score: number;
  warnings: string[];
}

export function scoreSchedulingCandidate(
  match: Match,
  table: TableResource,
  context: SchedulingContext,
): SchedulingCandidate {
  const warnings: string[] = [];
  let score = 100;

  if (!table.active) score -= 1000;
  if (context.strictTableIds.length && !context.strictTableIds.includes(table.id)) score -= 1000;
  if (context.preferredTableIds.includes(table.id)) score += 30;

  for (const participantId of [match.sideAId, match.sideBId].filter(Boolean) as UUID[]) {
    const lastFinished = context.lastFinishedAtByParticipant.get(participantId);
    if (!lastFinished) continue;
    const restMinutes = (context.now.getTime() - lastFinished.getTime()) / 60000;
    if (restMinutes < context.minimumRestMinutes) {
      score -= 30;
      warnings.push(`Ruhezeit von ${participantId} erst ${Math.floor(restMinutes)} Minuten`);
    } else {
      score += 20;
    }
  }

  return { matchId: match.id, tableId: table.id, score, warnings };
}

export function chooseBestTable(
  match: Match,
  tables: TableResource[],
  context: SchedulingContext,
): SchedulingCandidate | null {
  const candidates = tables.map((table) => scoreSchedulingCandidate(match, table, context));
  return candidates.sort((a, b) => b.score - a.score || a.tableId.localeCompare(b.tableId))[0] ?? null;
}
