import {describe,it,expect} from 'vitest';
import {personalRestMinutes,formatPersonalRest} from '@/domain/onlinePersonalContext';
describe('personal rest display',()=>{
 it('uses measured timestamps, never reports rest during a current match',()=>{
  expect(personalRestMinutes(1000,181000,false)).toBe(3);
  expect(personalRestMinutes(1000,181000,true)).toBeNull();
  expect(personalRestMinutes(null,181000,false)).toBeNull();
  expect(personalRestMinutes(200000,181000,false)).toBeNull();
  expect(formatPersonalRest(65)).toBe('1 h 05 min');
 });
});
