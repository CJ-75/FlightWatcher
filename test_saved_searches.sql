-- ============================================
-- Script de test pour vérifier saved_searches
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- ============================================
-- 1. VÉRIFICATION DE LA STRUCTURE DE LA TABLE
-- ============================================
DO $$
DECLARE
    test_passed BOOLEAN := TRUE;
    missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '=== TEST 1: Vérification de la structure de la table ===';
    
    -- Vérifier les colonnes essentielles
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'departure_airport'
    ) THEN
        test_passed := FALSE;
        missing_columns := array_append(missing_columns, 'departure_airport');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'check_interval_seconds'
    ) THEN
        test_passed := FALSE;
        missing_columns := array_append(missing_columns, 'check_interval_seconds');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'times_used'
    ) THEN
        test_passed := FALSE;
        missing_columns := array_append(missing_columns, 'times_used');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'user_id'
    ) THEN
        test_passed := FALSE;
        missing_columns := array_append(missing_columns, 'user_id');
    END IF;
    
    IF test_passed THEN
        RAISE NOTICE '✅ TEST 1 PASSÉ: Toutes les colonnes requises existent';
    ELSE
        RAISE NOTICE '❌ TEST 1 ÉCHOUÉ: Colonnes manquantes: %', array_to_string(missing_columns, ', ');
    END IF;
END $$;

-- ============================================
-- 2. VÉRIFICATION DES COLONNES OBSOLÈTES
-- ============================================
DO $$
DECLARE
    has_old_column BOOLEAN;
BEGIN
    RAISE NOTICE '=== TEST 2: Vérification des colonnes obsolètes ===';
    
    -- Vérifier si aeroport_depart existe encore (ne devrait pas)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'aeroport_depart'
    ) INTO has_old_column;
    
    IF has_old_column THEN
        RAISE NOTICE '⚠️ TEST 2 ATTENTION: Colonne obsolète aeroport_depart existe encore';
    ELSE
        RAISE NOTICE '✅ TEST 2 PASSÉ: Colonne obsolète aeroport_depart n''existe plus';
    END IF;
    
    -- Vérifier si auto_check_interval_seconds existe encore (ne devrait pas)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'auto_check_interval_seconds'
    ) INTO has_old_column;
    
    IF has_old_column THEN
        RAISE NOTICE '⚠️ TEST 2 ATTENTION: Colonne obsolète auto_check_interval_seconds existe encore';
    ELSE
        RAISE NOTICE '✅ TEST 2 PASSÉ: Colonne obsolète auto_check_interval_seconds n''existe plus';
    END IF;
END $$;

-- ============================================
-- 3. VÉRIFICATION DE RLS
-- ============================================
DO $$
DECLARE
    rls_enabled BOOLEAN;
BEGIN
    RAISE NOTICE '=== TEST 3: Vérification de RLS ===';
    
    SELECT rowsecurity INTO rls_enabled
    FROM pg_tables
    WHERE schemaname = 'public' 
    AND tablename = 'saved_searches';
    
    IF rls_enabled THEN
        RAISE NOTICE '✅ TEST 3 PASSÉ: RLS est activé';
    ELSE
        RAISE NOTICE '❌ TEST 3 ÉCHOUÉ: RLS n''est pas activé';
    END IF;
END $$;

-- ============================================
-- 4. VÉRIFICATION DES POLITIQUES RLS
-- ============================================
DO $$
DECLARE
    policy_count INTEGER;
    required_policies TEXT[] := ARRAY[
        'Users see own searches',
        'Users can insert own searches',
        'Users can update own searches',
        'Users can delete own searches'
    ];
    missing_policies TEXT[] := ARRAY[]::TEXT[];
    policy_name TEXT;
BEGIN
    RAISE NOTICE '=== TEST 4: Vérification des politiques RLS ===';
    
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'saved_searches';
    
    RAISE NOTICE 'Nombre de politiques trouvées: %', policy_count;
    
    -- Vérifier chaque politique requise
    FOREACH policy_name IN ARRAY required_policies
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = 'saved_searches'
            AND policyname = policy_name
        ) THEN
            missing_policies := array_append(missing_policies, policy_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_policies, 1) IS NULL THEN
        RAISE NOTICE '✅ TEST 4 PASSÉ: Toutes les politiques requises existent';
    ELSE
        RAISE NOTICE '❌ TEST 4 ÉCHOUÉ: Politiques manquantes: %', array_to_string(missing_policies, ', ');
    END IF;
END $$;

-- ============================================
-- 5. VÉRIFICATION DES INDEX
-- ============================================
DO $$
DECLARE
    index_count INTEGER;
    required_indexes TEXT[] := ARRAY[
        'idx_saved_searches_user',
        'idx_saved_searches_auto_check',
        'idx_saved_searches_created_at'
    ];
    missing_indexes TEXT[] := ARRAY[]::TEXT[];
    index_name TEXT;
BEGIN
    RAISE NOTICE '=== TEST 5: Vérification des index ===';
    
    FOREACH index_name IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = 'saved_searches'
            AND indexname = index_name
        ) THEN
            missing_indexes := array_append(missing_indexes, index_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_indexes, 1) IS NULL THEN
        RAISE NOTICE '✅ TEST 5 PASSÉ: Tous les index requis existent';
    ELSE
        RAISE NOTICE '⚠️ TEST 5 ATTENTION: Index manquants: %', array_to_string(missing_indexes, ', ');
    END IF;
END $$;

-- ============================================
-- 6. VÉRIFICATION DES DONNÉES EXISTANTES
-- ============================================
DO $$
DECLARE
    total_count INTEGER;
    null_user_id_count INTEGER;
    old_column_data_count INTEGER;
BEGIN
    RAISE NOTICE '=== TEST 6: Vérification des données existantes ===';
    
    SELECT COUNT(*) INTO total_count FROM saved_searches;
    RAISE NOTICE 'Nombre total de recherches sauvegardées: %', total_count;
    
    -- Vérifier s'il y a des user_id NULL (ne devrait pas y en avoir après migration)
    SELECT COUNT(*) INTO null_user_id_count 
    FROM saved_searches 
    WHERE user_id IS NULL;
    
    IF null_user_id_count > 0 THEN
        RAISE NOTICE '⚠️ TEST 6 ATTENTION: % recherche(s) avec user_id NULL', null_user_id_count;
    ELSE
        RAISE NOTICE '✅ TEST 6 PASSÉ: Aucun user_id NULL trouvé';
    END IF;
    
    -- Vérifier s'il y a des données utilisant les anciennes colonnes (ne devrait pas être possible)
    -- Note: Cette vérification ne fonctionnera que si les colonnes existent encore
    BEGIN
        SELECT COUNT(*) INTO old_column_data_count 
        FROM saved_searches 
        WHERE aeroport_depart IS NOT NULL;
        
        IF old_column_data_count > 0 THEN
            RAISE NOTICE '⚠️ TEST 6 ATTENTION: % recherche(s) utilisent encore aeroport_depart', old_column_data_count;
        END IF;
    EXCEPTION
        WHEN undefined_column THEN
            RAISE NOTICE '✅ TEST 6 PASSÉ: Colonne aeroport_depart n''existe plus (bon signe)';
    END;
END $$;

-- ============================================
-- 7. TEST D'INSERTION (nécessite un utilisateur connecté)
-- ============================================
DO $$
DECLARE
    test_user_id UUID;
    test_search_id UUID;
    insert_success BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '=== TEST 7: Test d''insertion ===';
    
    -- Récupérer un user_id existant pour le test
    SELECT user_id INTO test_user_id 
    FROM saved_searches 
    LIMIT 1;
    
    -- Si aucun user_id trouvé, essayer avec auth.uid()
    IF test_user_id IS NULL THEN
        BEGIN
            test_user_id := auth.uid();
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '⚠️ TEST 7 SKIPPÉ: Aucun utilisateur connecté pour le test';
                RETURN;
        END;
    END IF;
    
    IF test_user_id IS NULL THEN
        RAISE NOTICE '⚠️ TEST 7 SKIPPÉ: Impossible de trouver un user_id pour le test';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Utilisation de user_id: % pour le test', test_user_id;
    
    -- Essayer d'insérer une recherche de test
    BEGIN
        INSERT INTO saved_searches (
            user_id,
            name,
            departure_airport,
            dates_depart,
            dates_retour,
            budget_max,
            limite_allers
        ) VALUES (
            test_user_id,
            'TEST - Recherche de test',
            'BVA',
            '[]'::jsonb,
            '[]'::jsonb,
            200,
            50
        ) RETURNING id INTO test_search_id;
        
        RAISE NOTICE '✅ TEST 7 PASSÉ: Insertion réussie avec id: %', test_search_id;
        insert_success := TRUE;
        
        -- Nettoyer: supprimer la recherche de test
        DELETE FROM saved_searches WHERE id = test_search_id;
        RAISE NOTICE 'Recherche de test supprimée';
        
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '❌ TEST 7 ÉCHOUÉ: Erreur lors de l''insertion: %', SQLERRM;
    END;
END $$;

-- ============================================
-- 8. RÉSUMÉ FINAL
-- ============================================
SELECT 
    '=== RÉSUMÉ FINAL ===' as status,
    (SELECT COUNT(*) FROM saved_searches) as total_searches,
    (SELECT COUNT(DISTINCT user_id) FROM saved_searches) as unique_users,
    (SELECT COUNT(*) FROM saved_searches WHERE auto_check_enabled = TRUE) as auto_check_enabled_count,
    (SELECT COUNT(*) FROM saved_searches WHERE user_id IS NULL) as null_user_id_count;

-- Afficher les colonnes actuelles
SELECT 
    '=== COLONNES ACTUELLES ===' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'saved_searches'
ORDER BY ordinal_position;

-- Afficher les politiques RLS
SELECT 
    '=== POLITIQUES RLS ===' as info,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'saved_searches';

-- Afficher les index
SELECT 
    '=== INDEX ===' as info,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'saved_searches';

