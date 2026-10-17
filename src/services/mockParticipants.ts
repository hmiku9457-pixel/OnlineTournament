import type { DemoTournament } from '@/data/demoTournaments';

const firstNames = [
  'Max', 'Lukas', 'Jonas', 'Leon', 'Tim', 'Felix', 'Paul', 'Ben', 'Noah', 'Elias', 'Nico', 'Jan',
  'Moritz', 'Tobias', 'Daniel', 'Simon', 'David', 'Florian', 'Marco', 'Erik', 'Julian', 'Robin', 'Marius', 'Kevin',
  'Anna', 'Laura', 'Sophie', 'Lea', 'Mia', 'Lena', 'Lisa', 'Julia', 'Nina', 'Sarah', 'Marie', 'Emma',
];
const lastNames = [
  'Müller', 'Schmidt', 'Bauer', 'Fischer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf',
  'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Schmitz', 'Krause', 'Meier', 'Lehmann',
];

function generateSingles(count: number) {
  return Array.from({ length: count }, (_, index) => `${firstNames[index % firstNames.length]} ${lastNames[(index * 5 + 3) % lastNames.length]}`);
}

export function getRuntimeParticipantNames(tournament: DemoTournament) {
  if (tournament.participantNames?.length) return tournament.participantNames;
  if (tournament.discipline === 'DOUBLES') {
    const names = generateSingles(tournament.participants * 2);
    return Array.from({ length: tournament.participants }, (_, index) => `${names[index * 2]} / ${names[index * 2 + 1]}`);
  }
  return generateSingles(tournament.participants);
}
