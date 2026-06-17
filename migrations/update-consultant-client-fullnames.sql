-- Map the short client names used on consultants to the full company names in
-- the registry, so the analytics breakdown groups match (and show the logos).
--   Lorvish  -> Lorvish Technologies Inc
--   RazorPe  -> RazorPe Innovations LLC
--   ZScale   -> ZScale LLC   (also catches the "Zscale" case variant)
-- Case-insensitive and trimmed; idempotent (re-running is a no-op).

-- ── 1. PREVIEW — current distinct client values on consultants ────────────────
select client, count(*) as consultants
from consultants
group by client
order by client;

-- ── 2. APPLY ──────────────────────────────────────────────────────────────────
update consultants set client = 'Lorvish Technologies Inc'
where lower(trim(client)) in ('lorvish', 'lorvish technologies inc');

update consultants set client = 'RazorPe Innovations LLC'
where lower(trim(client)) in ('razorpe', 'razorpe innovations llc');

update consultants set client = 'ZScale LLC'
where lower(trim(client)) in ('zscale', 'zscale llc');

-- ── 3. VERIFY — should now show the full names only ───────────────────────────
select client, count(*) as consultants
from consultants
group by client
order by client;

-- Optional: if you also used those short names in the W2 column, uncomment:
-- update consultants set w2_company = 'Lorvish Technologies Inc' where lower(trim(w2_company)) in ('lorvish','lorvish technologies inc');
-- update consultants set w2_company = 'RazorPe Innovations LLC'  where lower(trim(w2_company)) in ('razorpe','razorpe innovations llc');
-- update consultants set w2_company = 'ZScale LLC'               where lower(trim(w2_company)) in ('zscale','zscale llc');
