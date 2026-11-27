import { describe,it,expect } from 'vitest';
import { provisionalCutoff } from '@/domain/publicMatchOverview';
describe('public provisional qualification',()=>{
 it('does not select an arbitrary winner at a shared boundary',()=>{
  expect(provisionalCutoff([{name:'A',rank:1},{name:'B',rank:2},{name:'C',rank:2},{name:'D',rank:4}],2)).toEqual({projected:['A'],possible:['B','C']});
 });
 it('handles a completed rank tier and zero slots',()=>{
  const rows=[{name:'A',rank:1},{name:'B',rank:1}];
  expect(provisionalCutoff(rows,2)).toEqual({projected:['A','B'],possible:[]});
  expect(provisionalCutoff(rows,0)).toEqual({projected:[],possible:[]});
 });
});
