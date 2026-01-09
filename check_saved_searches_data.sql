-- ============================================
-- Script pour vérifier les données dans la table saved_searches
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Vérifier si la table existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'saved_searches'
) as table_exists;

-- Compter le nombre total de recherches sauvegardées
SELECT COUNT(*) as total_searches FROM saved_searches;

-- Voir toutes les recherches (sans filtre user pour debug)
-- Utilise COALESCE pour gérer les deux noms de colonnes possibles
SELECT 
    id,
    user_id,
    name,
    COALESCE(
        (SELECT column_name FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'saved_searches' 
         AND column_name = 'departure_airport'),
        'aeroport_depart'
    ) as airport_column_name,
    created_at,
    auto_check_enabled,
    COALESCE(times_used, 0) as times_used
FROM saved_searches
ORDER BY created_at DESC
LIMIT 10;

-- Alternative : voir toutes les colonnes disponibles
SELECT * FROM saved_searches LIMIT 1;

-- Vérifier les politiques RLS sur saved_searches
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'saved_searches';

-- Vérifier si RLS est activé sur la table
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'saved_searches';

-- Activer RLS si nécessaire
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_searches' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS activé sur saved_searches';
    ELSE
        RAISE NOTICE 'RLS déjà activé sur saved_searches';
    END IF;
END $$;

-- Vérifier les données récentes (dernières 24h)
-- Utilise * pour éviter les problèmes de noms de colonnes
SELECT * FROM saved_searches
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Tester une requête avec auth.uid() (simuler un utilisateur connecté)
-- Remplacez 'VOTRE_USER_ID' par votre UUID d'utilisateur
-- SELECT * FROM saved_searches WHERE user_id = 'VOTRE_USER_ID';

