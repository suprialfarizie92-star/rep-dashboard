// Logika murni untuk menu SMKP (tanpa React): baca formulir audit Excel dan hitung ringkasan.
// Data disimpan di tabel app_data yang sama dengan menu lain, dengan tiga modul:
//   SMKP_Elemen  : satu baris per elemen (7 baris per tahun audit)
//   SMKP_Item    : satu baris per sub elemen / sub-sub elemen beserta nilai dan keterangannya
//   SMKP_Temuan  : satu baris per catatan temuan dan tindakan perbaikan (CTTP)
// row_index = tahun * 1000 + nomor urut, jadi beberapa tahun audit bisa tersimpan bersamaan.

export const MOD = { elemen: 'SMKP_Elemen', item: 'SMKP_Item', temuan: 'SMKP_Temuan' };
export const STATUS = ['Belum', 'Proses', 'Selesai', 'Terverifikasi'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROM = '(?:VII|VI|IV|V|III|II|I)';

const clean = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const noColon = v => clean(v).replace(/^:\s*/, '');
const nz = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^na$/i.test(s)) return 'NA';
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const txt = v => (v === null || v === undefined ? '' : String(v).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());
const pad = n => String(n).padStart(2, '0');

export function toIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const rowsOf = (XLSX, ws) => XLSX.utils.sheet_to_json(ws, { header: 'A', defval: null, raw: true, blankrows: false });

/** Membaca workbook formulir audit (sheet kriteria + sheet CTTP). */
export function parseAuditWorkbook(XLSX, wb) {
  let formRows = null; let cttpRows = null; let kritRows = null; let tahun = null;
  for (const name of wb.SheetNames) {
    const rows = rowsOf(XLSX, wb.Sheets[name]);
    const title = rows.slice(0, 6).map(r => clean(r.E)).find(t => /FORMULIR KRITERIA AUDIT/i.test(t));
    if (title && !formRows) { formRows = rows; tahun = Number((title.match(/(20\d{2})/) || [])[1]) || null; }
    else if (!kritRows && rows.slice(0, 8).some(r => String(r.N).trim() === '0' && String(r.O).trim() === '1' && String(r.R).trim() === '4')) kritRows = rows;
    else if (!cttpRows && (/cttp/i.test(name) || rows.slice(0, 8).some(r => /CATATAN TEMUAN AUDIT/i.test(clean(r.F))))) cttpRows = rows;
  }
  if (!formRows) throw new Error('Sheet "Formulir Kriteria Audit SMKP" tidak ditemukan di file ini.');

  const elemen = []; const item = [];
  for (const r of formRows) {
    const e = clean(r.E); const f = clean(r.F); const g = clean(r.G);
    if (f.toUpperCase() === 'TOTAL') break;
    if (new RegExp(`^${ROM}$`).test(e) && f && typeof r.K === 'number') {
      elemen.push({ Kode: e, Elemen: f, Bobot: r.K, 'Nilai Max': nz(r.L), 'Nilai Capai': nz(r.P) });
    } else if (new RegExp(`^${ROM}\\.\\d+$`).test(f)) {
      item.push({ Kode: f, Level: 2, Butir: g, max: nz(r.L), nilai: nz(r.N), ket: clean(r.R), tmu: clean(r.S), cat: clean(r.W) });
    } else if (new RegExp(`^${ROM}\\.\\d+\\.\\d+$`).test(g)) {
      item.push({ Kode: g, Level: 3, Butir: clean(r.H), max: nz(r.M), nilai: nz(r.O), ket: clean(r.R), tmu: clean(r.S), cat: clean(r.W) });
    }
  }
  if (!elemen.length) throw new Error('Baris elemen (I sampai VII) tidak terbaca. Periksa format formulir.');

  // Uraian kriteria nilai 0..4 per butir (sheet Kriteria), dipakai sebagai acuan saat memberi nilai.
  const krit = new Map();
  if (kritRows) {
    for (const r of kritRows) {
      const m = (clean(r.C) || clean(r.D)).match(new RegExp(`^(${ROM}\\.\\d+(?:\\.\\d+)?)\\.?$`));
      if (!m) continue;
      const lv = ['N', 'O', 'P', 'Q', 'R'].map(c => txt(r[c]).replace(/^Nilai\s*\d\s*:\s*/i, ''));
      while (lv.length && !lv[lv.length - 1]) lv.pop();
      if (!lv.length) continue;
      const mx = nz(r.I) !== null && nz(r.I) !== 'NA' ? nz(r.I) : nz(r.H);
      krit.set(m[1], { lv, max: typeof mx === 'number' ? mx : null, panduan: txt(r.S) });
    }
  }

  const itemRows = item.map(it => {
    const na = it.max === 'NA' || it.nilai === 'NA';
    const kr = krit.get(it.Kode);
    const parts = it.Kode.split('.');
    const tm = it.tmu.match(/^(Kritikal|Mayor|Minor)\s*(\d+)?/i);
    return {
      Kode: it.Kode, Elemen: parts[0], Level: it.Level, Induk: it.Level === 3 ? parts.slice(0, 2).join('.') : '',
      Butir: it.Butir, 'Nilai Max': na ? (kr ? kr.max : null) : it.max, 'Nilai Audit': na ? null : it.nilai, NA: na ? 'Ya' : '',
      Keterangan: it.ket, 'No Temuan': tm ? it.tmu : '', 'Jenis Temuan': tm ? tm[1][0].toUpperCase() + tm[1].slice(1).toLowerCase() : '', Catatan: it.cat,
      Kriteria: kr ? kr.lv : [], Panduan: kr ? kr.panduan : ''
    };
  });

  // Nilai elemen yang kosong di formulir dihitung dari butir (butir terkecil: sub-sub elemen, atau sub elemen tanpa anak).
  elemen.forEach(el => {
    if (el['Nilai Max'] !== null && el['Nilai Capai'] !== null) return;
    const mine = itemRows.filter(i => i.Elemen === el.Kode);
    const leaf = mine.filter(i => i.Level === 3 || !mine.some(x => x.Induk === i.Kode));
    el['Nilai Max'] = leaf.reduce((s, i) => s + (i['Nilai Max'] || 0), 0);
    el['Nilai Capai'] = leaf.reduce((s, i) => s + (i['Nilai Audit'] || 0), 0);
  });

  const temuan = []; const meta = {};
  if (cttpRows) {
    for (const r of cttpRows) {
      const b = clean(r.B); const f = clean(r.F);
      if (b === 'TANGGAL AUDIT') meta['Tanggal Audit'] = noColon(r.D);
      if (f === 'AUDITOR') meta.Auditor = noColon(r.G);
      if (f === 'AUDITEE') meta.Auditee = noColon(r.G);
      if (f === 'PERIODE AUDIT') meta['Periode Audit'] = noColon(r.G);
      if (typeof r.B === 'number' && clean(r.C)) {
        const ref = clean(r.F); const n = Number((ref.match(/(\d+)/) || [])[1]);
        temuan.push({
          No: r.B, 'Catatan Temuan': clean(r.C), Referensi: ref, Elemen: ROMAN[n - 1] || '', 'Jenis Temuan': clean(r.G),
          Auditor: clean(r.H), 'Akar Penyebab': clean(r.I), 'Tindakan Perbaikan': clean(r.J), 'Due Date': toIso(r.K),
          Departemen: clean(r.L), 'Detail Dept': clean(r.M), 'PIC 1': clean(r.N), 'PIC 2': clean(r.O), 'PIC 3': clean(r.P),
          'Tanggal Re-Audit': toIso(r.Q), Status: STATUS.includes(clean(r.R)) ? clean(r.R) : 'Belum'
        });
      }
    }
  }
  const stamp = { Tahun: tahun, ...meta };
  return { tahun, elemen: elemen.map(x => ({ ...x, ...stamp })), item: itemRows.map(x => ({ Tahun: tahun, ...x })), temuan: temuan.map(x => ({ Tahun: tahun, ...x })) };
}

/** Hitung nilai sub elemen dari butir di bawahnya, tandai butir yang belum dinilai, dan beri nomor temuan. */
function deriveItems(list) {
  const items = list.map(i => ({ ...i })).sort((a, b) => a.row_index - b.row_index);
  const kids = new Map();
  items.forEach(i => { if (i.Level === 3 && i.Induk) kids.set(i.Induk, [...(kids.get(i.Induk) || []), i]); });
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  items.forEach(i => {
    const k = i.Level === 2 ? kids.get(i.Kode) : null;
    if (k && k.length) {
      const live = k.filter(x => x.NA !== 'Ya');
      i._parent = true; i.NA = live.length ? '' : 'Ya';
      i['Nilai Max'] = live.reduce((s, x) => s + (num(x['Nilai Max']) || 0), 0);
      i['Nilai Audit'] = live.reduce((s, x) => s + (num(x['Nilai Audit']) || 0), 0);
    } else {
      i._parent = false; i._scored = i.NA === 'Ya' || num(i['Nilai Audit']) !== null;
    }
  });
  const seq = {};
  items.forEach(i => { const j = i['Jenis Temuan']; i['No Temuan'] = j ? `${j} ${pad((seq[j] = (seq[j] || 0) + 1))}` : ''; });
  return items;
}

/** Kumpulkan data SMKP dari app_data (overviewData) dan hitung ringkasan per tahun. */
export function buildSmkp(data, year) {
  const pick = m => (data || []).filter(r => r.module === m).map(r => ({ row_index: r.row_index, ...r.data }));
  const all = { elemen: pick(MOD.elemen), item: pick(MOD.item), temuan: pick(MOD.temuan) };
  const years = [...new Set(all.elemen.map(r => Number(r.Tahun)).filter(Boolean))].sort((a, b) => b - a);
  const y = year && years.includes(year) ? year : years[0];
  const of = list => list.filter(r => Number(r.Tahun) === y);
  const item = deriveItems(of(all.item)); const temuan = of(all.temuan);
  const elemen = of(all.elemen).sort((a, b) => ROMAN.indexOf(a.Kode) - ROMAN.indexOf(b.Kode)).map(e => {
    const leaf = item.filter(i => i.Elemen === e.Kode && !i._parent && i.NA !== 'Ya');
    const hasItems = item.some(i => i.Elemen === e.Kode);
    const max = hasItems ? leaf.reduce((s, i) => s + (Number(i['Nilai Max']) || 0), 0) : Number(e['Nilai Max']) || 0;
    const nilai = hasItems ? leaf.reduce((s, i) => s + (Number(i['Nilai Audit']) || 0), 0) : Number(e['Nilai Capai']) || 0;
    const bobot = Number(e.Bobot) || 0; const pct = max ? nilai / max : 0;
    return { ...e, max, nilai, bobot, pct, kontribusi: bobot * pct, selisih: bobot * (1 - pct) };
  });
  const leaves = item.filter(i => !i._parent && i.NA !== 'Ya');
  const resmi = item.filter(i => i['Jenis Temuan']);
  const count = (list, k, v) => list.filter(x => x[k] === v).length;
  return {
    years, year: y, elemen, item, temuan, meta: elemen[0] || {}, progress: { done: leaves.filter(i => i._scored).length, total: leaves.length },
    totalMax: elemen.reduce((s, e) => s + e.max, 0), totalNilai: elemen.reduce((s, e) => s + e.nilai, 0),
    totalPct: elemen.reduce((s, e) => s + e.kontribusi, 0),
    mayor: count(resmi, 'Jenis Temuan', 'Mayor'), minor: count(resmi, 'Jenis Temuan', 'Minor'), kritikal: count(resmi, 'Jenis Temuan', 'Kritikal'), resmi
  };
}

/** Acuan "Sub El 5.1" / "Sub Sub El 5.1.1" seperti di formulir CTTP. */
export function refOf(kode) {
  const p = String(kode).split('.'); const n = ROMAN.indexOf(p[0]) + 1;
  return p.length >= 3 ? `Sub Sub El ${n}.${p[1]}.${p[2]}` : `Sub El ${n}.${p[1]}`;
}
export const refKey = ref => (String(ref || '').replace(',', '.').match(/\d+(?:\.\d+)*/) || [''])[0];

/** Temuan resmi yang belum punya baris tindak lanjut (cocok dengan acuannya atau turunannya). */
export function belumAdaTindakLanjut(S) {
  const keys = S.temuan.map(t => refKey(t.Referensi)).filter(Boolean);
  return S.resmi.filter(i => { const k = refKey(refOf(i.Kode)); return !keys.some(x => x === k || x.startsWith(`${k}.`)); });
}

/** Baris awal untuk audit tahun baru: struktur butir disalin dari audit sebelumnya, nilai dikosongkan. */
export function templateRows(T, year) {
  const elemen = T.elemen.map(e => ({
    Tahun: year, Kode: e.Kode, Elemen: e.Elemen, Bobot: e.Bobot, 'Nilai Max': e.max, 'Nilai Capai': 0,
    Auditor: '', Auditee: T.meta.Auditee || '', 'Tanggal Audit': '', 'Periode Audit': ''
  }));
  const item = T.item.map(i => ({
    Tahun: year, Kode: i.Kode, Elemen: i.Elemen, Level: i.Level, Induk: i.Induk, Butir: i.Butir,
    'Nilai Max': i['Nilai Max'], 'Nilai Audit': null, NA: i._parent ? '' : (i.NA || ''), Keterangan: '', 'No Temuan': '', 'Jenis Temuan': '', Catatan: '',
    Kriteria: i.Kriteria || [], Panduan: i.Panduan || ''
  }));
  return { elemen, item };
}

export const isDone = t => t.Status === 'Selesai' || t.Status === 'Terverifikasi';
export function isOverdue(t, now) {
  const d = toIso(t['Due Date']); return Boolean(d) && !isDone(t) && d < toIso(now);
}

/** Ringkasan semua tahun audit (urut lama ke baru) untuk grafik tren. */
export function buildTrend(data) {
  const base = buildSmkp(data);
  return base.years.slice().reverse().map(y => {
    const s = buildSmkp(data, y);
    return {
      year: y, totalPct: s.totalPct, mayor: s.mayor, minor: s.minor, tl: s.temuan.length, done: s.temuan.filter(isDone).length,
      elemen: Object.fromEntries(s.elemen.map(e => [e.Kode, e.pct])), nama: Object.fromEntries(s.elemen.map(e => [e.Kode, e.Elemen]))
    };
  });
}
