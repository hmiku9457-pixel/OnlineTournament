import { Fragment } from 'react';
import { SwissQualificationCutoffRow } from '@/components/SwissQualificationCutoff';
import type { MockStanding } from '@/services/mockCompetitionViews';

interface Props {
  standings: readonly MockStanding[];
  scoreSport: boolean;
  scoreUnit: string;
  unplayedWinners: ReadonlySet<string>;
  previousFinishLabels: Record<string, string>;
  withdrawalLabel: (name: string) => string | null;
  qualifyingPlaces: number;
  cutoffIndex: number | null;
  finalized: boolean;
  onSelectPlayer: (name: string) => void;
  onShowBuchholz: () => void;
}

function SwissRatio({ value }: { value: string }) {
  const [left = '0', right = '0'] = value.split(':');
  return <span className="standing-ratio"><span>{left}</span><span>:</span><span>{right}</span></span>;
}

function difference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatBuchholz(value: number) {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

export function SwissStandingsTable({
  standings, scoreSport, scoreUnit, unplayedWinners, previousFinishLabels, withdrawalLabel,
  qualifyingPlaces, cutoffIndex, finalized, onSelectPlayer, onShowBuchholz,
}: Props) {
  return (
    <div className="card table-wrap swiss-standings-card">
      <table className="compact-table swiss-standings-table">
        <colgroup>
          <col className="swiss-col-rank" />
          <col className="swiss-col-participant" />
          <col className="swiss-col-count" />
          <col className="swiss-col-count" />
          <col className="swiss-col-count" />
          {scoreSport && <col className="swiss-col-count" />}
          <col className="swiss-col-buchholz" />
          <col className="swiss-col-ratio" />
          <col className="swiss-col-difference" />
          {scoreSport ? <col className="swiss-col-points" /> : <>
            <col className="swiss-col-ratio" />
            <col className="swiss-col-difference" />
          </>}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Teilnehmer</th>
            <th title="Spiele">Sp.</th>
            <th title="Siege">S</th>
            <th title={scoreSport ? 'Unentschieden' : 'Niederlagen'}>{scoreSport ? 'U' : 'N'}</th>
            {scoreSport && <th title="Niederlagen">N</th>}
            <th className="swiss-bhz-header" title="Buchholzzahl">
              <span className="swiss-bhz-header-inner">
                <span>BHZ</span>
                <button type="button" className="swiss-bhz-help-trigger" aria-label="Buchholzzahl (BHZ) erklären" aria-haspopup="dialog" title="Was ist die BHZ?" onClick={onShowBuchholz}>?</button>
              </span>
            </th>
            <th className="swiss-stat-ratio swiss-stat-group-start" title={scoreSport ? scoreUnit : 'Satzverhältnis'}>{scoreSport ? scoreUnit : 'Sätze'}</th>
            <th className="swiss-stat-difference" title={scoreSport ? `Differenz (${scoreUnit})` : 'Satzdifferenz'}>±</th>
            {scoreSport ? <th title="Tabellenpunkte">Pkt.</th> : <>
              <th className="swiss-stat-ratio swiss-stat-group-start" title="Ballverhältnis">Bälle</th>
              <th className="swiss-stat-difference" title="Balldifferenz">±</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const withdrawn = withdrawalLabel(row.name);
            return (
              <Fragment key={row.name}>
                <tr>
                  <td>{row.rank}</td>
                  <td>
                    <span className="swiss-standing-identity">
                      <button className="standing-player-button" type="button" onClick={() => onSelectPlayer(row.name)}><strong>{row.name}</strong></button>
                      {previousFinishLabels[row.name] && <small className="participant-origin swiss-standing-origin">{previousFinishLabels[row.name]}</small>}
                      {withdrawn && <span className="standing-withdrawn" title="Zeitpunkt des Rückzugs">{withdrawn}</span>}
                    </span>
                  </td>
                  <td>{row.played}</td>
                  <td>{row.wins}{unplayedWinners.has(row.name) && <sup className="swiss-bye-marker" title="Mindestens ein Sieg durch Freilos oder kampflose Wertung" aria-label="Mindestens ein Sieg durch Freilos oder kampflose Wertung">*</sup>}</td>
                  <td>{scoreSport ? row.draws : row.losses}</td>
                  {scoreSport && <td>{row.losses}</td>}
                  <td className="swiss-buchholz-cell">{formatBuchholz(row.buchholz)}</td>
                  <td className="swiss-stat-ratio swiss-stat-group-start"><SwissRatio value={scoreSport ? row.balls : row.sets} /></td>
                  <td className="swiss-stat-difference">{difference(scoreSport ? row.ballDifference : row.setDifference)}</td>
                  {scoreSport ? <td className="swiss-points-cell">{row.points}</td> : <>
                    <td className="swiss-stat-ratio swiss-stat-group-start"><SwissRatio value={row.balls} /></td>
                    <td className="swiss-stat-difference">{difference(row.ballDifference)}</td>
                  </>}
                </tr>
                {index === cutoffIndex && <SwissQualificationCutoffRow qualifyingPlaces={qualifyingPlaces} finalized={finalized} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="swiss-standings-legend" aria-label="Hinweise zur Schweizer Tabelle">
        {unplayedWinners.size > 0 && (
          <div className="swiss-legend-row">
            <span className="swiss-legend-symbol" aria-hidden="true">*</span>
            <span>Mindestens ein Sieg durch Freilos oder kampflose Wertung</span>
          </div>
        )}
        <div className="swiss-legend-row swiss-legend-ranking">
          <span className="swiss-legend-label">Rangfolge</span>
          <span>{scoreSport ? 'Siege/Remis → BHZ → Punktedifferenz' : 'Siege → BHZ → Satzdifferenz → Balldifferenz'}</span>
        </div>
      </div>
    </div>
  );
}
