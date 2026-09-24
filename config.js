// File: config.js
const CONFIG = {
    // GANTI DENGAN URL PROJECT SUPABASE ANDA
    SUPABASE_URL: "https://rzzmpxeiducczixmwkpo.supabase.co", 
    
    // GANTI DENGAN ANON/PUBLIC KEY SUPABASE ANDA
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6em1weGVpZHVjY3ppeG13a3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzEwOTYsImV4cCI6MjA5NjY0NzA5Nn0.uoLGH53BbizJqAGvBZwaC3GAbEAj20o_xLheKlu3CFY",

    // Pilihan pada form pendaftaran & edit profil (disimpan ke profiles.sekolah dan profiles.kelas).
    // Ubah/tambah sesuai sekolah sasaran penelitian.
    DAFTAR_SEKOLAH: ["SMA Negeri 1 Ternate", "SMA Negeri 3 Ternate", "MA Negeri 1 Kota Ternate"],
    DAFTAR_KELAS: ["Kelas X", "Kelas XI", "Kelas XII"]
};

// Isi <select> dengan daftar pilihan dari CONFIG (dipakai form daftar, profil, dan admin).
function isiPilihan(select, daftar, placeholder) {
    const el = typeof select === 'string' ? document.getElementById(select) : select;
    if (!el) return;
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '')
        + daftar.map(v => `<option value="${v}">${v}</option>`).join('');
}

// Hitung umur (tahun penuh) dari tanggal lahir 'YYYY-MM-DD'. Mengembalikan null jika kosong.
function hitungUmurDari(tanggalLahir) {
    if (!tanggalLahir) return null;
    const lahir = new Date(tanggalLahir), kini = new Date();
    if (isNaN(lahir)) return null;
    let umur = kini.getFullYear() - lahir.getFullYear();
    const m = kini.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && kini.getDate() < lahir.getDate())) umur--;
    return umur;
}
