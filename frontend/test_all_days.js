// Test pour chaque jour de la semaine
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function testDay(startDateStr) {
  const today = new Date(startDateStr + 'T00:00:00');
  today.setHours(0, 0, 0, 0);
  
  const dayOfWeek = today.getDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  
  if (daysUntilFriday === 0) {
    daysUntilFriday = 7;
  }
  
  const friday = new Date(today);
  friday.setDate(today.getDate() + daysUntilFriday);
  
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  
  const fridayDay = friday.getDay();
  const sundayDay = sunday.getDay();
  
  const fridayCorrect = fridayDay === 5;
  const sundayCorrect = sundayDay === 0;
  
  console.log(`${days[dayOfWeek]} ${startDateStr} -> Friday ${friday.toISOString().split('T')[0]} (${days[fridayDay]}) ${fridayCorrect ? '✓' : '✗'} | Sunday ${sunday.toISOString().split('T')[0]} (${days[sundayDay]}) ${sundayCorrect ? '✓' : '✗'}`);
  
  return fridayCorrect && sundayCorrect;
}

console.log('Test pour chaque jour de la semaine (semaine du 6-12 janvier 2026):\n');
const baseDate = '2026-01-06'; // Mardi
let allPassed = true;

for (let i = 0; i < 7; i++) {
  const testDate = new Date(baseDate);
  testDate.setDate(6 + i);
  const dateStr = testDate.toISOString().split('T')[0];
  const passed = testDay(dateStr);
  if (!passed) allPassed = false;
}

console.log(`\n${allPassed ? '✓ Tous les tests sont passés!' : '✗ Certains tests ont échoué'}`);

