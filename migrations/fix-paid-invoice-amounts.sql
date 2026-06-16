-- Backfill payment amounts on invoices marked "paid" that never recorded one.
--
-- Some invoices were set to status='paid' without an amount_paid / balance_due
-- (older records, or "mark as paid" without a payment entry). That leaves
-- amount_paid = 0 and a stale full balance_due, which makes analytics show $0
-- collected and makes paid invoices look like they still owe money.
--
-- This sets amount_paid = total and balance_due = 0 for those invoices.
-- Idempotent: re-running matches nothing once cleaned. Run the PREVIEW first.

-- ── 1. PREVIEW — what will change ────────────────────────────────────────────
select
    invoice_number,
    invoice_meta->>'currency'      as currency,
    totals->>'total'               as total,
    totals->>'amount_paid'         as amount_paid_now,
    totals->>'balance_due'         as balance_due_now,
    status
from invoices
where status = 'paid'
  and totals ? 'total'
  and coalesce((totals->>'amount_paid')::numeric, 0) = 0
order by invoice_number;

-- ── 2. APPLY — mark them fully collected ─────────────────────────────────────
update invoices
set totals = totals
    || jsonb_build_object('amount_paid', (totals->>'total')::numeric)
    || jsonb_build_object('balance_due', 0)
where status = 'paid'
  and totals ? 'total'
  and coalesce((totals->>'amount_paid')::numeric, 0) = 0;

-- ── 3. VERIFY — should return 0 rows after applying ──────────────────────────
select count(*) as remaining_paid_without_amount
from invoices
where status = 'paid'
  and totals ? 'total'
  and coalesce((totals->>'amount_paid')::numeric, 0) = 0;

-- Note: usd_received_amount is left untouched. USD invoices already count their
-- total as cash received; for CAD invoices the actual USD received isn't known
-- here, so cash-flow USD for those stays 0 until a real payment is recorded.
