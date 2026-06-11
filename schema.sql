-- Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    business_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    invoice_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT DEFAULT '',
    payment_instructions TEXT DEFAULT '',
    totals JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid')),
    paid_date DATE,
    UNIQUE(user_id, invoice_number)
);

-- Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'ops', 'finance', 'admin')),
    approval_buffer_days INTEGER NOT NULL DEFAULT 3 CHECK (approval_buffer_days BETWEEN 0 AND 30)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
CREATE POLICY "Users can read their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id AND role = 'viewer');

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prevent_profile_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'profiles.user_id cannot be changed';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'profiles.role cannot be changed from the application surface';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_changes ON public.profiles;
CREATE TRIGGER profiles_prevent_role_changes
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_changes();

-- Row Level Security (RLS) for Invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own invoices"
    ON public.invoices
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_user_status_idx ON public.invoices(user_id, status);
CREATE INDEX IF NOT EXISTS invoices_user_number_idx ON public.invoices(user_id, invoice_number);

-- Consultants Table
CREATE TABLE IF NOT EXISTS public.consultants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    w2_company TEXT,
    client TEXT,
    start_date DATE, -- Nullable for 'pending' onboarding
    end_date DATE,
    bill_rate NUMERIC(10, 2) DEFAULT 0,
    commission_rate NUMERIC(10, 2) DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive'))
);

-- Timesheets Table
CREATE TABLE IF NOT EXISTS public.timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consultant_id UUID NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    invoice_number TEXT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    hours_worked NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced'))
);

-- Row Level Security (RLS) for Consultants
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own consultants" 
    ON public.consultants 
    FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Row Level Security (RLS) for Timesheets
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own timesheets" 
    ON public.timesheets 
    FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Optional: Create an index to speed up lookups
CREATE INDEX IF NOT EXISTS consultants_user_id_idx ON public.consultants(user_id);
CREATE INDEX IF NOT EXISTS timesheets_user_id_idx ON public.timesheets(user_id);
CREATE INDEX IF NOT EXISTS timesheets_consultant_idx ON public.timesheets(consultant_id);
CREATE INDEX IF NOT EXISTS timesheets_user_period_idx ON public.timesheets(user_id, period_start);
CREATE INDEX IF NOT EXISTS timesheets_user_consultant_period_idx ON public.timesheets(user_id, consultant_id, period_start);
CREATE INDEX IF NOT EXISTS timesheets_invoice_id_idx ON public.timesheets(invoice_id);

-- Prevent duplicate periods for same consultant + user and enable upsert workflows
CREATE UNIQUE INDEX IF NOT EXISTS timesheets_user_consultant_period_unique
    ON public.timesheets(user_id, consultant_id, period_start, period_end);

-- Templates Table
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    business_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own templates"
    ON public.templates
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS templates_user_id_idx ON public.templates(user_id);

-- Clients Table (standalone client registry / CRM)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own clients"
    ON public.clients
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS clients_user_id_idx ON public.clients(user_id);

-- Companies Table (standalone sender / "Bill From" registry, replaces invoice Templates)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    logo TEXT,                              -- base64 data URL
    brand_color TEXT NOT NULL DEFAULT '#000000',
    currency TEXT NOT NULL DEFAULT 'USD',
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    payment_instructions TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own companies"
    ON public.companies
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS companies_user_id_idx ON public.companies(user_id);

-- Referral Pass-Through Payouts
-- For pass-through invoices: you keep cut_percent% of the received amount and
-- forward the remainder (pass_through_amount) to a referral partner.
CREATE TABLE IF NOT EXISTS public.referral_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    invoice_number TEXT,
    recipient TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    basis_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- amount received that the cut is based on
    cut_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,     -- percentage YOU keep
    my_cut NUMERIC(12, 2) NOT NULL DEFAULT 0,         -- basis_amount * cut_percent
    pass_through_amount NUMERIC(12, 2) NOT NULL DEFAULT 0, -- basis_amount - my_cut
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    paid_date DATE,
    notes TEXT
);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own referral payouts"
    ON public.referral_payouts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS referral_payouts_user_id_idx ON public.referral_payouts(user_id);
CREATE INDEX IF NOT EXISTS referral_payouts_invoice_idx ON public.referral_payouts(invoice_id);

-- Audit Trail Table
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('consultant', 'timesheet', 'invoice', 'template', 'client', 'company', 'referral')),
    entity_id UUID,
    entity_key TEXT,
    action TEXT NOT NULL,
    summary TEXT,
    before_data JSONB,
    after_data JSONB,
    context JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Users can read their own audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Users can insert their own audit events" ON public.audit_events;

CREATE POLICY "Users can read their own audit events"
    ON public.audit_events
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own audit events"
    ON public.audit_events
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
    ON public.audit_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
    ON public.audit_events(user_id, entity_type, entity_id);
