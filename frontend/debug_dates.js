// Test détaillé pour comprendre le problème exact
console.log('=== TEST DU CALCUL DES DATES ===\n');

// Test pour chaque jour de la semaine
const testDates = [
  { date: '2026-01-05', day: 'Dimanche', expected: 5 }, // 0
  { date: '2026-01-06', day: 'Lundi', expected: 4 },     // 1
  { date: '2026-01-07', day: 'Mardi', expected: 3 },    // 2
  { date: '2026-01-08', day: 'Mercredi', expected: 2 }, // 3
  { date: '2026-01-09', day: 'Jeudi', expected: 1 },     // 4
  { date: '2026-01-10', day: 'Vendredi', expected: 0 }, // 5
  { date: '2026-01-11', day: 'Samedi', expected: 6 },   // 6
];

testDates.forEach(test => {
  const today = new Date(test.date + 'T00:00:00');
  today.setHours(0, 0, 0, 0);
  
  const dayOfWeek = today.getDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  
  console.log(`${test.day} (${test.date}, getDay=${dayOfWeek}):`);
  console.log(`  Calcul: (5 - ${dayOfWeek} + 7) % 7 = ${daysUntilFriday}`);
  
  if (daysUntilFriday === 0) {
    daysUntilFriday = 7;
    console.log(`  Ajusté à 7 jours (on est vendredi)`);
  }
  
  const friday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
  const fridayDay = friday.getDay();
  const fridayDate = friday.toISOString().split('T')[0];
  
  console.log(`  Résultat: ${fridayDate} (jour ${fridayDay})`);
  
  if (fridayDay === 5) {
    console.log(`  ✓ CORRECT - C'est bien un vendredi\n`);
  } else {
    console.log(`  ✗ ERREUR - Ce n'est pas un vendredi! (attendu: 5, obtenu: ${fridayDay})\n`);
  }
});

