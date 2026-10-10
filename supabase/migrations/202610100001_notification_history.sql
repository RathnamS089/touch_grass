-- Run in the Supabase SQL Editor for the Grounded project.
-- The current app has no sign-in: clients may submit reminder records,
-- but may not read, update, or delete anyone's history.
begin;

create table if not exists public.notification_history (
    id uuid primary key default gen_random_uuid(),
    place_name text not null check (char_length(place_name) between 1 and 500),
    place_category text not null check (char_length(place_category) between 1 and 200),
    notified_at timestamptz not null default now()
);

alter table public.notification_history enable row level security;
revoke all on public.notification_history from anon, authenticated;
grant insert (place_name, place_category) on public.notification_history to anon;

drop policy if exists grounded_submit_notification on public.notification_history;
create policy grounded_submit_notification
    on public.notification_history
    for insert to anon
    with check (true);

notify pgrst, 'reload schema';
commit;
