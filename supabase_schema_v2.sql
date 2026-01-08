-- ============================================
-- Schéma SQL complet pour FlightWatcher v2
-- Migration vers Supabase avec authentification
-- ============================================
-- Exécutez ce script dans l'éditeur SQL de votre projet Supabase

-- ============================================
-- 1. TABLE user_profiles
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    home_airport TEXT, -- 'CDG', 'ORY', 'BVA', etc.
    referral_code TEXT UNIQUE, -- Pour viralité future
    referred_by UUID REFERENCES auth.users,
    migration_completed BOOLEAN DEFAULT FALSE -- Flag pour migration localStorage
);

-- Index pour user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_referral ON user_profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_user_profiles_referred_by ON user_profiles(referred_by);

-- ============================================
-- 2. TABLE saved_searches
-- ============================================
CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Paramètres de recherche
    name TEXT NOT NULL, -- "Weekends pas chers"
    departure_airport TEXT NOT NULL,
    dates_depart JSONB NOT NULL, -- Liste de DateAvecHoraire
    dates_retour JSONB NOT NULL,
    budget_max INTEGER DEFAULT 200,
    limite_allers INTEGER DEFAULT 50,
    destinations_exclues JSONB DEFAULT '[]'::jsonb,
    destinations_incluses JSONB,
    
    -- Auto-check
    auto_check_enabled BOOLEAN DEFAULT FALSE,
    check_interval_seconds INTEGER DEFAULT 3600,
    last_checked_at TIMESTAMPTZ,
    last_check_results JSONB,
    
    -- Metadata
    times_used INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,
    
    CONSTRAINT valid_budget CHECK (budget_max > 0),
    CONSTRAINT valid_limite_allers CHECK (limite_allers > 0),
    CONSTRAINT valid_check_interval CHECK (check_interval_seconds >= 60)
);

-- Index pour saved_searches
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_auto_check ON saved_searches(user_id, auto_check_enabled) WHERE auto_check_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at DESC);

-- ============================================
-- 3. TABLE favorites
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Référence à la recherche associée (optionnelle)
    search_id UUID REFERENCES saved_searches(id) ON DELETE SET NULL,
    
    -- Détails du vol
    destination_code TEXT NOT NULL,
    destination_name TEXT,
    outbound_date DATE,
    return_date DATE,
    total_price DECIMAL(10,2),
    
    -- Snapshots des vols (JSON pour flexibilité)
    outbound_flight JSONB NOT NULL, -- Tout l'objet FlightResponse
    return_flight JSONB NOT NULL,
    
    -- Requête de recherche associée
    search_request JSONB NOT NULL,
    
    -- Statut
    is_archived BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    last_availability_check TIMESTAMPTZ,
    
    -- Booking
    booking_url TEXT,
    booked BOOLEAN DEFAULT FALSE,
    
    CONSTRAINT valid_price CHECK (total_price >= 0)
);

-- Index pour favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_active ON favorites(user_id, is_archived) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_favorites_search_id ON favorites(search_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC);

-- ============================================
-- 4. TABLE price_history (VOTRE MOAT)
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Route
    departure_airport TEXT NOT NULL,
    destination_code TEXT NOT NULL,
    flight_date DATE NOT NULL,
    
    -- Prix
    price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    
    -- Metadata
    airline TEXT DEFAULT 'Ryanair',
    source TEXT DEFAULT 'api_scan', -- 'api_scan', 'auto_check', etc.
    flight_number TEXT,
    
    CONSTRAINT valid_price_history CHECK (price > 0)
);

-- Index critiques pour performance
CREATE INDEX IF NOT EXISTS idx_price_route_date ON price_history(
    departure_airport, 
    destination_code, 
    flight_date
);
CREATE INDEX IF NOT EXISTS idx_price_recorded ON price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_route ON price_history(departure_airport, destination_code);

-- Fonction helper pour moyenne prix 30 derniers jours
CREATE OR REPLACE FUNCTION get_avg_price_last_30_days(
    p_departure TEXT,
    p_destination TEXT
)
RETURNS DECIMAL AS $$
    SELECT AVG(price)::DECIMAL(10,2)
    FROM price_history
    WHERE departure_airport = p_departure
      AND destination_code = p_destination
      AND recorded_at > NOW() - INTERVAL '30 days'
$$ LANGUAGE SQL STABLE;

-- ============================================
-- 5. TABLE search_results_cache
-- ============================================
CREATE TABLE IF NOT EXISTS search_results_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
    
    -- Clé de cache (hash de ces valeurs)
    cache_key TEXT UNIQUE NOT NULL, -- Hash de departure_airport + budget + dates
    departure_airport TEXT NOT NULL,
    budget_max INTEGER,
    dates_depart JSONB NOT NULL,
    dates_retour JSONB NOT NULL,
    
    -- Résultats (JSON)
    results JSONB NOT NULL,
    
    -- Stats
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ
);

-- Index pour cache
-- Note: On ne peut pas utiliser NOW() dans un index predicate (doit être IMMUTABLE)
-- On crée un index simple et on filtre dans les requêtes
CREATE INDEX IF NOT EXISTS idx_cache_key ON search_results_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON search_results_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_key_expires ON search_results_cache(cache_key, expires_at);

-- Fonction pour nettoyer le cache expiré (optionnel, peut être appelée périodiquement)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
    DELETE FROM search_results_cache
    WHERE expires_at < NOW();
    SELECT COUNT(*)::INTEGER FROM search_results_cache;
$$ LANGUAGE SQL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Activer RLS sur toutes les tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results_cache ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLITIQUES RLS pour user_profiles
-- ============================================
CREATE POLICY "Users see own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- POLITIQUES RLS pour saved_searches
-- ============================================
CREATE POLICY "Users see own searches"
    ON saved_searches FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
    ON saved_searches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own searches"
    ON saved_searches FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches"
    ON saved_searches FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- POLITIQUES RLS pour favorites
-- ============================================
CREATE POLICY "Users see own favorites"
    ON favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
    ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own favorites"
    ON favorites FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
    ON favorites FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- POLITIQUES RLS pour price_history
-- ============================================
-- Lecture publique (pour analytics futures)
CREATE POLICY "Anyone can read price history"
    ON price_history FOR SELECT
    USING (true);

-- Écriture uniquement par service_role (backend)
CREATE POLICY "Only service role can insert price history"
    ON price_history FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- POLITIQUES RLS pour search_results_cache
-- ============================================
-- Lecture publique (pour performance)
CREATE POLICY "Anyone can read cache"
    ON search_results_cache FOR SELECT
    USING (true);

-- Écriture uniquement par service_role (backend)
CREATE POLICY "Only service role can insert cache"
    ON search_results_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update cache"
    ON search_results_cache FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- TRIGGERS UTILES
-- ============================================

-- Mettre à jour last_active dans user_profiles à chaque action
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_profiles
    SET last_active = NOW()
    WHERE id = COALESCE(NEW.user_id, auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur saved_searches
CREATE TRIGGER trigger_update_last_active_searches
    AFTER INSERT OR UPDATE ON saved_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();

-- Trigger sur favorites
CREATE TRIGGER trigger_update_last_active_favorites
    AFTER INSERT OR UPDATE ON favorites
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();

-- ============================================
-- NOTES IMPORTANTES
-- ============================================
-- 1. Les tables auth.users sont gérées automatiquement par Supabase Auth
-- 2. Le service_role key doit être utilisé uniquement côté backend
-- 3. Les politiques RLS garantissent que les users ne voient que leurs données
-- 4. price_history et cache sont publics en lecture pour performance
-- 5. La fonction get_avg_price_last_30_days() peut être utilisée pour analytics

