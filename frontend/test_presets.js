/**
 * Script de test pour vérifier la génération des dates des presets côté frontend
 * Exécuter avec: node test_presets.js
 */

function generateDatesFromPresets(presets) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dates_depart = [];
  const dates_retour = [];
  const addedDatesDepart = new Set();
  const addedDatesRetour = new Set();
  
  const addDateIfNotExists = (date, isDepart) => {
    if (isDepart) {
      if (!addedDatesDepart.has(date.date)) {
        addedDatesDepart.add(date.date);
        dates_depart.push(date);
      }
    } else {
      if (!addedDatesRetour.has(date.date)) {
        addedDatesRetour.add(date.date);
        dates_retour.push(date);
      }
    }
  };
  
  const validPresets = presets.filter(p => p !== 'flexible');
  
  validPresets.forEach(preset => {
    if (preset === 'weekend') {
      // Ce weekend : vendredi-dimanche prochain
      const dayOfWeek = today.getDay(); // 0 = dimanche, 5 = vendredi
      let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      if (daysUntilFriday === 0) {
        daysUntilFriday = 7; // Si on est déjà vendredi, prendre le suivant
      }
      
      const friday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
      const sunday = new Date(friday.getTime() + 2 * 24 * 60 * 60 * 1000);
      
      addDateIfNotExists({
        date: friday.toISOString().split('T')[0],
        heure_min: '06:00',
        heure_max: '23:59'
      }, true);
      addDateIfNotExists({
        date: sunday.toISOString().split('T')[0],
        heure_min: '06:00',
        heure_max: '23:59'
      }, false);
    } else if (preset === 'next-weekend') {
      // Weekend prochain : vendredi-dimanche suivant
      const dayOfWeek = today.getDay();
      let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      if (daysUntilFriday === 0) {
        daysUntilFriday = 7; // Si on est vendredi, prendre le suivant
      }
      daysUntilFriday += 7; // Toujours ajouter 7 pour le weekend prochain
      
      const friday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
      const sunday = new Date(friday.getTime() + 2 * 24 * 60 * 60 * 1000);
      
      addDateIfNotExists({
        date: friday.toISOString().split('T')[0],
        heure_min: '06:00',
        heure_max: '23:59'
      }, true);
      addDateIfNotExists({
        date: sunday.toISOString().split('T')[0],
        heure_min: '06:00',
        heure_max: '23:59'
      }, false);
    } else if (preset === 'next-week') {
      // 3 jours la semaine prochaine : vendredi-dimanche
      // Horaires : 23h00 à 6h00 (plage qui traverse minuit)
      const dayOfWeek = today.getDay(); // 0 = dimanche, 5 = vendredi
      let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      if (daysUntilFriday === 0) {
        daysUntilFriday = 7; // Si on est vendredi, prendre le suivant
      }
      daysUntilFriday += 7; // Toujours ajouter 7 pour la semaine prochaine
      
      const friday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
      const sunday = new Date(friday.getTime() + 2 * 24 * 60 * 60 * 1000);
      
      addDateIfNotExists({
        date: friday.toISOString().split('T')[0],
        heure_min: '23:00',
        heure_max: '06:00'
      }, true);
      addDateIfNotExists({
        date: sunday.toISOString().split('T')[0],
        heure_min: '23:00',
        heure_max: '06:00'
      }, false);
    }
  });
  
  // Trier les dates
  dates_depart.sort((a, b) => a.date.localeCompare(b.date));
  dates_retour.sort((a, b) => a.date.localeCompare(b.date));
  
  return { dates_depart, dates_retour };
}

function getDayName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const date = new Date(dateStr + 'T00:00:00');
  return days[date.getDay()];
}

function testPreset(presetName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test du preset: ${presetName}`);
  console.log('='.repeat(60));
  
  try {
    const { dates_depart, dates_retour } = generateDatesFromPresets([presetName]);
    
    console.log(`\nDates de départ (${dates_depart.length}):`);
    dates_depart.forEach(d => {
      const dayName = getDayName(d.date);
      console.log(`  - ${d.date} (${dayName}) - ${d.heure_min} à ${d.heure_max}`);
    });
    
    console.log(`\nDates de retour (${dates_retour.length}):`);
    dates_retour.forEach(d => {
      const dayName = getDayName(d.date);
      console.log(`  - ${d.date} (${dayName}) - ${d.heure_min} à ${d.heure_max}`);
    });
    
    // Vérifications
    const errors = [];
    
    // Vérifier que tous les départs sont le vendredi
    dates_depart.forEach(d => {
      const dayName = getDayName(d.date);
      if (dayName !== 'Friday') {
        errors.push(`❌ ERREUR: Le départ ${d.date} n'est pas un vendredi (c'est un ${dayName})`);
      }
    });
    
    // Vérifier que tous les retours sont le dimanche
    dates_retour.forEach(d => {
      const dayName = getDayName(d.date);
      if (dayName !== 'Sunday') {
        errors.push(`❌ ERREUR: Le retour ${d.date} n'est pas un dimanche (c'est un ${dayName})`);
      }
    });
    
    // Vérifier qu'il y a au moins une date de départ et une de retour
    if (dates_depart.length === 0) {
      errors.push('❌ ERREUR: Aucune date de départ générée');
    }
    if (dates_retour.length === 0) {
      errors.push('❌ ERREUR: Aucune date de retour générée');
    }
    
    // Vérifier qu'il n'y a qu'un seul départ et un seul retour
    if (dates_depart.length > 1) {
      errors.push(`⚠️  ATTENTION: ${dates_depart.length} dates de départ générées (attendu: 1)`);
    }
    if (dates_retour.length > 1) {
      errors.push(`⚠️  ATTENTION: ${dates_retour.length} dates de retour générées (attendu: 1)`);
    }
    
    if (errors.length > 0) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log('PROBLÈMES DÉTECTÉS:');
      errors.forEach(error => console.log(`  ${error}`));
      console.log('!'.repeat(60));
      return false;
    } else {
      console.log(`\n✅ Tous les tests sont passés pour ${presetName}!`);
      return true;
    }
  } catch (error) {
    console.log(`\n❌ ERREUR lors du test: ${error.message}`);
    console.error(error);
    return false;
  }
}

function main() {
  console.log('='.repeat(60));
  console.log('TEST DES PRESETS DE DATES (FRONTEND)');
  console.log('='.repeat(60));
  const today = new Date();
  console.log(`Date actuelle: ${today.toISOString().split('T')[0]} (${getDayName(today.toISOString().split('T')[0])})`);
  
  const presets = ['weekend', 'next-weekend', 'next-week'];
  
  const results = {};
  presets.forEach(preset => {
    results[preset] = testPreset(preset);
  });
  
  // Résumé
  console.log(`\n${'='.repeat(60)}`);
  console.log('RÉSUMÉ DES TESTS');
  console.log('='.repeat(60));
  Object.entries(results).forEach(([preset, success]) => {
    const status = success ? '✅ PASSÉ' : '❌ ÉCHOUÉ';
    console.log(`  ${preset}: ${status}`);
  });
  
  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log(`\n🎉 Tous les tests sont passés!`);
  } else {
    console.log(`\n⚠️  Certains tests ont échoué. Vérifiez les erreurs ci-dessus.`);
  }
  
  process.exit(allPassed ? 0 : 1);
}

main();

