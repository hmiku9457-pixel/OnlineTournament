import {describe,it,expect} from 'vitest';
import {participantId,participantName} from '@/domain/participantIdentity';
import {BYE_SLOT,PENDING_SLOT,UNCLAIMED_WINNER} from '@/domain/matchSlots';
import type {DemoTournament} from '@/data/demoTournaments';
describe('database-safe technical participant storage',()=>{
 it('encodes technical slots without NUL characters and restores exact identity',()=>{
  const t={participantIds:{Anna:'p-a'}} as unknown as DemoTournament;
  for(const slot of [BYE_SLOT,PENDING_SLOT,UNCLAIMED_WINNER]){
    const id=participantId(t,slot);
    expect(id).not.toContain('\u0000');
    expect(participantName(t,id)).toBe(slot);
  }
  expect(participantName(t,participantId(t,'Anna'))).toBe('Anna');
 });
});