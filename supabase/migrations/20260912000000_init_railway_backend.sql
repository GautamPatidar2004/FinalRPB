-- ====================================================================
-- Railway Block Planning Engine - Supabase Database Schema
-- Migration: 20260912000000_init_railway_backend.sql
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS profiles(
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    department TEXT CHECK (department IN ('Engineering', 'Traction Distribution', 'Signalling & Telecom', 'Operations', 'General')),
    role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'controller', 'engineer', 'operator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_profiles_modtime ON profiles;
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS corridors (
    corridor_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    length_km NUMERIC(6, 2) NOT NULL CHECK (length_km > 0),
    is_electrified BOOLEAN NOT NULL DEFAULT TRUE,
    available_start_minute INT NOT NULL DEFAULT 0 CHECK (available_start_minute >= 0),
    available_end_minute INT NOT NULL DEFAULT 1440 CHECK (available_end_minute <= 1440),
    max_parallel_blocks INT NOT NULL DEFAULT 2 CHECK (max_parallel_blocks >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_corridors_modtime ON corridors;
CREATE TRIGGER update_corridors_modtime
    BEFORE UPDATE ON corridors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS assets (
    asset_id TEXT PRIMARY KEY,
    corridor_id TEXT NOT NULL REFERENCES corridors(corridor_id) ON DELETE CASCADE,
    department TEXT NOT NULL CHECK (department IN ('Engineering', 'Traction Distribution', 'Signalling & Telecom')),
    track_type TEXT NOT NULL DEFAULT 'BOTH' CHECK (track_type IN ('UP', 'DOWN', 'BOTH', 'SINGLE')),
    start_km NUMERIC(6, 2) NOT NULL CHECK (start_km >= 0),
    end_km NUMERIC(6, 2) NOT NULL CHECK (end_km >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_asset_km_range CHECK (end_km >= start_km)
);

CREATE INDEX IF NOT EXISTS idx_assets_corridor_id ON assets(corridor_id);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department);

DROP TRIGGER IF EXISTS update_assets_modtime ON assets;
CREATE TRIGGER update_assets_modtime
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS trains (
    train_id TEXT PRIMARY KEY,
    train_type TEXT NOT NULL,
    corridor_id TEXT NOT NULL REFERENCES corridors(corridor_id) ON DELETE CASCADE,
    entry_minute INT NOT NULL CHECK (entry_minute >= 0 AND entry_minute <= 1440),
    exit_minute INT NOT NULL CHECK (exit_minute >= 0 AND exit_minute <= 1440),
    priority_level INT NOT NULL DEFAULT 2 CHECK (priority_level >= 1 AND priority_level <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_train_times CHECK (exit_minute >= entry_minute)
);

CREATE INDEX IF NOT EXISTS idx_trains_corridor_id ON trains(corridor_id);
CREATE INDEX IF NOT EXISTS idx_trains_window ON trains(corridor_id, entry_minute, exit_minute);

DROP TRIGGER IF EXISTS update_trains_modtime ON trains;
CREATE TRIGGER update_trains_modtime
    BEFORE UPDATE ON trains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS maintenance_block_requests (
    request_id TEXT PRIMARY KEY,
    department TEXT NOT NULL CHECK (department IN ('Engineering', 'Traction Distribution', 'Signalling & Telecom')),
    corridor_id TEXT NOT NULL REFERENCES corridors(corridor_id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    required_duration_minutes INT NOT NULL CHECK (required_duration_minutes >= 15 AND required_duration_minutes <= 720),
    earliest_start_minute INT NOT NULL DEFAULT 0 CHECK (earliest_start_minute >= 0),
    latest_end_minute INT NOT NULL DEFAULT 1440 CHECK (latest_end_minute <= 1440),
    is_power_block_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_traffic_block_required BOOLEAN NOT NULL DEFAULT TRUE,
    urgency TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (urgency IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    linked_defect_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED')),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_request_window CHECK (latest_end_minute >= earliest_start_minute + required_duration_minutes)
);

CREATE INDEX IF NOT EXISTS idx_mbr_corridor_id ON maintenance_block_requests(corridor_id);
CREATE INDEX IF NOT EXISTS idx_mbr_department ON maintenance_block_requests(department);
CREATE INDEX IF NOT EXISTS idx_mbr_status ON maintenance_block_requests(status);
CREATE INDEX IF NOT EXISTS idx_mbr_urgency ON maintenance_block_requests(urgency);

DROP TRIGGER IF EXISTS update_mbr_modtime ON maintenance_block_requests;
CREATE TRIGGER update_mbr_modtime
    BEFORE UPDATE ON maintenance_block_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS block_plans (
    plan_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
    overall_score NUMERIC(5, 2) CHECK (overall_score >= 0 AND overall_score <= 100),
    is_feasible BOOLEAN NOT NULL DEFAULT TRUE,
    selected_strategy TEXT,
    evaluation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_block_plans_status ON block_plans(status);

DROP TRIGGER IF EXISTS update_block_plans_modtime ON block_plans;
CREATE TRIGGER update_block_plans_modtime
    BEFORE UPDATE ON block_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS block_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id TEXT NOT NULL REFERENCES block_plans(plan_id) ON DELETE CASCADE,
    request_id TEXT NOT NULL REFERENCES maintenance_block_requests(request_id) ON DELETE CASCADE,
    corridor_id TEXT NOT NULL REFERENCES corridors(corridor_id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    department TEXT NOT NULL CHECK (department IN ('Engineering', 'Traction Distribution', 'Signalling & Telecom')),
    scheduled_start_minute INT NOT NULL CHECK (scheduled_start_minute >= 0),
    scheduled_end_minute INT NOT NULL CHECK (scheduled_end_minute >= 0),
    allocated_duration_minutes INT NOT NULL CHECK (allocated_duration_minutes >= 0),
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'DEFERRED', 'REJECTED')),
    conflict_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON block_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_request_id ON block_plan_items(request_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_corridor_time ON block_plan_items(corridor_id, scheduled_start_minute, scheduled_end_minute);

DROP TRIGGER IF EXISTS update_plan_items_modtime ON block_plan_items;
CREATE TRIGGER update_plan_items_modtime
    BEFORE UPDATE ON block_plan_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridors ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trains ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_block_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
    ON profiles FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Operational corridors viewable by all users" ON corridors;
CREATE POLICY "Operational corridors viewable by all users"
    ON corridors FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Operational assets viewable by all users" ON assets;
CREATE POLICY "Operational assets viewable by all users"
    ON assets FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Operational trains viewable by all users" ON trains;
CREATE POLICY "Operational trains viewable by all users"
    ON trains FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Admin manage corridors" ON corridors;
CREATE POLICY "Admin manage corridors"
    ON corridors FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'controller')));

DROP POLICY IF EXISTS "Admin manage assets" ON assets;
CREATE POLICY "Admin manage assets"
    ON assets FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'controller')));

DROP POLICY IF EXISTS "Admin manage trains" ON trains;
CREATE POLICY "Admin manage trains"
    ON trains FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'controller')));

DROP POLICY IF EXISTS "View block requests" ON maintenance_block_requests;
CREATE POLICY "View block requests"
    ON maintenance_block_requests FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Create block requests" ON maintenance_block_requests;
CREATE POLICY "Create block requests"
    ON maintenance_block_requests FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Update block requests" ON maintenance_block_requests;
CREATE POLICY "Update block requests"
    ON maintenance_block_requests FOR UPDATE TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "View block plans" ON block_plans;
CREATE POLICY "View block plans"
    ON block_plans FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Manage block plans" ON block_plans;
CREATE POLICY "Manage block plans"
    ON block_plans FOR ALL TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "View plan items" ON block_plan_items;
CREATE POLICY "View plan items"
    ON block_plan_items FOR SELECT TO authenticated, anon USING (TRUE);

DROP POLICY IF EXISTS "Manage plan items" ON block_plan_items;
CREATE POLICY "Manage plan items"
    ON block_plan_items FOR ALL TO authenticated USING (TRUE);

-- ====================================================================
-- PERMISSIONS / ROLE GRANTS (anon, authenticated, service_role)
-- ====================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

