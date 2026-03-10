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
