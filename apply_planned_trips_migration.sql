-- ============================================
-- Planner: planned_trips, trip_proposals, trip_members
-- À exécuter manuellement dans l'éditeur SQL Supabase
-- ============================================

CREATE TABLE IF NOT EXISTS planned_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    arrival_airport TEXT,
    passengers INTEGER NOT NULL DEFAULT 1 CHECK (passengers >= 1 AND passengers <= 6),
    dates_depart JSONB NOT NULL DEFAULT '[]'::jsonb,
    dates_retour JSONB NOT NULL DEFAULT '[]'::jsonb,
    budget_max INTEGER NOT NULL DEFAULT 200,
    invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scanning', 'planning', 'locked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_trips_organizer ON planned_trips(organizer_id);
CREATE INDEX IF NOT EXISTS idx_planned_trips_invite_token ON planned_trips(invite_token);

CREATE TABLE IF NOT EXISTS trip_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES planned_trips(id) ON DELETE CASCADE,
    trip_data JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_proposals_trip ON trip_proposals(trip_id);

CREATE TABLE IF NOT EXISTS trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES planned_trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'traveler'
        CHECK (role IN ('organizer', 'traveler')),
    status TEXT NOT NULL DEFAULT 'joined'
        CHECK (status IN ('joined')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id);

ALTER TABLE planned_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;

-- Organizer full access on own trips
DROP POLICY IF EXISTS "Organizers manage own trips" ON planned_trips;
CREATE POLICY "Organizers manage own trips" ON planned_trips
    FOR ALL USING (auth.uid() = organizer_id)
    WITH CHECK (auth.uid() = organizer_id);

-- Members can read trips they joined
DROP POLICY IF EXISTS "Members read trips" ON planned_trips;
CREATE POLICY "Members read trips" ON planned_trips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM trip_members m
            WHERE m.trip_id = planned_trips.id AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members read proposals" ON trip_proposals;
CREATE POLICY "Members read proposals" ON trip_proposals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM trip_members m
            WHERE m.trip_id = trip_proposals.trip_id AND m.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_proposals.trip_id AND t.organizer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Organizers manage proposals" ON trip_proposals;
CREATE POLICY "Organizers manage proposals" ON trip_proposals
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_proposals.trip_id AND t.organizer_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_proposals.trip_id AND t.organizer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members read members" ON trip_members;
CREATE POLICY "Members read members" ON trip_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM trip_members m
            WHERE m.trip_id = trip_members.trip_id AND m.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_members.trip_id AND t.organizer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Organizers manage members" ON trip_members;
CREATE POLICY "Organizers manage members" ON trip_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_members.trip_id AND t.organizer_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM planned_trips t
            WHERE t.id = trip_members.trip_id AND t.organizer_id = auth.uid()
        )
        OR auth.uid() = user_id
    );

-- Allow users to insert themselves as traveler (join) — also done via service role in API
DROP POLICY IF EXISTS "Users can join as member" ON trip_members;
CREATE POLICY "Users can join as member" ON trip_members
    FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'traveler');
