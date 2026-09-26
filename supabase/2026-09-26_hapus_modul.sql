-- =====================================================================
-- Macaya — Modul bisa dihapus dari admin
-- Sebelumnya penghapusan buku ditolak bila ada riwayat/soal yang menunjuk ke modul itu.
--   - kuis          : ikut terhapus bersama modulnya (ON DELETE CASCADE)
--   - riwayat_kuis  : TETAP disimpan untuk data penelitian; tautan modulnya dikosongkan
--                     (ON DELETE SET NULL). Nama tes tetap tercatat di kolom jenis_tes.
-- Aman dijalankan berulang kali.
-- =====================================================================

alter table public.riwayat_kuis alter column id_buku drop not null;

alter table public.kuis drop constraint if exists kuis_id_buku_fkey;
alter table public.kuis add constraint kuis_id_buku_fkey
    foreign key (id_buku) references public.buku(id) on delete cascade;

alter table public.riwayat_kuis drop constraint if exists riwayat_kuis_id_buku_fkey;
alter table public.riwayat_kuis add constraint riwayat_kuis_id_buku_fkey
    foreign key (id_buku) references public.buku(id) on delete set null;
