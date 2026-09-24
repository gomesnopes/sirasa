// File: slide-render.js
// Perender satu slide modul SIRASA (pasangan slide.css). Dipakai buku.html
// (pembaca siswa) dan admin.html (pratinjau editor) agar tampilannya identik.
//
// Format teks isi slide (sederhana, ramah admin):
//   - baris diawali "- " atau "• "  -> poin berbutir
//   - baris kosong                  -> paragraf baru
//   - **teks**                      -> tebal
(function () {
    function esc(t) {
        return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    const tebal = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    function isiKeHtml(isi) {
        const baris = String(isi || '').replace(/\r/g, '').split('\n');
        let html = '', paragraf = [], poin = [];
        const tutupParagraf = () => { if (paragraf.length) { html += `<p>${paragraf.map(tebal).join('<br>')}</p>`; paragraf = []; } };
        const tutupPoin = () => { if (poin.length) { html += `<ul>${poin.map(p => `<li>${tebal(p)}</li>`).join('')}</ul>`; poin = []; } };
        baris.forEach(b => {
            const t = b.trim();
            if (!t) { tutupParagraf(); tutupPoin(); return; }
            const m = t.match(/^[-•*]\s+(.*)$/);
            if (m) { tutupParagraf(); poin.push(m[1]); }
            else { tutupPoin(); paragraf.push(t); }
        });
        tutupParagraf(); tutupPoin();
        return html;
    }

    // Teks untuk dibacakan (sama dengan logika Edge Function tts-slide).
    function teksUcapan(slide) {
        const baris = String(slide.isi || '').split(/\r?\n/).map(b => b.trim()).filter(Boolean)
            .map(b => b.replace(/^[-•*]\s+/, '').replace(/\*\*/g, ''))
            .map(b => (/[.!?:;]$/.test(b) ? b : b + '.'));
        const judul = String(slide.judul || '').trim();
        return [judul ? judul.replace(/[.!?]?$/, '.') : '', ...baris].filter(Boolean).join(' ');
    }

    function orientasiLayar() {
        return window.innerHeight > window.innerWidth ? 'potret' : 'lanskap';
    }

    // Isi elemen `el` dengan slide. meta: { nomor, total, label }
    function render(el, slide, orientasi, meta = {}) {
        const adaGambar = !!slide.gambar_url;
        el.className = `sl-slide sl-${orientasi}${adaGambar ? '' : ' sl-tanpa-gambar'}`;
        const label = meta.label || (meta.nomor ? `Slide ${meta.nomor}${meta.total ? ' dari ' + meta.total : ''}` : '');
        const isi = isiKeHtml(slide.isi);
        el.innerHTML = `
            ${adaGambar ? `<div class="sl-media"><img src="${esc(slide.gambar_url)}" alt="" loading="eager"></div>` : ''}
            <div class="sl-teks">
                ${label ? `<span class="sl-label">${esc(label)}</span>` : ''}
                <h2 class="sl-judul">${slide.judul ? esc(slide.judul) : '<span class="sl-kosong">Judul slide</span>'}</h2>
                <div class="sl-isi">${isi || '<p class="sl-kosong">Isi slide belum ditulis.</p>'}</div>
            </div>`;
    }

    window.SlideRender = { isiKeHtml, teksUcapan, orientasiLayar, render, esc };
})();
