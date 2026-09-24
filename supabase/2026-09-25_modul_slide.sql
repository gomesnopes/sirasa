-- =====================================================================
-- SIRASA — Modul Slide (alternatif modul PDF)
-- Modul bertipe buku.tipe_konten = 'Modul Slide' berisi baris-baris slide.
-- Jalankan SETELAH 2026-09-25_tabel_admins.sql (butuh public.is_admin()).
-- Aman dijalankan berulang kali.
-- =====================================================================

create table if not exists public.slide (
    id          uuid primary key default gen_random_uuid(),
    id_buku     uuid not null references public.buku(id) on delete cascade,
    urutan      integer not null default 1,
    judul       text not null default '',
    isi         text not null default '',     -- paragraf; baris "- " menjadi poin
    gambar_url  text,                          -- opsional (disimpan di bucket pdf-buku/slide/)
    audio_url   text,                          -- MP3 suara neural (dibuat Edge Function tts-slide)
    audio_suara text,                          -- nama suara yang dipakai, mis. id-ID-GadisNeural
    audio_hash  text,                          -- sidik teks saat audio dibuat (deteksi audio usang)
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists slide_buku_urutan_idx on public.slide (id_buku, urutan);

alter table public.slide enable row level security;

-- Semua orang boleh membaca slide (sama seperti tabel buku); hanya admin yang boleh menulis.
drop policy if exists "slide_baca"  on public.slide;
drop policy if exists "slide_admin" on public.slide;
create policy "slide_baca"  on public.slide for select to anon, authenticated using (true);
create policy "slide_admin" on public.slide for all    to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- updated_at otomatis
create or replace function public.slide_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_slide_updated_at on public.slide;
create trigger trg_slide_updated_at before update on public.slide
    for each row execute function public.slide_set_updated_at();
