-- ============================================
-- Script de migration de saved_favorites vers favorites
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Vérifier si saved_favorites existe et contient des données
DO $$
DECLARE
    table_exists BOOLEAN;
    row_count INTEGER;
BEGIN
    -- Vérifier si la table existe
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_favorites'
    ) INTO table_exists;
    
    IF table_exists THEN
        -- Compter les lignes
        SELECT COUNT(*) INTO row_count FROM saved_favorites;
        
        RAISE NOTICE 'Table saved_favorites trouvée avec % lignes', row_count;
        
        IF row_count > 0 THEN
            -- Migrer les données vers favorites
            INSERT INTO favorites (
                id,
                user_id,
                destination_code,
                destination_name,
                outbound_date,
                return_date,
                total_price,
                outbound_flight,
                return_flight,
                search_request,
                is_archived,
                is_available,
                last_availability_check,
                created_at
            )
            SELECT 
                sf.id,
                COALESCE(sf.user_id, '00000000-0000-0000-0000-000000000000'::UUID), -- UUID par défaut si null
                COALESCE(sf.trip_data->>'destination_code', ''),
                sf.trip_data->>'destinationFull',
                (sf.trip_data->>'departureTime')::DATE,
                (sf.trip_data->>'returnTime')::DATE,
                COALESCE((sf.trip_data->>'prix_total')::DECIMAL, 0),
                jsonb_build_object(
                    'flightNumber', sf.trip_data->>'flightNumber',
                    'origin', sf.trip_data->>'origin',
                    'originFull', sf.trip_data->>'originFull',
                    'destination', sf.trip_data->>'destination',
                    'destinationFull', sf.trip_data->>'destinationFull',
                    'departureTime', sf.trip_data->>'departureTime',
                    'price', COALESCE((sf.trip_data->>'price')::DECIMAL, 0),
                    'currency', COALESCE(sf.trip_data->>'currency', 'EUR')
                ),
                jsonb_build_object(
                    'flightNumber', sf.trip_data->>'returnFlightNumber',
                    'origin', sf.trip_data->>'returnOrigin',
                    'originFull', sf.trip_data->>'returnOriginFull',
                    'destination', sf.trip_data->>'returnDestination',
                    'destinationFull', sf.trip_data->>'returnDestinationFull',
                    'departureTime', sf.trip_data->>'returnTime',
                    'price', COALESCE((sf.trip_data->>'returnPrice')::DECIMAL, 0),
                    'currency', COALESCE(sf.trip_data->>'currency', 'EUR')
                ),
                sf.search_request,
                COALESCE(sf.archived, false),
                COALESCE(sf.is_still_valid, true),
                sf.last_checked,
                sf.created_at
            FROM saved_favorites sf
            WHERE NOT EXISTS (
                SELECT 1 FROM favorites f WHERE f.id = sf.id
            )
            ON CONFLICT (id) DO NOTHING;
            
            RAISE NOTICE 'Migration terminée';
        ELSE
            RAISE NOTICE 'Aucune donnée à migrer';
        END IF;
    ELSE
        RAISE NOTICE 'Table saved_favorites n''existe pas';
    END IF;
END $$;

-- Vérifier le résultat
SELECT 
    'saved_favorites' as table_name,
    COUNT(*) as count
FROM saved_favorites
UNION ALL
SELECT 
    'favorites' as table_name,
    COUNT(*) as count
FROM favorites;

-- Optionnel : Supprimer l'ancienne table après vérification
-- DÉCOMMENTEZ LES LIGNES SUIVANTES UNIQUEMENT APRÈS AVOIR VÉRIFIÉ QUE LA MIGRATION EST CORRECTE
-- DROP TABLE IF EXISTS saved_favorites CASCADE;

