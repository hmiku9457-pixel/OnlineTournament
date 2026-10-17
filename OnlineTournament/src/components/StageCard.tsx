import type { TournamentStage } from '@/domain/types';

export function StageCard({ stage }: { stage: TournamentStage }) {
  return (
    <article className="card">
      <span className="badge">{stage.type}</span>
      <h3>{stage.name}</h3>
      <p className="muted">Reihenfolge {stage.orderIndex + 1}</p>
      <div>
        Qualifikation:{' '}
        {stage.advancement.type === 'top_n'
          ? `Top ${stage.advancement.value}`
          : stage.advancement.type === 'percentage'
            ? `${stage.advancement.value}%`
            : 'manuell'}
      </div>
    </article>
  );
}
