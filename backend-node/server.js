import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialiser Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let supabaseService = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  if (supabaseServiceKey) {
    supabaseService = createClient(supabaseUrl, supabaseServiceKey);
  }
  console.log('[OK] Supabase configure et disponible');
} else {
  console.log('[WARNING] Supabase non configure - certaines fonctionnalites seront desactivees');
}

// Helper pour formater les dates
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':');
  return { hours: parseInt(hours), minutes: parseInt(minutes) };
}

function isTimeInRange(timeStr, minTime, maxTime) {
  const time = parseTime(timeStr);
  const min = parseTime(minTime);
  const max = parseTime(maxTime);
  
  const timeMinutes = time.hours * 60 + time.minutes;
  const minMinutes = min.hours * 60 + min.minutes;
  const maxMinutes = max.hours * 60 + max.minutes;
  
  if (maxMinutes < minMinutes) {
    // Plage qui traverse minuit
    return timeMinutes >= minMinutes || timeMinutes <= maxMinutes;
  }
  return timeMinutes >= minMinutes && timeMinutes <= maxMinutes;
}

// Helper pour appeler l'API Ryanair (version simplifiée)
// Note: L'API Ryanair réelle nécessite une bibliothèque spécialisée
// Pour l'instant, on retourne des données mockées
async function scanFlights(params) {
  const {
    aeroport_depart,
    dates_depart,
    dates_retour,
    budget_max,
    destinations_exclues = [],
    destinations_incluses = null
  } = params;

  // TODO: Implémenter l'appel réel à l'API Ryanair
  // Pour l'instant, on retourne un tableau vide
  // Vous pouvez utiliser une bibliothèque comme node-fetch pour appeler l'API
  
  return [];
}

// Endpoint de santé
app.get('/', (req, res) => {
  res.json({ 
    message: 'FlightWatcher API', 
    status: 'ok',
    supabase: supabase ? 'configure' : 'non configure'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'flightwatcher-api' });
});

// Endpoint pour obtenir les aéroports
app.get('/api/airports', async (req, res) => {
  try {
    const query = req.query.query || '';
    const fs = await import('fs');
    const path = await import('path');
    
    const airportsFile = path.join(__dirname, '..', 'ryanair-py', 'ryanair', 'airports.csv');
    
    const countryNames = {
      'FR': 'France', 'GB': 'Royaume-Uni', 'ES': 'Espagne', 'IT': 'Italie',
      'DE': 'Allemagne', 'PT': 'Portugal', 'GR': 'Grèce', 'IE': 'Irlande',
      'BE': 'Belgique', 'NL': 'Pays-Bas', 'CH': 'Suisse', 'AT': 'Autriche',
      'PL': 'Pologne', 'CZ': 'République tchèque', 'HU': 'Hongrie', 'RO': 'Roumanie',
      'BG': 'Bulgarie', 'HR': 'Croatie', 'SI': 'Slovénie', 'SK': 'Slovaquie',
      'DK': 'Danemark', 'SE': 'Suède', 'NO': 'Norvège', 'FI': 'Finlande',
    };
    
    let airports = [];
    
    if (fs.existsSync(airportsFile)) {
      const csvContent = fs.readFileSync(airportsFile, 'utf-8');
      const lines = csvContent.split('\n');
      
      // Parser CSV simple (gère les guillemets)
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
      
      if (lines.length > 1) {
        const headers = parseCSVLine(lines[0]);
        const iataIndex = headers.indexOf('iata_code');
        const nameIndex = headers.indexOf('name');
        const municipalityIndex = headers.indexOf('municipality');
        const isoCountryIndex = headers.indexOf('iso_country');
        
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
      }
    } else {
      // Fallback si le fichier n'existe pas
      airports = [
        { code: 'BVA', name: 'Beauvais-Tillé', city: 'Beauvais', country: 'France' },
        { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
        { code: 'ORY', name: 'Orly', city: 'Paris', country: 'France' },
      ];
    }
    
    // Filtrer par recherche si fournie
    const filtered = query 
      ? airports.filter(a => 
          a.code.toLowerCase().includes(query.toLowerCase()) ||
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.city.toLowerCase().includes(query.toLowerCase()) ||
          a.country.toLowerCase().includes(query.toLowerCase())
        )
      : airports;
    
    // Trier par code
    filtered.sort((a, b) => a.code.localeCompare(b.code));
    
    res.json({ airports: filtered, count: filtered.length });
  } catch (error) {
    console.error('Erreur chargement aéroports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint pour scanner les vols
app.post('/api/scan', async (req, res) => {
  try {
    const {
      aeroport_depart = 'BVA',
      dates_depart = [],
      dates_retour = [],
      budget_max = 200,
      limite_allers = 50,
      destinations_exclues = [],
      destinations_incluses = null
    } = req.body;

    if (!dates_depart.length || !dates_retour.length) {
      return res.status(400).json({ error: 'Dates de depart et retour requises' });
    }

    // Vérifier le cache Supabase si disponible
    let cachedResult = null;
    if (supabaseService) {
      try {
        const cacheKey = JSON.stringify({
          aeroport_depart,
          dates_depart,
          dates_retour,
          budget_max,
          destinations_exclues: destinations_exclues.sort(),
          destinations_incluses: destinations_incluses?.sort() || null
        });
        
        const { data } = await supabaseService
          .from('search_results_cache')
          .select('results, expires_at, hit_count')
          .eq('cache_key', cacheKey)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (data) {
          cachedResult = data.results;
          // Mettre à jour hit_count et last_hit_at
          await supabaseService
            .from('search_results_cache')
            .update({
              hit_count: (data.hit_count || 0) + 1,
              last_hit_at: new Date().toISOString()
            })
            .eq('cache_key', cacheKey);
        }
      } catch (error) {
        // Cache non disponible, continuer
      }
    }

    if (cachedResult) {
      return res.json({
        resultats: cachedResult,
        nombre_requetes: 0,
        message: `Scan termine (cache): ${cachedResult.length} voyage(s) trouve(s)`
      });
    }

    // Appeler la fonction de scan
    const resultats = await scanFlights({
      aeroport_depart,
      dates_depart,
      dates_retour,
      budget_max,
      destinations_exclues,
      destinations_incluses
    });

    // Mettre en cache si Supabase est disponible
    if (supabaseService && resultats.length > 0) {
      try {
        const cacheKey = JSON.stringify({
          aeroport_depart,
          dates_depart,
          dates_retour,
          budget_max,
          destinations_exclues: destinations_exclues.sort(),
          destinations_incluses: destinations_incluses?.sort() || null
        });
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Cache valide 1 heure

        await supabaseService
          .from('search_results_cache')
          .upsert({
            cache_key: cacheKey,
            departure_airport: aeroport_depart,
            budget_max,
            dates_depart,
            dates_retour,
            results: resultats,
            expires_at: expiresAt.toISOString(),
            hit_count: 0,
            last_hit_at: null
          }, {
            onConflict: 'cache_key'
          });
      } catch (error) {
        console.error('Erreur mise en cache:', error);
      }
    }
    
    res.json({
      resultats,
      nombre_requetes: 0,
      message: `Scan termine: ${resultats.length} voyage(s) trouve(s)`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint pour obtenir les destinations
app.get('/api/destinations', async (req, res) => {
  try {
    const airport = (req.query.airport || 'BVA').toUpperCase().trim();
    
    if (!airport || airport.length !== 3) {
      return res.status(400).json({ 
        error: 'Code aéroport invalide',
        aeroport: airport 
      });
    }
    
    console.log(`[API] Récupération des destinations depuis ${airport}...`);
    
    // SOLUTION SIMPLIFIÉE : Utiliser directement le script Python
    // Le script est plus fiable que d'appeler un autre serveur
    
    // FALLBACK : Appeler le script Python
    const backendDir = join(__dirname, '..', 'backend');
    const scriptPath = join(backendDir, 'get_destinations.py');
    
    if (!existsSync(scriptPath)) {
      console.error(`[API] Script Python introuvable: ${scriptPath}`);
      return res.json({
        destinations: {},
        aeroport: airport,
        message: 'Script Python introuvable. Le backend FastAPI doit être démarré ou le script Python doit être disponible.'
      });
    }
    
    return new Promise((resolve) => {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pythonProcess = spawn(pythonCmd, [scriptPath, airport], {
        cwd: backendDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
      
      let stdout = '';
      let stderr = '';
      let timeoutId = setTimeout(() => {
        pythonProcess.kill();
        console.error('[API] Timeout lors de l\'exécution du script Python');
        res.json({
          destinations: {},
          aeroport: airport,
          message: 'Timeout lors du chargement des destinations. Cela peut prendre du temps.'
        });
        resolve();
      }, 60000); // 60 secondes max
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          console.error(`[API] Erreur script Python (code ${code})`);
          console.error(`[API] Stderr:`, stderr.substring(0, 500));
          return res.json({
            destinations: {},
            aeroport: airport,
            message: `Erreur Python: ${stderr.substring(0, 200) || 'Code de sortie ' + code}`
          });
        }
        
        try {
          const jsonOutput = stdout.trim();
          if (!jsonOutput) {
            return res.json({
              destinations: {},
              aeroport: airport,
              message: 'Aucune donnée retournée'
            });
          }
          
          const jsonMatch = jsonOutput.match(/\{[\s\S]*\}/);
          const destinations = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(jsonOutput);
          
          console.log(`[API] ${Object.keys(destinations).length} pays trouvés`);
          res.json({ destinations, aeroport: airport });
          resolve();
        } catch (parseError) {
          console.error('[API] Erreur parsing:', parseError.message);
          console.error('[API] Output:', stdout.substring(0, 200));
          res.json({
            destinations: {},
            aeroport: airport,
            message: 'Erreur parsing JSON: ' + parseError.message
          });
          resolve();
        }
      });
      
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error('[API] Erreur lancement Python:', error.message);
        res.json({
          destinations: {},
          aeroport: airport,
          message: `Python non disponible: ${error.message}`
        });
        resolve();
      });
    });
  } catch (error) {
    console.error('[API] Erreur endpoint destinations:', error);
    res.status(500).json({ 
      error: error.message,
      aeroport: req.query.airport || 'BVA'
    });
  }
});

// Endpoint Inspire
app.post('/api/inspire', async (req, res) => {
  try {
    const {
      budget,
      date_preset,
      departure,
      flexible_dates,
      destinations_exclues = [],
      limite_allers = 30
    } = req.body;

    res.json({
      resultats: [],
      nombre_requetes: 0,
      message: `0 destination(s) trouvee(s) pour ${budget}€`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoints Supabase
app.get('/api/config', (req, res) => {
  res.json({
    supabase_url: supabaseUrl || null,
    supabase_anon_key: supabaseAnonKey || null,
    available: !!(supabaseUrl && supabaseAnonKey)
  });
});

app.get('/api/supabase/status', async (req, res) => {
  if (!supabase) {
    return res.json({
      available: false,
      message: 'Supabase n\'est pas configure'
    });
  }

  try {
    // Tester la connexion
    const { error } = await supabase.from('user_profiles').select('id').limit(1);
    
    if (error) {
      return res.json({
        available: false,
        message: `Erreur de connexion: ${error.message}`
      });
    }

    res.json({
      available: true,
      message: 'Supabase est configure et connecte'
    });
  } catch (error) {
    res.json({
      available: false,
      message: `Erreur: ${error.message}`
    });
  }
});

// Endpoints pour les recherches sauvegardées
app.get('/api/supabase/searches', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    // Extraire le token JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { data, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supabase/searches', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { name, request } = req.body;

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: user.id,
        name,
        departure_airport: request.aeroport_depart || 'BVA',
        dates_depart: request.dates_depart,
        dates_retour: request.dates_retour,
        budget_max: request.budget_max || 200,
        limite_allers: request.limite_allers || 50,
        destinations_exclues: request.destinations_exclues || [],
        destinations_incluses: request.destinations_incluses
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/supabase/searches/:id', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoints pour les favoris
app.get('/api/supabase/favorites', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supabase/favorites', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { trip, search_request } = req.body;

    const { data, error } = await supabase
      .from('favorites')
      .insert({
        user_id: user.id,
        destination_code: trip.destination_code,
        destination_name: trip.aller.destinationFull,
        outbound_date: trip.aller.departureTime.split('T')[0],
        return_date: trip.retour.departureTime.split('T')[0],
        total_price: trip.prix_total,
        outbound_flight: trip.aller,
        return_flight: trip.retour,
        search_request: search_request
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/supabase/favorites/:id', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint auth
app.get('/api/auth/me', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase non configure' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json({ authenticated: false });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.json({ authenticated: false });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({
      authenticated: true,
      user_id: user.id,
      profile: profile || null
    });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur demarre sur http://localhost:${PORT}`);
  console.log(`📡 Supabase: ${supabase ? 'Configure' : 'Non configure'}`);
});

