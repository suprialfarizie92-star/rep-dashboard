// Logika murni untuk menu Laporan SHE (tahap 1): menyusun bagian laporan bulanan dari data yang sudah ada di dashboard.
import { LV_DEFAULT, UNIT_DEFAULT, norm as normCn } from './unitShift.js';
import { DAY, DEPT, isResigned, isLicense, norm, num, toDate, val } from './utils.js';

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const rowsOf = (data, m) => (data || []).filter(x => x.module === m).map(x => x.data || {});
// Nama kolom di Excel bisa berbeda-beda, jadi dicari lewat pola (sama seperti halaman Unit dan Manpower).
const pick = (r, re) => { const k = Object.keys(r).find(x => re.test(x)); return k === undefined || r[k] === '' || r[k] === null ? undefined : r[k]; };
const typeKey = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const keyOf = (r, name) => Object.keys(r).find(k => typeKey(k) === name);
const txt = v => (v === undefined || v === null ? '' : String(v).trim());

export const fd = d => (d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const monthsBetween = (from, to) => {
  if (!from || !to || to < from) return null;
  let m = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) m -= 1;
  return m < 0 ? null : m;
};
export const masaKerja = (from, to) => { const m = monthsBetween(from, to); return m === null ? '—' : `${Math.floor(m / 12)} Tahun ${m % 12} Bulan`; };
export const usia = (lahir, to) => { const m = monthsBetween(lahir, to); return m === null ? '—' : `${Math.floor(m / 12)} Thn`; };
/** Tanggal acuan laporan: akhir bulan terpilih, atau hari ini bila bulan itu belum berakhir. */
export function asOfOf(year, month, now = new Date()) {
  const end = new Date(year, month + 1, 0);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end < t ? end : t;
}
const left = (d, asOf) => (d ? Math.round((d - asOf) / DAY) : null);
/** Sel tanggal berstatus: lewat (merah), <= 30 hari (kuning), aman (hijau). */
function dcell(d, asOf, win = 30) {
  if (!d) return '—';
  const l = left(d, asOf);
  return { t: fd(d), tone: l < 0 ? 'red' : l <= win ? 'amber' : 'green', sub: l < 0 ? `Lewat ${-l} hari` : l === 0 ? 'Hari ini' : `${l} hari lagi` };
}

function empOf(r) {
  const resignRaw = isResigned(r) ? toDate(val(r, 'Tanggal Resign')) : null;
  return {
    amodi: txt(val(r, 'AMODI')), nrp: txt(val(r, 'NRP')), nama: txt(val(r, 'Nama', 'NAMA')), jabatan: txt(val(r, 'Jabatan', 'JABATAN')),
    masuk: toDate(val(r, 'Tanggal Masuk', 'TGL MASUK')), lahir: toDate(val(r, 'Tanggal Lahir')),
    resigned: isResigned(r), resign: resignRaw, status: txt(val(r, 'Status Karyawan')),
    jk: txt(pick(r, /jenis\s*kelamin|^jk$|gender/i)), agama: txt(pick(r, /agama/i)), darah: txt(pick(r, /gol.*darah|^darah$/i)),
    email: txt(pick(r, /e-?mail/i)), alamat: txt(pick(r, /alamat/i)), kontak: txt(pick(r, /contact|kontak|telp|telepon|no\.?\s*hp|phone/i)),
    ket: txt(pick(r, /^(keterangan|ket)\b/i)), row: r
  };
}

/** Karyawan aktif pada tanggal acuan: sudah masuk, dan belum resign (atau resign setelah tanggal acuan). */
const activeAt = (e, asOf) => (!e.masuk || e.masuk <= asOf) && (!e.resigned || (e.resign && e.resign > asOf));

export function buildLaporan(data, year, month, now = new Date()) {
  const asOf = asOfOf(year, month, now);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const all = rowsOf(data, 'Data_Karyawan').map(empOf);
  const aktif = all.filter(e => activeAt(e, asOf)).sort((a, b) => (a.masuk || 0) - (b.masuk || 0));
  const masuk = all.filter(e => e.masuk && e.masuk >= start && e.masuk <= end).sort((a, b) => a.masuk - b.masuk);

  const activeIds = new Set(); const knownIds = new Set();
  all.forEach(e => [e.amodi, e.nrp].filter(Boolean).map(norm).forEach(i => { knownIds.add(i); if (activeAt(e, asOf)) activeIds.add(i); }));
  const rowActive = r => {
    const ids = [val(r, 'AMODI'), val(r, 'NRP')].filter(v => v !== undefined).map(norm);
    if (ids.some(i => activeIds.has(i))) return true;
    return !ids.some(i => knownIds.has(i));
  };

  // Kebutuhan manpower: rencana vs aktual per jabatan.
  const manpower = rowsOf(data, 'Data_Kebutuhan')
    .filter(r => !/^total/i.test(txt(val(r, ...DEPT))))
    .map(r => {
      const plan = num(pick(r, /kebutuhan|plan|target|formasi/i)); const akt = num(pick(r, /aktual|actual|eksisting|existing|terisi/i));
      return { jabatan: txt(pick(r, /jabatan|position|posisi/i)), unit: txt(pick(r, /jumlah\s*unit|^unit/i)), shift: txt(pick(r, /shift/i)), faktor: txt(pick(r, /faktor/i)), plan, akt, kurang: plan !== null && akt !== null ? Math.max(plan - akt, 0) : null, ket: txt(pick(r, /^(keterangan|ket)\b/i)) };
    }).filter(x => x.jabatan);
  const mpPlan = manpower.reduce((s, x) => s + (x.plan || 0), 0); const mpAkt = manpower.reduce((s, x) => s + (x.akt || 0), 0);

  // Pengawas dan tenaga teknis: dari Data_Kompetensi (di luar lisensi), dikelompokkan lewat nama kompetensi/kategori.
  const grup = r => {
    const s = `${txt(val(r, 'Kompetensi'))} ${txt(val(r, 'Kategori'))}`;
    if (/tenaga\s*teknis|juru\s*ledak/i.test(s)) return 'Tenaga Teknis';
    if (/operasional|\bpo[pmu]\b/i.test(s)) return 'Pengawas Operasional';
    if (/pengawas.*(teknik|teknis)|\bpt[pmu]\b|teknik/i.test(s)) return 'Pengawas Teknik';
    if (/pengawas/i.test(s)) return 'Pengawas Operasional';
    return null;
  };
  const kompAll = rowsOf(data, 'Data_Kompetensi').filter(r => !isLicense(r) && rowActive(r)).map(r => {
    const exp = toDate(val(r, 'Expired', 'MASA BERLAKU'));
    return { grup: grup(r), nrp: txt(val(r, 'NRP', 'AMODI')), nama: txt(val(r, 'Nama', 'NAMA')), jabatan: txt(val(r, 'Jabatan', 'JABATAN')), kompetensi: txt(val(r, 'Kompetensi')), kategori: txt(val(r, 'Kategori')), reg: txt(val(r, 'No. Registrasi')), exp, ket: txt(val(r, 'Keterangan')) };
  });

  // Authority high risk: karyawan dengan tanggal HighRisk terisi, dipisah per jabatan A2B / DT.
  const highrisk = { a2b: [], dt: [], lain: [] };
  aktif.forEach(e => {
    const kh = keyOf(e.row, 'highrisk'); const hr = kh ? toDate(e.row[kh]) : null;
    if (!hr) return;
    const ka = keyOf(e.row, 'authority');
    const item = { ...e, hr, auth: ka ? toDate(e.row[ka]) : null };
    (/a2b/i.test(e.jabatan) ? highrisk.a2b : /\bdt\b|dump\s*truck/i.test(e.jabatan) ? highrisk.dt : highrisk.lain).push(item);
  });

  // Komisioning unit dan kendaraan.
  const mk = d => (d ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : null);
  const units = rowsOf(data, 'Data_Unit').map(r => {
    const kom = toDate(pick(r, /komisioning|commissioning/i));
    const exp = toDate(pick(r, /masa\s*berlaku|berlaku|expired|habis/i)) || mk(kom);
    const eq = txt(pick(r, /^(equipment|jenis|tipe|type)/i)); const model = txt(pick(r, /^model/i));
    const cn = txt(pick(r, /^cn/i)); const d = UNIT_DEFAULT[normCn(cn)] || {};
    // Akses, shift, operator: isi kolom di database didahulukan, kalau belum ada dipakai data laporan Oktober 2026.
    return { cn, eq, model, akses: txt(pick(r, /^akses/i)) || d.akses || '', shift: txt(pick(r, /^shift/i)) || d.shift || '', opt: txt(pick(r, /^(opt|operator)/i)) || d.opt || '', thn: txt(pick(r, /^(tahun|year)/i)), kom, exp, ket: txt(pick(r, /^(keterangan|ket)\b/i)) };
  });
  const unitGrup = { dt: [], alat: [], lain: [] };
  units.forEach(u => (/dump|^dt\b/i.test(u.eq) ? unitGrup.dt : /excavator|bulldozer|dozer|grader|loader|alat\s*berat|exca/i.test(u.eq) ? unitGrup.alat : unitGrup.lain).push(u));
  const lv = rowsOf(data, 'Data_LV & Bus').map(r => {
    const d = { pajak: toDate(pick(r, /pajak/i)), stnk: toDate(pick(r, /stnk/i)), kir: toDate(pick(r, /kir/i)), kom: toDate(pick(r, /komisioning|commissioning/i)) };
    const ls = Object.values(d).map(x => left(x, asOf)).filter(x => x !== null);
    const cn = txt(pick(r, /^cn/i)); const dv = LV_DEFAULT[normCn(cn)] || {};
    return { cn, akses: txt(pick(r, /^akses/i)) || dv.akses || '', shift: txt(pick(r, /^shift/i)) || dv.shift || '', driver: txt(pick(r, /^driver/i)) || dv.driver || '', jenis: txt(pick(r, /^jenis/i)), nopol: txt(pick(r, /polisi|nopol|plat/i)), model: txt(pick(r, /^model/i)), ...d, ket: txt(pick(r, /catatan|keterangan|^ket/i)), min: ls.length ? Math.min(...ls) : null };
  });

  const komisDue = units.filter(u => u.exp && left(u.exp, asOf) <= 30).length;
  const missing = [];
  if (aktif.length) [['email', 'Email'], ['alamat', 'Alamat'], ['agama', 'Agama'], ['jk', 'Jenis kelamin'], ['darah', 'Golongan darah'], ['kontak', 'Kontak']].forEach(([k, l]) => { if (!aktif.some(e => e[k])) missing.push(l); });

  return {
    year, month, asOf, aktif, masuk, manpower, mpPlan, mpAkt, kompAll, highrisk, unitGrup, lv, missing,
    cards: {
      aktif: aktif.length, masuk: masuk.length, mpRate: mpPlan > 0 ? (mpAkt / mpPlan) * 100 : null, mpKurang: Math.max(mpPlan - mpAkt, 0),
      hr: highrisk.a2b.length + highrisk.dt.length + highrisk.lain.length, komisDue,
      kompLewat: kompAll.filter(k => k.grup && k.exp && left(k.exp, asOf) < 0).length
    }
  };
}

/** Tabel tiap bagian laporan (kepala kolom + baris). Dipakai untuk tampilan dan untuk ekspor Excel. */
export function tablesOf(L, { kontak = false, semuaKompetensi = false } = {}) {
  const { asOf } = L;
  const idCols = e => [e.amodi || '—', e.nrp || '—'];
  const karyawan = list => list.map((e, i) => [i + 1, ...idCols(e), e.nama, e.jabatan, fd(e.masuk), masaKerja(e.masuk, asOf), usia(e.lahir, asOf), e.jk || '—', e.agama || '—', e.darah || '—',
    ...(kontak ? [e.email || '—', e.alamat || '—', e.kontak || '—'] : [])]);
  const kHead = ['No', 'AMODI', 'NRP', 'Nama', 'Jabatan', 'Tgl masuk', 'Masa kerja', 'Usia', 'Jenis kelamin', 'Agama', 'Gol. darah', ...(kontak ? ['Email', 'Alamat domisili', 'Kontak'] : [])];

  const hr = list => list.map((e, i) => [i + 1, e.nrp || e.amodi || '—', e.nama, e.jabatan, fd(e.masuk), masaKerja(e.masuk, asOf), usia(e.lahir, asOf), dcell(e.hr, asOf), dcell(e.auth, asOf), e.ket]);
  const hrHead = ['No', 'NRP', 'Nama', 'Jabatan', 'Tgl masuk', 'Masa kerja', 'Usia', 'High risk', 'Authority', 'Keterangan'];

  const pengList = L.kompAll.filter(k => semuaKompetensi || k.grup).sort((a, b) => String(a.grup).localeCompare(String(b.grup)) || a.nama.localeCompare(b.nama));
  const typeUnit = u => `${u.eq.replace(/dump\s*truck/i, 'DT')} ${u.model}`.trim() || '—';
  const unitRows = list => list.map((u, i) => [i + 1, u.cn || '—', typeUnit(u), u.akses || '—', u.shift || '—', u.opt || '—', fd(u.kom), dcell(u.exp, asOf), u.ket]);
  const unitHead = ['No', 'No lambung (CN)', 'Type unit', 'Akses', 'Shift', 'Operator (Ya/Tidak)', 'Komisioning', 'Expired', 'Keterangan'];

  return {
    aktif: { title: 'Daftar karyawan aktif', head: kHead, rows: karyawan(L.aktif) },
    masuk: { title: `Daftar karyawan yang masuk, periode ${BULAN[L.month]} ${L.year}`, head: [...kHead.slice(0, 1), ...kHead.slice(1)], rows: karyawan(L.masuk) },
    manpower: {
      title: 'Daftar manpower: rencana vs aktual', head: ['No', 'Jabatan', 'Jumlah unit', 'Shift', 'Faktor X', 'Plan', 'Aktual', 'Kekurangan', 'Keterangan'],
      rows: L.manpower.map((x, i) => [i + 1, x.jabatan, x.unit || '—', x.shift || '—', x.faktor || '—', x.plan ?? '—', x.akt ?? '—', x.kurang === null ? '—' : x.kurang ? { t: String(x.kurang), tone: 'red' } : 0, x.ket])
    },
    pengawas: {
      title: semuaKompetensi ? 'Semua kompetensi (di luar lisensi)' : 'Pengawas operasional, pengawas teknik, dan tenaga teknis',
      head: ['No', 'Kelompok', 'NRP', 'Nama', 'Jabatan', 'Kompetensi', 'No. registrasi', 'Berlaku sampai', 'Keterangan'],
      rows: pengList.map((k, i) => [i + 1, k.grup || '—', k.nrp || '—', k.nama, k.jabatan, k.kompetensi || '—', k.reg || '—', dcell(k.exp, asOf), k.ket])
    },
    highrisk: [
      { key: 'a2b', title: 'Authority high risk operator A2B', head: hrHead, rows: hr(L.highrisk.a2b) },
      { key: 'dt', title: 'Authority high risk operator DT', head: hrHead, rows: hr(L.highrisk.dt) },
      ...(L.highrisk.lain.length ? [{ key: 'lain', title: 'Authority high risk, jabatan lain', head: hrHead, rows: hr(L.highrisk.lain) }] : [])
    ],
    unit: [
      { key: 'lv', title: 'Komisioning sarana LV & Bus', head: ['No', 'No lambung (CN)', 'Type mobil', 'No. polisi', 'Akses', 'Shift', 'Driver (Ya/Tidak)', 'Komisioning (expired)', 'Pajak', 'STNK', 'KIR', 'Keterangan'],
        rows: L.lv.map((v, i) => [i + 1, v.cn || '—', v.model || v.jenis || '—', v.nopol || '—', v.akses || '—', v.shift || '—', v.driver || '—', dcell(v.kom, asOf), dcell(v.pajak, asOf), dcell(v.stnk, asOf), dcell(v.kir, asOf), v.ket]) },
      { key: 'dt', title: 'Komisioning unit dump truck', head: unitHead, rows: unitRows(L.unitGrup.dt) },
      { key: 'alat', title: 'Komisioning unit alat berat (excavator dan bulldozer)', head: unitHead, rows: unitRows(L.unitGrup.alat) },
      ...(L.unitGrup.lain.length ? [{ key: 'lain', title: 'Komisioning unit lain', head: unitHead, rows: unitRows(L.unitGrup.lain) }] : [])
    ]
  };
}

export const cellText = c => (c !== null && typeof c === 'object' ? (c.sub ? `${c.t} (${c.sub})` : c.t) : c);
