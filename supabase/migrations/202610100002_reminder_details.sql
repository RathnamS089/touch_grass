-- Run in the Supabase SQL Editor for the Grounded project
-- (Dashboard → SQL Editor → paste → Run), or via CLI: supabase db push
--
-- Adds the fields the app's reminder-history feature reads back:
--   - the place's coordinates (for "recently suggested" variety and analytics)
--   - the kind of nudge that produced the record
-- The original migration (202610100001) created the table with RLS allowing
-- anon INSERT only; this one keeps that guarantee.

begin;

-- 1) Extra columns. The app sends them on every insert; older rows get NULL.
alter table public.notification_history
    add column if not exists place_lat double precision,
    add column if not exists place_lon double precision,
    add column if not exists nudge_kind text not null default 'threshold';

-- 2) The anon grant must cover the new columns (Postgres grants are
--    column-specific: the 202610100001 grant listed only two columns).
revoke insert (place_name, place_category) on public.notification_history from anon;
grant insert (place_name, place_category, place_lat, place_lon, nudge_kind)
    on public.notification_history to anon;

-- 3) Keep the write-only guarantee: anon can never read rows back.
--    (The original grant never included SELECT, so this is belt-and-braces;
--    correct grammar is "revoke select", not "revoke all (select)".)
revoke select on public.notification_history from anon, authenticated;
revoke select (place_lat, place_lon, nudge_kind) on public.notification_history from anon, authenticated;

-- 4) Sanity: nudge_kind only carries the values the app produces.
alter table public.notification_history
    drop constraint if exists notification_history_nudge_kind_check;
alter table public.notification_history
    add constraint notification_history_nudge_kind_check
    check (nudge_kind in ('threshold', 'manual'));

notify pgrst, 'reload schema';
commit;
