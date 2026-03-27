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
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
    paid_date DATE,
    UNIQUE(user_id, invoice_number)
);

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

-- Audit Trail Table
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('consultant', 'timesheet', 'invoice', 'template')),
    entity_id UUID,
    entity_key TEXT,
    action TEXT NOT NULL,
    summary TEXT,
    before_data JSONB,
    after_data JSONB,
    context JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'audit_events'
          AND policyname = 'Users can manage their own audit events'
    ) THEN
        CREATE POLICY "Users can manage their own audit events"
            ON public.audit_events
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
    ON public.audit_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
    ON public.audit_events(user_id, entity_type, entity_id);
