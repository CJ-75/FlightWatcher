-- Mon voyage Lot C — carrier → homepage / booking site
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS carrier_booking_url (
    carrier_code TEXT PRIMARY KEY,
    carrier_name TEXT NOT NULL DEFAULT '',
    homepage_url TEXT NOT NULL,
    site_label TEXT NOT NULL DEFAULT '',
    supports_deeplink TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE carrier_booking_url IS
  'Lot C MyTrip: airline code → official booking site. Deep-links stay in app code when known.';

COMMENT ON COLUMN carrier_booking_url.supports_deeplink IS
  'Optional hint: ryanair | transavia | null — FE builds deep-link when route+dates present.';

INSERT INTO carrier_booking_url (carrier_code, carrier_name, homepage_url, site_label, supports_deeplink)
VALUES
  ('FR', 'Ryanair', 'https://www.ryanair.com/fr/fr', 'ryanair.com', 'ryanair'),
  ('RK', 'Ryanair', 'https://www.ryanair.com/fr/fr', 'ryanair.com', 'ryanair'),
  ('TO', 'Transavia', 'https://www.transavia.com/fr-FR/', 'transavia.com', 'transavia'),
  ('HV', 'Transavia', 'https://www.transavia.com/fr-FR/', 'transavia.com', 'transavia'),
  ('U2', 'easyJet', 'https://www.easyjet.com/fr', 'easyjet.com', NULL),
  ('EC', 'easyJet', 'https://www.easyjet.com/fr', 'easyjet.com', NULL),
  ('VY', 'Vueling', 'https://www.vueling.com/fr', 'vueling.com', NULL),
  ('V7', 'Volotea', 'https://www.volotea.com/fr/', 'volotea.com', NULL),
  ('W4', 'Wizz Air', 'https://www.wizzair.com/fr-fr', 'wizzair.com', NULL),
  ('W6', 'Wizz Air', 'https://www.wizzair.com/fr-fr', 'wizzair.com', NULL),
  ('AF', 'Air France', 'https://wwws.airfrance.fr/', 'airfrance.fr', NULL)
ON CONFLICT (carrier_code) DO UPDATE SET
  carrier_name = EXCLUDED.carrier_name,
  homepage_url = EXCLUDED.homepage_url,
  site_label = EXCLUDED.site_label,
  supports_deeplink = EXCLUDED.supports_deeplink,
  updated_at = now();
