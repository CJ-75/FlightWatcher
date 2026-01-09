-- ============================================
-- Script pour vérifier les colonnes de la table saved_searches
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Lister toutes les colonnes de la table saved_searches
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'saved_searches'
ORDER BY ordinal_position;

-- Vérifier si la table existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'saved_searches'
) as table_exists;

-- Si la table existe, voir un exemple de données (sans spécifier de colonnes)
SELECT * FROM saved_searches LIMIT 1;

