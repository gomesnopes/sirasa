// File: slide-render.js
// Perender satu slide modul SIRASA (pasangan slide.css). Dipakai buku.html
// (pembaca siswa) dan admin.html (pratinjau editor) agar tampilannya identik.
//
// Format teks isi slide (sederhana, ramah admin):
//   - teks            -> poin berbutir
//   [ikon] Label      -> kotak ikon (ikon Font Awesome, mis. [droplet] Darah)
//   ! teks            -> kotak sorotan "Ingat, ya!"
//   Sumber: teks      -> catatan sumber (tidak dibacakan)
//   baris kosong      -> paragraf baru
//   **teks**          -> tebal
//
// Jenis slide: materi | sampul | penutup | mitos-fakta
//   mitos-fakta: isi = pernyataan, kunci = 'mitos'/'fakta', penjelasan = dibacakan setelah kartu dibalik.
//   Saat siswa memilih jawaban, elemen slide memancarkan event 'sl-jawab' {detail: {pilihan, benar}}.
(function () {
    function esc(t) {
        return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    const tebal = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const namaIkon = n => (/^[a-z0-9-]+$/.test(String(n || '').trim()) ? String(n).trim() : '');
    const ikonHtml = (n, kelas = '') => namaIkon(n) ? `<i class="fa-solid fa-${namaIkon(n)} ${kelas}" aria-hidden="true"></i>` : '';

    const POLA = {
        poin: /^[-•*]\s+(.*)$/,
        chip: /^\[([a-z0-9-]+)\]\s+(.*)$/,
        ingat: /^!\s*(.*)$/,
        sumber: /^sumber\s*:/i
    };

    function isiKeHtml(isi) {
        const baris = String(isi || '').replace(/\r/g, '').split('\n');
        let html = '', blok = null, isiBlok = [];
        const tutup = () => {
            if (!isiBlok.length) return;
            if (blok === 'p') html += `<p>${isiBlok.map(tebal).join('<br>')}</p>`;
            if (blok === 'poin') html += `<ul>${isiBlok.map(p => `<li>${tebal(p)}</li>`).join('')}</ul>`;
            // Label panjang -> kotak ikon dibuat satu kolom (HP) / dua kolom (desktop)
            if (blok === 'chip') html += `<div class="sl-grid${isiBlok.some(([, t]) => t.length > 28) ? ' sl-grid-lebar' : ''}">${isiBlok.map(([ik, t], i) => `<div class="sl-chip" style="--i:${i}">${ikonHtml(ik) || '<i></i>'}<span>${tebal(t)}</span></div>`).join('')}</div>`;
            if (blok === 'ingat') html += `<div class="sl-ingat"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><div><b>Ingat, ya!</b>${isiBlok.map(p => `<p>${tebal(p)}</p>`).join('')}</div></div>`;
            isiBlok = []; blok = null;
        };
        const masuk = (jenis, nilai) => { if (blok !== jenis) tutup(); blok = jenis; isiBlok.push(nilai); };
        baris.forEach(b => {
            const t = b.trim();
            if (!t) return tutup();
            let m;
            if (POLA.sumber.test(t)) { tutup(); html += `<p class="sl-sumber"><i class="fa-solid fa-book-medical" aria-hidden="true"></i>${tebal(t)}</p>`; }
            else if ((m = t.match(POLA.chip))) masuk('chip', [m[1], m[2]]);
            else if ((m = t.match(POLA.ingat))) masuk('ingat', m[1]);
            else if ((m = t.match(POLA.poin))) masuk('poin', m[1]);
            else masuk('p', t);
        });
        tutup();
        return html;
    }

    // ---------- Teks untuk dibacakan (harus sama dengan Edge Function tts-slide) ----------
    function rapikanUcapan(t) {
        return String(t || '')
            .replace(/\*\*/g, '')
            .replace(/HIV\/AIDS/g, 'HIV dan AIDS')
            .replace(/(\S)\s*\/\s*(\S)/g, '$1 atau $2')
            .replace(/≠/g, ' tidak sama dengan ')
            .replace(/\s*(…|\.\.\.)\s*$/, ':').replace(/…|\.\.\./g, ', ')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
            .replace(/\s+/g, ' ').trim();
    }
    const akhiriTitik = b => (/[.!?:;]$/.test(b) ? b : b + '.');

    function teksUcapan(slide) {
        const judul = rapikanUcapan(slide.judul);
        if (slide.jenis === 'mitos-fakta') {
            return [judul ? akhiriTitik(judul) : 'Mitos atau fakta?', akhiriTitik(rapikanUcapan(slide.isi)), 'Menurutmu, mitos atau fakta?'].join(' ');
        }
        const baris = String(slide.isi || '').split(/\r?\n/).map(b => b.trim()).filter(Boolean)
            .filter(b => !POLA.sumber.test(b))
            .map((b, i, semua) => {
                let m;
                if ((m = b.match(POLA.chip))) return m[2];
                // "Ingat, ya!" cukup sekali per kotak sorotan
                if ((m = b.match(POLA.ingat))) return (i > 0 && POLA.ingat.test(semua[i - 1]) ? '' : 'Ingat, ya! ') + m[1];
                if ((m = b.match(POLA.poin))) return m[1];
                return b;
            })
            .map(rapikanUcapan).filter(Boolean).map(akhiriTitik);
        return [judul ? akhiriTitik(judul) : '', ...baris].filter(Boolean).join(' ');
    }

    function teksJawaban(slide) {
        if (slide.jenis !== 'mitos-fakta' || !slide.kunci) return '';
        return [`Jawabannya: ${slide.kunci === 'mitos' ? 'mitos' : 'fakta'}.`, rapikanUcapan(slide.penjelasan)].filter(Boolean).map(akhiriTitik).join(' ');
    }

    function orientasiLayar() {
        return window.innerHeight > window.innerWidth ? 'potret' : 'lanskap';
    }

    // ---------- Kartu Mitos / Fakta ----------
    function kartuMitosFakta(slide, terjawab) {
        const kunci = slide.kunci === 'fakta' ? 'fakta' : 'mitos';
        const benar = terjawab ? terjawab === kunci : null;
        return `
            <div class="sl-kartu${terjawab ? ' dibalik' : ''}">
                <div class="sl-kartu-dalam">
                    <div class="sl-muka depan" ${terjawab ? 'aria-hidden="true"' : ''}>
                        <p class="sl-pernyataan">${tebal(String(slide.isi || '').trim()) || '<span class="sl-kosong">Tulis pernyataan...</span>'}</p>
                        <div class="sl-pilihan">
                            <button type="button" class="sl-btn-mitos" data-jawab="mitos" ${terjawab ? 'disabled' : ''}><i class="fa-solid fa-xmark"></i> MITOS</button>
                            <button type="button" class="sl-btn-fakta" data-jawab="fakta" ${terjawab ? 'disabled' : ''}><i class="fa-solid fa-check"></i> FAKTA</button>
                        </div>
                    </div>
                    <div class="sl-muka belakang kunci-${kunci}" ${terjawab ? '' : 'aria-hidden="true"'}>
                        <div class="sl-hasil">
                            <span class="sl-lencana ${kunci}">${kunci.toUpperCase()}</span>
                            <span class="sl-hasil-teks ${benar === false ? 'sl-kurang' : 'sl-tepat'}">${benar === null ? '' : benar ? '<i class="fa-solid fa-circle-check"></i> Tebakanmu tepat!' : '<i class="fa-solid fa-circle-info"></i> Belum tepat, tidak apa-apa.'}</span>
                        </div>
                        <p class="sl-penjelasan">${tebal(slide.penjelasan || '') || '<span class="sl-kosong">Tulis penjelasan...</span>'}</p>
                    </div>
                </div>
            </div>`;
    }

    // Isi elemen `el` dengan slide. meta: { nomor, total, label, terjawab: 'mitos'|'fakta' }
    function render(el, slide, orientasi, meta = {}) {
        const jenis = ['sampul', 'penutup', 'mitos-fakta'].includes(slide.jenis) ? slide.jenis : 'materi';
        const ikon = namaIkon(slide.ikon) || (jenis === 'mitos-fakta' ? 'scale-balanced' : '');
        const adaGambar = !!slide.gambar_url && jenis !== 'mitos-fakta';
        // Ikon besar menggantikan gambar di layar lebar (materi) dan selalu tampil di sampul/penutup
        const ikonBesar = !adaGambar && ikon && (jenis === 'sampul' || jenis === 'penutup' || orientasi === 'lanskap');
        const adaMedia = adaGambar || ikonBesar;
        const kelasJenis = { sampul: ' sl-sampul', penutup: ' sl-penutup', 'mitos-fakta': ' sl-mf', materi: '' }[jenis];
        // Pertahankan kelas milik pemanggil (wadah halaman & mode hemat)
        const tetap = [...el.classList].filter(c => c === 'sl-halaman' || c === 'sl-hemat').map(c => ' ' + c).join('');
        el.className = `sl-slide sl-${orientasi}${kelasJenis}${adaMedia ? '' : ' sl-tanpa-media'}${tetap}`;

        const label = meta.label || (jenis === 'materi' && meta.nomor ? `Bagian ${meta.nomor}${meta.total ? ' / ' + meta.total : ''}` : '');
        const media = adaGambar ? `<div class="sl-media"><img src="${esc(slide.gambar_url)}" alt="" loading="eager"></div>`
            : ikonBesar ? `<div class="sl-media"><div class="sl-ikon-besar">${ikonHtml(ikon)}</div></div>` : '';
        const kepala = (jenis === 'materi' || jenis === 'mitos-fakta') && (label || (ikon && !ikonBesar))
            ? `<div class="sl-kepala">${ikon && !ikonBesar ? `<span class="sl-ikon-kecil">${ikonHtml(ikon)}</span>` : ''}${label ? `<span class="sl-label">${esc(label)}</span>` : ''}</div>` : '';
        const judul = `<h2 class="sl-judul">${slide.judul ? esc(slide.judul) : '<span class="sl-kosong">Judul slide</span>'}</h2>`;
        const isi = jenis === 'mitos-fakta' ? kartuMitosFakta(slide, meta.terjawab)
            : `<div class="sl-isi">${isiKeHtml(slide.isi) || '<p class="sl-kosong">Isi slide belum ditulis.</p>'}</div>`;

        el.innerHTML = `${media}<div class="sl-teks">${kepala}${judul}${isi}</div>`;

        if (jenis === 'mitos-fakta') {
            el.querySelectorAll('[data-jawab]').forEach(btn => btn.addEventListener('click', e => {
                e.stopPropagation();
                const pilihan = btn.dataset.jawab, kunci = slide.kunci === 'fakta' ? 'fakta' : 'mitos';
                render(el, slide, orientasi, { ...meta, terjawab: pilihan });
                // Balik kartu dengan animasi (render ulang di atas sudah menandai hasilnya)
                const kartu = el.querySelector('.sl-kartu');
                kartu.classList.remove('dibalik'); void kartu.offsetWidth; kartu.classList.add('dibalik');
                el.dispatchEvent(new CustomEvent('sl-jawab', { bubbles: true, detail: { pilihan, benar: pilihan === kunci } }));
            }));
        }
    }

    window.SlideRender = { isiKeHtml, teksUcapan, teksJawaban, orientasiLayar, render, esc };
})();
