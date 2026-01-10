-- Migration : Création de la table plan_features
-- Permet de configurer les fonctionnalités disponibles par plan

CREATE TABLE IF NOT EXISTS plan_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    limit_value INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, feature_name)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id 
ON plan_features(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_features_enabled 
ON plan_features(plan_id, enabled) WHERE enabled = TRUE;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_plan_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_plan_features_updated_at ON plan_features;
CREATE TRIGGER trigger_update_plan_features_updated_at
    BEFORE UPDATE ON plan_features
    FOR EACH ROW
    EXECUTE FUNCTION update_plan_features_updated_at();

-- Commentaires pour documentation
COMMENT ON TABLE plan_features IS 'Fonctionnalités disponibles par plan d''abonnement';
COMMENT ON COLUMN plan_features.feature_name IS 'Nom de la fonctionnalité (ex: auto_check, email_notifications, api_access)';
COMMENT ON COLUMN plan_features.limit_value IS 'Valeur limite si applicable (ex: nombre max de recherches)';

