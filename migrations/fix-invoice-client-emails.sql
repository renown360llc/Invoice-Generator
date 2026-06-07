-- ============================================================================
-- Data fix: canonicalize the Bill-To email on invoices by client NAME
-- ----------------------------------------------------------------------------
-- Clients are identified by name + email. Some invoices have the WRONG email
-- attached to a client name (and a couple have a trailing-dot typo). This sets
-- each client name to its single correct email so the registry ends up clean.
--
-- Canonical mapping (provided by the account owner):
--   'Nityo Cognizant Account Team' -> accounts.cognizant@nityo.com
--   'Nityo Infotech Corporation'   -> accounts.canada@nityo.com
--
-- This UPDATES invoices (financial records). It is idempotent: only rows whose
-- email is not already correct are rewritten. Run the steps in order.
-- ============================================================================


-- ── STEP 0 — BACKUP (recommended before any update) ─────────────────────────
-- One-off snapshot you can restore from if anything looks wrong.
CREATE TABLE IF NOT EXISTS public.invoices_backup_20260607 AS
SELECT * FROM public.invoices;


-- ── STEP 1 — PREVIEW (read-only): every invoice that will change ────────────
SELECT
    invoice_number,
    client_info->>'name'  AS name,
    client_info->>'email' AS current_email,
    CASE trim(client_info->>'name')
        WHEN 'Nityo Cognizant Account Team' THEN 'accounts.cognizant@nityo.com'
        WHEN 'Nityo Infotech Corporation'   THEN 'accounts.canada@nityo.com'
    END AS new_email
FROM public.invoices
WHERE trim(client_info->>'name') IN ('Nityo Cognizant Account Team', 'Nityo Infotech Corporation')
  AND coalesce(client_info->>'email', '') <> CASE trim(client_info->>'name')
        WHEN 'Nityo Cognizant Account Team' THEN 'accounts.cognizant@nityo.com'
        WHEN 'Nityo Infotech Corporation'   THEN 'accounts.canada@nityo.com'
    END
ORDER BY invoice_number;


-- ── STEP 2 — UPDATE (run after the preview looks correct) ───────────────────
UPDATE public.invoices
SET client_info = jsonb_set(client_info, '{email}', '"accounts.cognizant@nityo.com"')
WHERE trim(client_info->>'name') = 'Nityo Cognizant Account Team'
  AND coalesce(client_info->>'email', '') <> 'accounts.cognizant@nityo.com';

UPDATE public.invoices
SET client_info = jsonb_set(client_info, '{email}', '"accounts.canada@nityo.com"')
WHERE trim(client_info->>'name') = 'Nityo Infotech Corporation'
  AND coalesce(client_info->>'email', '') <> 'accounts.canada@nityo.com';


-- ── STEP 3 — VERIFY ─────────────────────────────────────────────────────────
-- (a) Re-running STEP 1 should now return ZERO rows.
-- (b) Distinct client name+email pairs across all invoices -- expect 2 clean rows:
SELECT DISTINCT
    client_info->>'name'  AS name,
    client_info->>'email' AS email
FROM public.invoices
WHERE coalesce(trim(client_info->>'name'), '') <> ''
ORDER BY name, email;
