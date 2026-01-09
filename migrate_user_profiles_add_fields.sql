-- ============================================
-- Script de migration pour ajouter les nouveaux champs à user_profiles
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Ajouter les nouveaux champs à la table user_profiles (si ils n'existent pas déjà)
DO $$ 
BEGIN
    -- Informations de base
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'email') THEN
        ALTER TABLE user_profiles ADD COLUMN email TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'full_name') THEN
        ALTER TABLE user_profiles ADD COLUMN full_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'display_name') THEN
        ALTER TABLE user_profiles ADD COLUMN display_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT;
    END IF;
    
    -- Préférences de voyage
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'preferred_airports') THEN
        ALTER TABLE user_profiles ADD COLUMN preferred_airports JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'default_budget') THEN
        ALTER TABLE user_profiles ADD COLUMN default_budget INTEGER DEFAULT 200;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'default_limite_allers') THEN
        ALTER TABLE user_profiles ADD COLUMN default_limite_allers INTEGER DEFAULT 50;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'currency') THEN
        ALTER TABLE user_profiles ADD COLUMN currency TEXT DEFAULT 'EUR';
    END IF;
    
    -- Préférences de notification
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'email_notifications') THEN
        ALTER TABLE user_profiles ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'price_alerts_enabled') THEN
        ALTER TABLE user_profiles ADD COLUMN price_alerts_enabled BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'weekly_digest_enabled') THEN
        ALTER TABLE user_profiles ADD COLUMN weekly_digest_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Préférences d'affichage
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'language') THEN
        ALTER TABLE user_profiles ADD COLUMN language TEXT DEFAULT 'fr';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'timezone') THEN
        ALTER TABLE user_profiles ADD COLUMN timezone TEXT DEFAULT 'Europe/Paris';
    END IF;
    
    -- Système de parrainage
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'referral_count') THEN
        ALTER TABLE user_profiles ADD COLUMN referral_count INTEGER DEFAULT 0;
    END IF;
    
    -- Statistiques
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'total_searches') THEN
        ALTER TABLE user_profiles ADD COLUMN total_searches INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'total_favorites') THEN
        ALTER TABLE user_profiles ADD COLUMN total_favorites INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'total_bookings') THEN
        ALTER TABLE user_profiles ADD COLUMN total_bookings INTEGER DEFAULT 0;
    END IF;
    
    -- Migration et métadonnées
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'onboarding_completed') THEN
        ALTER TABLE user_profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'last_onboarding_step') THEN
        ALTER TABLE user_profiles ADD COLUMN last_onboarding_step INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'metadata') THEN
        ALTER TABLE user_profiles ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Créer les index supplémentaires
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_home_airport ON user_profiles(home_airport);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_active ON user_profiles(last_active DESC);

-- Mettre à jour les profils existants avec les données depuis auth.users
UPDATE user_profiles up
SET 
    email = COALESCE(up.email, u.email),
    full_name = COALESCE(up.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    avatar_url = COALESCE(up.avatar_url, u.raw_user_meta_data->>'avatar_url')
FROM auth.users u
WHERE up.id = u.id;

-- Afficher un résumé
SELECT 
    COUNT(*) as total_profiles,
    COUNT(email) as profiles_with_email,
    COUNT(full_name) as profiles_with_name,
    COUNT(home_airport) as profiles_with_home_airport
FROM user_profiles;

