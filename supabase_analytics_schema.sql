-- ============================================
-- Tables d'analytics pour FlightWatcher
-- Tracking des recherches et des clics SAS
-- ============================================

-- ============================================
-- 1. TABLE search_events
-- ============================================
CREATE TABLE IF NOT EXISTS search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Utilisateur (optionnel pour tracker anonyme)
    user_id UUID REFERENCES auth.users,
    
    -- Tracking anonyme (cookie de session)
    session_id TEXT, -- Identifiant de session depuis cookie (pour utilisateurs non connectés)
    
    -- Paramètres de recherche
    departure_airport TEXT NOT NULL,
    date_preset TEXT, -- 'weekend', 'next-weekend', 'next-week', 'flexible'
    budget INTEGER,
    dates_depart JSONB NOT NULL, -- Liste de DateAvecHoraire
    dates_retour JSONB NOT NULL,
    destinations_exclues JSONB DEFAULT '[]'::jsonb,
    limite_allers INTEGER DEFAULT 50,
    
    -- Résultats de la recherche
    results_count INTEGER DEFAULT 0,
    results JSONB, -- Résultats complets (optionnel, peut être volumineux)
    
    -- Metadata
    search_duration_ms INTEGER, -- Durée de la recherche en millisecondes
    api_requests_count INTEGER, -- Nombre de requêtes API effectuées
    
    -- Source
    source TEXT DEFAULT 'web', -- 'web', 'mobile', 'api'
    user_agent TEXT,
    ip_address INET -- Pour analytics géographiques (optionnel)
);

-- Ajouter session_id si la table existe déjà (migration)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'search_events') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'search_events' AND column_name = 'session_id') THEN
            ALTER TABLE search_events ADD COLUMN session_id TEXT;
        END IF;
    END IF;
END $$;

-- Index pour search_events
CREATE INDEX IF NOT EXISTS idx_search_events_user ON search_events(user_id);
CREATE INDEX IF NOT EXISTS idx_search_events_session ON search_events(session_id);
CREATE INDEX IF NOT EXISTS idx_search_events_created_at ON search_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_departure ON search_events(departure_airport);
CREATE INDEX IF NOT EXISTS idx_search_events_date_preset ON search_events(date_preset);
CREATE INDEX IF NOT EXISTS idx_search_events_budget ON search_events(budget);

-- ============================================
-- 2. TABLE booking_sas_events
-- ============================================
CREATE TABLE IF NOT EXISTS booking_sas_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Utilisateur (optionnel pour tracker anonyme)
    user_id UUID REFERENCES auth.users,
    
    -- Tracking anonyme (cookie de session)
    session_id TEXT, -- Identifiant de session depuis cookie (pour utilisateurs non connectés)
    
    -- Lien avec l'événement de recherche
    search_event_id UUID REFERENCES search_events(id), -- ID de l'événement de recherche associé
    
    -- Informations du vol
    trip_id TEXT, -- Identifiant unique du trip (destination_code + dates)
    destination_code TEXT NOT NULL,
    destination_name TEXT,
    departure_airport TEXT NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Détails du vol (JSON pour flexibilité)
    trip_data JSONB NOT NULL, -- Tout l'objet EnrichedTripResponse
    
    -- Partenaire sélectionné
    partner_id TEXT NOT NULL, -- 'ryanair', 'skyscanner', etc.
    partner_name TEXT NOT NULL,
    redirect_url TEXT NOT NULL,
    
    -- Action
    action_type TEXT DEFAULT 'redirect', -- 'redirect', 'manual_click', 'auto_redirect'
    countdown_seconds INTEGER, -- Temps restant avant redirection (si auto)
    
    -- Source
    source TEXT DEFAULT 'web', -- 'web', 'mobile', 'api'
    user_agent TEXT,
    ip_address INET -- Pour analytics géographiques (optionnel)
);

-- Ajouter session_id et search_event_id si la table existe déjà (migration)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_sas_events') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_sas_events' AND column_name = 'session_id') THEN
            ALTER TABLE booking_sas_events ADD COLUMN session_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_sas_events' AND column_name = 'search_event_id') THEN
            ALTER TABLE booking_sas_events ADD COLUMN search_event_id UUID REFERENCES search_events(id);
        END IF;
    END IF;
END $$;

-- Index pour booking_sas_events
CREATE INDEX IF NOT EXISTS idx_booking_sas_user ON booking_sas_events(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_sas_session ON booking_sas_events(session_id);
CREATE INDEX IF NOT EXISTS idx_booking_sas_search_event ON booking_sas_events(search_event_id);
CREATE INDEX IF NOT EXISTS idx_booking_sas_created_at ON booking_sas_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_sas_partner ON booking_sas_events(partner_id);
CREATE INDEX IF NOT EXISTS idx_booking_sas_destination ON booking_sas_events(destination_code);
CREATE INDEX IF NOT EXISTS idx_booking_sas_departure ON booking_sas_events(departure_airport);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Activer RLS sur les tables analytics
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_sas_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLITIQUES RLS pour search_events
-- ============================================
-- Lecture publique pour analytics (peut être restreint selon besoins)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'search_events' 
        AND policyname = 'Anyone can read search events'
    ) THEN
        CREATE POLICY "Anyone can read search events"
            ON search_events FOR SELECT
            USING (true);
    END IF;
END $$;

-- Insertion publique (pour tracker même les utilisateurs non connectés)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'search_events' 
        AND policyname = 'Anyone can insert search events'
    ) THEN
        CREATE POLICY "Anyone can insert search events"
            ON search_events FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- ============================================
-- POLITIQUES RLS pour booking_sas_events
-- ============================================
-- Lecture publique pour analytics (peut être restreint selon besoins)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'booking_sas_events' 
        AND policyname = 'Anyone can read booking sas events'
    ) THEN
        CREATE POLICY "Anyone can read booking sas events"
            ON booking_sas_events FOR SELECT
            USING (true);
    END IF;
END $$;

-- Insertion publique (pour tracker même les utilisateurs non connectés)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'booking_sas_events' 
        AND policyname = 'Anyone can insert booking sas events'
    ) THEN
        CREATE POLICY "Anyone can insert booking sas events"
            ON booking_sas_events FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- ============================================
-- FONCTIONS UTILES POUR ANALYTICS
-- ============================================

-- Supprimer les fonctions existantes avant de les recréer (pour permettre le changement de signature)
DROP FUNCTION IF EXISTS get_search_stats(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_booking_sas_stats(TIMESTAMPTZ, TIMESTAMPTZ);

-- Fonction pour obtenir les statistiques de recherche
CREATE OR REPLACE FUNCTION get_search_stats(
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    total_searches BIGINT,
    unique_users BIGINT,
    unique_sessions BIGINT,
    avg_results_count NUMERIC,
    most_popular_airport TEXT,
    most_popular_preset TEXT,
    avg_budget NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_searches,
        COUNT(DISTINCT user_id)::BIGINT as unique_users,
        COUNT(DISTINCT COALESCE(user_id::TEXT, session_id))::BIGINT as unique_sessions,
        AVG(results_count)::NUMERIC(10,2) as avg_results_count,
        MODE() WITHIN GROUP (ORDER BY departure_airport) as most_popular_airport,
        MODE() WITHIN GROUP (ORDER BY date_preset) as most_popular_preset,
        AVG(budget)::NUMERIC(10,2) as avg_budget
    FROM search_events
    WHERE created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour obtenir les statistiques de booking SAS
CREATE OR REPLACE FUNCTION get_booking_sas_stats(
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    total_clicks BIGINT,
    unique_users BIGINT,
    unique_sessions BIGINT,
    partner_clicks JSONB,
    avg_price NUMERIC,
    most_popular_destination TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH partner_counts AS (
        SELECT partner_id, COUNT(*) as click_count
        FROM booking_sas_events
        WHERE created_at BETWEEN p_start_date AND p_end_date
        GROUP BY partner_id
    )
    SELECT 
        COUNT(*)::BIGINT as total_clicks,
        COUNT(DISTINCT user_id)::BIGINT as unique_users,
        COUNT(DISTINCT COALESCE(user_id::TEXT, session_id))::BIGINT as unique_sessions,
        (SELECT jsonb_object_agg(partner_id, click_count) FROM partner_counts) as partner_clicks,
        AVG(total_price)::NUMERIC(10,2) as avg_price,
        MODE() WITHIN GROUP (ORDER BY destination_code) as most_popular_destination
    FROM booking_sas_events
    WHERE created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- NOTES IMPORTANTES
-- ============================================
-- 1. Les tables sont publiques en lecture pour permettre l'analytics
-- 2. L'insertion est publique pour tracker même les utilisateurs non connectés
-- 3. user_id est optionnel pour permettre le tracking anonyme
-- 4. session_id permet de tracker les utilisateurs anonymes via un cookie de session
--    - Générer un UUID côté frontend et le stocker dans un cookie
--    - Utiliser ce même session_id pour toutes les requêtes d'un même utilisateur anonyme
--    - Si user_id est présent, session_id peut être NULL (ou gardé pour continuité)
-- 5. ip_address peut être utilisé en complément pour le tracking géographique
-- 6. Les fonctions d'analytics peuvent être appelées depuis le dashboard Supabase
-- 7. unique_sessions compte les utilisateurs uniques (user_id ou session_id)
-- 8. Pour la confidentialité, considérez masquer ou hasher les IP addresses après analyse

