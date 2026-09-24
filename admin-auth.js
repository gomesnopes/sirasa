// File: admin-auth.js
// Penjaga akses halaman admin (admin.html, analitik.html, dashpivot.html).
// Admin terdaftar di tabel public.admins (terpisah dari profiles responden).
// Wajib dimuat SETELAH supabase-js dan config.js.
//
// Catatan: pengecekan di browser hanya membatasi tampilan. Keamanan data yang
// sebenarnya harus ditegakkan oleh Row Level Security (RLS) di Supabase —
// lihat supabase/admin_setup.sql.
(function () {
    const LOGIN_PAGE = 'admin-login.html';
    let client = null;

    function getClient() {
        if (!client) {
            if (typeof CONFIG === 'undefined') throw new Error('config.js tidak terbaca!');
            client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        }
        return client;
    }

    // Hanya izinkan redirect ke halaman lokal (mencegah open redirect).
    function halamanAman(nama, cadangan) {
        return /^[a-z0-9_-]+\.html$/i.test(nama || '') ? nama : cadangan;
    }

    async function cekAdmin(userId) {
        const { data, error } = await getClient().from('admins').select('user_id, nama').eq('user_id', userId).maybeSingle();
        if (error) {
            const tabelHilang = /admins/i.test(error.message || '') && /exist|find|relation/i.test(error.message || '');
            return { ok: false, alasan: tabelHilang ? 'setup' : 'galat', pesan: error.message };
        }
        if (!data) return { ok: false, alasan: 'bukan_admin' };
        return { ok: true, profil: { id: data.user_id, nama_lengkap: data.nama } };
    }

    function keHalamanLogin(alasan) {
        // Jika berjalan di dalam iframe admin, arahkan jendela utama.
        const win = window.top !== window.self ? window.top : window;
        const asal = window.top !== window.self ? 'admin.html' : (location.pathname.split('/').pop() || 'admin.html');
        const params = new URLSearchParams({ next: halamanAman(asal, 'admin.html') });
        if (alasan) params.set('alasan', alasan);
        win.location.href = `${LOGIN_PAGE}?${params.toString()}`;
    }

    // Sembunyikan halaman sampai status admin terverifikasi.
    // Mengembalikan { client, session, profil } atau null (sudah dialihkan ke login).
    async function requireAdmin() {
        document.documentElement.style.visibility = 'hidden';
        try {
            const { data: { session } } = await getClient().auth.getSession();
            if (!session) { keHalamanLogin(); return null; }

            const hasil = await cekAdmin(session.user.id);
            if (!hasil.ok) { keHalamanLogin(hasil.alasan); return null; }

            document.documentElement.style.visibility = '';
            return { client: getClient(), session, profil: hasil.profil };
        } catch (err) {
            console.error('Verifikasi admin gagal:', err);
            keHalamanLogin('galat');
            return null;
        }
    }

    async function logout() {
        await getClient().auth.signOut();
        const win = window.top !== window.self ? window.top : window;
        win.location.href = `${LOGIN_PAGE}?alasan=keluar`;
    }

    function escapeHtml(teks) {
        return String(teks ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    window.AdminAuth = { LOGIN_PAGE, getClient, cekAdmin, requireAdmin, logout, halamanAman, escapeHtml };
})();
