// Supabase Edge Function: tts-slide
// Membuat audio suara neural bahasa Indonesia (MP3/WAV) untuk satu slide (plus audio
// penjelasan untuk kartu Mitos/Fakta), menyimpannya
// ke Storage (bucket pdf-buku/slide-audio/), lalu mencatat URL-nya di tabel slide.
//
// Hanya admin (tabel public.admins) yang boleh memanggil.
// Penyedia suara dipilih dari secret yang tersedia (Dashboard > Edge Functions > Secrets), urut prioritas:
//   - Gemini : GEMINI_API_KEY (Google AI Studio, ada kuota gratis) -> suara Leda (wanita) / Puck (pria), berkas WAV
//              opsional: GEMINI_TTS_MODEL (daftar dipisah koma, dicoba berurutan), GEMINI_SUARA_WANITA, GEMINI_SUARA_PRIA
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

// ---- Gemini TTS (endpoint interactions; keluaran WAV 24 kHz mono 16-bit) ----
const GAYA_SUARA = "Bacakan dengan ramah, jelas, dan hangat seperti kakak pembimbing yang menjelaskan kepada remaja SMA. " +
  "Gunakan bahasa Indonesia baku dengan aksen Indonesia yang natural, tempo sedang, dan jeda wajar di setiap tanda baca.";

function pcmDariWav(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 12 || String.fromCharCode(...b.slice(0, 4)) !== "RIFF") return b; // sudah PCM mentah
  let i = 12;
  while (i + 8 <= b.length) {
    const id = String.fromCharCode(...b.slice(i, i + 4)), ukuran = dv.getUint32(i + 4, true);
    if (id === "data") return b.slice(i + 8, i + 8 + ukuran);
    i += 8 + ukuran + (ukuran % 2);
  }
  throw new Error("Berkas WAV dari Gemini tidak berisi data audio.");
}

function bungkusWav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44)), tulis = (o: number, t: string) => [...t].forEach((c, k) => h.setUint8(o + k, c.charCodeAt(0)));
  tulis(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); tulis(8, "WAVE");
  tulis(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  tulis(36, "data"); h.setUint32(40, pcm.length, true);
  return gabung([new Uint8Array(h.buffer), pcm]);
}

// Tiap model punya kuota gratis sendiri: bila satu habis (429), otomatis pindah ke model berikutnya.
const MODEL_GEMINI = (Deno.env.get("GEMINI_TTS_MODEL") || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-pro-preview-tts")
  .split(",").map((m) => m.trim()).filter(Boolean);
const modelHabis = new Set<string>(); // diingat selama instance fungsi hidup

async function suaraGemini(teks: string, pria: boolean, key: string) {
  const nama = pria ? (Deno.env.get("GEMINI_SUARA_PRIA") || "Puck") : (Deno.env.get("GEMINI_SUARA_WANITA") || "Leda");
  const bagian: Uint8Array[] = [];
  for (const potongan of potong(teks, 2500)) {
    bagian.push(await potonganGemini(potongan, nama, key));
  }
  return { mp3: bungkusWav(gabung(bagian)), nama: `Gemini-${nama}`, tipe: "audio/wav", ekstensi: "wav" };
}

async function potonganGemini(potongan: string, nama: string, key: string): Promise<Uint8Array> {
  let pesanTerakhir = "";
  for (const model of MODEL_GEMINI.filter((m) => !modelHabis.has(m)).concat(MODEL_GEMINI.filter((m) => modelHabis.has(m)))) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ type: "user_input", content: [{ type: "text", text: potongan, annotations: [{ type: "speech_metadata", style: GAYA_SUARA }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: nama }] },
      }),
    });
    if (r.status === 429 || r.status === 404) { // kuota model ini habis / model tidak tersedia -> coba model lain
      modelHabis.add(model); pesanTerakhir = `${model}: ${(await r.text()).slice(0, 120)}`; continue;
    }
    if (!r.ok) throw new Error(`Gemini TTS gagal (${r.status}, ${model}): ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const audio = (j.steps || []).filter((st: { type: string }) => st.type === "model_output")
      .flatMap((st: { content?: { type: string; data?: string }[] }) => st.content || []).filter((c: { type: string }) => c.type === "audio").pop();
    if (!audio?.data) throw new Error("Gemini tidak mengembalikan audio.");
    modelHabis.delete(model);
    return pcmDariWav(Uint8Array.from(atob(audio.data), (c) => c.charCodeAt(0)));
  }
  throw new Error("Kuota gratis semua model suara Gemini hari ini sudah habis. Slide yang sudah bersuara tetap tersimpan; lanjutkan besok dengan klik \"Buat Suara Semua\" lagi. (" + pesanTerakhir + ")");
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
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const azureKey = Deno.env.get("AZURE_TTS_KEY"), azureRegion = Deno.env.get("AZURE_TTS_REGION");
    const googleKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    let buatSuara: (t: string) => Promise<{ mp3: Uint8Array; nama: string; tipe?: string; ekstensi?: string }>;
    if (geminiKey) buatSuara = (t) => suaraGemini(t, pria, geminiKey);
    else if (azureKey && azureRegion) buatSuara = (t) => suaraAzure(t, pria, azureKey, azureRegion);
    else if (googleKey) buatSuara = (t) => suaraGoogle(t, pria, googleKey);
    else return balas(500, { error: "Penyedia suara belum dikonfigurasi. Isi secret GEMINI_API_KEY (atau AZURE_TTS_KEY + AZURE_TTS_REGION / GOOGLE_TTS_API_KEY) di Supabase." });

    // 4) Simpan ke Storage (nama file memuat sidik teks agar cache browser tidak memutar audio lama)
    async function simpan(t: string, akhiran: string) {
      const hasil = await buatSuara(t);
      const hash = await sha(`${hasil.nama}|${t}`);
      const path = `slide-audio/${slide!.id}${akhiran}-${hash}.${hasil.ekstensi || "mp3"}`;
      const { error: errUp } = await db.storage.from(BUCKET).upload(path, hasil.mp3, { contentType: hasil.tipe || "audio/mpeg", upsert: true });
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
