import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getRuntimeParticipantNames } from '@/services/mockRuntime';
import { getBracketSlots, getGroupAssignments } from '@/services/mockDrawStore';
import { isStageStarted } from '@/services/mockPhaseLifecycle';

export interface MockStanding {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  sets: string;
}

export interface MockGroupMatch {
  sideA: string;
  sideB: string;
  score: string;
  status: 'played' | 'live' | 'open';
}

export interface MockGroupView {
  id: string;
  label: string;
  standings: MockStanding[];
  matches: MockGroupMatch[];
}

export interface MockBracketMatch {
  id: string;
  sideA: string;
  sideB: string;
  score?: string;
  winner?: string;
}

export interface MockBracketRound {
  label: string;
  matches: MockBracketMatch[];
}


export function buildMockGroups(tournament: DemoTournament, stage: TournamentStage): MockGroupView[] {
  const names = getRuntimeParticipantNames(tournament);
  const groupCount = Math.max(1, Number(stage.settings.groups) || 1);
  const entrantCount = Math.max(groupCount, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const participants = names.slice(0, entrantCount);
  const assignments = getGroupAssignments(tournament, stage);
  const started = isStageStarted(tournament, stage);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  participants.forEach((name, index) => {
    const groupIndex = assignments[name] ?? (index % groupCount);
    groups[Math.max(0, Math.min(groupCount - 1, groupIndex))].push(name);
  });

  return groups.map((members, groupIndex) => {
    const label = `Gruppe ${String.fromCharCode(65 + groupIndex)}`;
    const standings = members.map((name, index) => {
      if (!started) return { rank: index + 1, name, played: 0, wins: 0, losses: 0, sets: '0:0' };
      const played = Math.max(0, Math.min(members.length - 1, members.length - 2 + (index % 2)));
      const wins = Math.max(0, played - Math.floor(index / 2));
      const losses = played - wins;
      const setsWon = Math.max(wins, wins * 2 + (index % 2));
      const setsLost = Math.max(0, losses + (index % 3));
      return { rank: index + 1, name, played, wins, losses, sets: `${setsWon}:${setsLost}` };
    }).sort((a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name, 'de'))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const matches: MockGroupMatch[] = [];
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const matchIndex = matches.length;
        matches.push({
          sideA: members[a],
          sideB: members[b],
          score: started && matchIndex < members.length - 1 ? (matchIndex % 2 ? '0:1' : '1:0') : '–',
          status: !started ? 'open' : matchIndex < members.length - 2 ? 'played' : matchIndex === members.length - 2 ? 'live' : 'open',
        });
      }
    }

    return { id: `${stage.id}-group-${groupIndex + 1}`, label, standings, matches };
  });
}

function nextPowerOfTwo(value: number) {
  let result = 2;
  while (result < value) result *= 2;
  return result;
}

export function buildMockBracket(tournament: DemoTournament, stage: TournamentStage): MockBracketRound[] {
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const bracketSize = nextPowerOfTwo(entrants);
  const configuredSlots = getBracketSlots(tournament, stage);
  const slots = configuredSlots.length === bracketSize
    ? configuredSlots
    : Array.from({ length: bracketSize }, (_, index) => names[index] ?? 'Freilos');
  const started = isStageStarted(tournament, stage);
  const rounds: MockBracketRound[] = [];
  let current = slots;
  let matchCount = bracketSize / 2;
  let roundIndex = 0;

  while (matchCount >= 1) {
    const label = matchCount === 1 ? 'Finale' : matchCount === 2 ? 'Halbfinale' : matchCount === 4 ? 'Viertelfinale' : matchCount === 8 ? 'Achtelfinale' : `Runde ${roundIndex + 1}`;
    const matches: MockBracketMatch[] = [];
    const next: string[] = [];
    for (let index = 0; index < matchCount; index += 1) {
      const sideA = current[index * 2] ?? 'TBD';
      const sideB = current[index * 2 + 1] ?? 'TBD';
      const bye = sideA === 'Freilos' || sideB === 'Freilos';
      const played = started && roundIndex === 0 && index < Math.max(1, Math.floor(matchCount / 3));
      const winner = started && bye ? (sideA === 'Freilos' ? sideB : sideA) : played ? sideA : undefined;
      matches.push({
        id: `${stage.id}-r${roundIndex + 1}-m${index + 1}`,
        sideA,
        sideB,
        score: started && bye ? 'Freilos' : played ? (stage.bestOf === 1 ? '1:0' : '3:1') : undefined,
        winner,
      });
      next.push(winner ?? `Sieger ${index + 1}`);
    }
    rounds.push({ label, matches });
    current = next;
    matchCount /= 2;
    roundIndex += 1;
  }

  return rounds;
}

export function buildSwissStandings(tournament: DemoTournament, stage: TournamentStage): MockStanding[] {
  const names = getRuntimeParticipantNames(tournament);
  const entrants = Math.max(2, Math.min(names.length, Number(stage.settings.entrants) || names.length));
  const rounds = Math.max(1, Number(stage.settings.rounds) || 4);
  const started = isStageStarted(tournament, stage);
  return names.slice(0, entrants).map((name, index) => {
    if (!started) return { rank: index + 1, name, played: 0, wins: 0, losses: 0, sets: '0:0' };
    const played = Math.min(rounds, Math.max(1, rounds - (index % 2)));
    const wins = Math.max(0, played - Math.floor(index / 3));
    const losses = played - wins;
    return { rank: index + 1, name, played, wins, losses, sets: `${wins * 2 + (index % 2)}:${losses + (index % 3)}` };
  }).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name, 'de'))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
