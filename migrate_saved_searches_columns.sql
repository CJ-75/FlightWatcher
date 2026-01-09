-- ============================================
-- Script de migration pour renommer les colonnes de saved_searches
-- Migre de l'ancien schéma (supabase_schema.sql) vers le nouveau (supabase_schema_v2.sql)
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Vérifier quelles colonnes existent actuellement
DO $$
DECLARE
    has_aeroport_depart BOOLEAN;
    has_departure_airport BOOLEAN;
    has_auto_check_interval_seconds BOOLEAN;
    has_check_interval_seconds BOOLEAN;
    has_times_used BOOLEAN;
BEGIN
    -- Vérifier si aeroport_depart existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'aeroport_depart'
    ) INTO has_aeroport_depart;
    
    -- Vérifier si departure_airport existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'departure_airport'
    ) INTO has_departure_airport;
    
    -- Vérifier si auto_check_interval_seconds existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'auto_check_interval_seconds'
    ) INTO has_auto_check_interval_seconds;
    
    -- Vérifier si check_interval_seconds existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'check_interval_seconds'
    ) INTO has_check_interval_seconds;
    
    -- Vérifier si times_used existe
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'times_used'
    ) INTO has_times_used;
    
    -- Renommer aeroport_depart en departure_airport si nécessaire
    IF has_aeroport_depart AND NOT has_departure_airport THEN
        ALTER TABLE saved_searches RENAME COLUMN aeroport_depart TO departure_airport;
        RAISE NOTICE 'Colonne aeroport_depart renommée en departure_airport';
    ELSIF has_departure_airport THEN
        RAISE NOTICE 'Colonne departure_airport existe déjà';
    ELSE
        RAISE NOTICE 'Aucune colonne d''aéroport de départ trouvée';
    END IF;
    
    -- Renommer auto_check_interval_seconds en check_interval_seconds si nécessaire
    IF has_auto_check_interval_seconds AND NOT has_check_interval_seconds THEN
        ALTER TABLE saved_searches RENAME COLUMN auto_check_interval_seconds TO check_interval_seconds;
        RAISE NOTICE 'Colonne auto_check_interval_seconds renommée en check_interval_seconds';
    ELSIF has_check_interval_seconds THEN
        RAISE NOTICE 'Colonne check_interval_seconds existe déjà';
    END IF;
    
    -- Ajouter times_used si elle n'existe pas
    IF NOT has_times_used THEN
        ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne times_used ajoutée';
    ELSE
        RAISE NOTICE 'Colonne times_used existe déjà';
    END IF;
    
    -- S'assurer que user_id est NOT NULL (si la table existe déjà avec user_id nullable)
    BEGIN
        ALTER TABLE saved_searches ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE 'Colonne user_id définie comme NOT NULL';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Impossible de définir user_id comme NOT NULL (peut-être déjà NOT NULL ou contient des NULL)';
    END;
    
END $$;

-- Vérifier le résultat
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'saved_searches'
ORDER BY ordinal_position;

