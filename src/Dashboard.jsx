import React, { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { DAY, DEPT, norm, today, avg, fmt, num, val, toDate, daysLeft, yearOf, isLicense, licenseDocs, isResigned, resignedChecker } from './utils.js';
import { computeTraining } from './training.js';
import { KOMPETENSI_PRESET } from './nav.js';
import './dashboard.css';

const ATR_TARGET = 95; // persen; sesuaikan dengan target perusahaan
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

// Sertifikat operasi unit di Data_Karyawan: sel terisi (mis. "V") berarti punya. Sama dengan form Input data.
const CERTS = [['LV', 'LV'], ['Bus', 'BUS'], ['P360', 'P360/CWE'], ['FMX420', 'FMX420'], ['FMX400', 'FMX400'], ['PC210', 'PC210/300'], ['PC350', 'PC350LC'], ['D85', 'D85SS']];
const isOn = v => { const x = String(v ?? '').trim().toLowerCase(); return x !== '' && !['0', '-', 'false', 'tidak', 'no', 'n'].includes(x); };
const UMUR = ['Di bawah 30', '30-39', '40-49', '50 ke atas', 'Belum ada'];
const DARAH = ['A', 'B', 'AB', 'O', 'Belum ada'];

const LP = initial => ({ initial, nav: 'lisensi' }); // membuka halaman Lisensi pada tab tertentu

function Section({ title, tone, module, label, preset, onOpen, children }) {
  // Bagian bisa dilipat (minimize). Status disimpan per judul di browser ini.
  const storeKey = `rep.ringkasan.lipat.${title}`;
  const [shut, setShut] = useState(() => { try { return localStorage.getItem(storeKey) === '1'; } catch { return false; } });
  const toggle = () => setShut(v => { const n = !v; try { localStorage.setItem(storeKey, n ? '1' : '0'); } catch { /* abaikan */ } return n; });
  return (
    <section className="dsec" data-tone={tone} data-shut={shut ? '1' : '0'}>
      <div className="dsec-head">
        <div className="dsec-title">
          <button type="button" className="dsec-toggle" onClick={toggle} aria-expanded={!shut} aria-label={`${shut ? 'Buka' : 'Lipat'} bagian ${title}`} title={shut ? 'Buka' : 'Lipat'}>▾</button>
          <h3>{title}</h3>
        </div>
        <button type="button" className="dsec-open" onClick={() => onOpen(module, preset)}>Buka {label}</button>
      </div>
      {!shut && children}
    </section>
  );
}

function Box({ title, sub, children }) {
  return <div className="profil-box"><h4 className="dsub">{title}</h4>{sub && <p className="subtle">{sub}</p>}{children}</div>;
}

function Card({ label, value, tone, module, preset, onOpen }) {
  return (
    <button type="button" className="dcard" data-tone={tone} onClick={() => onOpen(module, preset)}>
      <b>{value}</b>
      <span>{label}</span>
    </button>
  );
}

function BarList({ items, module, onOpen, suffix = '', max }) {
  const top = max ?? Math.max(1, ...items.map(i => i.value));
  return (
    <div className="bar-list">
      {items.map(i => (
        <button type="button" className="dbar" key={i.name} onClick={() => onOpen(module, i.preset)}>
          <div className="bar-label"><span>{i.name}</span><b>{fmt(i.value, 0)}{suffix}</b></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} /></div>
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ data, loading, hasData, isAdmin, onImport, onRefresh, onOpen }) {
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [win, setWin] = useState(30);
  const open = (module, preset) => onOpen(module, preset || null);

  const D = useMemo(() => {
    const t = today();
    const yr = t.getFullYear();
    const rows = m => data.filter(x => x.module === m).map(x => x.data || {});
    const deptOf = r => val(r, ...DEPT);
    const inDept = r => { if (!dept) return true; const d = deptOf(r); return d === undefined || norm(d) === norm(dept); };
    const statusOk = r => !status || norm(val(r, 'Status Karyawan')) === norm(status);
    const isActive = r => !isResigned(r);
    const gone = resignedChecker(data);
    const empOk = r => inDept(r) && statusOk(r);
    // n = jumlah baris yang cocok, preset = filter yang dipakai saat kartu diklik
    const mk = (arr, label, test, nav) => ({ n: arr.filter(test).length, preset: { label, test, nav } });

    const allEmp = rows('Data_Karyawan');
    const active = allEmp.filter(r => empOk(r) && isActive(r));
    const depts = [...new Set(allEmp.map(deptOf).filter(Boolean).map(String))].sort();
    const statuses = [...new Set(allEmp.map(r => val(r, 'Status Karyawan')).filter(Boolean).map(String))].sort();
    const years = d => active.map(r => toDate(val(r, d))).filter(Boolean).map(x => (t - x) / DAY / 365.25);
    const kd = r => daysLeft(val(r, 'Akhir Kontrak'), t);

    const karyawan = {
      aktif: mk(allEmp, 'Karyawan aktif', r => empOk(r) && isActive(r)),
      umur: avg(years('Tanggal Lahir')),
      masaKerja: avg(years('Tanggal Masuk')),
      soon: mk(allEmp, `Kontrak berakhir ≤ ${win} hari`, r => empOk(r) && isActive(r) && kd(r) !== null && kd(r) >= 0 && kd(r) <= win),
      over: mk(allEmp, 'Kontrak sudah lewat', r => empOk(r) && isActive(r) && kd(r) !== null && kd(r) < 0)
    };

    const comp = rows('Data_Kompetensi').filter(r => !gone(r));
    const ld = r => daysLeft(val(r, 'Expired'), t);
    const kompRows = comp.filter(r => !isLicense(r) && inDept(r));
    const docs = licenseDocs(data).filter(x => empOk(x.row));
    const cnt = f => ({ n: docs.filter(f).length });
    const lisensi = {
      lewat: cnt(x => x.left < 0),
      soon: cnt(x => x.left >= 0 && x.left <= win),
      aktif: cnt(x => x.left > win),
      total: cnt(() => true)
    };
    const soonPeople = new Set(docs.filter(x => x.left >= 0 && x.left <= win).map(x => x.id || x.nama)).size;
    const katMap = new Map();
    kompRows.forEach(r => { const k = String(val(r, 'Kategori') ?? 'Tanpa kategori'); katMap.set(k, (katMap.get(k) || 0) + 1); });
    const kompetensi = {
      total: mk(comp, 'Kompetensi (di luar lisensi)', r => !isLicense(r) && inDept(r), 'kompetensi'),
      soon: mk(comp, `Kompetensi habis ≤ ${win} hari`, r => !isLicense(r) && inDept(r) && ld(r) !== null && ld(r) >= 0 && ld(r) <= win, 'kompetensi'),
      orang: new Set(kompRows.map(r => val(r, 'NRP', 'AMODI', 'NAMA')).filter(Boolean)).size,
      jenis: new Set(kompRows.map(r => norm(val(r, 'Kompetensi'))).filter(Boolean)).size,
      kategori: [...katMap].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({
        name, value, preset: { label: `Kategori ${name}`, nav: 'kompetensi', test: r => !isLicense(r) && inDept(r) && String(val(r, 'Kategori') ?? 'Tanpa kategori') === name }
      }))
    };

    const colOf = (arr, re) => Object.keys(arr[0] || {}).find(k => re.test(k));
    const colSum = (arr, re) => { const k = colOf(arr, re); return k ? arr.reduce((s, r) => s + (num(r[k]) || 0), 0) : null; };
    const kebutuhan = rows('Data_Kebutuhan').filter(r => inDept(r) && !/^total/i.test(String(val(r, ...DEPT) ?? '')));
    const mpPlan = colSum(kebutuhan, /kebutuhan|plan|target|formasi/i);
    const mpAkt = colSum(kebutuhan, /aktual|actual|eksisting|existing|terisi/i);
    const manpower = {
      plan: mpPlan, aktual: mpAkt,
      rate: mpPlan > 0 && mpAkt !== null ? (mpAkt / mpPlan) * 100 : null,
      kurang: mpPlan !== null && mpAkt !== null ? Math.max(mpPlan - mpAkt, 0) : null,
      pica: mk(rows('Data_PICA'), 'PICA masih terbuka', r => !/(closed|close|selesai|complete|completed)/i.test(String(val(r, 'Status') ?? '')), 'manpower')
    };

    const units = rows('Data_Unit');
    const veh = rows('Data_LV & Bus');
    const jenisKey = colOf(units, /^(jenis|tipe|type|kategori)/i);
    const jm = new Map();
    if (jenisKey) units.forEach(r => { const j = String(r[jenisKey] ?? '').trim(); if (j) jm.set(j, (jm.get(j) || 0) + 1); });
    const due = (r, re) => Object.keys(r).some(k => { if (!re.test(k) || /mulai|awal/i.test(k)) return false; const x = daysLeft(r[k], t); return x !== null && x <= win; });
    const unit = {
      total: units.length, kendaraan: veh.length,
      jenis: [...jm].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, value]) => ({ name, value, preset: { label: `Unit ${name}`, nav: 'unit', test: r => String(r[jenisKey] ?? '').trim() === name } })),
      komis: mk(units, 'Komisioning lewat/segera', r => due(r, /komisioning|commissioning/i), 'unit'),
      dok: mk(veh, 'Dokumen kendaraan lewat/segera', r => due(r, /stnk|kir|pajak|expired|berlaku|habis/i), 'unit')
    };

    const atrRows = rows('Data_ATR').filter(r => !gone(r));
    const pct = v => { const n = num(v); return n === null ? null : n <= 1.5 ? n * 100 : n; };
    const ytd = r => pct(val(r, 'YTD'));
    const monthly = MONTHS.map(m => ({ m, v: avg(atrRows.filter(inDept).map(r => pct(val(r, m))).filter(x => x !== null)) }));
    const last = [...monthly].reverse().find(x => x.v !== null);
    const atr = {
      ytd: avg(atrRows.filter(inDept).map(ytd).filter(x => x !== null)),
      ok: mk(atrRows, `ATR ≥ ${ATR_TARGET}%`, r => inDept(r) && ytd(r) !== null && ytd(r) >= ATR_TARGET),
      low: mk(atrRows, `ATR < ${ATR_TARGET}%`, r => inDept(r) && ytd(r) !== null && ytd(r) < ATR_TARGET),
      total: mk(atrRows, 'Semua karyawan ATR', inDept),
      monthly, last
    };

    const masuk = mk(allEmp, `Masuk ${yr}`, r => empOk(r) && yearOf(val(r, 'Tanggal Masuk')) === yr);
    const keluar = mk(rows('Data_Resign'), `Keluar ${yr}`, r => inDept(r) && yearOf(val(r, 'Tanggal Resign')) === yr);
    const headStart = active.length - masuk.n + keluar.n;
    const avgHead = (headStart + active.length) / 2;
    const turnover = { masuk, keluar, rate: avgHead > 0 ? (keluar.n / avgHead) * 100 : null };

    const rec = rows('Data_Rekrutmen');
    const hasil = r => String(val(r, 'Hasil Akhir') ?? '');
    const DONE = /diterima|hired|join/i;
    const NO = /tolak|reject|gagal/i;
    const rekrutmen = {
      total: mk(rec, 'Semua kandidat', () => true),
      proses: mk(rec, 'Kandidat dalam proses', r => !DONE.test(hasil(r)) && !NO.test(hasil(r))),
      diterima: mk(rec, 'Kandidat diterima', r => DONE.test(hasil(r))),
      ditolak: mk(rec, 'Kandidat ditolak', r => NO.test(hasil(r))),
      tth: avg(rec.map(r => num(val(r, 'Time to Hire (Hari)'))).filter(x => x !== null))
    };

    const kon = rows('Data_Kontrak');
    const yrKon = r => inDept(r) && yearOf(val(r, 'Awal Kontrak')) === yr;
    const ket = r => String(val(r, 'Keterangan') ?? '');
    const kontrak = {
      tahun: mk(kon, `Kontrak dicatat ${yr}`, yrKon),
      panjang: mk(kon, `Perpanjangan ${yr}`, r => yrKon(r) && /perpanjang/i.test(ket(r))),
      baru: mk(kon, `Kontrak baru ${yr}`, r => yrKon(r) && /baru/i.test(ket(r))),
      tetap: mk(kon, `Menjadi PKWTT ${yr}`, r => yrKon(r) && /pkwtt|tetap|permanen/i.test(ket(r)))
    };

    const sp = rows('REKAP_SP');
    const spYr = r => inDept(r) && yearOf(val(r, 'TANGGAL')) === yr;
    const spAktif = r => {
      const s = num(val(r, 'SISA PEMBINAAN'));
      return s !== null ? s > 0 : /aktif|berlaku/i.test(String(val(r, 'STATUS') ?? ''));
    };
    const jenis = new Map();
    sp.filter(spYr).forEach(r => { const j = String(val(r, 'JENIS PEMBINAAN') ?? 'Lainnya'); jenis.set(j, (jenis.get(j) || 0) + 1); });
    const pembinaan = {
      tahun: mk(sp, `Pembinaan ${yr}`, spYr),
      aktif: mk(sp, 'Pembinaan masih berlaku', r => inDept(r) && spAktif(r)),
      orang: new Set(sp.filter(spYr).map(r => val(r, 'NRP', 'AMODI', 'NAMA'))).size,
      jenis: [...jenis].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({
        name, value, preset: { label: `${name} ${yr}`, test: r => spYr(r) && String(val(r, 'JENIS PEMBINAAN') ?? 'Lainnya') === name }
      }))
    };

    const training = computeTraining(data, inDept);

    const byDept = new Map();
    allEmp.filter(r => statusOk(r) && isActive(r)).forEach(r => { const d = String(deptOf(r) ?? 'Tidak diketahui'); byDept.set(d, (byDept.get(d) || 0) + 1); });
    const deptBars = [...byDept].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({
      name, value, preset: { label: `Karyawan aktif ${name}`, test: r => norm(deptOf(r)) === norm(name) && isActive(r) && statusOk(r) }
    }));

    // ---- Profil karyawan (karyawan aktif, mengikuti filter Departemen dan Status) ----
    const activeTest = r => empOk(r) && isActive(r);
    const txt = (cols, kosong = 'Belum ada') => r => { const v = String(val(r, ...cols) ?? '').trim(); return v && v !== '-' ? v : kosong; };
    const byCount = (a, b) => b[1] - a[1];
    const byName = (a, b) => (a[0] === 'Belum ada' ? -1 : b[0] === 'Belum ada' ? 1 : a[0].localeCompare(b[0], 'id', { numeric: true }));
    const byOrder = list => (a, b) => list.indexOf(a[0]) - list.indexOf(b[0]);
    const bars = (fn, label, sort) => {
      const m = new Map();
      active.forEach(r => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); });
      return [...m].sort(sort).map(([name, value]) => ({ name, value, preset: { label: `${label}: ${name}`, test: r => activeTest(r) && fn(r) === name } }));
    };
    const ageOf = r => { const d = toDate(val(r, 'Tanggal Lahir')); return d ? (t - d) / DAY / 365.25 : null; };
    const umurGrup = r => { const a = ageOf(r); return a === null ? 'Belum ada' : a < 30 ? 'Di bawah 30' : a < 40 ? '30-39' : a < 50 ? '40-49' : '50 ke atas'; };
    const jabAll = bars(txt(['Jabatan'], 'Tanpa jabatan'), 'Jabatan', byCount);
    const jabRest = jabAll.slice(12);
    const jabTxt = txt(['Jabatan'], 'Tanpa jabatan');
    const jabatan = jabRest.length
      ? [...jabAll.slice(0, 12), { name: `Jabatan lainnya (${jabRest.length})`, value: jabRest.reduce((s, x) => s + x.value, 0), preset: { label: 'Jabatan lainnya', test: r => activeTest(r) && jabRest.some(x => x.name === jabTxt(r)) } }]
      : jabAll;
    const lengkap = (label, ...cols) => {
      const ok = r => { const v = val(r, ...cols); return v !== undefined && String(v).trim() !== ''; };
      return { name: label, value: active.filter(ok).length, preset: { label: `Belum ada ${label.toLowerCase()}`, test: r => activeTest(r) && !ok(r) } };
    };
    const lisensiJenis = new Map();
    docs.filter(x => x.left >= 0 && x.left <= win).forEach(x => lisensiJenis.set(x.type, (lisensiJenis.get(x.type) || 0) + 1));
    const profil = {
      total: active.length,
      lisensi: [...lisensiJenis].sort(byCount).map(([name, value]) => ({ name, value, preset: LP('segera') })),
      kelengkapan: [lengkap('Tanggal lahir', 'Tanggal Lahir'), lengkap('Tanggal masuk', 'Tanggal Masuk'), lengkap('Status karyawan', 'Status Karyawan'), lengkap('Email', 'Email'),
        lengkap('Golongan darah', 'Gol. Darah'), lengkap('Ring domisili', 'Ring'), lengkap('Alamat domisili', 'Domisili')],
      jabatan,
      pendidikan: bars(txt(['Pendidikan']), 'Pendidikan', byCount),
      ring: bars(txt(['Ring']), 'Ring', byName),
      umur: bars(umurGrup, 'Kelompok umur', byOrder(UMUR)),
      darah: bars(r => String(val(r, 'Gol. Darah') ?? '').trim().toUpperCase() || 'Belum ada', 'Golongan darah', byOrder(DARAH)),
      sertifikat: CERTS.map(([k, l]) => ({ name: l, value: active.filter(r => isOn(val(r, k))).length, preset: { label: `Sertifikat ${l}`, test: r => activeTest(r) && isOn(val(r, k)) } }))
    };

    return { yr, depts, statuses, karyawan, profil, lisensi, kompetensi, manpower, unit, soonPeople, atr, turnover, rekrutmen, kontrak, pembinaan, training, deptBars };
  }, [data, dept, status, win]);

  const n = x => fmt(x.n, 0);
  const { karyawan: K, profil: PF, lisensi: L, kompetensi: KM, manpower: MP, unit: U, atr: A, turnover: T, rekrutmen: R, kontrak: C, pembinaan: P, training: TR } = D;

  return (
    <div className="page-content dash">
      <div className="dash-top">
        <div>
          <h1>Ringkasan</h1>
          <p className="subtle">Klik kartu mana pun untuk langsung membuka datanya.</p>
        </div>
        <div className="dash-filters">
          <label>Departemen<select value={dept} onChange={e => setDept(e.target.value)}><option value="">Semua</option>{D.depts.map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Status karyawan<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua</option>{D.statuses.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Kedaluwarsa<select value={win} onChange={e => setWin(Number(e.target.value))}>{[30, 60, 90].map(d => <option key={d} value={d}>{d} hari</option>)}</select></label>
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      {!hasData && !loading && (
        <div className="import-banner"><div className="banner-icon"><Icon name="upload" size={20} /></div><div><strong>Data belum diimpor ke database</strong><p>Administrator dapat mengunggah file Excel untuk mengisi seluruh dashboard.</p></div>{isAdmin && <button className="btn primary" onClick={onImport}>Impor file Excel</button>}</div>
      )}

      <Section title="Karyawan" tone="blue" module="Data_Karyawan" label="Karyawan" onOpen={open}>
        <div className="dgrid">
          <Card label="Karyawan aktif" value={n(K.aktif)} tone="blue" module="Data_Karyawan" preset={K.aktif.preset} onOpen={open} />
          <Card label="Rata-rata umur" value={K.umur === null ? '—' : `${fmt(K.umur)} th`} tone="blue" module="Data_Karyawan" onOpen={open} />
          <Card label="Rata-rata masa kerja" value={K.masaKerja === null ? '—' : `${fmt(K.masaKerja)} th`} tone="blue" module="Data_Karyawan" onOpen={open} />
          <Card label={`Kontrak berakhir ≤ ${win} hari`} value={n(K.soon)} tone="amber" module="Data_Karyawan" preset={K.soon.preset} onOpen={open} />
          <Card label="Kontrak sudah lewat" value={n(K.over)} tone="red" module="Data_Karyawan" preset={K.over.preset} onOpen={open} />
        </div>
      </Section>

      <Section title="Profil karyawan" tone="blue" module="Data_Karyawan" label="Karyawan" onOpen={open}>
        <p className="subtle">Karyawan aktif ({fmt(PF.total, 0)} orang) menurut jabatan, pendidikan, ring, umur, golongan darah, sertifikat, lisensi, dan kelengkapan data. Klik batang untuk membuka datanya.</p>
        <div className="profil-grid">
          <Box title="Karyawan per departemen" sub="Karyawan aktif.">
            {D.deptBars.length ? <BarList items={D.deptBars} module="Data_Karyawan" onOpen={open} /> : <p className="subtle">Belum ada data karyawan.</p>}
          </Box>
          <Box title="Lisensi per jenis" sub={`Dokumen yang habis dalam ${win} hari.`}>
            {PF.lisensi.length ? <BarList items={PF.lisensi} module="Lisensi" onOpen={open} /> : <p className="subtle">Tidak ada lisensi yang habis dalam {win} hari.</p>}
          </Box>
          <Box title="Kelengkapan data" sub="Jumlah karyawan yang sudah terisi. Klik batang untuk melihat yang belum terisi.">
            <BarList items={PF.kelengkapan} module="Data_Karyawan" onOpen={open} max={Math.max(1, PF.total)} />
          </Box>
          <Box title="Karyawan per jabatan"><BarList items={PF.jabatan} module="Data_Karyawan" onOpen={open} /></Box>
          <Box title="Pendidikan terakhir" sub="Jumlah karyawan per jenjang."><BarList items={PF.pendidikan} module="Data_Karyawan" onOpen={open} /></Box>
          <Box title="Ring domisili" sub="Sebaran karyawan per ring."><BarList items={PF.ring} module="Data_Karyawan" onOpen={open} /></Box>
          <Box title="Kelompok umur" sub="Berdasarkan tanggal lahir."><BarList items={PF.umur} module="Data_Karyawan" onOpen={open} /></Box>
          <Box title="Golongan darah" sub="Karyawan yang datanya tersedia."><BarList items={PF.darah} module="Data_Karyawan" onOpen={open} /></Box>
          <Box title="Karyawan bersertifikat operasi unit" sub="Jumlah karyawan per jenis sertifikat."><BarList items={PF.sertifikat} module="Data_Karyawan" onOpen={open} /></Box>
        </div>
      </Section>

      <Section title="Database manpower" tone="teal" module="Data_Kebutuhan" label="Database Manpower" onOpen={open}>
        <div className="dgrid">
          <Card label="Pemenuhan manpower" value={MP.rate === null ? '—' : `${fmt(MP.rate)}%`} tone="green" module="Data_Kebutuhan" onOpen={open} />
          <Card label="Plan kebutuhan" value={MP.plan === null ? '—' : fmt(MP.plan, 0)} tone="blue" module="Data_Kebutuhan" onOpen={open} />
          <Card label="Aktual terisi" value={MP.aktual === null ? '—' : fmt(MP.aktual, 0)} tone="blue" module="Data_Kebutuhan" onOpen={open} />
          <Card label="Kekurangan" value={MP.kurang === null ? '—' : fmt(MP.kurang, 0)} tone="red" module="Data_Kebutuhan" onOpen={open} />
          <Card label="PICA masih terbuka" value={n(MP.pica)} tone="amber" module="Data_PICA" preset={MP.pica.preset} onOpen={open} />
        </div>
      </Section>

      <Section title="Lisensi" tone="green" module="Lisensi" label="Lisensi" onOpen={open}>
        <div className="dgrid">
          <Card label="Sudah lewat" value={n(L.lewat)} tone="red" module="Lisensi" preset={LP('lewat')} onOpen={open} />
          <Card label={`Habis dalam ${win} hari`} value={n(L.soon)} tone="amber" module="Lisensi" preset={LP('segera')} onOpen={open} />
          <Card label="Masih aktif" value={n(L.aktif)} tone="green" module="Lisensi" preset={LP('aktif')} onOpen={open} />
          <Card label="Total dokumen" value={n(L.total)} tone="gray" module="Lisensi" preset={LP('semua')} onOpen={open} />
        </div>
      </Section>

      <Section title="Kompetensi" tone="violet" module="Data_Kompetensi" label="Kompetensi" preset={KOMPETENSI_PRESET} onOpen={open}>
        <div className="dgrid">
          <Card label="Catatan kompetensi" value={n(KM.total)} tone="violet" module="Data_Kompetensi" preset={KM.total.preset} onOpen={open} />
          <Card label="Karyawan berkompetensi" value={fmt(KM.orang, 0)} tone="blue" module="Data_Kompetensi" preset={KM.total.preset} onOpen={open} />
          <Card label="Jenis kompetensi" value={fmt(KM.jenis, 0)} tone="blue" module="Data_Kompetensi" preset={KM.total.preset} onOpen={open} />
          <Card label={`Habis dalam ${win} hari`} value={n(KM.soon)} tone="amber" module="Data_Kompetensi" preset={KM.soon.preset} onOpen={open} />
        </div>
        {KM.kategori.length > 0 && <><h4 className="dsub">Catatan per kategori</h4><BarList items={KM.kategori} module="Data_Kompetensi" onOpen={open} /></>}
      </Section>

      <Section title="Kehadiran (ATR)" tone="teal" module="Data_ATR" label="ATR" onOpen={open}>
        <div className="dgrid">
          <Card label="Rata-rata ATR YTD" value={A.ytd === null ? '—' : `${fmt(A.ytd)}%`} tone="green" module="Data_ATR" onOpen={open} />
          <Card label={`Di atas target (${ATR_TARGET}%)`} value={n(A.ok)} tone="green" module="Data_ATR" preset={A.ok.preset} onOpen={open} />
          <Card label="Di bawah target" value={n(A.low)} tone="red" module="Data_ATR" preset={A.low.preset} onOpen={open} />
          <Card label={A.last ? `Rata-rata ATR ${A.last.m}` : 'Rata-rata bulan terakhir'} value={A.last ? `${fmt(A.last.v)}%` : '—'} tone="blue" module="Data_ATR" onOpen={open} />
          <Card label="Karyawan" value={n(A.total)} tone="gray" module="Data_ATR" preset={A.total.preset} onOpen={open} />
        </div>
        {A.monthly.some(x => x.v !== null) && (
          <div className="atr-chart" role="group" aria-label="Rata-rata ATR per bulan">
            {A.monthly.map(x => (
              <button type="button" key={x.m} className="atr-col" disabled={x.v === null} onClick={() => open('Data_ATR')} title={x.v === null ? 'Belum ada data' : `${x.m}: ${fmt(x.v)}%`}>
                <span className="atr-val">{x.v === null ? '' : `${fmt(x.v)}%`}</span>
                <span className="atr-bar" style={{ height: `${x.v === null ? 0 : Math.min(100, x.v)}%` }} />
                <span className="atr-lbl">{x.m}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Turnover" tone="red" module="Data_Resign" label="Turnover" onOpen={open}>
        <div className="dgrid">
          <Card label="Karyawan aktif" value={n(K.aktif)} tone="blue" module="Data_Karyawan" preset={K.aktif.preset} onOpen={open} />
          <Card label={`Masuk ${D.yr}`} value={n(T.masuk)} tone="green" module="Data_Karyawan" preset={T.masuk.preset} onOpen={open} />
          <Card label={`Keluar ${D.yr}`} value={n(T.keluar)} tone="red" module="Data_Resign" preset={T.keluar.preset} onOpen={open} />
          <Card label={`Turnover ${D.yr}`} value={T.rate === null ? '—' : `${fmt(T.rate)}%`} tone="amber" module="Data_Resign" onOpen={open} />
        </div>
      </Section>

      <Section title="Unit" tone="gray" module="Data_Unit" label="Unit" onOpen={open}>
        <div className="dgrid">
          <Card label="Total unit" value={fmt(U.total, 0)} tone="gray" module="Data_Unit" onOpen={open} />
          {U.jenis.map(j => <Card key={j.name} label={j.name} value={fmt(j.value, 0)} tone="gray" module="Data_Unit" preset={j.preset} onOpen={open} />)}
          <Card label="Komisioning lewat/segera" value={n(U.komis)} tone="amber" module="Data_Unit" preset={U.komis.preset} onOpen={open} />
          <Card label="LV & Bus" value={fmt(U.kendaraan, 0)} tone="gray" module="Data_LV & Bus" onOpen={open} />
          <Card label="Dokumen kendaraan lewat/segera" value={n(U.dok)} tone="red" module="Data_LV & Bus" preset={U.dok.preset} onOpen={open} />
        </div>
      </Section>

      <Section title="Rekrutmen" tone="violet" module="Data_Rekrutmen" label="Rekrutmen" onOpen={open}>
        <div className="dgrid">
          <Card label="Total kandidat" value={n(R.total)} tone="violet" module="Data_Rekrutmen" onOpen={open} />
          <Card label="Sedang diproses" value={n(R.proses)} tone="amber" module="Data_Rekrutmen" preset={R.proses.preset} onOpen={open} />
          <Card label="Diterima" value={n(R.diterima)} tone="green" module="Data_Rekrutmen" preset={R.diterima.preset} onOpen={open} />
          <Card label="Ditolak" value={n(R.ditolak)} tone="red" module="Data_Rekrutmen" preset={R.ditolak.preset} onOpen={open} />
          <Card label="Rata-rata time to hire" value={R.tth === null ? '—' : `${fmt(R.tth)} hari`} tone="blue" module="Data_Rekrutmen" onOpen={open} />
        </div>
      </Section>

      <Section title="Kontrak" tone="teal" module="Data_Kontrak" label="Kontrak" onOpen={open}>
        <div className="dgrid">
          <Card label={`Kontrak dicatat ${D.yr}`} value={n(C.tahun)} tone="teal" module="Data_Kontrak" preset={C.tahun.preset} onOpen={open} />
          <Card label="Perpanjangan" value={n(C.panjang)} tone="blue" module="Data_Kontrak" preset={C.panjang.preset} onOpen={open} />
          <Card label="Kontrak baru" value={n(C.baru)} tone="green" module="Data_Kontrak" preset={C.baru.preset} onOpen={open} />
          <Card label="Menjadi PKWTT" value={n(C.tetap)} tone="violet" module="Data_Kontrak" preset={C.tetap.preset} onOpen={open} />
        </div>
      </Section>

      <Section title="Training (TNA)" tone="amber" module="Training" label="Training" onOpen={open}>
        <div className="dgrid">
          <Card label="Pemenuhan training" value={TR.rate === null ? '—' : `${fmt(TR.rate)}%`} tone="amber" module="Training" onOpen={open} />
          <Card label="Plan training" value={fmt(TR.totalPlan, 0)} tone="blue" module="Training" onOpen={open} />
          <Card label="Training selesai" value={fmt(TR.totalDone, 0)} tone="green" module="Training" onOpen={open} />
          <Card label="Jenis training tuntas" value={fmt(TR.tuntas, 0)} tone="green" module="Training" onOpen={open} />
          <Card label="Karyawan punya training tertunda" value={fmt(TR.pendingPeople, 0)} tone="red" module="Training" onOpen={open} />
        </div>
      </Section>

      <Section title="Pembinaan karyawan" tone="red" module="REKAP_SP" label="Pembinaan" onOpen={open}>
        <div className="dgrid">
          <Card label={`Kasus pembinaan ${D.yr}`} value={n(P.tahun)} tone="red" module="REKAP_SP" preset={P.tahun.preset} onOpen={open} />
          <Card label="Masih berlaku" value={n(P.aktif)} tone="amber" module="REKAP_SP" preset={P.aktif.preset} onOpen={open} />
          <Card label="Karyawan terkait" value={fmt(P.orang, 0)} tone="blue" module="REKAP_SP" preset={P.tahun.preset} onOpen={open} />
        </div>
        {P.jenis.length > 0 && <><h4 className="dsub">Kasus per jenis ({D.yr})</h4><BarList items={P.jenis} module="REKAP_SP" onOpen={open} /></>}
      </Section>
    </div>
  );
}
