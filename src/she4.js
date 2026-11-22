// Logika murni Tahap 3 Laporan SHE: Kegiatan SHE (teks dan jalur foto di Supabase Storage).
export const KEG_MOD = 'SHE_Kegiatan';
export const BUCKET = 'she-kegiatan';
export const KATEGORI_KEG = ['Rutin', 'Khusus'];
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const rowsOf = (data, m) => (data || []).filter(x => x.module === m).map(x => ({ row_index: x.row_index, ...(x.data || {}) }));
export const fotoList = v => String(v ?? '').split('|').map(s => s.trim()).filter(Boolean);
export const fotoJoin = a => a.join('|');

export function buildKegiatan(data, year, month) {
  const list = rowsOf(data, KEG_MOD).filter(r => Number(r.Tahun) === year && Number(r.Bulan) === month + 1)
    .map(r => ({ ...r, fotos: fotoList(r.Foto) })).sort((a, b) => (a.Kategori === b.Kategori ? Number(a.No) - Number(b.No) : a.Kategori === 'Rutin' ? -1 : 1));
  return { rutin: list.filter(x => x.Kategori !== 'Khusus'), khusus: list.filter(x => x.Kategori === 'Khusus'), all: list };
}

const dateText = (v) => {
  if (typeof v === 'number' && v > 20000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  return String(v ?? '').replace(/\s+/g, ' ').trim();
};
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Membaca sheet "SHE Activity Report": kegiatan rutin dan khusus (teks saja; foto diunggah dari dashboard). */
export function parseKegiatanSheet(XLSX, wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const ref = XLSX.utils.decode_range(ws['!ref']); ref.s.r = 0; ref.s.c = 0; ws['!ref'] = XLSX.utils.encode_range(ref);
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  let kat = 'Rutin'; const rows = []; let title = '';
  a.forEach(r => {
    const b = clean(r[1]); const c = clean(r[2]);
    if (/^month\/bulan/i.test(b)) { if (!title) title = `${b} ${clean(r[4])}`; return; }
    if (/special|khusus/i.test(b) && !c) { kat = 'Khusus'; return; }
    if (/regular|rutin/i.test(b) && !c) { kat = 'Rutin'; return; }
    if (typeof r[1] === 'number' && c) rows.push({ Kategori: kat, No: r[1], Kegiatan: c, Tanggal: dateText(r[3]), Lokasi: clean(r[4]) });
  });
  return { rows, title };
}

/** Mencocokkan nama file foto ke kegiatan: awalan R atau K + nomor, mis. "R01_safety_talk.jpg" (rutin no. 1) atau "K2 foto.png" (khusus no. 2). */
export function cocokkanFoto(names, all) {
  const cocok = []; const tidak = [];
  names.forEach((name, i) => {
    const m = String(name).match(/^\s*([RK])[\s._-]*0*(\d{1,2})(?!\d)/i);
    if (!m) { tidak.push({ name, i, alasan: 'nama file tidak diawali R01, K02, dan sebagainya' }); return; }
    const kat = m[1].toUpperCase() === 'K' ? 'Khusus' : 'Rutin'; const no = Number(m[2]);
    const item = all.find(x => (x.Kategori === 'Khusus' ? 'Khusus' : 'Rutin') === kat && Number(x.No) === no);
    if (!item) { tidak.push({ name, i, alasan: `kegiatan ${kat.toLowerCase()} no. ${no} tidak ada di bulan ini` }); return; }
    cocok.push({ name, i, item });
  });
  return { cocok, tidak };
}
