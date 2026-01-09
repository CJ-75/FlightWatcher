-- ============================================
-- Script pour corriger les politiques RLS existantes
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Supprimer toutes les politiques existantes pour les recréer proprement

-- user_profiles
DROP POLICY IF EXISTS "Users see own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- saved_searches
DROP POLICY IF EXISTS "Users see own searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can insert own searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can update own searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can delete own searches" ON saved_searches;

-- favorites
DROP POLICY IF EXISTS "Users see own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can insert own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can update own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;

-- price_history
DROP POLICY IF EXISTS "Anyone can read price history" ON price_history;
DROP POLICY IF EXISTS "Only service role can insert price history" ON price_history;

-- search_results_cache
DROP POLICY IF EXISTS "Anyone can read cache" ON search_results_cache;
DROP POLICY IF EXISTS "Only service role can insert cache" ON search_results_cache;
DROP POLICY IF EXISTS "Only service role can update cache" ON search_results_cache;

-- Recréer toutes les politiques

-- ============================================
-- POLITIQUES RLS pour user_profiles
-- ============================================
CREATE POLICY "Users see own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- POLITIQUES RLS pour saved_searches
-- ============================================
CREATE POLICY "Users see own searches"
    ON saved_searches FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
    ON saved_searches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own searches"
    ON saved_searches FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches"
    ON saved_searches FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- POLITIQUES RLS pour favorites
-- ============================================
CREATE POLICY "Users see own favorites"
    ON favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
    ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own favorites"
    ON favorites FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
    ON favorites FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- POLITIQUES RLS pour price_history
-- ============================================
CREATE POLICY "Anyone can read price history"
    ON price_history FOR SELECT
    USING (true);

CREATE POLICY "Only service role can insert price history"
    ON price_history FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- POLITIQUES RLS pour search_results_cache
-- ============================================
CREATE POLICY "Anyone can read cache"
    ON search_results_cache FOR SELECT
    USING (true);

CREATE POLICY "Only service role can insert cache"
    ON search_results_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update cache"
    ON search_results_cache FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- SUPPRIMER ET RECRÉER LES TRIGGERS
-- ============================================

-- Supprimer les triggers existants
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trigger_update_last_active_searches ON saved_searches;
DROP TRIGGER IF EXISTS trigger_update_last_active_favorites ON favorites;

-- Fonction pour créer automatiquement un profil utilisateur lors de l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    referral_code TEXT;
BEGIN
    -- Générer un code de référence unique (8 caractères alphanumériques)
    referral_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT) FROM 1 FOR 8));
    
    -- Vérifier l'unicité du code (très peu probable qu'il y ait un doublon, mais on vérifie)
    WHILE EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.referral_code = referral_code) LOOP
        referral_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));
    END LOOP;
    
    -- Créer le profil utilisateur
    INSERT INTO public.user_profiles (id, referral_code, created_at, last_active)
    VALUES (NEW.id, referral_code, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING; -- Ne rien faire si le profil existe déjà
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour créer automatiquement un profil lors de la création d'un utilisateur
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Mettre à jour last_active dans user_profiles à chaque action
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_profiles
    SET last_active = NOW()
    WHERE id = COALESCE(NEW.user_id, auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur saved_searches
CREATE TRIGGER trigger_update_last_active_searches
    AFTER INSERT OR UPDATE ON saved_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();

-- Trigger sur favorites
CREATE TRIGGER trigger_update_last_active_favorites
    AFTER INSERT OR UPDATE ON favorites
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();

