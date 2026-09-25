-- =====================================================================
-- SIRASA — Modul Slide v2 (tampilan kaca + kartu Mitos/Fakta)
-- Menambah jenis slide, ikon mono, dan kunci/penjelasan kartu Mitos/Fakta
-- beserta audio jawabannya. Jalankan SETELAH 2026-09-25_modul_slide.sql.
-- Aman dijalankan berulang kali; slide lama otomatis berjenis 'materi'.
-- =====================================================================

alter table public.slide
    add column if not exists jenis             text not null default 'materi', -- materi | sampul | mitos-fakta | penutup
    add column if not exists ikon              text,                          -- nama ikon Font Awesome, mis. 'virus'
    add column if not exists kunci             text,                          -- mitos | fakta (khusus jenis mitos-fakta)
    add column if not exists penjelasan        text not null default '',     -- dibacakan setelah kartu dibalik
    add column if not exists audio_jawaban_url text;                          -- MP3 penjelasan (dibuat Edge Function tts-slide)

alter table public.slide drop constraint if exists slide_jenis_cek;
alter table public.slide add constraint slide_jenis_cek check (jenis in ('materi', 'sampul', 'mitos-fakta', 'penutup'));
alter table public.slide drop constraint if exists slide_kunci_cek;
alter table public.slide add constraint slide_kunci_cek check (kunci is null or kunci in ('mitos', 'fakta'));
