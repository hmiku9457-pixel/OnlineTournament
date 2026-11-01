import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { matchVisualClass, matchVisualLabel, matchVisualState } from '@/domain/matchVisualStatus';
import { GroupMatchDayList } from '@/components/GroupMatchDayList';
import { MatchStatusLegend } from '@/components/MatchStatusLegend';

describe('uniform visual statuses for tournament fixtures', () => {
  it('maps runtime and historical statuses to the same three colors', () => {
    for (const status of ['WAITING', 'open', undefined]) {
      expect(matchVisualState(status)).toBe('waiting');
      expect(matchVisualLabel(status)).toBe('Ausstehend');
    }
    for (const status of ['LIVE', 'READY', 'CONFIRMATION', 'live']) {
      expect(matchVisualState(status)).toBe('live');
      expect(matchVisualClass(status)).toBe('match-state-live');
    }
    for (const status of ['FINISHED', 'played']) {
      expect(matchVisualState(status)).toBe('finished');
      expect(matchVisualLabel(status)).toBe('Abgeschlossen');
    }
    expect(matchVisualState('CANCELLED')).toBe('cancelled');
    expect(matchVisualLabel('CANCELLED')).toBe('Nicht ausgetragen');
  });

  it('shows the common colors and accessible match statuses in compact group schedules', () => {
    const html = renderToStaticMarkup(createElement(GroupMatchDayList, {
      sport: 'table_tennis',
      matches: [
        { id: 'finished', sideA: 'A', sideB: 'B', status: 'played', score: '3:0', matchDay: 1 },
        { id: 'live', sideA: 'C', sideB: 'D', status: 'live', score: '1:0', matchDay: 1 },
        { id: 'waiting', sideA: 'E', sideB: 'F', status: 'open', score: '–', matchDay: 1 },
      ],
    }));
    expect(html).toContain('match-state-finished');
    expect(html).toContain('match-state-live');
    expect(html).toContain('match-state-waiting');
    expect(html).toContain('Abgeschlossen');
    expect(html).toContain('Läuft gerade');
    expect(html).toContain('Ausstehend');
    const legend = renderToStaticMarkup(createElement(MatchStatusLegend));
    expect(legend).toContain('match-state-finished');
    expect(legend).toContain('match-state-live');
    expect(legend).toContain('match-state-waiting');
  });
});
