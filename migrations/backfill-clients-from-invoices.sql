-- ============================================================================
-- Backfill: populate the clients registry from existing invoices' Bill-To data
-- ----------------------------------------------------------------------------
-- Source:  invoices.client_info  (name, email, phone, address)
-- Dedup:   by (user_id, name, NORMALIZED email) -- different emails = different
--          clients. Emails are normalized first (lowercase, trimmed, trailing
--          dots stripped) so typos like "x@y.com." collapse into "x@y.com".
-- Detail:  phone/address = the most recent NON-NULL value across the group, so
--          a sparse/typo invoice never overwrites real contact details.
-- Safe:    idempotent (NOT EXISTS guard) -- re-running inserts nothing new.
--          Only INSERTs; touches no invoices; adds no schema constraints.
--
-- Run STEP 1 first to preview. If it looks right, run STEP 2. Then STEP 3.
-- ============================================================================


-- ── STEP 1 — PREVIEW (read-only): exactly what STEP 2 will insert ───────────
WITH normalized AS (
    SELECT
        i.user_id,
        trim(i.client_info->>'name')                                            AS name,
        nullif(regexp_replace(lower(trim(i.client_info->>'email')), '\.+$', ''), '') AS email,
        nullif(trim(i.client_info->>'phone'), '')                               AS phone,
        nullif(trim(i.client_info->>'address'), '')                             AS address,
        i.created_at
    FROM public.invoices i
    WHERE coalesce(trim(i.client_info->>'name'), '') <> ''
),
grouped AS (
    SELECT
        user_id,
        (array_agg(name ORDER BY created_at DESC))[1]                                   AS name,
        email,
        (array_agg(phone   ORDER BY created_at DESC) FILTER (WHERE phone   IS NOT NULL))[1] AS phone,
        (array_agg(address ORDER BY created_at DESC) FILTER (WHERE address IS NOT NULL))[1] AS address
    FROM normalized
    GROUP BY user_id, lower(name), email
)
SELECT name, email, phone, address
FROM grouped g
WHERE NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = g.user_id
      AND lower(c.name) = lower(g.name)
      AND coalesce(lower(c.email), '') = coalesce(g.email, '')
)
ORDER BY name, email;


-- ── STEP 2 — INSERT (run after the preview looks correct) ───────────────────
WITH normalized AS (
    SELECT
        i.user_id,
        trim(i.client_info->>'name')                                            AS name,
        nullif(regexp_replace(lower(trim(i.client_info->>'email')), '\.+$', ''), '') AS email,
        nullif(trim(i.client_info->>'phone'), '')                               AS phone,
        nullif(trim(i.client_info->>'address'), '')                             AS address,
        i.created_at
    FROM public.invoices i
    WHERE coalesce(trim(i.client_info->>'name'), '') <> ''
),
grouped AS (
    SELECT
        user_id,
        (array_agg(name ORDER BY created_at DESC))[1]                                   AS name,
        email,
        (array_agg(phone   ORDER BY created_at DESC) FILTER (WHERE phone   IS NOT NULL))[1] AS phone,
        (array_agg(address ORDER BY created_at DESC) FILTER (WHERE address IS NOT NULL))[1] AS address
    FROM normalized
    GROUP BY user_id, lower(name), email
)
INSERT INTO public.clients (user_id, name, email, phone, address, status)
SELECT g.user_id, g.name, g.email, g.phone, g.address, 'active'
FROM grouped g
WHERE NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = g.user_id
      AND lower(c.name) = lower(g.name)
      AND coalesce(lower(c.email), '') = coalesce(g.email, '')
);


-- ── STEP 3 — VERIFY ─────────────────────────────────────────────────────────
SELECT count(*) AS total_clients FROM public.clients;
SELECT name, email, phone, address FROM public.clients ORDER BY name, email;
