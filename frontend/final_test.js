// Test final pour comprendre le problème
const today = new Date();
today.setHours(0, 0, 0, 0);

console.log('Date actuelle:', today.toISOString().split('T')[0]);
console.log('Jour de la semaine:', today.getDay(), '(0=dimanche, 4=jeudi, 5=vendredi)');

const dayOfWeek = today.getDay();
console.log('\nCalcul pour trouver le prochain vendredi:');
console.log(`dayOfWeek = ${dayOfWeek}`);

let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
console.log(`(5 - ${dayOfWeek} + 7) % 7 = ${daysUntilFriday}`);

if (daysUntilFriday === 0) {
  daysUntilFriday = 7;
  console.log('Ajusté à 7 jours (on est vendredi)');
}

console.log(`\nJours jusqu'au vendredi: ${daysUntilFriday}`);

const friday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
console.log(`\nVendredi calculé: ${friday.toISOString().split('T')[0]}`);
console.log(`Jour de la semaine du vendredi: ${friday.getDay()} (devrait être 5)`);

const sunday = new Date(friday.getTime() + 2 * 24 * 60 * 60 * 1000);
console.log(`Dimanche calculé: ${sunday.toISOString().split('T')[0]}`);
console.log(`Jour de la semaine du dimanche: ${sunday.getDay()} (devrait être 0)`);

if (friday.getDay() === 5 && sunday.getDay() === 0) {
  console.log('\n✓ Calcul correct!');
} else {
  console.log('\n✗ Calcul incorrect!');
  console.log(`  Vendredi attendu: jour 5, obtenu: jour ${friday.getDay()}`);
  console.log(`  Dimanche attendu: jour 0, obtenu: jour ${sunday.getDay()}`);
}

