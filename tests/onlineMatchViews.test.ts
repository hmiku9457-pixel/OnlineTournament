import { describe, expect, it } from 'vitest';
import { onlinePage, onlinePlayerSummary, orientOnlineScore, publicHallAssignments, onlineMatchOutcome, filterPlayerMatches, type OnlineMatchView } from '@/domain/onlineMatchViews';

const match: OnlineMatchView = { sideA: 'A', sideB: 'B', phase: 'Liga', round: 'Runde 1', status: 'FINISHED', table: 'Tisch 1', score: '3:1', sets: [] };
describe('online match views', () => {
  it('orients all score pairs including penalty scores', () => {
    expect(orientOnlineScore('2:2 (4:5 i.E.)', false)).toBe('2:2 (5:4 i.E.)');
    expect(orientOnlineScore('3:1', false)).toBe('1:3');
    expect(orientOnlineScore('W.O.', false)).toBe('W.O.');
  });
  it('counts only personal final results, keeps special decisions separate', () => {
    const result = onlinePlayerSummary([match, {...match, score: '2:2'}, {...match, score: '2:2 (4:5 i.E.)'}, {...match, score: 'W.O.'},
      {...match, status: 'WAITING'}, {...match, status: 'LIVE'}, {...match, sideB: 'C'}, {...match, status: 'CANCELLED'}], 'B');
    expect(result).toMatchObject({ active: 1, waiting: 1, finished: 4, wins: 1, losses: 1, draws: 1, other: 1 });
    expect(result.upcoming).toHaveLength(1);
  });
  it('lists only published active assignments and retains ambiguous assignments', () => {
    const hall = publicHallAssignments([{...match, status: 'LIVE', table: 'Tisch 10'}, {...match, status: 'READY', table: 'Tisch 2'},
      {...match, status: 'CONFIRMATION', table: 'Tisch 2'}, {...match, status: 'WAITING'}, match,
      {...match, status: 'LIVE', table: 'Noch offen'}, {...match, status: 'LIVE', table: 'Tisch 11'}], 10);
    expect(hall.map(t => t.number)).toEqual([2, 10]);
    expect(hall[0].matches).toHaveLength(2);
  });
  it('clamps a page after filters or live refresh remove rows', () => {
    expect(onlinePage([1, 2, 3], 9, 2)).toEqual({page: 1, pages: 2, items: [3]});
    expect(onlinePage([], 3, 10)).toEqual({page: 0, pages: 1, items: []});
  });
});

describe('player filters and result tones',()=>{
  it('filters by opponent, phase and status without returning unrelated games',()=>{
    expect(filterPlayerMatches([match,{...match,phase:'Finale',sideB:'C'},{...match,sideA:'X',sideB:'B'}],'A','Liga',' b ','FINISHED')).toEqual([match]);
    expect(filterPlayerMatches([match],'A','','a','all')).toEqual([]);
  });
  it('classifies a decision from the individual perspective',()=>{
    expect(onlineMatchOutcome({...match,score:'2:2 (4:5 i.E.)'},'B')).toBe('win');
    expect(onlineMatchOutcome(match,'B')).toBe('loss');
    expect(onlineMatchOutcome({...match,score:'1:1 (Losentscheid)'},'A')).toBe('other');
    expect(onlineMatchOutcome({...match,status:'LIVE'},'A')).toBe('open');
  });
});
