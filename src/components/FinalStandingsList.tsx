import type { getMockFinalStandings } from '@/services/mockParticipantProgress';

type FinalStanding = ReturnType<typeof getMockFinalStandings>[number];

interface FinalStandingsListProps {
  standings: readonly FinalStanding[];
  phaseNames: readonly string[];
}

function rankStyle(placement: string): string {
  if (placement === 'Platz 1') return 'is-first';
  if (placement === 'Platz 2') return 'is-second';
  if (placement === 'Platz 3') return 'is-third';
  return '';
}

function statusStyle(status: FinalStanding['status']): string {
  if (status === 'Turniersieger') return 'is-winner';
  if (status === 'Ausgeschieden') return 'is-eliminated';
  if (status === 'Zurückgezogen') return 'is-withdrawn';
  if (status === 'Aktiv') return 'is-active';
  return '';
}

export function FinalStandingsList({ standings, phaseNames }: FinalStandingsListProps) {
  return (
    <div className="final-standings-list" role="list" aria-label="Endplatzierungen">
      {standings.map((row) => {
        const placement = row.placement ?? (row.status === 'Zurückgezogen' ? 'Zurückgezogen' : 'Keine Platzierung');
        const rankClass = rankStyle(placement);
        return (
          <div key={row.name} className={`final-standing-row ${rankClass}`.trim()} role="listitem">
            <div className="final-standing-identity">
              <span className={`final-standing-rank ${rankClass}`.trim()}>{placement}</span>
              <span className="final-standing-person">
                <strong>{row.name}</strong>
                <small>{phaseNames[row.stageIndex] ?? '–'}</small>
              </span>
            </div>
            <span className={`final-standing-status ${statusStyle(row.status)}`.trim()}>{row.status}</span>
          </div>
        );
      })}
    </div>
  );
}
