-- =====================================================================
-- KITA SEBAYA — Pindahkan admin ke tabel tersendiri (public.admins)
-- Menggantikan desain profiles.role dari admin_setup.sql.
-- Aman dijalankan berulang kali.
--
-- Alasan:
-- 1) Admin bukan responden: tidak boleh muncul di peringkat, daftar
--    responden, maupun analitik riset (semuanya membaca tabel profiles).
-- 2) Keamanan: profiles punya policy "Enable all access for anon", sehingga
--    kolom role bisa diubah lewat anon key. Tabel admins memakai RLS TANPA
--    policy tulis — admin hanya bisa ditambah dari SQL Editor / service role.
-- =====================================================================

-- 1) Tabel admin
create table if not exists public.admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    nama       text not null default 'Admin',
    created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Admin hanya boleh membaca barisnya sendiri (untuk verifikasi login).
-- Sengaja TIDAK ada policy insert/update/delete.
drop policy if exists "admins_baca_sendiri" on public.admins;
create policy "admins_baca_sendiri" on public.admins for select to authenticated
    using (user_id = auth.uid());

-- 2) is_admin() kini membaca tabel admins (dipakai policy riwayat_kuis, dll.)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3) Pindahkan admin lama (profiles.role = 'admin') ke tabel admins,
--    lalu hapus baris profilnya agar tidak dihitung sebagai responden.
do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
        insert into public.admins (user_id, nama)
        select id, coalesce(nullif(nama_lengkap, ''), 'Admin') from public.profiles where role = 'admin'
        on conflict (user_id) do nothing;
    end if;
end $$;
delete from public.profiles where id in (select user_id from public.admins);

-- 4) Bersihkan desain lama berbasis kolom role
drop trigger if exists trg_lindungi_role on public.profiles;
drop function if exists public.lindungi_kolom_role();
alter table public.profiles drop column if exists role;

-- =====================================================================
-- MENAMBAH ADMIN BARU (jalankan di SQL Editor, ganti emailnya).
-- Akun harus sudah mendaftar lewat situs lebih dulu.
--
-- insert into public.admins (user_id, nama)
-- select id, coalesce(raw_user_meta_data->>'nama_lengkap', split_part(email, '@', 1))
-- from auth.users where email = 'email-admin@contoh.com'
-- on conflict (user_id) do nothing;
-- delete from public.profiles where id in (select user_id from public.admins);
--
-- MENCABUT ADMIN:
-- delete from public.admins where user_id = (select id from auth.users where email = 'email-admin@contoh.com');
-- =====================================================================
