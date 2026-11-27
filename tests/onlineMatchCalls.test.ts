import {describe,it,expect} from 'vitest';
import {callAgeMinutes,callLabel} from '@/domain/onlineMatchCalls';
import {parseHallPreferences} from '@/domain/hallPreferences';
describe('call display and hall preferences',()=>{
 it('never fabricates elapsed time for invalid or future timestamps',()=>{
  expect(callAgeMinutes('invalid',100)).toBeNull();
  expect(callAgeMinutes('2026-01-01T00:00:00Z',0)).toBeNull();
  expect(callAgeMinutes('2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:05:00Z'))).toBe(5);
  expect(callLabel(0)).toBe('gerade eben');
 });
 it('validates persisted preferences and defaults on malformed storage',()=>{
  expect(parseHallPreferences('{"size":12,"rotate":true}')).toEqual({size:12,rotate:true});
  expect(parseHallPreferences('{"size":10000,"rotate":"true"}')).toEqual({size:8,rotate:false});
  expect(parseHallPreferences('{')).toEqual({size:8,rotate:false});
 });
});
