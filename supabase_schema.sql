-- Schéma SQL pour Supabase FlightWatcher
-- Exécutez ce script dans l'éditeur SQL de votre projet Supabase

-- Table pour les recherches sauvegardées
CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    aeroport_depart TEXT NOT NULL,
    dates_depart JSONB NOT NULL,
    dates_retour JSONB NOT NULL,
    budget_max INTEGER DEFAULT 200,
    limite_allers INTEGER DEFAULT 50,
    destinations_exclues JSONB DEFAULT '[]'::jsonb,
    destinations_incluses JSONB,
    auto_check_enabled BOOLEAN DEFAULT FALSE,
    auto_check_interval_seconds INTEGER DEFAULT 300,
    last_checked_at TIMESTAMPTZ,
    last_check_results JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used TIMESTAMPTZ,
    user_id UUID, -- Pour futures fonctionnalités multi-utilisateurs
    CONSTRAINT valid_budget CHECK (budget_max > 0),
    CONSTRAINT valid_limite_allers CHECK (limite_allers > 0)
);

-- Table pour les favoris
CREATE TABLE IF NOT EXISTS saved_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID REFERENCES saved_searches(id) ON DELETE SET NULL,
    trip_data JSONB NOT NULL,
    search_request JSONB NOT NULL,
    is_still_valid BOOLEAN,
    last_checked TIMESTAMPTZ,
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID, -- Pour futures fonctionnalités multi-utilisateurs
    CONSTRAINT valid_trip_data CHECK (trip_data IS NOT NULL)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_searches_auto_check ON saved_searches(auto_check_enabled) WHERE auto_check_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_saved_favorites_search_id ON saved_favorites(search_id);
CREATE INDEX IF NOT EXISTS idx_saved_favorites_archived ON saved_favorites(archived);
CREATE INDEX IF NOT EXISTS idx_saved_favorites_created_at ON saved_favorites(created_at DESC);

-- RLS (Row Level Security) - Activer si vous utilisez l'authentification Supabase
-- Pour l'instant, désactivé pour permettre l'accès anonyme
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_favorites ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'accès anonyme (à modifier selon vos besoins de sécurité)
CREATE POLICY "Allow anonymous read access" ON saved_searches
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert" ON saved_searches
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON saved_searches
    FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete" ON saved_searches
    FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON saved_favorites
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert" ON saved_favorites
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON saved_favorites
    FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete" ON saved_favorites
    FOR DELETE USING (true);

