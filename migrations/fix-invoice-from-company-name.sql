-- ============================================================================
-- Data fix: standardize the sender company name on invoices (business_info)
-- ----------------------------------------------------------------------------
-- One invoice has the sender typed as 'ZScale' instead of the canonical
-- 'ZScale LLC' (same email accounts@zscalellc.com). Normalize it so all ZScale
-- invoices carry an identical "from" company name.
--
-- This UPDATEs invoices (financial records). Idempotent: once renamed, the
-- WHERE no longer matches. Lorvish Technologies Inc is left untouched.
-- A backup table (invoices_backup_20260607) was created in the earlier fix.
-- ============================================================================


-- ── STEP 1 — PREVIEW (read-only): the invoice(s) that will change ───────────
SELECT
    invoice_number,
    business_info->>'name'  AS current_from_company,
    business_info->>'email' AS from_email
FROM public.invoices
WHERE trim(business_info->>'name') = 'ZScale'
ORDER BY invoice_number;


-- ── STEP 2 — UPDATE (run after the preview looks correct) ───────────────────
UPDATE public.invoices
SET business_info = jsonb_set(business_info, '{name}', '"ZScale LLC"')
WHERE trim(business_info->>'name') = 'ZScale';


-- ── STEP 3 — VERIFY: expect 2 sender companies, ZScale LLC with 6 invoices ──
SELECT
    business_info->>'name'  AS from_company,
    business_info->>'email' AS from_email,
    count(*) AS invoices
FROM public.invoices
GROUP BY 1, 2
ORDER BY invoices DESC;
