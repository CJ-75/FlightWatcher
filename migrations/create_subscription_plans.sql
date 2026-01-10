-- Migration : Création de la table subscription_plans
-- Structure prête pour intégration Stripe future

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    stripe_price_id_monthly TEXT,
    stripe_price_id_yearly TEXT,
    max_searches_per_month INTEGER,
    max_saved_searches INTEGER,
    features JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active 
ON subscription_plans(active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_name 
ON subscription_plans(name);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_subscription_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER trigger_update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

-- Commentaires pour documentation
COMMENT ON TABLE subscription_plans IS 'Plans d''abonnement pour les utilisateurs (structure prête pour Stripe)';
COMMENT ON COLUMN subscription_plans.stripe_price_id_monthly IS 'ID du prix Stripe pour l''abonnement mensuel';
COMMENT ON COLUMN subscription_plans.stripe_price_id_yearly IS 'ID du prix Stripe pour l''abonnement annuel';

