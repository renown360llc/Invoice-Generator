-- ============================================================================
-- Referral pass-through payouts
-- ----------------------------------------------------------------------------
-- For pass-through invoices: you keep cut_percent% of the amount received and
-- forward the remainder to a referral partner. This ledger tracks each payout.
-- Run once in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.referral_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    invoice_number TEXT,
    recipient TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    basis_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cut_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    my_cut NUMERIC(12, 2) NOT NULL DEFAULT 0,
    pass_through_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    paid_date DATE,
    notes TEXT
);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own referral payouts" ON public.referral_payouts;
CREATE POLICY "Users can manage their own referral payouts"
    ON public.referral_payouts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS referral_payouts_user_id_idx ON public.referral_payouts(user_id);
CREATE INDEX IF NOT EXISTS referral_payouts_invoice_idx ON public.referral_payouts(invoice_id);

-- Allow referral events in the audit trail
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_entity_type_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_entity_type_check
    CHECK (entity_type IN ('consultant','timesheet','invoice','template','client','company','referral'));
