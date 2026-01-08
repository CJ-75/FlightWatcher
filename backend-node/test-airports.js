/**
 * Script de test pour l'endpoint /api/airports
 * Affiche la liste des aéroports disponibles
 */

const fs = await import('fs');
const path = await import('path');

const airportsFile = path.join(process.cwd(), '..', 'ryanair-py', 'ryanair', 'airports.csv');

const countryNames = {
  'FR': 'France', 'GB': 'Royaume-Uni', 'ES': 'Espagne', 'IT': 'Italie',
  'DE': 'Allemagne', 'PT': 'Portugal', 'GR': 'Grèce', 'IE': 'Irlande',
  'BE': 'Belgique', 'NL': 'Pays-Bas', 'CH': 'Suisse', 'AT': 'Autriche',
  'PL': 'Pologne', 'CZ': 'République tchèque', 'HU': 'Hongrie', 'RO': 'Roumanie',
  'BG': 'Bulgarie', 'HR': 'Croatie', 'SI': 'Slovénie', 'SK': 'Slovaquie',
  'DK': 'Danemark', 'SE': 'Suède', 'NO': 'Norvège', 'FI': 'Finlande',
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

console.log('📋 Chargement de la liste des aéroports...\n');

if (fs.existsSync(airportsFile)) {
  const csvContent = fs.readFileSync(airportsFile, 'utf-8');
  const lines = csvContent.split('\n');
  
  if (lines.length > 1) {
    const headers = parseCSVLine(lines[0]);
    const iataIndex = headers.indexOf('iata_code');
    const nameIndex = headers.indexOf('name');
    const municipalityIndex = headers.indexOf('municipality');
    const isoCountryIndex = headers.indexOf('iso_country');
    
    const airports = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
      if (values.length <= iataIndex) continue;
      
      const iataCode = values[iataIndex]?.replace(/"/g, '') || '';
      if (!iataCode || iataCode.length !== 3) continue;
      
      const isoCountry = values[isoCountryIndex]?.replace(/"/g, '') || '';
      const country = countryNames[isoCountry] || isoCountry;
      
      airports.push({
        code: iataCode,
        name: values[nameIndex]?.replace(/"/g, '') || 'N/A',
        city: values[municipalityIndex]?.replace(/"/g, '') || 'N/A',
        country: country
      });
    }
    
    // Filtrer les aéroports européens populaires pour Ryanair
    const europeanCountries = ['FR', 'GB', 'ES', 'IT', 'DE', 'PT', 'GR', 'IE', 'BE', 'NL', 'CH', 'AT', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'DK', 'SE', 'NO', 'FI'];
    const ryanairAirports = airports.filter(a => {
      const countryCode = Object.keys(countryNames).find(code => countryNames[code] === a.country);
      return europeanCountries.includes(countryCode);
    });
    
    // Trier par code
    ryanairAirports.sort((a, b) => a.code.localeCompare(b.code));
    
    console.log(`✅ ${ryanairAirports.length} aéroports européens trouvés\n`);
    console.log('📌 Aéroports populaires Ryanair :\n');
    
    // Afficher les 50 premiers
    ryanairAirports.slice(0, 50).forEach(airport => {
      console.log(`${airport.code.padEnd(4)} - ${airport.name.padEnd(40)} ${airport.city.padEnd(20)} (${airport.country})`);
    });
    
    if (ryanairAirports.length > 50) {
      console.log(`\n... et ${ryanairAirports.length - 50} autres aéroports`);
    }
    
    // Statistiques par pays
    const byCountry = {};
    ryanairAirports.forEach(airport => {
      if (!byCountry[airport.country]) {
        byCountry[airport.country] = 0;
      }
      byCountry[airport.country]++;
    });
    
    console.log('\n📊 Statistiques par pays :\n');
    Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        console.log(`${country.padEnd(20)} : ${count} aéroport(s)`);
      });
    
  } else {
    console.log('❌ Fichier CSV vide');
  }
} else {
  console.log(`❌ Fichier introuvable : ${airportsFile}`);
}

