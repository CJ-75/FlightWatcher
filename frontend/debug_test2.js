// Test de debug pour comprendre le problème avec l'initialisation de today
const today = new Date();
today.setHours(0, 0, 0, 0);

console.log('Date actuelle (new Date()):', today.toISOString().split('T')[0]);
console.log('Jour de la semaine:', today.getDay(), '(0=dimanche, 4=jeudi, 5=vendredi)');

// Simuler le code du preset weekend
const dayOfWeek = today.getDay();
let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
console.log('Calcul initial:', `(5 - ${dayOfWeek} + 7) % 7 = ${daysUntilFriday}`);

if (daysUntilFriday === 0) {
  daysUntilFriday = 7;
}

console.log('Jours jusqu\'au vendredi:', daysUntilFriday);

const friday = new Date(today);
const currentDay = today.getDate();
console.log('Jour actuel du mois:', currentDay);
friday.setDate(currentDay + daysUntilFriday);
console.log('Date du vendredi calculée:', friday.toISOString().split('T')[0]);
console.log('Jour de la semaine du vendredi:', friday.getDay(), '(devrait être 5=vendredi)');

const sunday = new Date(friday);
sunday.setDate(friday.getDate() + 2);
console.log('Date du dimanche calculée:', sunday.toISOString().split('T')[0]);
console.log('Jour de la semaine du dimanche:', sunday.getDay(), '(devrait être 0=dimanche)');

