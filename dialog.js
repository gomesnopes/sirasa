// File: dialog.js
// Pengganti alert()/confirm() bawaan browser dengan modal bergaya Macaya
// (tanpa tulisan "<alamat web> menyatakan"). Mandiri: tidak butuh Tailwind.
//
//   await Dialog.alert('Data tersimpan.');
//   if (await Dialog.confirm('Hapus modul ini?', { tipe: 'bahaya', teksOk: 'Hapus' })) { ... }
//
// Opsi: { judul, tipe: 'info' | 'sukses' | 'peringatan' | 'bahaya', teksOk, teksBatal }
// Jika tipe tidak diisi, ditebak dari isi pesan (✅ = sukses, "gagal" = bahaya, 🔒 = peringatan).
(function () {
    const GAYA = `
    .sd-latar{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;
      background:rgba(11,29,58,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:sd-muncul .18s ease-out}
    .sd-kartu{width:100%;max-width:380px;background:#fff;border-radius:24px;box-shadow:0 24px 60px rgba(11,29,58,.35);
      padding:28px 24px 20px;text-align:center;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
      animation:sd-naik .24s cubic-bezier(.16,1,.3,1)}
    .sd-ikon{width:64px;height:64px;border-radius:999px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:28px}
    .sd-info .sd-ikon{background:#e8f1fb;color:#1769b3}.sd-sukses .sd-ikon{background:#ecfdf5;color:#059669}
    .sd-peringatan .sd-ikon{background:#fffbeb;color:#d97706}.sd-bahaya .sd-ikon{background:#fff1f2;color:#e11d48}
    .sd-judul{margin:0 0 6px;font-size:19px;font-weight:900;color:#0b1d3a}
    .sd-pesan{margin:0;font-size:14.5px;line-height:1.6;color:#475569;white-space:pre-line;word-break:break-word;max-height:50vh;overflow-y:auto}
    .sd-tombol{display:flex;gap:10px;margin-top:22px}
    .sd-tombol button{flex:1;border:0;border-radius:14px;padding:13px 16px;font-size:15px;font-weight:800;cursor:pointer;transition:transform .1s,filter .15s}
    .sd-tombol button:active{transform:scale(.97)}.sd-tombol button:hover{filter:brightness(.95)}
    .sd-batal{background:#f1f5f9;color:#334155}.sd-ok{color:#fff;background:#1769b3}
    .sd-sukses .sd-ok{background:#059669}.sd-bahaya .sd-ok{background:#e11d48}.sd-peringatan .sd-ok{background:#d97706}
    @media (max-width:640px){.sd-latar{align-items:flex-end;padding:0}
      .sd-kartu{max-width:none;border-radius:24px 24px 0 0;padding-bottom:max(20px,env(safe-area-inset-bottom));animation:sd-geser .28s cubic-bezier(.16,1,.3,1)}}
    @keyframes sd-muncul{from{opacity:0}to{opacity:1}}
    @keyframes sd-naik{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
    @keyframes sd-geser{from{transform:translateY(100%)}to{transform:none}}`;

    const IKON = {
        info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg>',
        sukses: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        peringatan: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
        bahaya: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
    };
    const JUDUL = { info: 'Informasi', sukses: 'Berhasil', peringatan: 'Perhatian', bahaya: 'Terjadi Kesalahan' };

    let antrian = Promise.resolve();

    function tebakTipe(pesan, konfirmasi) {
        const t = String(pesan);
        if (/^\s*(✅|🎉)/.test(t) || /berhasil/i.test(t) && !/gagal/i.test(t)) return 'sukses';
        if (/gagal|error|tidak (dapat|bisa)|kesalahan/i.test(t)) return 'bahaya';
        if (/^\s*🔒/.test(t) || /wajib|mohon|belum|hapus|kosongkan/i.test(t)) return konfirmasi && /hapus|kosongkan/i.test(t) ? 'bahaya' : 'peringatan';
        return 'info';
    }

    function pasangGaya() {
        if (document.getElementById('sd-gaya')) return;
        const el = document.createElement('style'); el.id = 'sd-gaya'; el.textContent = GAYA;
        document.head.appendChild(el);
    }

    function tampilkan(pesan, opsi, konfirmasi) {
        pasangGaya();
        const tipe = opsi.tipe || tebakTipe(pesan, konfirmasi);
        const pesanBersih = String(pesan ?? '').replace(/^\s*(✅|🎉|🔒)\s*/, '');
        return new Promise(resolve => {
            const latar = document.createElement('div');
            latar.className = `sd-latar sd-${tipe}`;
            latar.setAttribute('role', konfirmasi ? 'alertdialog' : 'dialog');
            latar.setAttribute('aria-modal', 'true');
            latar.innerHTML = `<div class="sd-kartu"><div class="sd-ikon">${IKON[tipe]}</div>
                <h3 class="sd-judul"></h3><p class="sd-pesan"></p>
                <div class="sd-tombol">${konfirmasi ? '<button type="button" class="sd-batal"></button>' : ''}<button type="button" class="sd-ok"></button></div></div>`;
            latar.querySelector('.sd-judul').textContent = opsi.judul || (konfirmasi ? 'Konfirmasi' : JUDUL[tipe]);
            latar.querySelector('.sd-pesan').textContent = pesanBersih;
            const ok = latar.querySelector('.sd-ok'), batal = latar.querySelector('.sd-batal');
            ok.textContent = opsi.teksOk || (konfirmasi ? 'Ya, Lanjutkan' : 'Oke');
            if (batal) batal.textContent = opsi.teksBatal || 'Batal';

            const fokusSebelum = document.activeElement;
            const tutup = hasil => {
                document.removeEventListener('keydown', tombolKeyboard, true);
                latar.remove();
                if (fokusSebelum && fokusSebelum.focus) try { fokusSebelum.focus(); } catch (e) {}
                resolve(hasil);
            };
            const tombolKeyboard = e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tutup(!konfirmasi); }
                else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tutup(true); }
            };
            ok.onclick = () => tutup(true);
            if (batal) batal.onclick = () => tutup(false);
            latar.addEventListener('click', e => { if (e.target === latar && konfirmasi) tutup(false); });
            document.addEventListener('keydown', tombolKeyboard, true);
            document.body.appendChild(latar);
            ok.focus();
        });
    }

    // Dialog ditampilkan berurutan (tidak menumpuk)
    function antre(pesan, opsi, konfirmasi) {
        const hasil = antrian.then(() => tampilkan(pesan, opsi || {}, konfirmasi));
        antrian = hasil.catch(() => {});
        return hasil;
    }

    window.Dialog = {
        alert: (pesan, opsi) => antre(pesan, opsi, false),
        confirm: (pesan, opsi) => antre(pesan, opsi, true)
    };
})();
