// Logika murni Tahap 3 Laporan SHE: SAP per orang dan Jadwal Inspeksi.
export const SAP_MOD = 'SHE_SAP';
export const INSP_MOD = 'SHE_Inspeksi';

// Kategori SAP: [kode kolom, nama tampil]. Kolom di database: "<kode> Plan" dan "<kode> Actual".
export const SAP_KAT = [['GC', 'Green card'], ['WC', 'White card'], ['IT', 'Inspeksi terencana'], ['OT', 'Observasi tugas terencana'], ['SL', 'Salamanders'], ['M2', 'Meeting level 2']];
export const SAP_FIELDS = SAP_KAT.flatMap(([k, n]) => [[`${k} Plan`, `${n}: plan`], [`${k} Actual`, `${n}: actual`]]);
export const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const rowsOf = (data, m) => (data || []).filter(x => x.module === m).map(x => ({ row_index: x.row_index, ...(x.data || {}) }));
const n0 = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

/** Daftar SAP pada satu bulan, dengan total, ACH tiap kategori, dan ACH keseluruhan (rata-rata ACH kategori yang punya plan, seperti di file SAP). */
export function buildSap(data, year, month) {
  const rows = rowsOf(data, SAP_MOD).filter(r => Number(r.Tahun) === year && Number(r.Bulan) === month + 1).sort((a, b) => a.row_index - b.row_index);
  const tot = {}; const ach = {};
  SAP_KAT.forEach(([k]) => {
    tot[k] = { plan: rows.reduce((s, r) => s + n0(r[`${k} Plan`]), 0), actual: rows.reduce((s, r) => s + n0(r[`${k} Actual`]), 0) };
    ach[k] = tot[k].plan > 0 ? tot[k].actual / tot[k].plan : null;
  });
  const vals = Object.values(ach).filter(v => v !== null);
  return { rows, tot, ach, overall: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
}

/** Membaca sheet SAP dari file Excel (lembar "SAP"): nama di kolom C, pasangan Plan/Actual mulai kolom D. */
export function parseSapSheet(XLSX, wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Mulai dari A1 supaya nomor kolom sama dengan di Excel, walau data baru dimulai dari kolom B.
  const ref = XLSX.utils.decode_range(ws['!ref']); ref.s.r = 0; ref.s.c = 0; ws['!ref'] = XLSX.utils.encode_range(ref);
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const hdr = a.findIndex(r => String(r[2] ?? '').trim().toLowerCase() === 'nama');
  if (hdr < 0) throw new Error('Baris judul "Nama" tidak ditemukan. Pastikan ini file SAP periode bulanan.');
  const title = String((a[hdr - 1] || [])[1] || '');
  const rows = [];
  for (let i = hdr + 2; i < a.length; i += 1) {
    const r = a[i]; const nama = String(r[2] ?? '').trim();
    if (/^total/i.test(String(r[1] ?? '').trim()) || /^total/i.test(nama)) break;
    if (!nama) continue;
    const d = { Nama: nama.toUpperCase() };
    let any = false;
    SAP_KAT.forEach(([k], j) => {
      const p = r[3 + j * 2]; const c = r[4 + j * 2];
      d[`${k} Plan`] = typeof p === 'number' ? p : ''; d[`${k} Actual`] = typeof c === 'number' ? c : '';
      if (typeof p === 'number' || typeof c === 'number') any = true;
    });
    if (any) rows.push(d);
  }
  return { rows, title: String(a[hdr - 2]?.[1] || '') + ' ' + title };
}

export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
export const parseDays = s => String(s ?? '').split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 31);
export const joinDays = arr => [...new Set(arr)].sort((a, b) => a - b).join(',');

/** Jadwal inspeksi satu bulan: daftar inspeksi dengan hari rencana dan realisasi. */
export function buildInspeksi(data, year, month) {
  return rowsOf(data, INSP_MOD).filter(r => Number(r.Tahun) === year && Number(r.Bulan) === month + 1).sort((a, b) => Number(a.No) - Number(b.No))
    .map(r => { const plan = parseDays(r.Plan); const actual = parseDays(r.Actual); return { ...r, plan, actual, done: plan.filter(d => actual.includes(d)).length, ach: plan.length ? plan.filter(d => actual.includes(d)).length / plan.length : null }; });
}
export const inspeksiTotal = list => { const p = list.reduce((s, x) => s + x.plan.length, 0); const d = list.reduce((s, x) => s + x.done, 0); return { plan: p, done: d, ach: p ? d / p : null }; };
export const pctTxt = v => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
