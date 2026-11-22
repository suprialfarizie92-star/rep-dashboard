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

/** PICA kebutuhan manpower: diambil langsung dari menu Database Manpower (modul Data_PICA), tanpa input ganda. */
const pickKey = (r, re) => { const k = Object.keys(r).find(x => re.test(x) && r[x] !== '' && r[x] !== null && r[x] !== undefined); return k === undefined ? undefined : r[k]; };
const isClosed = v => /(closed|close|selesai|complete|completed)/i.test(String(v ?? ''));
export const buildPica = (data) => (data || []).filter(x => x.module === 'Data_PICA').map(x => x.data || {}).map((r, i) => {
  const vals = Object.values(r).filter(v => v !== '' && v !== null && v !== undefined).map(String);
  const due = pickKey(r, /target|due|deadline|selesai/i);
  const st = pickKey(r, /^status$/i);
  return {
    No: i + 1,
    Problem: String(pickKey(r, /temuan|masalah|isu|issue|gap|uraian|jabatan|posisi|item/i) ?? vals[0] ?? ''),
    Action: String(pickKey(r, /tindak|action|rencana|progress|keterangan|deskripsi/i) ?? ''),
    PIC: String(pickKey(r, /^pic/i) ?? ''),
    'Due Date': due === undefined ? '' : (toIso(due) || String(due)),
    Status: st === undefined ? 'Open' : (isClosed(st) ? 'Closed' : String(st))
  };
});

/** MOM dari Excel/CSV: baris judul dicari otomatis, bagian "bulan lalu" / "bulan ini" dikenali dari baris pemisah. */
export function parseMom(XLSX, wb) {
  const out = [];
  const remark = v => { const t = String(v ?? '').trim(); return /clos|selesai|done/i.test(t) ? 'Closed' : /continue|lanjut|progress|proses/i.test(t) ? 'Continue' : 'Open'; };
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    let cols = null; let sek = 'Bulan ini';
    for (const row of grid) {
      const cells = row.map(c => clean(c));
      const filled = cells.filter(Boolean);
      if (!filled.length) continue;
      const hi = cells.findIndex(c => /problem|permasalahan|pembahasan|topik/i.test(c));
      if (hi >= 0 && cells.some(c => /action|tindak/i.test(c))) {
        const f = re => cells.findIndex(c => re.test(c));
        cols = { problem: hi, action: f(/action|tindak/i), pic: f(/^pic/i), issue: f(/issue|terbit|tgl.*mulai/i), due: f(/due|target/i), remark: f(/remark|status|ket/i) };
        continue;
      }
      if (filled.length <= 2 && /bulan\s*lalu|previous|last\s*month/i.test(filled.join(' '))) { sek = 'Bulan lalu'; continue; }
      if (filled.length <= 2 && /bulan\s*ini|current|this\s*month/i.test(filled.join(' '))) { sek = 'Bulan ini'; continue; }
      if (!cols) continue;
      const problem = cells[cols.problem];
      if (!problem) continue;
      const g = i => (i >= 0 ? row[i] : '');
      out.push({ Seksi: sek, Problem: problem, Action: clean(g(cols.action)), PIC: clean(g(cols.pic)), 'Issue Date': toIso(g(cols.issue)), 'Due Date': toIso(g(cols.due)), Remark: remark(g(cols.remark)) });
    }
    if (out.length) break;
  }
  return out;
}

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

/** Daftar orang tetap (roster) disimpan di modul yang sama dengan data bulanan, dengan penanda Roster = 1.
 *  Orang di roster muncul setiap bulan (kosong bila belum ada data) sampai dihapus. */
export const personKey = r => String(r?.NRP || '').trim().toUpperCase() || String(r?.Nama || '').trim().toUpperCase();
export const KK_ID = ['NRP', 'NRPSAP', 'Nama', 'Usia', 'Jabatan', 'Perusahaan'];
export const BMI_ID = ['NRP', 'Nama', 'Jabatan', 'Perusahaan'];
function peopleOf(data, module, idKeys, y, m) {
  const all = rowsOf(data, module);
  const stored = all.filter(r => !r.Roster && inMonth(r, y, m)).sort((a, b) => Number(a.No) - Number(b.No) || a.row_index - b.row_index);
  const idOf = r => Object.fromEntries(idKeys.map(k => [k, r[k] ?? '']));
  let roster = all.filter(r => r.Roster).sort((a, b) => a.row_index - b.row_index);
  // Belum ada daftar tetap: nama diteruskan dari bulan terakhir yang punya data (tersimpan jadi daftar tetap saat ada perubahan pertama).
  let carried = false; let from = null;
  if (!roster.length) {
    const hist = all.filter(r => !r.Roster); const cur = y * 12 + m; let best = -1;
    hist.forEach(r => { const k = Number(r.Tahun) * 12 + Number(r.Bulan) - 1; if (Number.isFinite(k) && k <= cur && k > best) best = k; });
    if (best >= 0) {
      roster = hist.filter(r => Number(r.Tahun) * 12 + Number(r.Bulan) - 1 === best).sort((a, b) => Number(a.No) - Number(b.No) || a.row_index - b.row_index).map((r, i) => ({ ...idOf(r), row_index: i + 1 }));
      carried = roster.length > 0; from = { y: Math.floor(best / 12), m: best % 12 };
    }
  }
  const byKey = new Map(stored.map(r => [personKey(r), r]));
  const used = new Set();
  const fromRoster = roster.map(p => {
    const k = personKey(p); used.add(k); const mr = byKey.get(k);
    return mr ? { ...mr, ...idOf(p), pid: p.row_index, rowIdx: mr.row_index } : { Tahun: y, Bulan: m + 1, ...idOf(p), pid: p.row_index, rowIdx: null };
  });
  const only = stored.filter(r => !used.has(personKey(r))).map(r => ({ ...r, pid: null, rowIdx: r.row_index }));
  const rows = [...fromRoster, ...only].map((r, i) => ({ ...r, No: i + 1 }));
  return { rows, stored, roster, only, carried, from };
}

/** Status otomatis: periode 1 (tanggal dan tempat P1 terisi), periode 2 (hanya P2 terisi), rutin (keduanya terisi). Bila belum ada yang terisi, dipakai status tersimpan. */
const terisi = (a, b) => Boolean(String(a ?? '').trim() && String(b ?? '').trim());
export const statusKontrol = (r, k1, k2) => {
  const p1 = terisi(r[`${k1} Tanggal`], r[`${k1} Tempat`]); const p2 = terisi(r[`${k2} Tanggal`], r[`${k2} Tempat`]);
  return p1 && p2 ? 'Rutin' : p1 ? 'Periode 1' : p2 ? 'Periode 2' : (r.Status || '');
};
export function buildKK(data, y, m) {
  const P0 = peopleOf(data, M5.kk, KK_ID, y, m); const { stored, roster, only } = P0; const rows = P0.rows.map(r => ({ ...r, Status: statusKontrol(r, 'P1', 'P2') }));
  const p1 = rows.filter(r => r['P1 Tanggal'] || r['P1 Hasil']).length; const p2 = rows.filter(r => r['P2 Tanggal'] || r['P2 Hasil']).length;
  return { rows, stored, roster, only, carried: P0.carried, from: P0.from, n: rows.length, p1, p2, a1: ach(p1, rows.length), a2: ach(p2, rows.length), mtd: ach(p1 + p2, rows.length * 2) };
}

export const bmiOf = (tb, bb) => { const h = n0(tb); const w = n0(bb); return h && w ? w / (h * h) : null; };
export const bmiTone = v => (v === null ? undefined : v >= 30 ? 'red' : v >= 25 ? 'amber' : 'green');
export function buildBMI(data, y, m) {
  const P = peopleOf(data, M5.bmi, BMI_ID, y, m);
  const rows = P.rows.map(r => ({ ...r, Status: statusKontrol(r, 'W12', 'W34'), bmi1: bmiOf(r['W12 TB'], r['W12 BB']), bmi2: bmiOf(r['W34 TB'], r['W34 BB']) }));
  const p1 = rows.filter(r => r.bmi1 !== null).length; const p2 = rows.filter(r => r.bmi2 !== null).length;
  return { rows, stored: P.stored, roster: P.roster, only: P.only, carried: P.carried, from: P.from, n: rows.length, p1, p2, a1: ach(p1, rows.length), a2: ach(p2, rows.length), mtd: ach(p1 + p2, rows.length * 2) };
}

/** Pengawas & tenaga teknis: penyesuaian khusus laporan (hapus atau ubah baris) disimpan di SHE_Lampiran, Jenis = 'pengawas'. */
export const pengawasKey = k => [k.nrp, k.nama, k.kompetensi, k.reg].map(x => String(x || '').trim().toLowerCase()).join('|');
export const buildPengOv = data => new Map(rowsOf(data, M5.lamp).filter(r => r.Jenis === 'pengawas' && r.Key).map(r => [r.Key, r]));

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
