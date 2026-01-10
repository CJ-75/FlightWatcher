-- Migration : Ajout du champ is_admin dans user_profiles
-- Permet de marquer les utilisateurs comme administrateurs

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Index pour améliorer les performances des requêtes admin
CREATE INDEX IF NOT EXISTS idx_user_profiles_admin 
ON user_profiles(is_admin) WHERE is_admin = TRUE;

-- Commentaire pour documentation
COMMENT ON COLUMN user_profiles.is_admin IS 'Indique si l''utilisateur est un administrateur du système';

