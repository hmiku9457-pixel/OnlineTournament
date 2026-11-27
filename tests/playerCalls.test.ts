import {describe,it,expect} from 'vitest';
import {getPlayerCalls,newPlayerCalls,playerRefreshDelay,type PlayerCallMatch} from '@/domain/playerCalls';
const m:PlayerCallMatch={sideA:'A',sideB:'B',phase:'Liga',round:'Runde 1',status:'LIVE',table:'Tisch 1'};
describe('private player call alerts',()=>{
 it('only shows own active assigned games, deduplicated',()=>{
  expect(getPlayerCalls([m,m,{...m,status:'FINISHED'},{...m,table:'Noch offen'},{...m,sideA:'C'}],'A')).toHaveLength(1);
  expect(getPlayerCalls([m],'B')[0].opponent).toBe('A');
 });
 it('does not signal initial load or unchanged assignments, but detects a move',()=>{
  const first=getPlayerCalls([m],'A');
  expect(newPlayerCalls(null,first)).toEqual([]);
  expect(newPlayerCalls(first.map(c=>c.key),first)).toEqual([]);
  const moved=getPlayerCalls([{...m,table:'Tisch 3'}],'A');
  expect(newPlayerCalls(first.map(c=>c.key),moved)).toEqual(moved);
 });
 it('slows hidden polling and backs off repeated failures',()=>{
  expect(playerRefreshDelay(true,0)).toBe(4000);
  expect(playerRefreshDelay(false,0)).toBe(30000);
  expect(playerRefreshDelay(true,2)).toBe(10000);
  expect(playerRefreshDelay(true,20)).toBe(60000);
 });
});
