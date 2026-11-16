// Fungsi bantu yang dipakai bersama oleh Dashboard, Training, dan navigasi.
export const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6, aug: 7, agu: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11 };
export const DEPT = ['Departemen', 'Department', 'Departement'];
export const DAY = 86400000;

export const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const fmt = (n, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('id-ID', { maximumFractionDigits: d }));
export const num = v => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Ambil nilai kolom tanpa peduli huruf besar/kecil.
export function val(r, ...names) {
  const keys = Object.keys(r);
  for (const n of names) {
    const k = keys.find(key => norm(key) === norm(n));
    if (k !== undefined && r[k] !== null && r[k] !== '') return r[k];
  }
  return undefined;
}

export function toDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + v * DAY);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (m && MON[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    let y = +m[3];
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    return new Date(y, MON[m[2].slice(0, 3).toLowerCase()], +m[1]);
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

export const daysLeft = (v, t) => { const d = toDate(v); return d ? Math.round((d - t) / DAY) : null; };
export const yearOf = v => { const d = toDate(v); return d ? d.getFullYear() : null; };

// Enam jenis lisensi. Catatan di Data_Kompetensi dengan jenis ini tidak dihitung sebagai kompetensi.
export const LICENSE_TYPES = { authority: 'Authority', escorting: 'Escorting', highrisk: 'HighRisk', powertools: 'PowerTools', simper: 'Simper', simpol: 'Simpol' };
const typeKey = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const licenseType = r => LICENSE_TYPES[typeKey(val(r, 'Kompetensi'))] || LICENSE_TYPES[typeKey(val(r, 'Kategori'))] || null;
export const isLicense = r => licenseType(r) !== null;

/**
 * Lisensi diambil dari Data_Karyawan: setiap kolom Authority, Escorting, HighRisk, PowerTools,
 * Simper, dan Simpol yang berisi tanggal dianggap satu dokumen lisensi (tanggal = masa berlaku).
 * Karyawan yang sudah resign tidak dihitung.
 */
export function licenseDocs(data) {
  const t = today();
  const docs = [];
  data.forEach(x => {
    if (x.module !== 'Data_Karyawan') return;
    const r = x.data || {};
    if (val(r, 'Tanggal Resign')) return;
    Object.keys(r).forEach(key => {
      const type = LICENSE_TYPES[typeKey(key)];
      const exp = type ? toDate(r[key]) : null;
      if (!exp) return;
      docs.push({
        k: docs.length, row: r, type, exp, left: Math.round((exp - t) / DAY),
        nama: val(r, 'Nama', 'NAMA'), id: val(r, 'AMODI', 'NRP'), jabatan: val(r, 'Jabatan', 'JABATAN')
      });
    });
  });
  return docs;
}

export function licenseExpiringPeople(data, days = 30) {
  return new Set(licenseDocs(data).filter(d => d.left >= 0 && d.left <= days).map(d => d.id || d.nama)).size;
}
