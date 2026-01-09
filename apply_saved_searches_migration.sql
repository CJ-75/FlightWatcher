-- ============================================
-- Script complet pour migrer saved_searches vers le nouveau schéma
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- 1. Vérifier et renommer les colonnes
DO $$
DECLARE
    has_aeroport_depart BOOLEAN;
    has_departure_airport BOOLEAN;
    has_auto_check_interval_seconds BOOLEAN;
    has_check_interval_seconds BOOLEAN;
    has_times_used BOOLEAN;
    has_user_id_constraint BOOLEAN;
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
        RAISE NOTICE '✅ Colonne aeroport_depart renommée en departure_airport';
    ELSIF has_departure_airport THEN
        RAISE NOTICE '✅ Colonne departure_airport existe déjà';
    ELSE
        RAISE NOTICE '⚠️ Aucune colonne d''aéroport de départ trouvée';
    END IF;
    
    -- Renommer auto_check_interval_seconds en check_interval_seconds si nécessaire
    IF has_auto_check_interval_seconds AND NOT has_check_interval_seconds THEN
        ALTER TABLE saved_searches RENAME COLUMN auto_check_interval_seconds TO check_interval_seconds;
        RAISE NOTICE '✅ Colonne auto_check_interval_seconds renommée en check_interval_seconds';
    ELSIF has_check_interval_seconds THEN
        RAISE NOTICE '✅ Colonne check_interval_seconds existe déjà';
    END IF;
    
    -- Ajouter times_used si elle n'existe pas
    IF NOT has_times_used THEN
        ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
        RAISE NOTICE '✅ Colonne times_used ajoutée';
    ELSE
        RAISE NOTICE '✅ Colonne times_used existe déjà';
    END IF;
    
    -- Ajouter la contrainte NOT NULL sur user_id si possible
    BEGIN
        -- D'abord, mettre à jour les valeurs NULL si nécessaire
        UPDATE saved_searches SET user_id = auth.uid() WHERE user_id IS NULL;
        
        -- Ensuite, ajouter la contrainte NOT NULL
        ALTER TABLE saved_searches ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE '✅ Colonne user_id définie comme NOT NULL';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '⚠️ Impossible de définir user_id comme NOT NULL: %', SQLERRM;
    END;
    
END $$;

-- 2. S'assurer que RLS est activé
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer les anciennes politiques si elles existent (ancien schéma avec accès anonyme)
DROP POLICY IF EXISTS "Allow anonymous read access" ON saved_searches;
DROP POLICY IF EXISTS "Allow anonymous insert" ON saved_searches;
DROP POLICY IF EXISTS "Allow anonymous update" ON saved_searches;
DROP POLICY IF EXISTS "Allow anonymous delete" ON saved_searches;

-- 4. Créer les nouvelles politiques RLS (accès basé sur user_id)
DROP POLICY IF EXISTS "Users see own searches" ON saved_searches;
CREATE POLICY "Users see own searches"
    ON saved_searches FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own searches" ON saved_searches;
CREATE POLICY "Users can insert own searches"
    ON saved_searches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own searches" ON saved_searches;
CREATE POLICY "Users can update own searches"
    ON saved_searches FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own searches" ON saved_searches;
CREATE POLICY "Users can delete own searches"
    ON saved_searches FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Créer les index si nécessaire
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_auto_check ON saved_searches(user_id, auto_check_enabled) WHERE auto_check_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at DESC);

-- 6. Vérifier le résultat final
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'saved_searches'
ORDER BY ordinal_position;

-- 7. Vérifier les politiques RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'saved_searches';

-- 8. Vérifier que RLS est activé
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'saved_searches';

