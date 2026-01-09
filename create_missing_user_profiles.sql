-- ============================================
-- Script pour créer les profils utilisateurs manquants
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Créer les profils pour tous les utilisateurs qui n'en ont pas encore
-- Version compatible avec les anciennes et nouvelles structures de table
DO $$
DECLARE
    has_email_column BOOLEAN;
    has_full_name_column BOOLEAN;
    has_avatar_url_column BOOLEAN;
BEGIN
    -- Vérifier quelles colonnes existent
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' AND column_name = 'email'
    ) INTO has_email_column;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' AND column_name = 'full_name'
    ) INTO has_full_name_column;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
    ) INTO has_avatar_url_column;
    
    -- Insérer les profils selon les colonnes disponibles
    IF has_email_column AND has_full_name_column AND has_avatar_url_column THEN
        -- Version complète avec tous les champs
        INSERT INTO public.user_profiles (
            id, 
            email,
            full_name,
            avatar_url,
            referral_code, 
            created_at, 
            last_active
        )
        SELECT 
            u.id,
            u.email,
            COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as full_name,
            u.raw_user_meta_data->>'avatar_url' as avatar_url,
            UPPER(SUBSTRING(MD5(RANDOM()::TEXT || u.id::TEXT) FROM 1 FOR 8)) as referral_code,
            u.created_at,
            COALESCE(u.updated_at, u.created_at) as last_active
        FROM auth.users u
        LEFT JOIN public.user_profiles up ON u.id = up.id
        WHERE up.id IS NULL
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
            avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
            last_active = NOW();
    ELSE
        -- Version minimale sans les nouveaux champs
        INSERT INTO public.user_profiles (
            id, 
            referral_code, 
            created_at, 
            last_active
        )
        SELECT 
            u.id,
            UPPER(SUBSTRING(MD5(RANDOM()::TEXT || u.id::TEXT) FROM 1 FOR 8)) as referral_code,
            u.created_at,
            COALESCE(u.updated_at, u.created_at) as last_active
        FROM auth.users u
        LEFT JOIN public.user_profiles up ON u.id = up.id
        WHERE up.id IS NULL
        ON CONFLICT (id) DO UPDATE SET
            last_active = NOW();
    END IF;
END $$;

-- Vérifier qu'il n'y a pas de doublons de referral_code
-- Si c'est le cas, régénérer les codes en double
DO $$
DECLARE
    duplicate_record RECORD;
    new_code TEXT;
BEGIN
    FOR duplicate_record IN 
        SELECT id, referral_code 
        FROM user_profiles 
        WHERE referral_code IN (
            SELECT referral_code 
            FROM user_profiles 
            GROUP BY referral_code 
            HAVING COUNT(*) > 1
        )
    LOOP
        -- Générer un nouveau code unique
        LOOP
            new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || duplicate_record.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));
            EXIT WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE referral_code = new_code);
        END LOOP;
        
        -- Mettre à jour le code
        UPDATE user_profiles 
        SET referral_code = new_code 
        WHERE id = duplicate_record.id;
    END LOOP;
END $$;

-- Afficher le nombre de profils créés
SELECT COUNT(*) as total_profiles FROM user_profiles;

