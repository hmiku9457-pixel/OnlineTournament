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
  highlightPlayers?: ReadonlySet<string>;
  readOnly?: boolean;
  lotWinners?: ReadonlySet<string>;
  lotParticipants?: ReadonlySet<string>;
  /** Visible qualification outcome, independent of the normal Swiss ranking. */
  decisionTags?: Record<string, { label: string; qualified: boolean }>;
  hideBuchholz?: boolean;
}

function SwissRatio({ value }: { value: string }) {
  const [left = '0', right = '0'] = value.split(':');
  return <span className="standing-ratio"><span>{left}</span><span>:</span><span>{right}</span></span>;
}

function SwissDifference({ value }: { value: number }) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return (
    <span className="swiss-difference-value">
      <span className="swiss-difference-sign">{sign}</span>
      <span className="swiss-difference-digits">{Math.abs(value)}</span>
    </span>
  );
}

function formatSonnebornBerger(value: number) {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function SwissStandingsTable({
  standings, scoreSport, scoreUnit, unplayedWinners, previousFinishLabels, withdrawalLabel,
  qualifyingPlaces, cutoffIndex, finalized, onSelectPlayer, onShowBuchholz, highlightPlayers, readOnly = false,
  lotWinners, lotParticipants, decisionTags, hideBuchholz = false,
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
          {!hideBuchholz && <col className="swiss-col-buchholz" />}
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
            {!hideBuchholz && <th className="swiss-bhz-header" title="Sonneborn-Berger-Wertung">
              <span className="swiss-bhz-header-inner">
                <span>SB</span>
                <button type="button" className="swiss-bhz-help-trigger" aria-label="Sonneborn-Berger-Wertung (SB) erklären" aria-haspopup="dialog" title="Was ist die SB-Wertung?" onClick={onShowBuchholz}>?</button>
              </span>
            </th>}
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
                <tr className={highlightPlayers?.has(row.name) ? 'swiss-cutoff-highlight' : undefined} aria-label={highlightPlayers?.has(row.name) ? `${row.name}: Gleichstand an der Qualifikationsgrenze` : undefined}>
                  <td>{row.rank}</td>
                  <td>
                    <span className="swiss-standing-identity">
                      {readOnly ? <strong>{row.name}</strong> : <button className="standing-player-button" type="button" onClick={() => onSelectPlayer(row.name)}><strong>{row.name}</strong></button>}
                      {previousFinishLabels[row.name] && <small className="participant-origin swiss-standing-origin">{previousFinishLabels[row.name]}</small>}
                      {withdrawn && <span className="standing-withdrawn" title="Zeitpunkt des Rückzugs">{withdrawn}</span>}
                      {lotParticipants?.has(row.name) && <span className={lotWinners?.has(row.name) ? 'swiss-lot-tag is-qualified' : 'swiss-lot-tag is-eliminated'} title="Qualifikation nach physischem Losentscheid">
                        {lotWinners?.has(row.name) ? 'Losentscheid · weiter' : 'Losentscheid · raus'}
                      </span>}
                      {decisionTags?.[row.name] && <span
                        className={decisionTags[row.name].qualified ? 'swiss-lot-tag is-qualified' : 'swiss-lot-tag is-eliminated'}
                        title="Qualifikation durch zusätzliches Entscheidungsspiel">
                        {decisionTags[row.name].label} · {decisionTags[row.name].qualified ? 'weiter' : 'raus'}
                      </span>}
                    </span>
                  </td>
                  <td>{row.played}</td>
                  <td>{row.wins}{unplayedWinners.has(row.name) && <sup className="swiss-bye-marker" title="Mindestens ein Sieg durch Freilos oder kampflose Wertung" aria-label="Mindestens ein Sieg durch Freilos oder kampflose Wertung">*</sup>}</td>
                  <td>{scoreSport ? row.draws : row.losses}</td>
                  {scoreSport && <td>{row.losses}</td>}
                  {!hideBuchholz && <td className="swiss-buchholz-cell">{formatSonnebornBerger(row.buchholz)}</td>}
                  <td className="swiss-stat-ratio swiss-stat-group-start"><SwissRatio value={scoreSport ? row.balls : row.sets} /></td>
                  <td className="swiss-stat-difference"><SwissDifference value={scoreSport ? row.ballDifference : row.setDifference} /></td>
                  {scoreSport ? <td className="swiss-points-cell">{row.points}</td> : <>
                    <td className="swiss-stat-ratio swiss-stat-group-start"><SwissRatio value={row.balls} /></td>
                    <td className="swiss-stat-difference"><SwissDifference value={row.ballDifference} /></td>
                  </>}
                </tr>
                {index === cutoffIndex && <SwissQualificationCutoffRow qualifyingPlaces={qualifyingPlaces} finalized={finalized} colSpan={hideBuchholz ? 9 : 10} />}
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
          <span>{hideBuchholz
            ? scoreSport ? 'Wertungspunkte → Punktedifferenz → erzielte Punkte → direkter Vergleich'
              : 'Siege → Satzdifferenz → gewonnene Sätze → Balldifferenz → direkter Vergleich'
            : scoreSport ? 'Siege/Remis → SB → Punktedifferenz' : 'Siege → SB → Satzdifferenz → Balldifferenz'}</span>
        </div>
      </div>
    </div>
  );
}
