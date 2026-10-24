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

function groupByPhase(groups: PlacementGroup[]) {
  const phases: Array<{ stageIndex: number; groups: PlacementGroup[] }> = [];
  for (const group of groups) {
    const current = phases[phases.length - 1];
    if (current?.stageIndex === group.stageIndex) {
      current.groups.push(group);
    } else {
      phases.push({ stageIndex: group.stageIndex, groups: [group] });
    }
  }
  return phases;
}

function participantTag(status: FinalStanding['status']) {
  if (status === 'Zurückgezogen') return <span className="final-standing-tag is-withdrawn">Zurückgezogen</span>;
  if (status === 'Turniersieger') return <span className="final-standing-tag is-winner">Turniersieger</span>;
  if (status === 'Aktiv') return <span className="final-standing-tag is-active">Aktiv</span>;
  return null;
}

function playerName(row: FinalStanding) {
  return (
    <span className="final-standing-person">
      <strong>{row.name}</strong>
      {participantTag(row.status)}
    </span>
  );
}

export function FinalStandingsList({ standings, phaseNames }: FinalStandingsListProps) {
  const groups = groupPlacements(standings);
  const podium = groups.filter((group) => ['Platz 1', 'Platz 2', 'Platz 3'].includes(group.placement));
  const podiumGroups = new Set(podium);
  const remainingPhases = groupByPhase(groups.filter((group) => !podiumGroups.has(group)));

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
                <article key={group.placement} className={'final-podium-card is-' + level} role="listitem">
                  <span className="final-podium-medal" aria-hidden="true">{medal}</span>
                  <div className="final-podium-content">
                    <span className="final-podium-rank">{group.placement}{group.participants.length > 1 ? ' · geteilt' : ''}</span>
                    <ul className="final-podium-players">
                      {group.participants.map((row) => <li key={row.name}>{playerName(row)}</li>)}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {remainingPhases.length > 0 && (
        <section className="final-ranking" aria-label="Weitere Platzierungen">
          <h3>{podium.length ? 'Weitere Platzierungen' : 'Endplatzierungen'}</h3>
          {remainingPhases.map((phase, index) => {
            const participantCount = phase.groups.reduce((sum, group) => sum + group.participants.length, 0);
            return (
              <div className="final-ranking-phase" key={phase.stageIndex + '-' + index}>
                <div className="final-ranking-phase-heading">
                  <h4>{phaseNames[phase.stageIndex] ?? 'Ohne Turnierphase'}</h4>
                  <small>{participantCount} Teilnehmer</small>
                </div>
                <div className="final-ranking-grid" role="list">
                  {phase.groups.map((group) => (
                    <article
                      key={[group.placementNumber, group.stageIndex, group.placement].join('-')}
                      className={['final-ranking-card', group.participants.length > 1 ? 'is-shared' : '', group.participants.length >= 3 ? 'is-wide' : ''].filter(Boolean).join(' ')}
                      role="listitem"
                    >
                      <div className="final-ranking-position">
                        <span className="final-ranking-badge">{group.placement}</span>
                        {group.participants.length > 1 && <small>{group.participants.length} Teilnehmer</small>}
                      </div>
                      <ul className="final-ranking-players">
                        {group.participants.map((row) => <li key={row.name}>{playerName(row)}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
