-- REP People & Operations Dashboard
-- Jalankan seluruh skrip ini di Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null default 'Pengguna',
  role text not null default 'viewer' check (role in ('admin','hr','editor','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.module_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, module_key),
  check (not can_write or can_read)
);

create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  row_index integer not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (module, row_index)
);

-- Kolom pribadi karyawan dipisahkan agar hanya admin/HR yang bisa mengaksesnya.
create table if not exists public.app_private_data (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  row_index integer not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (module, row_index)
);

create index if not exists app_data_module_idx on public.app_data(module);
create index if not exists private_data_module_idx on public.app_private_data(module);

create or replace function public.current_app_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.user_id = auth.uid()), 'viewer');
$$;

create or replace function public.has_module_access(p_module text, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.module_permissions mp
    where mp.user_id = auth.uid()
      and mp.module_key = p_module
      and case when p_action = 'write' then mp.can_write else mp.can_read end
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_username text;
  v_display_name text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', v_username, 'Pengguna');
  insert into public.profiles(user_id, username, display_name, role)
  values (new.id, v_username, v_display_name, 'viewer')
  on conflict (user_id) do update
    set username = excluded.username,
        display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rep on auth.users;
create trigger on_auth_user_created_rep
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_data_touch_updated_at on public.app_data;
create trigger app_data_touch_updated_at before update on public.app_data
for each row execute procedure public.touch_updated_at();
drop trigger if exists app_private_data_touch_updated_at on public.app_private_data;
create trigger app_private_data_touch_updated_at before update on public.app_private_data
for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.module_permissions enable row level security;
alter table public.app_data enable row level security;
alter table public.app_private_data enable row level security;

-- Profiles: setiap pengguna hanya bisa melihat profil sendiri; admin dapat melihat semuanya.
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (user_id = auth.uid() or public.current_app_role() = 'admin');
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Hak akses menu: pengguna melihat hak akses miliknya; hanya admin mengubahnya.
drop policy if exists module_permissions_select_self_or_admin on public.module_permissions;
create policy module_permissions_select_self_or_admin on public.module_permissions
for select to authenticated
using (user_id = auth.uid() or public.current_app_role() = 'admin');
drop policy if exists module_permissions_admin_write on public.module_permissions;
create policy module_permissions_admin_write on public.module_permissions
for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Data operasional: akses diberikan per modul.
drop policy if exists app_data_read_by_module on public.app_data;
create policy app_data_read_by_module on public.app_data
for select to authenticated
using (public.current_app_role() = 'admin' or public.has_module_access(module, 'read'));
drop policy if exists app_data_insert_by_module on public.app_data;
create policy app_data_insert_by_module on public.app_data
for insert to authenticated
with check (public.current_app_role() = 'admin' or public.has_module_access(module, 'write'));
drop policy if exists app_data_update_by_module on public.app_data;
create policy app_data_update_by_module on public.app_data
for update to authenticated
using (public.current_app_role() = 'admin' or public.has_module_access(module, 'write'))
with check (public.current_app_role() = 'admin' or public.has_module_access(module, 'write'));
drop policy if exists app_data_delete_by_module on public.app_data;
create policy app_data_delete_by_module on public.app_data
for delete to authenticated
using (public.current_app_role() = 'admin' or public.has_module_access(module, 'write'));

-- Data pribadi karyawan: hanya admin dan HR.
drop policy if exists private_data_admin_hr_read on public.app_private_data;
create policy private_data_admin_hr_read on public.app_private_data
for select to authenticated
using (public.current_app_role() = 'admin' or (public.current_app_role() = 'hr' and public.has_module_access('Data_Karyawan', 'read')));
drop policy if exists private_data_admin_hr_insert on public.app_private_data;
create policy private_data_admin_hr_insert on public.app_private_data
for insert to authenticated
with check (public.current_app_role() = 'admin' or (public.current_app_role() = 'hr' and public.has_module_access('Data_Karyawan', 'write')));
drop policy if exists private_data_admin_hr_update on public.app_private_data;
create policy private_data_admin_hr_update on public.app_private_data
for update to authenticated
using (public.current_app_role() = 'admin' or (public.current_app_role() = 'hr' and public.has_module_access('Data_Karyawan', 'write')))
with check (public.current_app_role() = 'admin' or (public.current_app_role() = 'hr' and public.has_module_access('Data_Karyawan', 'write')));
drop policy if exists private_data_admin_hr_delete on public.app_private_data;
create policy private_data_admin_hr_delete on public.app_private_data
for delete to authenticated
using (public.current_app_role() = 'admin' or (public.current_app_role() = 'hr' and public.has_module_access('Data_Karyawan', 'write')));

-- Fungsi policy dipanggil oleh client login.
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_module_access(text, text) to authenticated;
revoke all on public.profiles, public.module_permissions, public.app_data, public.app_private_data from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.module_permissions to authenticated;
grant select, insert, update, delete on public.app_data to authenticated;
grant select, insert, update, delete on public.app_private_data to authenticated;

-- Realtime: broadcast perubahan tabel ke klien yang memiliki akses RLS.
alter table public.app_data replica identity full;
alter table public.app_private_data replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_data') then
    alter publication supabase_realtime add table public.app_data;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_private_data') then
    alter publication supabase_realtime add table public.app_private_data;
  end if;
end $$;
