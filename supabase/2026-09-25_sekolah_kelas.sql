-- =====================================================================
-- KITA SEBAYA — Data sekolah, kelas & tanggal lahir responden
-- Jalankan SETELAH supabase/admin_setup.sql (butuh fungsi public.is_admin()).
-- Aman dijalankan berulang kali.
-- =====================================================================

-- 1) Kolom baru pengganti "kota" (-> sekolah) dan "kategori" (-> kelas).
--    Kolom lama dibiarkan agar data lama tidak hilang.
alter table public.profiles add column if not exists sekolah text;
alter table public.profiles add column if not exists kelas   text;
-- tanggal_lahir (date) sudah ada.

-- 2) Trigger pendaftaran: isi profil langsung dari metadata signUp.
--    Tetap berhasil walau konfirmasi email aktif (user belum punya sesi saat mendaftar).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
    v_tgl  date;
    v_jk   text := meta->>'jenis_kelamin';
begin
    begin
        v_tgl := nullif(meta->>'tanggal_lahir', '')::date;
    exception when others then
        v_tgl := null;
    end;
    if v_jk not in ('Laki-laki', 'Perempuan') then v_jk := null; end if;

    insert into public.profiles (id, nama_lengkap, jenis_kelamin, tanggal_lahir, sekolah, kelas, total_poin)
    values (
        new.id,
        coalesce(nullif(meta->>'nama_lengkap', ''), split_part(new.email, '@', 1)),
        v_jk,
        v_tgl,
        nullif(meta->>'sekolah', ''),
        nullif(meta->>'kelas', ''),
        0
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- 3) riwayat_kuis: RLS aktif tetapi belum ada policy, sehingga hasil kuis & durasi
--    baca dari aplikasi DITOLAK database. Policy berikut mengizinkan:
--    - user menyimpan & membaca riwayat miliknya sendiri
--    - admin membaca & mengelola semua riwayat (untuk analitik/dashpivot)
drop policy if exists "riwayat_insert_sendiri" on public.riwayat_kuis;
drop policy if exists "riwayat_baca"           on public.riwayat_kuis;
drop policy if exists "riwayat_admin"          on public.riwayat_kuis;
create policy "riwayat_insert_sendiri" on public.riwayat_kuis for insert to authenticated
    with check (id_user = auth.uid());
create policy "riwayat_baca" on public.riwayat_kuis for select to authenticated
    using (id_user = auth.uid() or public.is_admin());
create policy "riwayat_admin" on public.riwayat_kuis for all to authenticated
    using (public.is_admin()) with check (public.is_admin());
