-- Merge case-only variants of client / company names on invoices.
--
-- Free-text names mean "Zscale" and "ZScale" are stored as different strings and
-- compared case-sensitively, so they show up as two clients/companies. This
-- collapses names that differ ONLY by case to a single canonical spelling — the
-- most frequently used variant. Names that differ by more than case (e.g.
-- "ZScale" vs "ZScale LLC") are NOT touched.
--
-- Run the PREVIEW blocks first; adjust a canonical by hand if the auto-pick
-- isn't the spelling you want, then run APPLY. Idempotent.

-- ── 1. PREVIEW — company name groups that differ only by case ─────────────────
select lower(business_info->>'name')                  as folded,
       array_agg(distinct business_info->>'name')     as variants,
       count(*)                                        as invoices
from invoices
where coalesce(business_info->>'name', '') <> ''
group by lower(business_info->>'name')
having count(distinct business_info->>'name') > 1;

-- ── 2. PREVIEW — client name groups that differ only by case ──────────────────
select lower(client_info->>'name')                    as folded,
       array_agg(distinct client_info->>'name')       as variants,
       count(*)                                        as invoices
from invoices
where coalesce(client_info->>'name', '') <> ''
group by lower(client_info->>'name')
having count(distinct client_info->>'name') > 1;

-- ── 3. APPLY — canonicalize COMPANY names to the most common spelling ─────────
with ranked as (
    select id, business_info->>'name' as name, lower(business_info->>'name') as folded
    from invoices
    where coalesce(business_info->>'name', '') <> ''
),
canon as (
    select folded, (array_agg(name order by cnt desc, name))[1] as canonical
    from (select folded, name, count(*) as cnt from ranked group by folded, name) t
    group by folded
)
update invoices i
set business_info = jsonb_set(i.business_info, '{name}', to_jsonb(c.canonical))
from ranked r
join canon c on c.folded = r.folded
where i.id = r.id
  and (i.business_info->>'name') is distinct from c.canonical;

-- ── 4. APPLY — canonicalize CLIENT names to the most common spelling ──────────
with ranked as (
    select id, client_info->>'name' as name, lower(client_info->>'name') as folded
    from invoices
    where coalesce(client_info->>'name', '') <> ''
),
canon as (
    select folded, (array_agg(name order by cnt desc, name))[1] as canonical
    from (select folded, name, count(*) as cnt from ranked group by folded, name) t
    group by folded
)
update invoices i
set client_info = jsonb_set(i.client_info, '{name}', to_jsonb(c.canonical))
from ranked r
join canon c on c.folded = r.folded
where i.id = r.id
  and (i.client_info->>'name') is distinct from c.canonical;

-- ── 5. VERIFY — both PREVIEW queries above should now return 0 rows ───────────

-- Optional: also clean the companies / clients registry tables the same way.
-- update companies set name = ... ; update clients set name = ... ;
