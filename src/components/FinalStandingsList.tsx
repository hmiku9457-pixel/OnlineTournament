import type { getMockFinalStandings } from '@/services/mockParticipantProgress';

type FinalStanding = ReturnType<typeof getMockFinalStandings>[number];

interface FinalStandingsListProps {
  standings: readonly FinalStanding[];
  phaseNames: readonly string[];
}

interface PlacementGroup {
  placement: string;
  placementNumber: number;
  stageIndex: number;
  participants: FinalStanding[];
}

/** Gruppenplätze werden nur zusammengefasst, wenn es dieselbe Gesamtplatzierung ist. */
function groupPlacements(standings: readonly FinalStanding[]): PlacementGroup[] {
  const groups: PlacementGroup[] = [];
  for (const row of standings) {
    const placement = row.placement ?? (row.status === 'Zurückgezogen' ? 'Zurückgezogen' : 'Keine Platzierung');
    const previous = groups[groups.length - 1];
    if (previous && previous.placement === placement && previous.placementNumber === row.placementNumber && previous.stageIndex === row.stageIndex) {
      previous.participants.push(row);
    } else {
      groups.push({ placement, placementNumber: row.placementNumber, stageIndex: row.stageIndex, participants: [row] });
    }
  }
  return groups;
}

function participantTag(status: FinalStanding['status']) {
  if (status === 'Zurückgezogen') return <span className="final-standing-tag is-withdrawn">Zurückgezogen</span>;
  if (status === 'Turniersieger') return <span className="final-standing-tag is-winner">Turniersieger</span>;
  if (status === 'Aktiv') return <span className="final-standing-tag is-active">Aktiv</span>;
  return null;
}

function playerDetails(row: FinalStanding, phaseNames: readonly string[]) {
  return (
    <span className="final-standing-person">
      <span className="final-standing-person-name"><strong>{row.name}</strong>{participantTag(row.status)}</span>
      <small>{phaseNames[row.stageIndex] ?? '–'}</small>
    </span>
  );
}

export function FinalStandingsList({ standings, phaseNames }: FinalStandingsListProps) {
  const groups = groupPlacements(standings);
  const podium = groups.filter((group) => ['Platz 1', 'Platz 2', 'Platz 3'].includes(group.placement));
  const podiumGroups = new Set(podium);
  const remaining = groups.filter((group) => !podiumGroups.has(group));

  return (
    <div className="final-standings-list" aria-label="Endplatzierungen">
      {podium.length > 0 && (
        <section className="final-podium" aria-label="Siegerpodest">
          <h3>Siegerpodest</h3>
          <div className="final-podium-grid" role="list">
            {podium.map((group) => {
              const level = group.placement === 'Platz 1' ? 'first' : group.placement === 'Platz 2' ? 'second' : 'third';
              const medal = level === 'first' ? '🏆' : level === 'second' ? '🥈' : '🥉';
              return (
                <article key={group.placement} className={['final-podium-card', 'is-' + level].join(' ')} role="listitem">
                  <span className="final-podium-medal" aria-hidden="true">{medal}</span>
                  <span className="final-podium-rank">{group.placement}{group.participants.length > 1 ? ' · geteilt' : ''}</span>
                  <ul className="final-podium-players">
                    {group.participants.map((row) => <li key={row.name}>{playerDetails(row, phaseNames)}</li>)}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {remaining.length > 0 && (
        <section className="final-ranking" aria-label="Weitere Platzierungen">
          <h3>{podium.length ? 'Weitere Platzierungen' : 'Endplatzierungen'}</h3>
          <div className="final-ranking-grid" role="list">
            {remaining.map((group) => (
              <article key={[group.placementNumber, group.stageIndex, group.placement].join('-')} className={['final-ranking-card', group.participants.length > 1 ? 'is-shared' : ''].filter(Boolean).join(' ')} role="listitem">
                <div className="final-ranking-position">
                  <span className="final-ranking-badge">{group.placement}</span>
                  {group.participants.length > 1 && <small>{group.participants.length} Teilnehmer</small>}
                </div>
                <ul className="final-ranking-players">
                  {group.participants.map((row) => <li key={row.name}>{playerDetails(row, phaseNames)}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
