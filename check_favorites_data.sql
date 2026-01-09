-- ============================================
-- Script pour vérifier les données dans la table favorites
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Vérifier si la table existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'favorites'
) as table_exists;

-- Compter le nombre total de favoris
SELECT COUNT(*) as total_favorites FROM favorites;

-- Voir tous les favoris (sans filtre user pour debug)
SELECT 
    id,
    user_id,
    destination_code,
    destination_name,
    created_at,
    is_archived,
    is_available
FROM favorites
ORDER BY created_at DESC
LIMIT 10;

-- Vérifier les politiques RLS sur favorites
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
WHERE tablename = 'favorites';

-- Vérifier si RLS est activé sur la table
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'favorites';

-- Activer RLS si nécessaire
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'favorites' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS activé sur favorites';
    ELSE
        RAISE NOTICE 'RLS déjà activé sur favorites';
    END IF;
END $$;

-- Vérifier les données récentes (dernières 24h)
SELECT 
    id,
    user_id,
    destination_code,
    destination_name,
    created_at,
    is_archived,
    is_available,
    outbound_flight->>'departureTime' as outbound_departure_time,
    return_flight->>'departureTime' as return_departure_time
FROM favorites
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Tester une requête avec auth.uid() (simuler un utilisateur connecté)
-- Remplacez 'VOTRE_USER_ID' par votre UUID d'utilisateur
-- SELECT * FROM favorites WHERE user_id = 'VOTRE_USER_ID';

