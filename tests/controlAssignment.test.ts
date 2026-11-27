import { describe, expect, it } from 'vitest';
import { planControlAssignments, type AssignmentCandidate } from '@/domain/controlAssignment';

const match=(id:string,sideA:string,sideB:string,startedAt?:number):AssignmentCandidate=>({id,sideA,sideB,startedAt});
const tables=['Tisch 1','Tisch 2'];
const eligible=(matches:AssignmentCandidate[])=>new Map(matches.map(m=>[m.id,tables]));
describe('automatic simultaneous table assignment',()=>{
  it('finds two compatible games rather than one greedy game',()=>{
    const queue=[match('ab','A','B'),match('ac','A','C'),match('bd','B','D')];
    const result=planControlAssignments(queue,eligible(queue),tables);
    expect(result.map(a=>a.matchId)).toEqual(['ac','bd']);
    expect(new Set(result.map(a=>a.table)).size).toBe(2);
  });
  it('preserves original priority when the greedy plan fills all tables',()=>{
    const queue=[match('ab','A','B'),match('cd','C','D'),match('ac','A','C'),match('bd','B','D')];
    expect(planControlAssignments(queue,eligible(queue),tables).map(a=>a.matchId)).toEqual(['ab','cd']);
  });
  it('protects resumed games in rest-priority mode',()=>{
    const queue=[match('ab','A','B',123),match('ac','A','C'),match('bd','B','D')];
    expect(planControlAssignments(queue,eligible(queue),tables,true).map(a=>a.matchId)).toEqual(['ab']);
  });
  it('respects individual table eligibility and can change a greedy table choice',()=>{
    const queue=[match('ab','A','B'),match('cd','C','D'),match('ef','E','F')];
    const options=new Map([['ab',tables],['cd',['Tisch 1']],['ef',[]]]);
    expect(planControlAssignments(queue,options,tables)).toEqual([{matchId:'ab',table:'Tisch 2'},{matchId:'cd',table:'Tisch 1'}]);
    expect(planControlAssignments(queue,options,['Tisch 2'])).toEqual([{matchId:'ab',table:'Tisch 2'}]);
  });
  it('never reuses a participant, game or table, including large queues',()=>{
    const people=Array.from({length:48},(_,i)=>String(i));
    const queue=people.flatMap((a,i)=>people.slice(i+1).map(b=>match(a+'-'+b,a,b)));
    const free=Array.from({length:20},(_,i)=>'Tisch '+(i+1));
    const options=new Map(queue.map(m=>[m.id,free]));
    const result=planControlAssignments(queue,options,free);
    const played=result.flatMap(a=>{const m=queue.find(m=>m.id===a.matchId)!;return [m.sideA,m.sideB];});
    expect(result).toHaveLength(20);
    expect(new Set(played).size).toBe(40);
    expect(new Set(result.map(a=>a.table)).size).toBe(20);
    expect(planControlAssignments(queue,options,[])).toEqual([]);
  });
  it('returns an empty plan when no candidate is eligible',()=>{
    const queue=[match('ab','A','B')];
    expect(planControlAssignments(queue,new Map(),tables)).toEqual([]);
  });
});
