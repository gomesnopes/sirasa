// Supabase Edge Function: tts-slide
// Membuat audio MP3 suara neural bahasa Indonesia untuk satu slide (plus audio
// penjelasan untuk kartu Mitos/Fakta), menyimpannya
// ke Storage (bucket pdf-buku/slide-audio/), lalu mencatat URL-nya di tabel slide.
//
// Hanya admin (tabel public.admins) yang boleh memanggil.
// Penyedia suara dipilih dari secret yang tersedia (Dashboard > Edge Functions > Secrets):
//   - Azure  : AZURE_TTS_KEY + AZURE_TTS_REGION   -> id-ID-GadisNeural / id-ID-ArdiNeural
//   - Google : GOOGLE_TTS_API_KEY                 -> suara id-ID terbaik (Chirp3-HD > Neural2 > WaveNet > Standard)
//
// Body JSON: { "slide_id": "<uuid>", "suara": "wanita" | "pria" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "pdf-buku";

function balas(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---- Teks yang dibacakan (harus sama dengan slide-render.js: teksUcapan / teksJawaban) ----
const POLA = { poin: /^[-•*]\s+(.*)$/, chip: /^\[([a-z0-9-]+)\]\s+(.*)$/, ingat: /^!\s*(.*)$/, sumber: /^sumber\s*:/i };

// Kamus ejaan dari tabel kamus_ucapan, mis. HIV -> "ha i ve" (dimuat tiap permintaan)
let KAMUS: { pola: RegExp; ucapan: string }[] = [];
function aturKamus(daftar: { kata: string; ucapan: string }[] | null) {
  const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  KAMUS = (daftar || []).filter((k) => k?.kata && k?.ucapan)
    .sort((a, b) => b.kata.length - a.kata.length)
    .map((k) => ({ pola: new RegExp(`(?<![\\p{L}\\p{N}])${escRe(k.kata.trim())}(?![\\p{L}\\p{N}])`, "gu"), ucapan: k.ucapan.trim() }));
}
const terapkanKamus = (t: string) => KAMUS.reduce((h, k) => h.replace(k.pola, k.ucapan), t);

function rapikanUcapan(t: string): string {
  return terapkanKamus(String(t || "")
    .replace(/\*\*/g, "")
    .replace(/HIV\/AIDS/g, "HIV dan AIDS")
    .replace(/(\S)\s*\/\s*(\S)/g, "$1 atau $2")
    .replace(/≠/g, " tidak sama dengan ")
    .replace(/\s*(…|\.\.\.)\s*$/, ":").replace(/…|\.\.\./g, ", ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ""))
    .replace(/\s+/g, " ").trim();
}
const akhiriTitik = (b: string) => (/[.!?:;]$/.test(b) ? b : b + ".");

type Slide = { id: string; judul: string; isi: string; jenis?: string; kunci?: string | null; penjelasan?: string };

function teksUcapan(s: Slide): string {
  const judul = rapikanUcapan(s.judul);
  if (s.jenis === "mitos-fakta") {
    return [judul ? akhiriTitik(judul) : "Mitos atau fakta?", akhiriTitik(rapikanUcapan(s.isi)), "Menurutmu, mitos atau fakta?"].join(" ");
  }
  const baris = String(s.isi || "").split(/\r?\n/).map((b) => b.trim()).filter(Boolean)
    .filter((b) => !POLA.sumber.test(b))
    .map((b, i, semua) => {
      let m;
      if ((m = b.match(POLA.chip))) return m[2];
      // "Ingat, ya!" cukup sekali per kotak sorotan
      if ((m = b.match(POLA.ingat))) return (i > 0 && POLA.ingat.test(semua[i - 1]) ? "" : "Ingat, ya! ") + m[1];
      if ((m = b.match(POLA.poin))) return m[1];
      return b;
    })
    .map(rapikanUcapan).filter(Boolean).map(akhiriTitik);
  return [judul ? akhiriTitik(judul) : "", ...baris].filter(Boolean).join(" ");
}

function teksJawaban(s: Slide): string {
  if (s.jenis !== "mitos-fakta" || !s.kunci) return "";
  return [`Jawabannya: ${s.kunci === "mitos" ? "mitos" : "fakta"}.`, rapikanUcapan(s.penjelasan || "")].filter(Boolean).map(akhiriTitik).join(" ");
}

function escapeXml(t: string) {
  return t.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

async function sha(teks: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(teks));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Potong teks per kalimat agar tiap permintaan di bawah batas ukuran penyedia.
function potong(teks: string, maksByte: number): string[] {
  const kalimat = teks.match(/[^.!?]+[.!?]*\s*/g) || [teks];
  const hasil: string[] = []; let buf = "";
  for (const k of kalimat) {
    if (buf && new TextEncoder().encode(buf + k).length > maksByte) { hasil.push(buf.trim()); buf = ""; }
    buf += k;
  }
  if (buf.trim()) hasil.push(buf.trim());
  return hasil;
}

function gabung(bagian: Uint8Array[]): Uint8Array {
  const total = bagian.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const b of bagian) { out.set(b, o); o += b.length; }
  return out;
}

async function suaraAzure(teks: string, pria: boolean, key: string, region: string) {
  const nama = pria ? "id-ID-ArdiNeural" : "id-ID-GadisNeural";
  const bagian: Uint8Array[] = [];
  for (const potongan of potong(teks, 3000)) {
    const ssml = `<speak version="1.0" xml:lang="id-ID"><voice name="${nama}">${escapeXml(potongan)}</voice></speak>`;
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "macaya-tts",
      },
      body: ssml,
    });
    if (!r.ok) throw new Error(`Azure TTS gagal (${r.status}): ${(await r.text()).slice(0, 200)}`);
    bagian.push(new Uint8Array(await r.arrayBuffer()));
  }
  return { mp3: gabung(bagian), nama };
}

async function suaraGoogle(teks: string, pria: boolean, key: string) {
  const daftar = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=id-ID&key=${key}`);
  if (!daftar.ok) throw new Error(`Google TTS: gagal membaca daftar suara (${daftar.status})`);
  const { voices = [] } = await daftar.json();
  const peringkat = (n: string) => ["Chirp3-HD", "Chirp-HD", "Neural2", "Wavenet", "Standard"].findIndex((t) => n.includes(t));
  const gender = pria ? "MALE" : "FEMALE";
  const kandidat = voices
    .filter((v: { name: string; ssmlGender: string }) => v.ssmlGender === gender)
    .sort((a: { name: string }, b: { name: string }) => {
      const pa = peringkat(a.name), pb = peringkat(b.name);
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    });
  const nama = kandidat[0]?.name || (pria ? "id-ID-Wavenet-B" : "id-ID-Wavenet-A");

  const bagian: Uint8Array[] = [];
  for (const potongan of potong(teks, 4500)) {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: potongan },
        voice: { languageCode: "id-ID", name: nama },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!r.ok) throw new Error(`Google TTS gagal (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const { audioContent } = await r.json();
    bagian.push(Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0)));
  }
  return { mp3: gabung(bagian), nama };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return balas(405, { error: "Gunakan metode POST." });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Pastikan pemanggil adalah admin
    const authHeader = req.headers.get("Authorization") || "";
    const sebagaiUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: adalahAdmin, error: errAdmin } = await sebagaiUser.rpc("is_admin");
    if (errAdmin || adalahAdmin !== true) return balas(403, { error: "Hanya admin yang boleh membuat suara." });

    // 2) Ambil slide
    const { slide_id, suara } = await req.json();
    if (!slide_id) return balas(400, { error: "slide_id wajib diisi." });
    const db = createClient(url, service);
    const { data: slide, error: errSlide } = await db.from("slide").select("id, judul, isi, jenis, kunci, penjelasan").eq("id", slide_id).single();
    if (errSlide || !slide) return balas(404, { error: "Slide tidak ditemukan." });
    const { data: kamus } = await db.from("kamus_ucapan").select("kata, ucapan");
    aturKamus(kamus);

    const teks = teksUcapan(slide as Slide);
    const teksJwb = teksJawaban(slide as Slide);
    if (!teks) return balas(400, { error: "Slide belum memiliki teks untuk dibacakan." });
    const pria = suara === "pria";

    // 3) Buat audio dengan penyedia yang dikonfigurasi
    const azureKey = Deno.env.get("AZURE_TTS_KEY"), azureRegion = Deno.env.get("AZURE_TTS_REGION");
    const googleKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    let buatSuara: (t: string) => Promise<{ mp3: Uint8Array; nama: string }>;
    if (azureKey && azureRegion) buatSuara = (t) => suaraAzure(t, pria, azureKey, azureRegion);
    else if (googleKey) buatSuara = (t) => suaraGoogle(t, pria, googleKey);
    else return balas(500, { error: "Penyedia suara belum dikonfigurasi. Isi secret AZURE_TTS_KEY + AZURE_TTS_REGION atau GOOGLE_TTS_API_KEY di Supabase." });

    // 4) Simpan ke Storage (nama file memuat sidik teks agar cache browser tidak memutar audio lama)
    async function simpan(t: string, akhiran: string) {
      const hasil = await buatSuara(t);
      const hash = await sha(`${hasil.nama}|${t}`);
      const path = `slide-audio/${slide!.id}${akhiran}-${hash}.mp3`;
      const { error: errUp } = await db.storage.from(BUCKET).upload(path, hasil.mp3, { contentType: "audio/mpeg", upsert: true });
      if (errUp) throw new Error("Gagal menyimpan audio: " + errUp.message);
      return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, nama: hasil.nama, hash };
    }
    const utama = await simpan(teks, "");
    const jawaban = teksJwb ? await simpan(teksJwb, "-jawaban") : null;

    const { error: errUpd } = await db.from("slide").update({
      audio_url: utama.url, audio_suara: utama.nama, audio_hash: utama.hash, audio_jawaban_url: jawaban?.url ?? null,
    }).eq("id", slide.id);
    if (errUpd) throw new Error("Gagal mencatat audio: " + errUpd.message);

    return balas(200, { audio_url: utama.url, audio_jawaban_url: jawaban?.url ?? null, suara: utama.nama, karakter: teks.length + teksJwb.length });
  } catch (err) {
    console.error(err);
    return balas(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
