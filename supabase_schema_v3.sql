-- ============================================
-- Schéma SQL FlightWatcher v3
-- Système de brouillons, hôtels et planner
-- ============================================

-- ============================================
-- 1. TABLE trip_drafts (Brouillons de voyage)
-- Accessible SANS login via token unique
-- ============================================
CREATE TABLE IF NOT EXISTS trip_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    
    -- Propriétaire (optionnel - peut être NULL si pas connecté)
    user_id UUID REFERENCES auth.users ON DELETE SET NULL,
    
    -- Statut du brouillon
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'flight_booked', 'hotel_booked', 'complete', 'expired')),
    
    -- Données du vol sélectionné
    flight_data JSONB NOT NULL, -- TripResponse complet
    departure_airport TEXT NOT NULL,
    destination_code TEXT NOT NULL,
    destination_name TEXT,
    outbound_date DATE NOT NULL,
    return_date DATE NOT NULL,
    flight_total_price DECIMAL(10,2) NOT NULL,
    
    -- Données hôtel (remplies à l'étape 2)
    hotel_data JSONB, -- Hôtel sélectionné
    hotel_price_per_night DECIMAL(10,2),
    hotel_total_price DECIMAL(10,2),
    hotel_booked_at TIMESTAMPTZ,
    
    -- Participants (pour invitations - requiert login)
    participants JSONB DEFAULT '[]'::jsonb, -- [{email, name, status}]
    
    -- Checklist voyage
    checklist JSONB DEFAULT '{}'::jsonb, -- {flight_booked: bool, hotel_booked: bool, ...}
    
    -- Notes libres
    notes TEXT
);

-- Index pour trip_drafts
CREATE INDEX IF NOT EXISTS idx_drafts_token ON trip_drafts(token);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON trip_drafts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_status ON trip_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_expires ON trip_drafts(expires_at);
CREATE INDEX IF NOT EXISTS idx_drafts_destination ON trip_drafts(destination_code, outbound_date);

-- ============================================
-- 2. TABLE hotel_rates_cache (Cache tarifs hôtels)
-- ============================================
CREATE TABLE IF NOT EXISTS hotel_rates_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours'),
    
    -- Clé de cache
    cache_key TEXT UNIQUE NOT NULL, -- city:check_in:check_out
    city_code TEXT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    
    -- Résultats
    results JSONB NOT NULL, -- Liste des hôtels
    hotel_count INTEGER DEFAULT 0,
    
    -- Statistiques pour les tiers de prix
    price_min DECIMAL(10,2),
    price_max DECIMAL(10,2),
    price_median DECIMAL(10,2),
    price_p25 DECIMAL(10,2), -- 25e percentile
    price_p75 DECIMAL(10,2), -- 75e percentile
    
    -- Stats d'utilisation
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ
);

-- Index pour hotel_rates_cache
CREATE INDEX IF NOT EXISTS idx_hotel_cache_key ON hotel_rates_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_hotel_cache_city ON hotel_rates_cache(city_code, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_hotel_cache_expires ON hotel_rates_cache(expires_at);

-- ============================================
-- 3. TABLE user_rate_limits (Rate limiting par user/token)
-- ============================================
CREATE TABLE IF NOT EXISTS user_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT UNIQUE NOT NULL, -- user_id ou draft_token
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('user', 'token')),
    
    -- Compteurs par fenêtre
    hotel_searches_count INTEGER DEFAULT 0,
    hotel_searches_window_start TIMESTAMPTZ DEFAULT NOW(),
    
    -- Limites
    last_request_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour rate limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON user_rate_limits(identifier);

-- ============================================
-- 4. TABLE city_hotel_stats (Stats prix par ville - agrégées)
-- ============================================
CREATE TABLE IF NOT EXISTS city_hotel_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_code TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Stats globales (moyennes sur 30 jours)
    avg_price_economy DECIMAL(10,2), -- Tier économique
    avg_price_comfort DECIMAL(10,2), -- Tier confort (médian)
    avg_price_charm DECIMAL(10,2),   -- Tier charme
    
    -- Nombre d'hôtels par tier
    count_economy INTEGER DEFAULT 0,
    count_comfort INTEGER DEFAULT 0,
    count_charm INTEGER DEFAULT 0,
    
    sample_size INTEGER DEFAULT 0, -- Nombre de recherches agrégées
    
    UNIQUE(city_code)
);

-- Index pour city stats
CREATE INDEX IF NOT EXISTS idx_city_stats_code ON city_hotel_stats(city_code);

-- ============================================
-- 5. FONCTIONS UTILITAIRES
-- ============================================

-- Fonction pour obtenir ou créer un brouillon par token
CREATE OR REPLACE FUNCTION get_draft_by_token(p_token TEXT)
RETURNS trip_drafts AS $$
    SELECT * FROM trip_drafts 
    WHERE token = p_token 
    AND expires_at > NOW()
    AND status != 'expired'
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Fonction pour vérifier le rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier TEXT,
    p_identifier_type TEXT,
    p_limit INTEGER DEFAULT 20,
    p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    v_record user_rate_limits%ROWTYPE;
    v_window_start TIMESTAMPTZ;
BEGIN
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    -- Récupérer ou créer l'enregistrement
    SELECT * INTO v_record FROM user_rate_limits WHERE identifier = p_identifier;
    
    IF NOT FOUND THEN
        INSERT INTO user_rate_limits (identifier, identifier_type, hotel_searches_count, hotel_searches_window_start)
        VALUES (p_identifier, p_identifier_type, 1, NOW());
        RETURN TRUE;
    END IF;
    
    -- Reset si la fenêtre est expirée
    IF v_record.hotel_searches_window_start < v_window_start THEN
        UPDATE user_rate_limits 
        SET hotel_searches_count = 1, 
            hotel_searches_window_start = NOW(),
            last_request_at = NOW()
        WHERE identifier = p_identifier;
        RETURN TRUE;
    END IF;
    
    -- Vérifier la limite
    IF v_record.hotel_searches_count >= p_limit THEN
        RETURN FALSE;
    END IF;
    
    -- Incrémenter le compteur
    UPDATE user_rate_limits 
    SET hotel_searches_count = hotel_searches_count + 1,
        last_request_at = NOW()
    WHERE identifier = p_identifier;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer la note pondérée (Bayesian average)
CREATE OR REPLACE FUNCTION weighted_rating(
    p_rating DECIMAL,
    p_review_count INTEGER,
    p_confidence_threshold INTEGER DEFAULT 100,
    p_global_mean DECIMAL DEFAULT 7.5
)
RETURNS DECIMAL AS $$
    SELECT ((p_review_count * p_rating) + (p_confidence_threshold * p_global_mean)) 
           / (p_review_count + p_confidence_threshold);
$$ LANGUAGE SQL IMMUTABLE;

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE trip_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rates_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_hotel_stats ENABLE ROW LEVEL SECURITY;

-- trip_drafts : lecture publique par token, écriture par propriétaire ou anonyme
CREATE POLICY "Anyone can read drafts by token"
    ON trip_drafts FOR SELECT
    USING (true); -- Le filtrage par token se fait dans la requête

CREATE POLICY "Anyone can create drafts"
    ON trip_drafts FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update drafts by token or owner"
    ON trip_drafts FOR UPDATE
    USING (
        user_id IS NULL -- Brouillon anonyme
        OR auth.uid() = user_id -- Propriétaire
        OR auth.uid() IS NULL -- Service role
    );

-- hotel_rates_cache : lecture publique, écriture service_role
CREATE POLICY "Anyone can read hotel cache"
    ON hotel_rates_cache FOR SELECT
    USING (true);

CREATE POLICY "Service role can write hotel cache"
    ON hotel_rates_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update hotel cache"
    ON hotel_rates_cache FOR UPDATE
    USING (auth.role() = 'service_role');

-- user_rate_limits : service_role uniquement
CREATE POLICY "Service role manages rate limits"
    ON user_rate_limits FOR ALL
    USING (auth.role() = 'service_role');

-- city_hotel_stats : lecture publique
CREATE POLICY "Anyone can read city stats"
    ON city_hotel_stats FOR SELECT
    USING (true);

CREATE POLICY "Service role can write city stats"
    ON city_hotel_stats FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 7. TRIGGER pour updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drafts_updated_at
    BEFORE UPDATE ON trip_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 8. CLEANUP des brouillons expirés (à appeler périodiquement)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_drafts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM trip_drafts
        WHERE expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
