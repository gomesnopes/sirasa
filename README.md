# KITA SEBAYA — Platform Edukasi Pencegahan HIV/AIDS

Situs statis (GitHub Pages, domain `kitasebaya.biz.id`) dengan backend **Supabase** (Auth, Database, Storage).
Tidak ada proses build — semua halaman adalah HTML + Tailwind CDN + JavaScript biasa.

## Struktur Halaman

| File | Untuk | Keterangan |
|---|---|---|
| `index.html` | Publik | Landing page + modal masuk/daftar responden + slide intro |
| `dashboard.html` | Responden | Galeri modul, kuis, dan leaderboard |
| `buku.html` | Responden | Pembaca modul (flipbook), **Mode Baca Teks + Bacakan**, dan lembar kuis |
| `profil.html` | Responden | Profil & rapor belajar |
| `admin-login.html` | Admin | Halaman login panel peneliti |
| `admin.html` | Admin | Panel: analitik, data responden, konten & modul, bank soal, pengaturan |
| `analitik.html` | Admin | Dasbor analitik riset (dimuat dalam iframe di admin) |
| `dashpivot.html` | Admin | Rekap kuis per modul/dimensi + unduh Excel (iframe di admin) |
| `admin-auth.js` | Admin | Penjaga akses: hanya `profiles.role = 'admin'` yang boleh masuk |
| `config.js` | Semua | URL & anon key Supabase, **daftar sekolah & kelas** untuk form, fungsi `hitungUmurDari()` |
| `app.css` | Responden | Gaya tampilan aplikasi native di HP (bottom nav, ubin ikon, bottom sheet) |
| `manifest.webmanifest` | Responden | Agar situs bisa "Tambahkan ke Layar Utama" dan terbuka layar penuh seperti aplikasi |
| `supabase/admin_setup.sql` | Setup | Kolom `role`, fungsi `is_admin()`, trigger pelindung, contoh RLS |
| `supabase/2026-09-25_sekolah_kelas.sql` | Setup | Kolom `sekolah` & `kelas`, trigger pendaftaran, policy `riwayat_kuis` |
| `_arsip/` | — | Halaman lama yang tidak dipakai (tidak diterbitkan oleh GitHub Pages) |

## Tabel Supabase yang dipakai
- `profiles` — data responden (`nama_lengkap`, `jenis_kelamin`, `tanggal_lahir`, `sekolah`, `kelas`, `total_poin`, `role`;
  kolom lama `kota` & `kategori` tidak dipakai lagi)
- `buku` — modul/konten (`judul`, `tipe_konten`: *Modul PDF* / *Hanya Kuis* / *Evaluasi Global* / *Pengantar Sistem*, `file_url`, `cover_url`, `is_active`, `id_kuis_terkait`)
- `kuis` — soal (`id_buku`, `pertanyaan`, `dimensi`, `opsi_jawaban` JSON berisi `{teks, poin}`)
- `riwayat_kuis` — aktivitas & jawaban (`id_user`, `id_buku`, `poin_didapat`, `durasi_baca_detik`, `jenis_tes`, `dimensi`, `detail_jawaban`)
- Storage bucket `pdf-buku` — file PDF & sampul

## Setup Admin (wajib sekali)
1. Buka Supabase → **SQL Editor**, jalankan isi `supabase/admin_setup.sql` (bagian 1–3).
2. Angkat akun Anda menjadi admin (ganti email):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email-anda@contoh.com');
   ```
3. Jalankan `supabase/2026-09-25_sekolah_kelas.sql` (kolom sekolah/kelas + trigger pendaftaran + policy riwayat).
4. Masuk lewat `https://kitasebaya.biz.id/admin-login.html`.

## Mengganti daftar sekolah / kelas
Edit `DAFTAR_SEKOLAH` dan `DAFTAR_KELAS` di `config.js`. Form daftar, edit profil, edit responden di admin,
dan filter analitik otomatis mengikuti.

## Tampilan mobile (ala aplikasi)
Di layar < 768px, `index.html`, `dashboard.html`, dan `profil.html` memakai tata letak aplikasi native:
header gradasi, kartu ringkasan XP/peringkat, grid ikon menu, kartu misi geser, dan bottom navigation
dengan tombol tengah "Belajar" (membuka misi berikutnya yang belum selesai). Tampilan desktop tidak berubah.

## Fitur Mode Baca Teks (buku.html)
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
4. **Gambar**: halaman kini memakai versi ringan (`assets/hero.png`, `hero-mobile.png`, `logo-ks.png`, ikon).
   File asli `img.png` (5,8 MB) & `kitasebaya.png` (1,8 MB) disimpan sebagai master dan tidak dimuat halaman mana pun.
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
