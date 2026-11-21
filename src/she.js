// Logika murni untuk Tahap 2 Laporan SHE: statistik insiden, performance monitoring, catatan insiden, dan law enforcement.
import { toDate, val } from './utils.js';

export const SHE = { stat: 'SHE_Statistik', insiden: 'SHE_Insiden', target: 'SHE_Target' };
export const KATEGORI = ['Fatal', 'Potential Fatal', 'LTI', 'Minor Injury', 'Property Damage', 'Enviro', 'Near Miss'];
export const BULAN_PENDEK = ['JAN', 'PEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGS', 'SEP', 'OKT', 'NOP', 'DES'];
// Kolom isian bulanan (nama kolom = nama field di database).
export const STAT_FIELDS = [
  ['Fatal', 'Fatal'], ['Potential Fatal', 'Potential fatal'], ['LTI', 'LTI'], ['Minor Injury', 'Minor injury'], ['Property Damage', 'Property damage'],
  ['Enviro', 'Enviro'], ['Near Miss', 'Near miss'], ['Day Loss', 'Hari hilang (day loss)'], ['Man Hours', 'Man hours bulan ini'], ['Biaya Property Damage', 'Biaya property damage (USD)'],
  ['SAP Achievement', 'SAP achievement (%)'], ['Implementasi PSMS', 'Implementasi PSMS (%)']
];
export const IND = [
  ['fatal', 'Fatal Incident'], ['lti', 'Lost Time Injury (LTI)'], ['minor', 'Minor Injury'], ['ltifr', 'Lost Time Injury Frequency Rate (LTIFR)'],
  ['pdcase', 'Property Damage Case'], ['pdcost', 'Property Damage Cost ($)'], ['enviro', 'Major Enviro Incident'], ['sap', 'SAP Achievement'], ['psms', 'Implementasi PSMS']
];
// Nilai awal sesuai laporan Oktober 2026. Faktor 1.000.000 jam kerja adalah asumsi umum untuk LTIFR dan severity rate; ubah di "Atur target" bila REP memakai faktor lain.
export const TARGET_DEFAULT = { fatal: '0', lti: '0', minor: '0', ltifr: '0', pdcase: '<1', pdcost: '$50.000,00', enviro: '0,00', sap: '100%', psms: '95%', faktor: '1000000' };

const n0 = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
export const nf = (v, d = 0) => (v === null || v === undefined ? '' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const usd = v => `$${nf(v, 2)}`;
const rowsOf = (data, m) => (data || []).filter(x => x.module === m).map(x => ({ row_index: x.row_index, ...(x.data || {}) }));

export function targetOf(data, year) {
  const t = { ...TARGET_DEFAULT };
  rowsOf(data, SHE.target).filter(r => Number(r.Tahun) === year).forEach(r => { if (r.Kode && r.Objective !== undefined && r.Objective !== '') t[r.Kode] = String(r.Objective); });
  return t;
}

/** Statistik 12 bulan: angka bulanan, YTD, LTIFR, severity rate, dan LTI-free man hours. */
export function buildStat(data, year, faktor) {
  const F = n0(faktor) || 1000000;
  const byMonth = new Map(rowsOf(data, SHE.stat).filter(r => Number(r.Tahun) === year).map(r => [Number(r.Bulan), r]));
  const cum = { fatal: 0, pf: 0, lti: 0, minor: 0, pd: 0, env: 0, nm: 0, total: 0, dl: 0, mh: 0, cost: 0, free: 0 };
  return Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    if (!r) return { m: i, filled: false };
    const v = { fatal: n0(r.Fatal), pf: n0(r['Potential Fatal']), lti: n0(r.LTI), minor: n0(r['Minor Injury']), pd: n0(r['Property Damage']), env: n0(r.Enviro), nm: n0(r['Near Miss']), dl: n0(r['Day Loss']), mh: n0(r['Man Hours']), cost: n0(r['Biaya Property Damage']) };
    v.total = v.fatal + v.pf + v.lti + v.minor + v.pd + v.env + v.nm;
    Object.keys(cum).filter(k => k !== 'free').forEach(k => { cum[k] += v[k]; });
    const hit = v.lti + v.fatal > 0;
    cum.free = hit ? 0 : cum.free + v.mh;
    const hasSap = r['SAP Achievement'] !== undefined && r['SAP Achievement'] !== '';
    const hasPsms = r['Implementasi PSMS'] !== undefined && r['Implementasi PSMS'] !== '';
    return {
      m: i, filled: true, rec: r, ...v, ytd: { ...cum }, catatan: r.Catatan || '',
      ltifr: v.mh > 0 ? (v.lti * F) / v.mh : 0, ltifrYtd: cum.mh > 0 ? (cum.lti * F) / cum.mh : 0,
      sev: v.mh > 0 ? (v.dl * F) / v.mh : 0, sevYtd: cum.mh > 0 ? (cum.dl * F) / cum.mh : 0,
      freeMonth: hit ? 0 : v.mh, freeYtd: cum.free,
      sap: hasSap ? n0(r['SAP Achievement']) : null, psms: hasPsms ? n0(r['Implementasi PSMS']) : null
    };
  });
}

/** Performance monitoring untuk satu bulan: objective, aktual, dan YTD. */
export function buildKinerja(stat, target, month) {
  const upto = stat.slice(0, month + 1).filter(s => s.filled);
  const s = stat[month];
  const avg = k => { const xs = upto.map(x => x[k]).filter(x => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const has = s && s.filled;
  const y = has ? s.ytd : {};
  const pct = v => (v === null || v === undefined ? '—' : `${nf(v, 0)}%`);
  const rows = {
    fatal: [has ? nf(s.fatal) : '—', has ? nf(y.fatal) : '—'], lti: [has ? nf(s.lti) : '—', has ? nf(y.lti) : '—'], minor: [has ? nf(s.minor) : '—', has ? nf(y.minor) : '—'],
    ltifr: [has ? nf(s.ltifr, 2) : '—', has ? nf(s.ltifrYtd, 2) : '—'], pdcase: [has ? nf(s.pd) : '—', has ? nf(y.pd) : '—'],
    pdcost: [has ? usd(s.cost) : '—', has ? usd(y.cost) : '—'], enviro: [has ? nf(s.env) : '—', has ? nf(y.env) : '—'],
    sap: [has ? pct(s.sap) : '—', pct(avg('sap'))], psms: [has ? pct(s.psms) : '—', pct(avg('psms'))]
  };
  return IND.map(([k, label]) => [label, target[k] ?? '', rows[k][0], rows[k][1]]);
}

/** Catatan insiden pada bulan terpilih (dipakai untuk Summary Sheet dan Rekapitulasi Kejadian Berbahaya). */
export function insidenBulan(data, year, month) {
  return rowsOf(data, SHE.insiden).map(r => ({ ...r, d: toDate(r.Tanggal) })).filter(r => r.d && r.d.getFullYear() === year && r.d.getMonth() === month).sort((a, b) => a.d - b.d);
}
export const KRITIS = ['Fatal', 'Potential Fatal', 'LTI', 'Minor Injury', 'Enviro', 'Near Miss'];

/** Law enforcement: pembinaan/SP pada bulan terpilih, dari data Pembinaan Karyawan (REKAP_SP). */
export function penegakanBulan(data, year, month) {
  return rowsOf(data, 'REKAP_SP').map(r => {
    const d = toDate(val(r, 'TANGGAL')); const until = toDate(val(r, 'MASA BERLAKU'));
    let ket = String(val(r, 'KETERANGAN', 'Keterangan') ?? '').trim();
    if (!ket && d && until && until > d) ket = `Berlaku ${Math.round((until - d) / 86400000 / 30.44)} Bulan`;
    return { d, nama: String(val(r, 'NAMA', 'Nama') ?? ''), nrp: String(val(r, 'NRP', 'AMODI') ?? ''), dept: String(val(r, 'DEPARTEMEN', 'Departemen') ?? ''), jabatan: String(val(r, 'JABATAN') ?? ''), desk: String(val(r, 'DESKRIPSI PELANGGARAN') ?? ''), sanksi: String(val(r, 'JENIS PEMBINAAN') ?? ''), ket };
  }).filter(x => x.d && x.d.getFullYear() === year && x.d.getMonth() === month).sort((a, b) => a.d - b.d);
}
