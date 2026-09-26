# Macaya — Platform Edukasi Pencegahan HIV/AIDS

Situs statis (GitHub Pages: https://gomesnopes.github.io/sirasa/) dengan backend **Supabase** (Auth, Database, Storage).
Tidak ada proses build — semua halaman adalah HTML + Tailwind CDN + JavaScript biasa.

## Struktur Halaman

| File | Untuk | Keterangan |
|---|---|---|
| `index.html` | Publik | Landing page + modal masuk/daftar responden + slide intro |
| `dashboard.html` | Responden | Galeri modul, kuis, dan leaderboard |
| `buku.html` | Responden | Pembaca modul: **slide** (responsif + narasi) atau PDF (flipbook + Mode Baca Teks), dan lembar kuis |
| `profil.html` | Responden | Profil & rapor belajar |
| `admin-login.html` | Admin | Halaman login panel peneliti |
| `admin.html` | Admin | Panel: analitik, data responden, konten & modul, bank soal, pengaturan |
| `analitik.html` | Admin | Dasbor analitik riset (dimuat dalam iframe di admin) |
| `dashpivot.html` | Admin | Rekap kuis per modul/dimensi + unduh Excel (iframe di admin) |
| `admin-auth.js` | Admin | Penjaga akses: hanya akun yang terdaftar di tabel `admins` yang boleh masuk |
| `config.js` | Semua | URL & anon key Supabase, **daftar sekolah & kelas** untuk form, fungsi `hitungUmurDari()` |
| `slide.css`, `slide-render.js` | Semua | Tampilan satu slide (dipakai pembaca siswa & pratinjau editor admin) |
| `supabase/functions/tts-slide/` | Server | Edge Function pembuat suara neural (MP3) per slide |
| `app.css` | Responden | Gaya tampilan aplikasi native di HP (bottom nav, ubin ikon, bottom sheet) |
| `manifest.webmanifest` | Responden | Agar situs bisa "Tambahkan ke Layar Utama" dan terbuka layar penuh seperti aplikasi |
| `supabase/admin_setup.sql` | Setup | (usang, digantikan `tabel_admins`) — bagian 5 berisi contoh RLS |
| `supabase/2026-09-25_modul_slide.sql` | Setup | Tabel `slide` (isi modul slide + URL audio narasi) |
| `supabase/2026-09-25_tabel_admins.sql` | Setup | Tabel `admins` terpisah, fungsi `is_admin()`, cara tambah/cabut admin |
| `supabase/2026-09-25_sekolah_kelas.sql` | Setup | Kolom `sekolah` & `kelas`, trigger pendaftaran, policy `riwayat_kuis` |
| `_arsip/` | — | Halaman lama yang tidak dipakai (tidak diterbitkan oleh GitHub Pages) |

## Tabel Supabase yang dipakai
- `profiles` — data **responden saja** (`nama_lengkap`, `jenis_kelamin`, `tanggal_lahir`, `sekolah`, `kelas`, `total_poin`;
  kolom lama `kota` & `kategori` tidak dipakai lagi)
- `admins` — akun admin/peneliti (`user_id`, `nama`). RLS tanpa policy tulis: hanya bisa diubah dari SQL Editor.
  Admin tidak punya baris di `profiles`, jadi tidak muncul di peringkat maupun analitik.
- `buku` — modul/konten (`judul`, `tipe_konten`: *Modul PDF* / *Hanya Kuis* / *Evaluasi Global* / *Pengantar Sistem*, `file_url`, `cover_url`, `is_active`, `id_kuis_terkait`)
- `slide` — isi modul bertipe *Modul Slide* (`id_buku`, `urutan`, `jenis`, `ikon`, `judul`, `isi`, `kunci`, `penjelasan`, `gambar_url`, `audio_url`, `audio_jawaban_url`, `audio_suara`)
- `kuis` — soal (`id_buku`, `pertanyaan`, `dimensi`, `opsi_jawaban` JSON berisi `{teks, poin}`)
- `riwayat_kuis` — aktivitas & jawaban (`id_user`, `id_buku`, `poin_didapat`, `durasi_baca_detik`, `jenis_tes`, `dimensi`, `detail_jawaban`)
- Storage bucket `pdf-buku` — file PDF & sampul

## Setup Admin (wajib sekali)
1. Di Supabase → **SQL Editor**, jalankan berurutan: `supabase/2026-09-25_sekolah_kelas.sql`
   lalu `supabase/2026-09-25_tabel_admins.sql`.
2. Akun admin mendaftar dulu lewat situs, lalu angkat menjadi admin (ganti emailnya):
   ```sql
   insert into public.admins (user_id, nama)
   select id, coalesce(raw_user_meta_data->>'nama_lengkap', split_part(email, '@', 1))
   from auth.users where email = 'email-admin@contoh.com'
   on conflict (user_id) do nothing;
   delete from public.profiles where id in (select user_id from public.admins);
   ```
3. Masuk lewat `/admin-login.html`.

## Mengganti daftar sekolah / kelas
Edit `DAFTAR_SEKOLAH` dan `DAFTAR_KELAS` di `config.js`. Form daftar, edit profil, edit responden di admin,
dan filter analitik otomatis mengikuti.

## Logo & ikon
Wordmark `assets/macaya-wordmark-putih.png` (latar gelap) / `-gelap.png` (latar terang), brandmark
`assets/macaya-brandmark-*.png`, ikon aplikasi `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
favicon `favicon.png`.

## Tampilan HP & desktop
- **HP (< 768px)** — `dashboard.html` & `profil.html` bergaya aplikasi native: header gradasi, kartu ringkasan
  XP/peringkat (tab Progres/Waktu/Tes), grid ikon Menu Belajar, bottom navigation dengan tombol tengah "Lanjut".
- **Desktop** — tata letak dasbor web tersendiri (bukan tampilan HP yang diperbesar): bilah atas dengan tab
  **Beranda · Rapor**, kartu besar *Lanjutkan Belajar*, papan peringkat, empat kartu statistik sekaligus
  (XP & level, misi selesai, waktu, tes), dan kartu materi lengkap dengan status.
  Gaya bersama ada di `app.css` (`.d-header`, `.d-tabs`, `.d-tab`, `.d-kartu`).
- **Admin** — warna & kartu yang sama (sidebar biru tua, kartu modul ala Menu Belajar).

## Modul Slide + Suara Narasi Natural
**Membuat modul (admin):** Konten & Modul → *Buat Konten Baru* → tipe **Modul Slide** → editor slide terbuka.
Tiap slide punya **jenis** (Materi, Sampul, Kartu Mitos/Fakta, Penutup), **ikon mono** (nama ikon Font Awesome,
mis. `virus`, `shield-heart`), judul, isi, dan gambar opsional (otomatis diperkecil). Format isi:

| Tulis | Hasil |
|---|---|
| `- teks` | poin berbutir |
| `[droplet] Darah` | kotak ikon (grid) |
| `! teks` | kotak sorotan "Ingat, ya!" |
| `Sumber: ...` | catatan sumber kecil (tidak dibacakan) |
| `**teks**` | tebal |

**Kartu Mitos/Fakta:** isi = pernyataan, pilih kunci (Mitos/Fakta) dan tulis penjelasan. Siswa menebak, kartu
dibalik 3D, lalu penjelasan dibacakan (audio terpisah `audio_jawaban_url`).
Pratinjau bisa diganti *Desktop* / *HP* dan dirender pada ukuran layar sungguhan. Gambar slide pertama menjadi sampul modul.

**Suara narasi:** klik *Buat Suara Slide Ini* atau *Buat Suara Semua*. Edge Function `tts-slide` membuat MP3
sekali saja lalu menyimpannya di Storage (`pdf-buku/slide-audio/`); siswa hanya memutar file itu.
Jika teks slide diubah, audionya otomatis dikosongkan dan perlu dibuat ulang.

**Kamus ejaan suara** — Admin → *Pengaturan Sistem* → *Kamus Ejaan Suara* (tabel `kamus_ucapan`).
Singkatan dibaca sesuai kamus, mis. `HIV` → "ha i ve", `AIDS` → "eids", `ARV` → "a er ve". Berlaku untuk suara
neural (Edge Function) maupun suara perangkat. Di editor slide, buka *Lihat teks yang akan dibacakan* untuk mengecek.
Setelah kamus diubah, buat ulang suara slide terkait.

**Memasang penyedia suara (wajib sekali)** — Supabase Dashboard → *Edge Functions* → *Secrets*, isi salah satu
(urutan prioritas bila lebih dari satu terisi):
- **Gemini (disarankan, paling mudah)**: `GEMINI_API_KEY` dari https://aistudio.google.com/apikey (login akun Google,
  tanpa kartu kredit, ada kuota gratis). Model `gemini-3.8-flash-tts`, suara *Leda* (wanita) / *Puck* (pria), berkas WAV.
  Bila kuota satu model habis, otomatis pindah ke model Gemini TTS lain (tiap model punya kuota sendiri); tombol
  *Buat Suara Semua* menunggu 60 dtk lalu mencoba lagi saat kuota per menit penuh, dan bisa dilanjutkan esok hari.
  Opsional: `GEMINI_TTS_MODEL` (daftar model dipisah koma), `GEMINI_SUARA_WANITA`, `GEMINI_SUARA_PRIA`.
- **Azure**: `AZURE_TTS_KEY` + `AZURE_TTS_REGION` (mis. `southeastasia`) — suara Gadis / Ardi, MP3.
- **Google Cloud TTS**: `GOOGLE_TTS_API_KEY` (butuh akun billing Google Cloud).

**Membaca (siswa):** kartu kaca (glassmorphism) di atas latar animasi ringan, efek balik halaman antarslide,
progres ala *Story* di atas layar. Layar awal meminta *Mulai dengan Suara* (browser hanya mengizinkan suara setelah
ketukan); setelah itu narasi berjalan dan slide maju otomatis (tombol ⏩), kecepatan 0,75×–1,5×, teks panjang
ikut digulir mengikuti suara. Slide tanpa audio dibacakan dengan suara perangkat sebagai cadangan.
Hemat daya: blur kaca dimatikan di HP lemah, animasi berhenti saat tab tidak dibuka / "kurangi gerakan" aktif.

**Minggu 2 - HIV/AIDS** kini bertipe Modul Slide (15 slide dari Materi 1); 18 soal kuisnya tetap terhubung.
File PDF lamanya masih tersimpan di `file_url` bila suatu saat ingin dikembalikan.

## Dengarkan Materi di Flipbook (modul PDF)
- Tombol **🔊 Dengarkan** di sebelah *Mode Baca Teks*: isi halaman yang sedang tampil dibacakan tanpa mengubah tampilan flipbook.
- Setelah satu halaman selesai, flipbook **dibalik otomatis** dan pembacaan berlanjut; jika siswa membalik sendiri, pembacaan ikut pindah.
- Pemutar kecil di bawah layar: status halaman, jeda/lanjut, berhenti. Halaman berupa gambar dilewati otomatis.
- Memakai suara perangkat terbaik yang tersedia (sama seperti Mode Baca Teks).

## Fitur Mode Baca Teks (modul PDF)
- Tombol **Mode Baca Teks** di pojok kiri atas saat membaca modul PDF.
- Teks diambil dari PDF per halaman (pdf.js) dan disusun ulang jadi paragraf; judul terdeteksi otomatis.
- Pengaturan ukuran huruf dan tema (terang / sepia / gelap) tersimpan di browser.
- **Bacakan**: text-to-speech bahasa Indonesia (Web Speech API), paragraf yang dibacakan disorot,
  otomatis lanjut ke halaman berikutnya, bisa dijeda/dihentikan, kecepatan 0.75×–1.5×.
  Klik paragraf mana pun untuk mulai dibacakan dari situ.
- Halaman berupa gambar/scan tidak memiliki teks — pengguna diarahkan kembali ke flipbook.

## Rekomendasi Lanjutan (urut prioritas)
1. **Aktifkan RLS di Supabase** (bagian 5 di `supabase/admin_setup.sql`). Anon key di `config.js` bersifat publik;
   tanpa RLS siapa pun bisa membaca/mengubah/menghapus data langsung lewat API, walau halaman admin sudah dikunci.
2. **Amankan endpoint Google Apps Script** di `admin.html` (ubah email/password pengguna). Saat ini endpoint itu
   memakai service role key dan tampaknya bisa dipanggil siapa saja. Pindahkan ke Supabase Edge Function yang
   memverifikasi JWT pemanggil dan `is_admin()`, atau minimal cek token rahasia + validasi admin di GAS.
3. **Poin/XP dihitung di browser** (`buku.html` mengubah `profiles.total_poin` langsung) sehingga bisa dimanipulasi.
   Pindahkan perhitungan skor ke fungsi database (RPC) yang membaca kunci jawaban di server.
4. **Gambar**: halaman memakai versi ringan `assets/hero.png` (desktop) dan `assets/hero-mobile.png` (HP),
   diperkecil dari foto asli `img.png` (5,8 MB) yang tidak dimuat halaman mana pun.
   `kitasebaya.png` adalah logo program KITA SEBAYA (platform lain) — tidak dipakai di Macaya.
5. **Tailwind CDN** (`cdn.tailwindcss.com`) tidak disarankan untuk produksi (lambat, peringatan di konsol).
   Pertimbangkan build Tailwind CLI sekali jadi `styles.css`.
6. **Satukan kode yang berulang**: inisialisasi Supabase, fungsi upload PDF+sampul (ada 2 salinan di `admin.html`),
   dan logika kuis (`buku.html`) sebaiknya dipindah ke file `.js` bersama.
7. **Escape data pengguna**: sudah diterapkan di halaman admin dan leaderboard `dashboard.html`. Terapkan pola
   yang sama bila menambah halaman baru yang merender data pengguna lewat `innerHTML`.
8. **Tabel `buku` belum memakai RLS** — siapa pun dengan anon key bisa mengubah/menghapus modul. Aktifkan bersama
   policy baca-untuk-semua & tulis-khusus-admin (contoh di bagian 5 `admin_setup.sql`).
9. Nilai `MAX_SCORE_TOTAL = 500` di `analitik.html` adalah asumsi — sesuaikan dengan skor maksimum instrumen
   agar N-Gain akurat (atau hitung otomatis dari `opsi_jawaban`).
