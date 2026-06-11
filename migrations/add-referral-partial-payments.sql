-- ============================================================================
-- Referral payouts: partial-payment tracking
-- ----------------------------------------------------------------------------
-- Adds installment tracking so a payout can go pending -> partially_paid ->
-- paid as you forward money to the partner in parts. Safe / idempotent.
-- Run in the Supabase SQL editor (after add-referral-payouts.sql).
-- ============================================================================

ALTER TABLE public.referral_payouts
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Allow the 'partially_paid' status value.
ALTER TABLE public.referral_payouts DROP CONSTRAINT IF EXISTS referral_payouts_status_check;
ALTER TABLE public.referral_payouts ADD CONSTRAINT referral_payouts_status_check
    CHECK (status IN ('pending', 'partially_paid', 'paid'));

-- Backfill amount_paid for any payouts already marked paid before this change.
UPDATE public.referral_payouts
SET amount_paid = pass_through_amount
WHERE status = 'paid' AND amount_paid = 0;
