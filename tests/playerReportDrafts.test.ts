import {describe,it,expect} from 'vitest';
import {reportDraftKey,retainReportDrafts,type ReportIdentity,type ReportDrafts} from '@/domain/playerReportDrafts';
const match:ReportIdentity={matchId:'m1',startedAt:42,generation:0,side:'A',sideA:'Anna',sideB:'Bernd',bestOf:3,requiresWinner:true};
describe('player result drafts',()=>{
 it('retains edits across unrelated revision changes and temporarily missing projections',()=>{
  const key=reportDraftKey(match);
  const drafts:ReportDrafts={[key]:[['11','8']]};
  expect(retainReportDrafts(drafts,[],false)).toBe(drafts);
  expect(retainReportDrafts(drafts,[match],true)).toEqual(drafts);
 });
 it('drops drafts when match identity or reset generation changes',()=>{
  const drafts:ReportDrafts={[reportDraftKey(match)]:[['11','8']]};
  for(const next of [{...match,generation:1},{...match,startedAt:43},{...match,sideB:'Clara'},{...match,bestOf:5}])expect(retainReportDrafts(drafts,[next],true)).toEqual({});
  expect(retainReportDrafts(drafts,[],true)).toEqual({});
 });
});
