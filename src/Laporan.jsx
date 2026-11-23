import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { fmt, norm } from './utils.js';
import { BULAN, buildLaporan, cellText, fd, tablesOf } from './laporan.js';
import { SHE, buildKinerja, buildStat, insidenBulan, penegakanBulan, targetOf, TARGET_DEFAULT, IND } from './she.js';
import { INSP_MOD, SAP_FIELDS, SAP_MOD, buildInspeksi, buildSap, daysIn, inspeksiTotal, joinDays, parseDays, parseSapSheet, pctTxt } from './she3.js';
import { InspeksiTab, SapTab, inspFields, sapFields } from './LaporanTahap3.jsx';
import { KegiatanTab, fotoDataUrls } from './LaporanTahap4.jsx';
import { buildKegiatan } from './she4.js';
import { BmiTab, KkTab, KkpTab, PenyakitTab, PicaPanel, StrukturTab } from './LaporanTahap5.jsx';
import { M5, buildBMI, buildKK, buildKkp, buildOrg, buildPengOv, buildPenyakit, buildPica, buildStruktur } from './she5.js';
import { FormModal, Insiden, Kinerja, Penegakan, Statistik, deleteRec, insidenFields, saveMany, saveRec, statFields, targetFields, toIsoDate } from './LaporanShe.jsx';
import './dashboard.css';
import './pages.css';
import './laporan.css';

const GROUPS = [
  ['Ringkasan', [['ringkasan', 'Ringkasan']]],
  ['Manpower', [['aktif', 'Karyawan aktif'], ['masuk', 'Masuk & keluar'], ['manpower', 'Manpower & PICA'], ['pengawas', 'Pengawas & teknis'], ['highrisk', 'High risk']]],
  ['Unit', [['unit', 'Komisioning unit']]],
  ['Kinerja SHE', [['kinerja', 'Performance'], ['statistik', 'Statistik insiden'], ['insiden', 'Insiden'], ['penyakit', 'Rekap penyakit'], ['penegakan', 'Law enforcement']]],
  ['Program', [['sap', 'SAP'], ['inspeksi', 'Jadwal inspeksi'], ['kegiatan', 'Kegiatan SHE'], ['kkp', 'Meeting KKP']]],
  ['Kesehatan', [['kk', 'Kontrol kritis kronis'], ['bmi', 'Kontrol BMI']], true],
  ['Lainnya', [['struktur', 'Struktur organisasi']]]
];

function Cell({ c }) {
  if (React.isValidElement(c)) return c;
  if (c !== null && typeof c === 'object') return <><span className="badge" data-tone={c.tone || 'gray'}>{c.t}</span>{c.sub && <span className="lap-sub">{c.sub}</span>}</>;
  return c;
}

function Tabel({ head, rows, empty = 'Tidak ada data untuk bagian ini.' }) {
  const wrapCols = new Set(['Nama', 'Jabatan', 'Keterangan', 'Kompetensi', 'Alamat domisili']);
  return (
    <div className="tr-scroll">
      <table className="ttable">
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={wrapCols.has(head[j]) ? 'lap-wrap' : undefined}><Cell c={c} /></td>)}</tr>)}</tbody>
      </table>
      {!rows.length && <div className="no-results">{empty}</div>}
    </div>
  );
}

export default function Laporan({ data, loading, canPrivate, canWrite, canHealth, canHealthWrite, onRefresh, onNotice }) {
  const [ym, setYm] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [tab, setTab] = useState('ringkasan');
  const [kontak, setKontak] = useState(false);
  const [semuaK, setSemuaK] = useState(false);
  const [q, setQ] = useState('');
  const [hr, setHr] = useState('a2b');
  const [un, setUn] = useState('lv');
  const [sub, setSub] = useState('summary');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const L = useMemo(() => buildLaporan(data, ym.y, ym.m), [data, ym]);
  const pengOv = useMemo(() => buildPengOv(data), [data]);
  const T = useMemo(() => tablesOf(L, { kontak: canPrivate && kontak, semuaKompetensi: semuaK, pengOv }), [L, canPrivate, kontak, semuaK, pengOv]);
  const target = useMemo(() => targetOf(data, ym.y), [data, ym.y]);
  const stat = useMemo(() => buildStat(data, ym.y, target.faktor), [data, ym.y, target.faktor]);
  const kin = useMemo(() => buildKinerja(stat, target, ym.m), [stat, target, ym.m]);
  const ins = useMemo(() => insidenBulan(data, ym.y, ym.m), [data, ym]);
  const pen = useMemo(() => penegakanBulan(data, ym.y, ym.m), [data, ym]);
  const bulanLabel = `${BULAN[ym.m]} ${ym.y}`;

  // Jadwal inspeksi: klik kotak harus terasa langsung, jadi perubahan ditampilkan dulu sebelum data dimuat ulang.
  const [ovI, setOvI] = useState({});
  const ovIRef = useRef({});
  const putOvI = n => { ovIRef.current = n; setOvI(n); };
  useEffect(() => {
    const keys = Object.keys(ovIRef.current);
    if (!keys.length) return;
    const by = new Map((data || []).filter(r => r.module === INSP_MOD).map(r => [String(r.row_index), r.data || {}]));
    const next = {};
    keys.forEach(k => { const base = by.get(k) || {}; const left = Object.fromEntries(Object.entries(ovIRef.current[k]).filter(([f, v]) => String(base[f] ?? '') !== String(v ?? ''))); if (Object.keys(left).length) next[k] = left; });
    if (JSON.stringify(next) !== JSON.stringify(ovIRef.current)) putOvI(next);
  }, [data]);
  const dataI = useMemo(() => (Object.keys(ovI).length ? (data || []).map(r => (r.module === INSP_MOD && ovI[String(r.row_index)] ? { ...r, data: { ...r.data, ...ovI[String(r.row_index)] } } : r)) : data), [data, ovI]);
  const sap = useMemo(() => buildSap(data, ym.y, ym.m), [data, ym]);
  const insp = useMemo(() => buildInspeksi(dataI, ym.y, ym.m), [dataI, ym]);
  const monthBase = ym.y * 10000 + (ym.m + 1) * 100;
  const thisYear = new Date().getFullYear();

  // Penyimpanan: setiap aksi menyimpan ke app_data lalu memuat ulang data.
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); setModal(null); onNotice?.(ok); await onRefresh?.(); } catch (e) { onNotice?.(`Gagal menyimpan: ${e.message}`); } finally { setBusy(false); }
  };
  const num = v => (v === '' || v === undefined || v === null ? '' : Number(v));
  const saveStat = (i, f) => run(() => saveRec(SHE.stat, ym.y * 100 + i + 1, { Tahun: ym.y, Bulan: i + 1, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === 'Catatan' ? v : num(v)])) }), `Statistik ${BULAN[i]} ${ym.y} disimpan.`);
  const saveTarget = f => run(async () => {
    const keys = [...IND.map(([k]) => k), 'faktor'];
    for (let n = 0; n < keys.length; n += 1) await saveRec(SHE.target, ym.y * 100 + n + 1, { Tahun: ym.y, Kode: keys[n], Objective: f[keys[n]] ?? '' });
  }, `Target ${ym.y} disimpan.`);
  const pengFields = [
    { key: 'Kelompok', label: 'Kelompok', type: 'select', options: ['Pengawas Operasional', 'Pengawas Teknik', 'Tenaga Teknis', ''] },
    { key: 'NRP', label: 'NRP' }, { key: 'Nama', label: 'Nama', required: true }, { key: 'Jabatan', label: 'Jabatan' },
    { key: 'Kompetensi', label: 'Kompetensi', wide: true }, { key: 'Reg', label: 'No. registrasi' }, { key: 'Exp', label: 'Berlaku sampai', type: 'date' },
    { key: 'Keterangan', label: 'Keterangan', type: 'textarea', wide: true }
  ];
  const pengIdx = key => pengOv.get(key)?.row_index ?? Math.max(100000, ...[...pengOv.values()].map(r => r.row_index)) + 1;
  const savePeng = (f, item) => run(async () => {
    await saveRec(M5.lamp, pengIdx(item.key), { ...(pengOv.get(item.key) ? (({ row_index, ...d }) => d)(pengOv.get(item.key)) : {}), Jenis: 'pengawas', Key: item.key, ...f });
  }, 'Perubahan disimpan (hanya untuk laporan).');
  const hidePeng = item => window.confirm(`Hapus ${item.nama} dari daftar pengawas & teknis di laporan?\n\nData asli di menu Data Kompetensi tidak ikut terhapus. Baris ini bisa dipulihkan kapan saja.`)
    && run(async () => { await saveRec(M5.lamp, pengIdx(item.key), { ...(pengOv.get(item.key) ? (({ row_index, ...d }) => d)(pengOv.get(item.key)) : {}), Jenis: 'pengawas', Key: item.key, Hide: 1, Nama: item.nama }); }, `${item.nama} dihapus dari daftar laporan.`);
  const restorePeng = item => run(() => deleteRec(M5.lamp, pengOv.get(item.key).row_index), `${item.nama} dipulihkan.`);
  const saveInsiden = (f, row) => run(async () => {
    const used = (data || []).filter(x => x.module === SHE.insiden).map(x => x.row_index);
    await saveRec(SHE.insiden, row ? row.row_index : Math.max(0, ...used) + 1, f);
  }, 'Insiden disimpan.');
  const sapRecs = (list, ex) => list.filter(x => x !== ex).map((x, i) => ({ row_index: monthBase + i + 1, data: { Tahun: ym.y, Bulan: ym.m + 1, No: i + 1, Nama: x.Nama } }));
  const saveSapRow = (f, row) => run(async () => {
    const v = sap.virtual;
    if (v) await saveMany(SAP_MOD, sapRecs(sap.rows));
    const idxs = v ? sap.rows.map((_, i) => monthBase + i + 1) : sap.rows.map(r => r.row_index);
    const idx = row ? (v ? monthBase + sap.rows.indexOf(row) + 1 : row.row_index) : Math.max(monthBase, ...idxs) + 1;
    const no = row ? (v ? sap.rows.indexOf(row) + 1 : row.No) : sap.rows.length + 1;
    await saveRec(SAP_MOD, idx, { Tahun: ym.y, Bulan: ym.m + 1, No: no, Nama: String(f.Nama || '').trim().toUpperCase(), ...Object.fromEntries(SAP_FIELDS.map(([k]) => [k, num(f[k])])) });
  }, 'Data SAP disimpan.');
  const delSapRow = row => window.confirm(`Hapus ${row.Nama} dari SAP ${bulanLabel}?`) && run(() => (sap.virtual ? saveMany(SAP_MOD, sapRecs(sap.rows, row)) : deleteRec(SAP_MOD, row.row_index)), 'Data SAP dihapus.');
  const importSap = async file => {
    try {
      const p = parseSapSheet(XLSX, XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      if (!p.rows.length) throw new Error('Tidak ada baris SAP yang terbaca.');
      const bln = BULAN.findIndex(b => new RegExp(b, 'i').test(p.title));
      const warn = bln >= 0 && bln !== ym.m ? `\n\nPERHATIAN: judul file menyebut ${BULAN[bln]}, sedangkan bulan yang dipilih ${BULAN[ym.m]}.` : '';
      if (!window.confirm(`Impor SAP ${bulanLabel}: ${p.rows.length} orang.\nData SAP bulan ini yang sudah ada akan diganti.${warn}`)) return;
      await run(async () => {
        await saveMany(SAP_MOD, p.rows.map((d, i) => ({ row_index: monthBase + i + 1, data: { Tahun: ym.y, Bulan: ym.m + 1, No: i + 1, ...d } })));
        const keep = new Set(p.rows.map((_, i) => monthBase + i + 1));
        for (const r of sap.rows) if (r.row_index && !keep.has(r.row_index)) await deleteRec(SAP_MOD, r.row_index);
      }, `SAP ${bulanLabel} diimpor.`);
    } catch (e) { onNotice?.(`Impor SAP gagal: ${e.message}`); }
  };
  const applyPerf = () => run(async () => {
    const rec = (data || []).find(r => r.module === SHE.stat && r.row_index === ym.y * 100 + ym.m + 1);
    if (!rec) throw new Error('Statistik bulan ini belum diisi.');
    await saveRec(SHE.stat, rec.row_index, { ...rec.data, 'SAP Achievement': Math.round(Math.min(100, (sap.overall || 0) * 100) * 10) / 10 });
  }, 'SAP Achievement diterapkan ke Performance.');
  const toggleDay = async (it, key, day) => {
    if (it.virtual) {
      const cur = parseDays(it[key]); const val = joinDays(cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day]);
      try { await saveMany(INSP_MOD, inspRecs(insp).map(r => (r.data.Inspeksi === it.Inspeksi ? { ...r, data: { ...r.data, [key]: val } } : r))); await onRefresh?.(); } catch (e) { onNotice?.(`Gagal menyimpan: ${e.message}`); }
      return;
    }
    const orig = (data || []).find(r => r.module === INSP_MOD && r.row_index === it.row_index);
    if (!orig) return;
    const cur = parseDays(it[key]);
    const patch = { [key]: joinDays(cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day]) };
    const k = String(it.row_index);
    const mergedPatch = { ...(ovIRef.current[k] || {}), ...patch };
    putOvI({ ...ovIRef.current, [k]: mergedPatch });
    try { await saveRec(INSP_MOD, it.row_index, { ...orig.data, ...mergedPatch }); } catch (e) {
      const c = { ...ovIRef.current }; delete c[k]; putOvI(c); onNotice?.(`Gagal menyimpan: ${e.message}`);
    }
  };
  const inspRecs = (list, ex) => list.filter(x => x !== ex).map((x, i) => ({ row_index: monthBase + i + 1, data: { Tahun: ym.y, Bulan: ym.m + 1, No: i + 1, Inspeksi: x.Inspeksi, Plan: '', Actual: '' } }));
  const addInsp = f => run(async () => {
    if (insp.virtual) await saveMany(INSP_MOD, inspRecs(insp));
    const no = Math.max(0, ...insp.map(x => Number(x.No) || 0)) + 1;
    await saveRec(INSP_MOD, monthBase + no, { Tahun: ym.y, Bulan: ym.m + 1, No: no, Inspeksi: String(f.Inspeksi || '').trim().toUpperCase(), Plan: '', Actual: '' });
  }, 'Inspeksi ditambahkan.');
  const delInsp = it => window.confirm(`Hapus inspeksi ${it.Inspeksi} dari ${bulanLabel}?`) && run(() => (insp.virtual ? saveMany(INSP_MOD, inspRecs(insp, it)) : deleteRec(INSP_MOD, it.row_index)), 'Inspeksi dihapus.');
  const copyPrev = () => {
    const py = ym.m === 0 ? ym.y - 1 : ym.y; const pm = ym.m === 0 ? 11 : ym.m - 1;
    const prev = buildInspeksi(data, py, pm).filter(p => !insp.some(x => x.Inspeksi === p.Inspeksi));
    if (!prev.length) { onNotice?.(`Tidak ada inspeksi baru untuk disalin dari ${BULAN[pm]} ${py}.`); return; }
    if (!window.confirm(`Salin ${prev.length} inspeksi (hari rencana sama, realisasi dikosongkan) dari ${BULAN[pm]} ${py}?`)) return;
    const maxD = daysIn(ym.y, ym.m); let no = Math.max(0, ...insp.map(x => Number(x.No) || 0));
    run(() => saveMany(INSP_MOD, prev.map(p => { no += 1; return { row_index: monthBase + no, data: { Tahun: ym.y, Bulan: ym.m + 1, No: no, Inspeksi: p.Inspeksi, Plan: joinDays(p.plan.filter(d => d <= maxD)), Actual: '' } }; })), 'Rencana inspeksi disalin.');
  };
  const delInsiden = row => window.confirm('Hapus catatan insiden ini?') && run(() => deleteRec(SHE.insiden, row.row_index), 'Insiden dihapus.');

  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];
  const filt = rows => { const n = norm(q); return n ? rows.filter(r => norm(r.map(cellText).join(' ')).includes(n)) : rows; };
  const hrG = T.highrisk.find(g => g.key === hr) || T.highrisk[0];
  const unG = T.unit.find(g => g.key === un) || T.unit[0];

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const add = (name, t) => {
      const ws = XLSX.utils.aoa_to_sheet([t.head, ...t.rows.map(r => r.map(cellText))]);
      ws['!cols'] = t.head.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...t.rows.slice(0, 60).map(r => String(cellText(r[i]) ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    add('Karyawan Aktif', T.aktif); add('Karyawan Masuk', T.masuk); add('Karyawan Keluar', T.keluar); add('Manpower', T.manpower); add('Pengawas & Teknis', T.pengawas);
    T.highrisk.forEach(g => add(g.key === 'ringkasan' ? 'High Risk Ringkasan' : `High Risk ${g.key.toUpperCase()}`, g));
    T.unit.forEach(g => add(g.key === 'lv' ? 'Komisioning LV & Bus' : `Komisioning ${g.key.toUpperCase()}`, g));
    XLSX.writeFile(wb, `SHE_Laporan_${BULAN[ym.m]}_${ym.y}.xlsx`);
  };

  const [pptBusy, setPptBusy] = useState(false);
  const [withHealth, setWithHealth] = useState(false);
  const groups = GROUPS.filter(g => !g[2] || canHealth);
  const grp = groups.find(g => g[1].some(t => t[0] === tab)) || groups[0];
  const exportPpt = async () => {
    setPptBusy(true);
    try {
      const { exportPptx } = await import('./pptx.js');
      const keg = buildKegiatan(data, ym.y, ym.m);
      const photos = await fotoDataUrls(keg.all.map(x => x.fotos[0]).filter(Boolean));
      const kkp = buildKkp(data, ym.y, ym.m); const struktur = buildStruktur(data, ym.y, ym.m);
      const extra = [...kkp.fotos.slice(0, 4), ...kkp.absen.slice(0, 1), ...(struktur?.path ? [struktur.path] : [])];
      const photos2 = { ...photos, ...(await fotoDataUrls(extra)) };
      const health = canHealth && withHealth;
      await exportPptx({ T, stat, kin, ins, pen, sap, insp, keg, photos: photos2, year: ym.y, month: ym.m, pica: buildPica(data), kkp, struktur, org: buildOrg(data, ym.y, ym.m),
        penyakit: { pak: buildPenyakit(data, ym.y, 'PAK', ym.m), kaptk: buildPenyakit(data, ym.y, 'KAPTK', ym.m) }, kk: health ? buildKK(data, ym.y, ym.m, L.aktif) : null, bmi: health ? buildBMI(data, ym.y, ym.m, L.aktif) : null });
    } catch (e) {
      onNotice?.(/pptxgenjs|dynamically imported|Failed to fetch/i.test(String(e.message)) ? 'Unduh PowerPoint butuh paket pptxgenjs. Jalankan: npm install pptxgenjs' : `Gagal membuat PowerPoint: ${e.message}`);
    } finally { setPptBusy(false); }
  };
  const card = (v, label, tone) => <div className="dcard static" data-tone={tone}><b>{v}</b><span>{label}</span></div>;
  const c = L.cards;
  const cakupan = [
    ['Daftar karyawan aktif', 'hal. 3 sampai 5', `${L.aktif.length} karyawan`, L.aktif.length > 0],
    ['Karyawan yang masuk dan keluar', 'hal. 6', `${L.masuk.length} masuk, ${L.keluar.length} keluar`, true],
    ['Rencana vs aktual manpower', 'hal. 7', `${L.manpower.length} jabatan`, L.manpower.length > 0],
    ['Pengawas dan tenaga teknis', 'hal. 8', `${L.kompAll.filter(k => k.grup).length} catatan`, L.kompAll.some(k => k.grup)],
    ['Authority high risk A2B dan DT', 'hal. 9 sampai 11', `${c.hr} operator`, c.hr > 0],
    ['Komisioning LV, bus, dump truck, alat berat', 'hal. 12 sampai 14', `${L.lv.length} kendaraan, ${L.unitGrup.dt.length + L.unitGrup.alat.length + L.unitGrup.lain.length} unit`, L.lv.length + L.unitGrup.dt.length + L.unitGrup.alat.length > 0],
    ['Performance monitoring dan statistik insiden', 'hal. 15 dan 16', `${stat.filter(s => s.filled).length} bulan terisi`, stat.some(s => s.filled)],
    ['Summary sheet insiden dan kejadian berbahaya', 'hal. 17 dan 19', `${ins.length} insiden bulan ini`, true],
    ['SHE Law Enforcement', 'hal. 18', `${pen.length} pembinaan bulan ini`, true],
    ['SAP per orang', 'lampiran SAP', `${sap.rows.length} orang`, sap.rows.length > 0],
    ['Jadwal inspeksi', 'hal. 25', `${insp.length} inspeksi, ACH ${pctTxt(inspeksiTotal(insp).ach)}`, insp.length > 0],
    ['Kegiatan SHE (dengan foto)', 'hal. 20 sampai 22', `${buildKegiatan(data, ym.y, ym.m).all.length} kegiatan`, buildKegiatan(data, ym.y, ym.m).all.length > 0],
    ['Meeting KKP level II (MOM, foto, absensi)', 'hal. 21', (() => { const k = buildKkp(data, ym.y, ym.m); return k.head || k.ini.length || k.lalu.length || k.fotos.length ? `${k.ini.length} poin MOM` : 'Belum diisi'; })(), (() => { const k = buildKkp(data, ym.y, ym.m); return Boolean(k.head || k.ini.length || k.lalu.length || k.fotos.length); })()],
    ['PICA kebutuhan manpower', 'hal. 7', `${buildPica(data).length} baris dari Database Manpower`, buildPica(data).length > 0],
    ['Struktur organisasi', 'hal. 2', buildOrg(data, ym.y, ym.m).nodes.length ? `Bagan ${buildOrg(data, ym.y, ym.m).nodes.length} posisi` : buildStruktur(data, ym.y, ym.m) ? 'Gambar terpasang' : 'Belum ada bagan atau gambar', Boolean(buildOrg(data, ym.y, ym.m).nodes.length || buildStruktur(data, ym.y, ym.m))],
    ['Kontrol kritis kronis dan BMI', 'hal. 23 dan 24', canHealth ? `${buildKK(data, ym.y, ym.m).n} KK, ${buildBMI(data, ym.y, ym.m).n} BMI` : 'Akses terbatas', canHealth && buildKK(data, ym.y, ym.m).n > 0]
  ];

  return (
    <div className="page-content dash lap">
      <div className="dash-top">
        <div>
          <h1>Laporan SHE</h1>
          <p className="subtle">Bagian laporan bulanan SHE yang datanya sudah ada di dashboard. Per {fd(L.asOf)}.</p>
        </div>
        <div className="dash-filters">
          <label>Bulan<select value={ym.m} onChange={e => setYm({ ...ym, m: Number(e.target.value) })}>{BULAN.map((b, i) => <option key={b} value={i}>{b}</option>)}</select></label>
          <label>Tahun<select value={ym.y} onChange={e => setYm({ ...ym, y: Number(e.target.value) })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
          <button type="button" className="btn light" onClick={exportXlsx} disabled={loading}><Icon name="download" size={15} /> Unduh Excel</button>
          {canHealth && <label className="lap-check" title="Menyertakan data kesehatan (KK dan BMI) di PowerPoint"><input type="checkbox" checked={withHealth} onChange={e => setWithHealth(e.target.checked)} /> Sertakan KK &amp; BMI</label>}
          <button type="button" className="btn light" onClick={exportPpt} disabled={loading || pptBusy}><Icon name="download" size={15} /> {pptBusy ? 'Membuat PowerPoint...' : 'Unduh PowerPoint'}</button>
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      <div className="seg-tabs" role="group" aria-label="Kelompok laporan" style={{ justifySelf: 'start', flexWrap: 'wrap' }}>
        {groups.map(g => <button type="button" key={g[0]} aria-pressed={grp[0] === g[0]} onClick={() => { setTab(g[1][0][0]); setQ(''); }}>{g[0]}</button>)}
      </div>
      {grp[1].length > 1 && (
        <div className="seg-tabs" role="group" aria-label="Bagian laporan" style={{ justifySelf: 'start', flexWrap: 'wrap' }}>
          {grp[1].map(([k, lbl]) => <button type="button" key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setQ(''); }}>{lbl}</button>)}
        </div>
      )}

      {loading && !data.length ? <section className="panel tr-panel"><div className="loading-state"><div className="spinner" />Memuat data...</div></section> : (
        <>
          {tab === 'ringkasan' && (
            <>
              <div className="dgrid">
                {card(fmt(c.aktif, 0), `Karyawan aktif per ${fd(L.asOf)}`, 'blue')}
                {card(fmt(c.masuk, 0), `Masuk di ${BULAN[ym.m]} ${ym.y}`, 'green')}
                {card(fmt(c.keluar, 0), `Keluar di ${BULAN[ym.m]} ${ym.y}`, c.keluar ? 'amber' : 'gray')}
                {card(c.mpRate === null ? '—' : `${fmt(c.mpRate, 1)}%`, `Pemenuhan manpower (kurang ${fmt(c.mpKurang, 0)})`, c.mpKurang ? 'amber' : 'green')}
                {card(fmt(c.hr, 0), 'Operator authority high risk', 'blue')}
                {card(fmt(c.komisDue, 0), 'Komisioning unit lewat / ≤ 30 hari', c.komisDue ? 'red' : 'green')}
                {card(fmt(c.kompLewat, 0), 'Kompetensi pengawas sudah lewat', c.kompLewat ? 'red' : 'green')}
              </div>
              <section className="panel tr-panel">
                <h3 className="lap-title">Cakupan laporan Oktober 2026 (format PowerPoint)</h3>
                <p className="lap-hint">Bagian mana yang sudah terisi dari data dashboard.</p>
                <div className="tr-scroll"><table className="ttable"><thead><tr><th>Bagian laporan</th><th>Halaman</th><th>Isi saat ini</th></tr></thead>
                  <tbody>{cakupan.map(([n, p, s, ok]) => <tr key={n}><td>{n}</td><td>{p}</td><td><span className="badge" data-tone={ok ? 'green' : 'gray'}>{s}</span></td></tr>)}</tbody></table></div>
              </section>
              <div className="lap-note">
                Daftar karyawan aktif dan karyawan masuk dihitung dari tanggal masuk dan tanggal resign, jadi bisa dilihat untuk bulan lalu. Rencana manpower, kompetensi, lisensi, dan unit memakai isi tabel saat ini, bukan arsip bulan yang dipilih.
                Masa berlaku dihitung terhadap {fd(L.asOf)}.
              </div>
            </>
          )}

          {tab === 'aktif' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, NRP, atau jabatan" aria-label="Cari karyawan" />
                {canPrivate && <label className="lap-check"><input type="checkbox" checked={kontak} onChange={e => setKontak(e.target.checked)} /> Tampilkan email, alamat, dan kontak (data pribadi)</label>}
                <span className="count">{filt(T.aktif.rows).length} karyawan</span>
              </div>
              {L.missing.length > 0 && <div className="lap-note" style={{ marginBottom: 12 }}>Kolom berikut tidak ditemukan di Data Karyawan, jadi tampil "—": {L.missing.join(', ')}.</div>}
              <Tabel head={T.aktif.head} rows={filt(T.aktif.rows)} />
            </section>
          )}

          {tab === 'masuk' && (
            <section className="panel tr-panel">
              <h3 className="lap-title">{T.masuk.title}</h3>
              <p className="lap-hint">Karyawan dengan tanggal masuk di bulan ini. Kolom keterangan diambil dari kolom Keterangan atau Status Karyawan.</p>
              <Tabel head={T.masuk.head} rows={T.masuk.rows} empty="Tidak ada karyawan yang masuk di bulan ini." />
              <h3 className="lap-title" style={{ marginTop: 20 }}>{T.keluar.title}</h3>
              <p className="lap-hint">Karyawan dengan tanggal resign di bulan ini.</p>
              <Tabel head={T.keluar.head} rows={T.keluar.rows} empty="Tidak ada karyawan yang keluar di bulan ini." />
            </section>
          )}

          {tab === 'manpower' && (
            <section className="panel tr-panel">
              <h3 className="lap-title">{T.manpower.title}</h3>
              <p className="lap-hint">Total plan {fmt(L.mpPlan, 0)}, actual {fmt(L.mpAkt, 0)}, selisih {fmt(L.mpAkt - L.mpPlan, 0)} (negatif = kekurangan). Data dari menu Database Manpower.</p>
              <Tabel head={T.manpower.head} rows={T.manpower.rows} />
            </section>
          )}
          {tab === 'manpower' && (
            <PicaPanel data={data} year={ym.y} month={ym.m} manpower={L.manpower} canWrite={canWrite} onRefresh={onRefresh} onNotice={onNotice} />
          )}

          {tab === 'pengawas' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <h3 className="lap-title" style={{ margin: 0 }}>{T.pengawas.title}</h3>
                <label className="lap-check"><input type="checkbox" checked={semuaK} onChange={e => setSemuaK(e.target.checked)} /> Tampilkan semua kompetensi (tanpa filter pengawas)</label>
              </div>
              <p className="lap-hint">Dikelompokkan dari nama kompetensi/kategori di Data Kompetensi. Kalau ada yang tidak muncul, centang opsi di atas untuk melihat semua catatan, lalu beri tahu nama kompetensinya supaya pengelompokannya disesuaikan.</p>
              <Tabel head={canWrite ? [...T.pengawas.head, ''] : T.pengawas.head}
                rows={T.pengawas.rows.map((r, i) => (canWrite ? [...r, <span key="a" style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn light mini" onClick={() => setModal({ type: 'peng', item: T.pengawas.items[i] })}><Icon name="edit" size={13} /> Ubah</button>
                  <button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={() => hidePeng(T.pengawas.items[i])}>Hapus</button></span>] : r))}
                empty="Belum ada kompetensi yang cocok dengan kelompok pengawas atau tenaga teknis." />
              {canWrite && T.pengawas.hidden.length > 0 && (
                <div className="lap-note" style={{ marginTop: 12 }}>
                  <b>Dihapus dari laporan ({T.pengawas.hidden.length}):</b>
                  {T.pengawas.hidden.map(h => <div key={h.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}><span>{h.nama} • {h.kompetensi || '—'}</span><button type="button" className="btn light mini" onClick={() => restorePeng(h)}>Pulihkan</button></div>)}
                </div>
              )}
            </section>
          )}

          {tab === 'highrisk' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <div className="seg-tabs" role="group" aria-label="Kelompok">{T.highrisk.map(g => <button type="button" key={g.key} aria-pressed={hrG.key === g.key} onClick={() => setHr(g.key)}>{g.key.toUpperCase()} ({g.rows.length})</button>)}</div>
              </div>
              <h3 className="lap-title">{hrG.title}</h3>
              <p className="lap-hint">Semua operator aktif per kelompok; yang belum punya tanggal HighRisk tampil N/A. A2B = jabatan mengandung A2B, excavator, bulldozer, atau dozer. DT = jabatan mengandung DT atau dump truck. Hanya jabatan operator/driver yang dihitung.</p>
              <Tabel head={hrG.head} rows={hrG.rows} empty="Tidak ada operator di kelompok ini." />
            </section>
          )}

          {tab === 'unit' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <div className="seg-tabs" role="group" aria-label="Jenis unit">{T.unit.map(g => <button type="button" key={g.key} aria-pressed={unG.key === g.key} onClick={() => setUn(g.key)}>{g.key === 'lv' ? 'LV & Bus' : g.key === 'dt' ? 'Dump truck' : g.key === 'alat' ? 'Alat berat' : 'Lainnya'} ({g.rows.length})</button>)}</div>
              </div>
              <h3 className="lap-title">{unG.title}</h3>
              <p className="lap-hint">Dari menu Unit. Akses, shift, dan operator/driver mengikuti laporan Oktober 2026 (hal. 12 sampai 14). Setelah kolom Akses, Shift, dan Operator/Driver ada di data unit, isi kolom itulah yang dipakai.</p>
              <Tabel head={unG.head} rows={unG.rows} />
            </section>
          )}

          {tab === 'kinerja' && <Kinerja rows={kin} month={ym.m} year={ym.y} canWrite={canWrite} onEditData={() => setModal({ type: 'stat', i: ym.m })} onTarget={() => setModal({ type: 'target' })} catatan={stat[ym.m]?.catatan} />}
          {tab === 'statistik' && <Statistik stat={stat} year={ym.y} canWrite={canWrite} onEdit={i => setModal({ type: 'stat', i })} />}
          {tab === 'insiden' && <Insiden list={ins} sub={sub} setSub={setSub} canWrite={canWrite} bulanLabel={bulanLabel} onAdd={() => setModal({ type: 'insiden' })} onEdit={row => setModal({ type: 'insiden', row })} />}
          {tab === 'penegakan' && <Penegakan list={pen} bulanLabel={bulanLabel} />}
          {tab === 'sap' && <SapTab sap={sap} year={ym.y} month={ym.m} canWrite={canWrite} onImport={importSap} onAdd={() => setModal({ type: 'sap' })} onEdit={row => setModal({ type: 'sap', row })} onApplyPerf={applyPerf} statAda={Boolean(stat[ym.m]?.filled)} />}
          {tab === 'penyakit' && <PenyakitTab data={data} year={ym.y} month={ym.m} canWrite={canWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'kkp' && <KkpTab data={data} year={ym.y} month={ym.m} canWrite={canWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'struktur' && <StrukturTab data={data} year={ym.y} month={ym.m} canWrite={canWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'kk' && canHealth && <KkTab emps={L.aktif} data={data} year={ym.y} month={ym.m} canWrite={canHealthWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'bmi' && canHealth && <BmiTab emps={L.aktif} data={data} year={ym.y} month={ym.m} canWrite={canHealthWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'kegiatan' && <KegiatanTab data={data} year={ym.y} month={ym.m} canWrite={canWrite} onRefresh={onRefresh} onNotice={onNotice} />}
          {tab === 'inspeksi' && <InspeksiTab list={insp} year={ym.y} month={ym.m} canWrite={canWrite} onToggle={toggleDay} onAdd={() => setModal({ type: 'insp' })} onDelete={delInsp} onCopyPrev={copyPrev} />}
        </>
      )}

      {modal?.type === 'stat' && (() => {
        const s = stat[modal.i]; const r = s?.rec || {};
        return <FormModal eyebrow={`STATISTIK INSIDEN ${ym.y}`} title={`Isi / ubah ${BULAN[modal.i]}`} fields={statFields} init={Object.fromEntries(statFields.map(x => [x.key, r[x.key] ?? '']))} onClose={() => setModal(null)} onSave={f => saveStat(modal.i, f)} />;
      })()}
      {modal?.type === 'peng' && (
        <FormModal eyebrow="PENGAWAS & TENAGA TEKNIS" title={`Ubah ${modal.item.nama}`} fields={pengFields}
          init={{ Kelompok: modal.item.grup || '', NRP: modal.item.nrp || '', Nama: modal.item.nama || '', Jabatan: modal.item.jabatan || '', Kompetensi: modal.item.kompetensi || '', Reg: modal.item.reg || '', Exp: modal.item.exp ? toIsoDate(modal.item.exp) : '', Keterangan: modal.item.ket || '' }}
          onClose={() => setModal(null)} onSave={f => savePeng(f, modal.item)} onDelete={() => { const it = modal.item; setModal(null); hidePeng(it); }} />
      )}
      {modal?.type === 'sap' && (
        <FormModal eyebrow={`SAP ${bulanLabel.toUpperCase()}`} title={modal.row ? `Ubah ${modal.row.Nama}` : 'Tambah orang'} fields={sapFields}
          init={Object.fromEntries(sapFields.map(x => [x.key, modal.row?.[x.key] ?? '']))} onClose={() => setModal(null)} onSave={f => saveSapRow(f, modal.row)} onDelete={modal.row ? () => delSapRow(modal.row) : undefined} />
      )}
      {modal?.type === 'insp' && <FormModal eyebrow={`JADWAL INSPEKSI ${bulanLabel.toUpperCase()}`} title="Tambah inspeksi" fields={inspFields} init={{ Inspeksi: '' }} onClose={() => setModal(null)} onSave={addInsp} />}
      {modal?.type === 'target' && <FormModal eyebrow={`TARGET ${ym.y}`} title="Atur objective performance" fields={targetFields} init={target} onClose={() => setModal(null)} onSave={saveTarget} />}
      {modal?.type === 'insiden' && (
        <FormModal eyebrow="CATATAN INSIDEN" title={modal.row ? 'Ubah insiden' : 'Catat insiden'} fields={insidenFields}
          init={modal.row ? Object.fromEntries(insidenFields.map(x => [x.key, x.key === 'Tanggal' ? toIsoDate(modal.row.d) : modal.row[x.key] ?? ''])) : { Tanggal: toIsoDate(new Date(ym.y, ym.m, Math.min(new Date().getDate(), new Date(ym.y, ym.m + 1, 0).getDate()))), Kategori: 'Property Damage' }}
          onClose={() => setModal(null)} onSave={f => saveInsiden(f, modal.row)} onDelete={modal.row ? () => delInsiden(modal.row) : undefined} />
      )}
    </div>
  );
}
