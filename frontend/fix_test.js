// Test pour comprendre le problème exact
const testDate = '2026-01-08'; // Jeudi
const today = new Date(testDate + 'T00:00:00');
today.setHours(0, 0, 0, 0);

console.log('Date de test:', today.toISOString().split('T')[0]);
console.log('Jour de la semaine:', today.getDay(), '(4 = jeudi)');

const dayOfWeek = today.getDay();
console.log('dayOfWeek:', dayOfWeek);

let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
console.log('Calcul:', `(5 - ${dayOfWeek} + 7) % 7 = ${daysUntilFriday}`);

if (daysUntilFriday === 0) {
  daysUntilFriday = 7;
  console.log('Ajustement à 7 jours');
}

console.log('daysUntilFriday final:', daysUntilFriday);

const friday = new Date(today);
const currentDay = today.getDate();
console.log('Jour actuel du mois:', currentDay);
console.log('Nouveau jour:', currentDay + daysUntilFriday);

friday.setDate(currentDay + daysUntilFriday);
console.log('Date du vendredi:', friday.toISOString().split('T')[0]);
console.log('Jour de la semaine du vendredi:', friday.getDay(), '(5 = vendredi)');

if (friday.getDay() !== 5) {
  console.log('❌ ERREUR: Le vendredi calculé n\'est pas un vendredi!');
} else {
  console.log('✓ Le vendredi est correct');
}

