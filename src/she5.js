// Logika murni bagian laporan SHE lanjutan: PICA manpower, rekap penyakit, Meeting KKP (MOM), KK, BMI, struktur organisasi.
import { toIso } from './smkp.js';

export const M5 = { pica: 'SHE_PICA', penyakit: 'SHE_Penyakit', kkp: 'SHE_KKP', mom: 'SHE_MOM', kk: 'SHE_KK', bmi: 'SHE_BMI', lamp: 'SHE_Lampiran' };
export const STATUS_PICA = ['Open', 'Continue', 'Closed'];
const rowsOf = (data, m) => (data || []).filter(x => x.module === m).map(x => ({ row_index: x.row_index, ...(x.data || {}) }));
const inMonth = (r, y, m) => Number(r.Tahun) === y && Number(r.Bulan) === m + 1;
export const list = v => String(v ?? '').split('|').map(s => s.trim()).filter(Boolean);
export const join = a => a.join('|');
const n0 = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
export const pctN = v => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

export const buildPica = (data, y, m) => rowsOf(data, M5.pica).filter(r => inMonth(r, y, m)).sort((a, b) => Number(a.No) - Number(b.No));

/** Rekap penyakit tahunan (PAK atau KAPTK): per bulan sampai bulan terpilih; bulan tanpa kejadian tampil NIHIL. */
export function buildPenyakit(data, y, jenis, upTo) {
  const all = rowsOf(data, M5.penyakit).filter(r => Number(r.Tahun) === y && r.Jenis === jenis);
  return Array.from({ length: upTo + 1 }, (_, m) => ({ m, items: all.filter(r => Number(r.Bulan) === m + 1).sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)) || a.row_index - b.row_index) }));
}

export function buildKkp(data, y, m) {
  const head = rowsOf(data, M5.kkp).find(r => inMonth(r, y, m)) || null;
  const items = rowsOf(data, M5.mom).filter(r => inMonth(r, y, m)).sort((a, b) => Number(a.No) - Number(b.No));
  return { head, lalu: items.filter(r => r.Seksi === 'Bulan lalu'), ini: items.filter(r => r.Seksi !== 'Bulan lalu'), fotos: list(head?.['Foto Meeting']), absen: list(head?.['Foto Absensi']) };
}

/** Struktur organisasi: gambar terbaru pada bulan terpilih atau sebelumnya. */
export function buildStruktur(data, y, m) {
  const rows = rowsOf(data, M5.lamp).filter(r => r.Jenis === 'struktur' && (Number(r.Tahun) < y || (Number(r.Tahun) === y && Number(r.Bulan) <= m + 1)))
    .sort((a, b) => Number(b.Tahun) * 100 + Number(b.Bulan) - (Number(a.Tahun) * 100 + Number(a.Bulan)));
  return rows[0] ? { ...rows[0], path: list(rows[0].Foto)[0] || '' } : null;
}

const ach = (a, p) => (p > 0 ? a / p : null);
/** Monitoring kontrol kritis kronis: satu baris per karyawan, dengan plan/actual tiap periode. */
export function buildKK(data, y, m) {
  const rows = rowsOf(data, M5.kk).filter(r => inMonth(r, y, m)).sort((a, b) => Number(a.No) - Number(b.No));
  const p1 = rows.filter(r => r['P1 Tanggal'] || r['P1 Hasil']).length; const p2 = rows.filter(r => r['P2 Tanggal'] || r['P2 Hasil']).length;
  return { rows, n: rows.length, p1, p2, a1: ach(p1, rows.length), a2: ach(p2, rows.length), mtd: ach(p1 + p2, rows.length * 2) };
}

export const bmiOf = (tb, bb) => { const h = n0(tb); const w = n0(bb); return h && w ? w / (h * h) : null; };
export const bmiTone = v => (v === null ? undefined : v >= 30 ? 'red' : v >= 25 ? 'amber' : 'green');
export function buildBMI(data, y, m) {
  const rows = rowsOf(data, M5.bmi).filter(r => inMonth(r, y, m)).sort((a, b) => Number(a.No) - Number(b.No))
    .map(r => ({ ...r, bmi1: bmiOf(r['W12 TB'], r['W12 BB']), bmi2: bmiOf(r['W34 TB'], r['W34 BB']) }));
  const p1 = rows.filter(r => r.bmi1 !== null).length; const p2 = rows.filter(r => r.bmi2 !== null).length;
  return { rows, n: rows.length, p1, p2, a1: ach(p1, rows.length), a2: ach(p2, rows.length), mtd: ach(p1 + p2, rows.length * 2) };
}

function sheetRows(XLSX, ws) {
  const ref = XLSX.utils.decode_range(ws['!ref']); ref.s.r = 0; ref.s.c = 0; ws['!ref'] = XLSX.utils.encode_range(ref);
  return XLSX.utils.sheet_to_json(ws, { header: 'A', raw: true, defval: null, blankrows: false });
}
const sheetBy = (wb, re, test) => { const n = wb.SheetNames.find(s => re.test(s)) || wb.SheetNames.find(s => test(sheetRows(wb.XLSX || null, wb.Sheets[s]))); return n; };

/** KK: hanya kolom yang tampil di laporan (tanpa kategori penyakit dan catatan pengobatan awal). */
export function parseKk(XLSX, wb) {
  const name = wb.SheetNames.find(s => /^kk$/i.test(s.trim())) || wb.SheetNames[0];
  const rows = [];
  sheetRows(XLSX, wb.Sheets[name]).forEach(r => {
    if (typeof r.B !== 'number' || !clean(r.E)) return;
    rows.push({
      No: r.B, NRP: clean(r.C), NRPSAP: clean(r.D), Nama: clean(r.E).toUpperCase(), Usia: n0(r.F) ?? '', Jabatan: clean(r.G), Perusahaan: clean(r.H),
      'P1 Tanggal': toIso(r.K), 'P1 Tempat': clean(r.L), 'P1 Hasil': clean(r.M), 'P1 Catatan': clean(r.N), 'P1 Obat': clean(r.O),
      'P2 Tanggal': toIso(r.P), 'P2 Tempat': clean(r.Q), 'P2 Hasil': clean(r.R), 'P2 Catatan': clean(r.S), 'P2 Obat': clean(r.T), Status: clean(r.U)
    });
  });
  return rows;
}
/** BMI: hanya kolom kontrol periode (tanpa data MCU dan status gizi); nilai BMI dihitung ulang dari TB dan BB. */
export function parseBmi(XLSX, wb) {
  const name = wb.SheetNames.find(s => /^bmi$/i.test(s.trim())) || wb.SheetNames[wb.SheetNames.length - 1];
  const rows = [];
  sheetRows(XLSX, wb.Sheets[name]).forEach(r => {
    if (typeof r.B !== 'number' || !clean(r.E)) return;
    rows.push({
      No: r.B, NRP: clean(r.C), Nama: clean(r.E).toUpperCase(), Jabatan: clean(r.G), Perusahaan: clean(r.H),
      'W12 Tanggal': toIso(r.N), 'W12 Tempat': clean(r.O), 'W12 TB': n0(r.P) ?? '', 'W12 BB': n0(r.Q) ?? '',
      'W34 Tanggal': toIso(r.S), 'W34 Tempat': clean(r.T), 'W34 TB': n0(r.U) ?? '', 'W34 BB': n0(r.V) ?? '', Status: clean(r.X)
    });
  });
  return rows;
}
