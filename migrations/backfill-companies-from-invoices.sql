-- ============================================================================
-- Backfill: populate the companies (Bill-From) registry from existing invoices
-- ----------------------------------------------------------------------------
-- Source:  invoices.business_info (+ settings, invoice_meta, payment_instructions)
-- Dedup:   by (user_id, name) -- one row per sender company.
-- Detail:  email/phone/address/logo/brand_color/currency/tax_rate/payment are
--          the most recent NON-NULL value across that company's invoices.
-- Safe:    idempotent (NOT EXISTS guard); only INSERTs; touches no invoices.
--
-- Run STEP 1 first to preview. If it looks right, run STEP 2. Then STEP 3.
-- NOTE: run the ZScale name fix (fix-invoice-from-company-name.sql) FIRST, so
--       'ZScale' and 'ZScale LLC' don't become two companies.
-- ============================================================================


-- ── STEP 1 — PREVIEW (read-only) ─────────────────────────────────────────────
WITH normalized AS (
    SELECT
        i.user_id,
        trim(i.business_info->>'name')              AS name,
        nullif(trim(i.business_info->>'email'), '')   AS email,
        nullif(trim(i.business_info->>'phone'), '')   AS phone,
        nullif(trim(i.business_info->>'address'), '') AS address,
        nullif(i.business_info->>'logo', '')          AS logo,
        nullif(trim(i.settings->>'brandColor'), '')   AS brand_color,
        nullif(trim(i.invoice_meta->>'currency'), '') AS currency,
        nullif(trim(i.settings->>'taxRate'), '')      AS tax_rate,
        nullif(trim(i.payment_instructions), '')      AS payment_instructions,
        i.created_at
    FROM public.invoices i
    WHERE coalesce(trim(i.business_info->>'name'), '') <> ''
),
grouped AS (
    SELECT
        user_id,
        (array_agg(name ORDER BY created_at DESC))[1]                                                 AS name,
        (array_agg(email                ORDER BY created_at DESC) FILTER (WHERE email                IS NOT NULL))[1] AS email,
        (array_agg(phone                ORDER BY created_at DESC) FILTER (WHERE phone                IS NOT NULL))[1] AS phone,
        (array_agg(address              ORDER BY created_at DESC) FILTER (WHERE address              IS NOT NULL))[1] AS address,
        (array_agg(logo                 ORDER BY created_at DESC) FILTER (WHERE logo                 IS NOT NULL))[1] AS logo,
        (array_agg(brand_color          ORDER BY created_at DESC) FILTER (WHERE brand_color          IS NOT NULL))[1] AS brand_color,
        (array_agg(currency             ORDER BY created_at DESC) FILTER (WHERE currency             IS NOT NULL))[1] AS currency,
        (array_agg(tax_rate             ORDER BY created_at DESC) FILTER (WHERE tax_rate             IS NOT NULL))[1] AS tax_rate,
        (array_agg(payment_instructions ORDER BY created_at DESC) FILTER (WHERE payment_instructions IS NOT NULL))[1] AS payment_instructions
    FROM normalized
    GROUP BY user_id, lower(name)
)
SELECT name, email, phone, brand_color, currency, tax_rate,
       (logo IS NOT NULL) AS has_logo, payment_instructions
FROM grouped g
WHERE NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.user_id = g.user_id AND lower(c.name) = lower(g.name)
)
ORDER BY name;


-- ── STEP 2 — INSERT (run after the preview looks correct) ───────────────────
WITH normalized AS (
    SELECT
        i.user_id,
        trim(i.business_info->>'name')              AS name,
        nullif(trim(i.business_info->>'email'), '')   AS email,
        nullif(trim(i.business_info->>'phone'), '')   AS phone,
        nullif(trim(i.business_info->>'address'), '') AS address,
        nullif(i.business_info->>'logo', '')          AS logo,
        nullif(trim(i.settings->>'brandColor'), '')   AS brand_color,
        nullif(trim(i.invoice_meta->>'currency'), '') AS currency,
        nullif(trim(i.settings->>'taxRate'), '')      AS tax_rate,
        nullif(trim(i.payment_instructions), '')      AS payment_instructions,
        i.created_at
    FROM public.invoices i
    WHERE coalesce(trim(i.business_info->>'name'), '') <> ''
),
grouped AS (
    SELECT
        user_id,
        (array_agg(name ORDER BY created_at DESC))[1]                                                 AS name,
        (array_agg(email                ORDER BY created_at DESC) FILTER (WHERE email                IS NOT NULL))[1] AS email,
        (array_agg(phone                ORDER BY created_at DESC) FILTER (WHERE phone                IS NOT NULL))[1] AS phone,
        (array_agg(address              ORDER BY created_at DESC) FILTER (WHERE address              IS NOT NULL))[1] AS address,
        (array_agg(logo                 ORDER BY created_at DESC) FILTER (WHERE logo                 IS NOT NULL))[1] AS logo,
        (array_agg(brand_color          ORDER BY created_at DESC) FILTER (WHERE brand_color          IS NOT NULL))[1] AS brand_color,
        (array_agg(currency             ORDER BY created_at DESC) FILTER (WHERE currency             IS NOT NULL))[1] AS currency,
        (array_agg(tax_rate             ORDER BY created_at DESC) FILTER (WHERE tax_rate             IS NOT NULL))[1] AS tax_rate,
        (array_agg(payment_instructions ORDER BY created_at DESC) FILTER (WHERE payment_instructions IS NOT NULL))[1] AS payment_instructions
    FROM normalized
    GROUP BY user_id, lower(name)
)
INSERT INTO public.companies
    (user_id, name, email, phone, address, logo, brand_color, currency, tax_rate, payment_instructions)
SELECT
    g.user_id, g.name, g.email, g.phone, g.address, g.logo,
    coalesce(g.brand_color, '#000000'),
    coalesce(g.currency, 'USD'),
    coalesce(g.tax_rate::numeric, 0),
    g.payment_instructions
FROM grouped g
WHERE NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.user_id = g.user_id AND lower(c.name) = lower(g.name)
);


-- ── STEP 3 — VERIFY ─────────────────────────────────────────────────────────
SELECT name, email, phone, brand_color, currency, tax_rate,
       (logo IS NOT NULL) AS has_logo
FROM public.companies
ORDER BY name;
