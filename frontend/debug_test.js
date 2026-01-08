// Test de debug pour comprendre le problème
const today = new Date('2026-01-08T00:00:00');
today.setHours(0, 0, 0, 0);

console.log('Date de base:', today.toISOString().split('T')[0]);
console.log('Jour de la semaine:', today.getDay(), '(0=dimanche, 4=jeudi, 5=vendredi)');

const dayOfWeek = today.getDay();
let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
console.log('Calcul initial:', `(5 - ${dayOfWeek} + 7) % 7 = ${daysUntilFriday}`);

if (daysUntilFriday === 0) {
  daysUntilFriday = 7;
  console.log('Ajustement: jours jusqu\'au vendredi = 7');
}

console.log('Jours jusqu\'au vendredi:', daysUntilFriday);

const friday = new Date(today);
friday.setDate(today.getDate() + daysUntilFriday);
console.log('Date du vendredi calculée:', friday.toISOString().split('T')[0]);
console.log('Jour de la semaine du vendredi:', friday.getDay(), '(devrait être 5)');

