-- =====================================================================
-- ⚠️ USANG: bagian 1–4 digantikan oleh supabase/2026-09-25_tabel_admins.sql
--    (admin kini di tabel public.admins, kolom profiles.role dihapus).
--    Bagian 5 (rekomendasi RLS) masih relevan.
-- =====================================================================
-- KITA SEBAYA — Setup peran Admin
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- Aman dijalankan berulang kali.
-- =====================================================================

-- 1) Kolom peran pada profiles ('user' atau 'admin')
alter table public.profiles
    add column if not exists role text not null default 'user';

-- 2) Fungsi pembantu: apakah user yang sedang login adalah admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

-- 3) Cegah pengguna biasa menjadikan dirinya admin.
--    (profiles bisa di-insert/update dari browser, jadi kolom role harus dilindungi.)
--    auth.uid() bernilai NULL saat dijalankan dari SQL Editor / service role,
--    sehingga Anda tetap bisa mengangkat admin dari sini.
create or replace function public.lindungi_kolom_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is not null and not public.is_admin() then
        if tg_op = 'INSERT' then
            new.role := 'user';
        elsif new.role is distinct from old.role then
            raise exception 'Tidak diizinkan mengubah peran pengguna';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_lindungi_role on public.profiles;
create trigger trg_lindungi_role
    before insert or update on public.profiles
    for each row execute function public.lindungi_kolom_role();

-- 4) Angkat akun Anda menjadi admin (ganti emailnya, lalu jalankan):
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'email-admin@contoh.com');
--
-- Jika akun admin belum punya baris di profiles:
-- insert into public.profiles (id, nama_lengkap, role)
-- select id, 'Admin', 'admin' from auth.users where email = 'email-admin@contoh.com'
-- on conflict (id) do update set role = 'admin';


-- =====================================================================
-- 5) REKOMENDASI RLS (tinjau dulu sebelum dijalankan!)
--    Login admin di browser hanya menyembunyikan halaman. Tanpa RLS, siapa pun
--    yang memegang anon key (terlihat di config.js) tetap bisa mengubah data.
--    Cek kebijakan yang sudah ada di: Authentication > Policies.
--    Hapus tanda "--" pada blok yang ingin dipakai.
-- =====================================================================

-- -- BUKU: semua user login boleh membaca; hanya admin yang boleh mengubah.
-- alter table public.buku enable row level security;
-- create policy "buku_baca"    on public.buku for select using (true);
-- create policy "buku_admin"   on public.buku for all    using (public.is_admin()) with check (public.is_admin());

-- -- KUIS: sama seperti buku.
-- alter table public.kuis enable row level security;
-- create policy "kuis_baca"    on public.kuis for select using (auth.role() = 'authenticated');
-- create policy "kuis_admin"   on public.kuis for all    using (public.is_admin()) with check (public.is_admin());

-- -- RIWAYAT_KUIS: user menulis & membaca miliknya sendiri; admin membaca semua.
-- alter table public.riwayat_kuis enable row level security;
-- create policy "riwayat_insert_sendiri" on public.riwayat_kuis for insert with check (id_user = auth.uid());
-- create policy "riwayat_baca"           on public.riwayat_kuis for select using (id_user = auth.uid() or public.is_admin());
-- create policy "riwayat_admin"          on public.riwayat_kuis for all    using (public.is_admin()) with check (public.is_admin());

-- -- PROFILES: leaderboard butuh baca nama & poin semua user;
-- --           user hanya boleh mengubah profilnya sendiri; admin boleh semua.
-- alter table public.profiles enable row level security;
-- create policy "profiles_baca"          on public.profiles for select using (auth.role() = 'authenticated');
-- create policy "profiles_insert_sendiri" on public.profiles for insert with check (id = auth.uid());
-- create policy "profiles_update_sendiri" on public.profiles for update using (id = auth.uid() or public.is_admin());
-- create policy "profiles_hapus_admin"    on public.profiles for delete using (public.is_admin());

-- -- STORAGE bucket 'pdf-buku': hanya admin yang boleh upload/hapus.
-- create policy "pdf_upload_admin" on storage.objects for insert with check (bucket_id = 'pdf-buku' and public.is_admin());
-- create policy "pdf_hapus_admin"  on storage.objects for delete using (bucket_id = 'pdf-buku' and public.is_admin());
