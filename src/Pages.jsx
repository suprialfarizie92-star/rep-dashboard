import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { getKey, digits } from './KandidatForm.jsx';
import { DAY, avg, daysLeft, fmt, isLicense, norm, num, toDate, today, val, yearOf } from './utils.js';
import './dashboard.css';
import './pages.css';

const ATR_TARGET = 95; // persen
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const TONE = { lewat: 'red', segera: 'amber', aktif: 'green', none: 'gray' };
const LBL = { lewat: 'Lewat', segera: 'Segera', aktif: 'Aktif', none: 'Tanpa masa berlaku' };
const MARK = { lewat: '✕', segera: '⚠', aktif: '✓', none: '' };

const fd = v => { const d = v instanceof Date ? v : toDate(v); return d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const rowsOf = (data, m) => data.filter(x => x.module === m).map(x => x.data || {});
const pick = (r, re) => { const k = Object.keys(r).find(x => re.test(x)); return k === undefined || r[k] === '' || r[k] === null ? undefined : r[k]; };
const stOf = (left, win) => (left === null ? 'none' : left < 0 ? 'lewat' : left <= win ? 'segera' : 'aktif');
const sisa = left => (left === null ? '' : left < 0 ? `Lewat ${-left} hari` : left === 0 ? 'Hari ini' : `${left} hari lagi`);
const hay = (...a) => a.map(norm).join(' ');
const cmpLeft = (a, b) => (a.left === null ? 1 : b.left === null ? -1 : a.left - b.left);
const RAW = (nav, test, label) => ({ raw: true, nav, label: label || 'Semua data', test: test || (() => true) });
const count = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
const uniq = (arr, f) => [...new Set(arr.map(f).filter(Boolean).map(String))].sort();
const pctOf = v => { const n = num(v); return n === null ? null : n <= 1.5 ? n * 100 : n; };
const monthsBetween = (a, b) => { let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); if (b.getDate() < a.getDate()) m--; return Math.max(m, 0); };
const masaKerja = (a, b) => { const m = monthsBetween(a, b); return `${Math.floor(m / 12)} Tahun ${m % 12} Bulan`; };

/* ---------- komponen bersama ---------- */
const Wrap = ({ loading, data, children }) => (
  <div className="page-content dash">{loading && !data.length ? <div className="loading-state"><div className="spinner" />Memuat data...</div> : children}</div>
);
const Head = ({ title, sub, children }) => (
  <div className="dash-top"><div><h1>{title}</h1><p className="subtle">{sub}</p></div><div className="dash-filters">{children}</div></div>
);
const WinSel = ({ win, setWin }) => (
  <label>Batas peringatan<select value={win} onChange={e => setWin(Number(e.target.value))}>{[30, 60, 90].map(d => <option key={d} value={d}>{d} hari</option>)}</select></label>
);
const YearSel = ({ years, value, set, all }) => (
  <label>Tahun<select value={value} onChange={e => set(e.target.value)}>{all && <option value="">Semua</option>}{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
);
const Refresh = ({ onRefresh }) => <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>;
const Cards = ({ items }) => (
  <div className="dgrid">{items.map((c, i) => c.go
    ? <button type="button" key={i} className={`dcard${c.on ? ' on' : ''}`} data-tone={c.t} onClick={c.go} aria-pressed={!!c.on}><b>{c.v}</b><span>{c.l}</span></button>
    : <div key={i} className="dcard static" data-tone={c.t}><b>{c.v}</b><span>{c.l}</span></div>)}</div>
);
const Panel = ({ title, sub, right, children }) => (
  <section className="panel tr-panel">
    {(title || right) && <div className="pn-head"><div>{title && <h3 className="pn-title">{title}</h3>}{sub && <p className="pn-sub">{sub}</p>}</div>{right}</div>}
    {children}
  </section>
);
const Bdg = ({ s, tone, text }) => <span className="badge" data-tone={tone || TONE[s]}>{s ? `${MARK[s]} ` : ''}{text ?? LBL[s]}</span>;
const who = (nama, id) => <div className="lic-name"><strong>{nama || '—'}</strong><small>{id || '—'}</small></div>;

function Bars({ items, max, empty = 'Belum ada data.' }) {
  const top = max ?? Math.max(1, ...items.map(i => i.value));
  if (!items.length) return <p className="subtle">{empty}</p>;
  return <div className="bar-list">{items.map(i => (
    <div className="hbar" key={i.name}>
      <div><span>{i.name}</span>{i.sub && <small>{i.sub}</small>}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (i.value / top) * 100)}%`, ...(i.color ? { background: i.color } : {}) }} /></div>
      <b>{i.text ?? fmt(i.value, 0)}</b>
    </div>
  ))}</div>;
}

function Columns({ items, max, base = 0 }) {
  const top = max ?? Math.max(1, ...items.map(i => i.v ?? 0));
  return <div className="atr-chart">{items.map(i => {
    const on = i.v !== null && i.v !== undefined;
    return <div key={i.lbl} className="atr-col" style={on ? undefined : { opacity: 0.35 }}>
      <span className="atr-val">{on ? i.text ?? fmt(i.v, 0) : ''}</span>
      <div className="atr-bar" style={{ height: `${on ? Math.max(2, ((i.v - base) / (top - base || 1)) * 100) : 0}%` }} />
      <span className="atr-lbl">{i.lbl}</span>
    </div>;
  })}</div>;
}

function Tbl({ cols, rows, onRow, limit0 = 25, empty }) {
  const [n, setN] = useState(limit0);
  return <>
    <div className="tr-scroll" style={{ maxHeight: 560 }}>
      <table className="ttable">
        <thead><tr>{cols.map(c => <th key={c.h} className={c.num ? 'num' : ''}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, n).map(r => (
          <tr key={r.k} className={onRow ? 'trow' : ''} onClick={onRow ? () => onRow(r) : undefined}>{cols.map(c => <td key={c.h} className={c.num ? 'num' : ''}>{c.r(r)}</td>)}</tr>
        ))}</tbody>
      </table>
      {!rows.length && <div className="no-results">{empty || 'Tidak ada data yang cocok dengan filter ini.'}</div>}
    </div>
    {rows.length > n && <div className="more"><button type="button" className="btn light" onClick={() => setN(n + 25)}>Tampilkan lebih banyak ({rows.length - n} lagi)</button></div>}
  </>;
}

function Bar({ q, setQ, ph, tabs, tab, setTab, selects = [], total }) {
  return <div className="lic-bar">
    <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder={ph} aria-label={ph} />
    {tabs && <div className="seg-tabs" role="group">{tabs.map(([k, l]) => <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>}
    {selects.map(s => <select key={s.l} className="dash-select" value={s.v} onChange={e => s.set(e.target.value)} aria-label={s.l}><option value="">{s.l}</option>{s.opts.map(o => <option key={o}>{o}</option>)}</select>)}
    <span className="count">{total}</span>
  </div>;
}

function DCell({ v, win }) {
  const d = toDate(v);
  if (!d) return <span className="muted-cell">—</span>;
  const left = Math.round((d - today()) / DAY);
  const s = stOf(left, win);
  return <div className="lic-name"><span className="badge" data-tone={TONE[s]}>{MARK[s]} {fd(d)}</span><small>{left < 0 ? `Lewat ${-left} hari` : `${left} hari lagi`}</small></div>;
}

/* ---------- kebutuhan manpower (dipakai Database Manpower dan Rekrutmen) ---------- */
function needsOf(data) {
  const map = new Map();
  rowsOf(data, 'Data_Kebutuhan').forEach(r => {
    if (/^total/i.test(String(val(r, 'Departemen', 'Department', 'Departement') ?? ''))) return;
    const jab = pick(r, /jabatan|position|posisi/i);
    if (!jab) return;
    const e = map.get(jab) || { jab: String(jab), plan: 0, akt: 0, n: 0, shift: undefined };
    e.plan += num(pick(r, /kebutuhan|plan|target|formasi/i)) || 0;
    e.akt += num(pick(r, /aktual|actual|eksisting|existing|terisi/i)) || 0;
    e.n += 1; e.shift = e.shift ?? pick(r, /shift/i);
    map.set(jab, e);
  });
  return [...map.values()].map(e => ({ ...e, kurang: Math.max(e.plan - e.akt, 0), sub: `${e.shift === undefined ? '' : e.n > 1 ? `${e.n} Shift · ` : /non/i.test(String(e.shift)) ? 'Non Shift · ' : '1 Shift · '}${fmt(e.akt, 0)} dari ${fmt(e.plan, 0)}` }))
    .sort((a, b) => b.kurang - a.kurang || b.plan - a.plan);
}

/* ============ KOMPETENSI ============ */
function KompetensiPage({ data, loading, onRefresh, onOpen }) {
  const [win, setWin] = useState(30); const [tab, setTab] = useState('semua'); const [q, setQ] = useState('');
  const [kat, setKat] = useState(''); const [kom, setKom] = useState('');
  const all = useMemo(() => {
    const t = today();
    return rowsOf(data, 'Data_Kompetensi').filter(r => !isLicense(r)).map((r, i) => ({
      k: i, nama: val(r, 'NAMA', 'Nama'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'JABATAN', 'Jabatan'), kom: val(r, 'Kompetensi'), kat: val(r, 'Kategori'),
      reg: val(r, 'No. Registrasi'), ket: val(r, 'Keterangan'), exp: toDate(val(r, 'Expired')), left: daysLeft(val(r, 'Expired'), t)
    })).sort(cmpLeft);
  }, [data]);
  const s = it => stOf(it.left, win);
  const n = st => all.filter(it => s(it) === st).length;
  const needle = norm(q);
  const rows = all.filter(it => {
    const st = s(it);
    if (tab === 'perhatian' ? !(st === 'lewat' || st === 'segera') : tab !== 'semua' && st !== tab) return false;
    if ((kat && it.kat !== kat) || (kom && it.kom !== kom)) return false;
    return !needle || hay(it.nama, it.id, it.reg, it.kom).includes(needle);
  });
  const card = (v, l, t, to) => ({ v: fmt(v, 0), l, t, go: () => setTab(to), on: tab === to });
  const edit = it => onOpen('Data_Kompetensi', RAW('kompetensi', r => String(val(r, 'AMODI', 'NRP') ?? '') === String(it.id ?? '') && norm(val(r, 'Kompetensi')) === norm(it.kom), `${it.kom || 'Kompetensi'} • ${it.nama || it.id}`));
  return <Wrap loading={loading} data={data}>
    <Head title="Kompetensi" sub="Sertifikat kompetensi pengawas dan tenaga teknis beserta masa berlakunya. Klik baris untuk memperbarui."><WinSel win={win} setWin={setWin} /><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[card(n('lewat'), 'Sudah lewat', 'red', 'lewat'), card(n('segera'), `Habis dalam ${win} hari`, 'amber', 'segera'), card(n('aktif'), 'Masih aktif', 'green', 'aktif'), card(n('none'), 'Tanpa masa berlaku / dalam proses', 'gray', 'none'), { v: fmt(new Set(all.map(i => i.id || i.nama)).size, 0), l: 'Karyawan bersertifikat', t: 'violet' }]} />
    <Panel>
      <Bar q={q} setQ={setQ} ph="Cari nama, AMODI, atau nomor regist" tab={tab} setTab={setTab} total={`${rows.length} sertifikat`}
        tabs={[['semua', 'Semua'], ['perhatian', 'Perlu perhatian'], ['lewat', 'Lewat'], ['segera', 'Segera'], ['aktif', 'Aktif'], ['none', 'Tanpa masa berlaku']]}
        selects={[{ l: 'Semua kategori', v: kat, set: setKat, opts: uniq(all, i => i.kat) }, { l: 'Semua kompetensi', v: kom, set: setKom, opts: uniq(all, i => i.kom) }]} />
      <button type="button" className="btn primary" style={{ marginBottom: 12 }} onClick={() => onOpen('Data_Kompetensi', RAW('kompetensi', r => !isLicense(r), 'Kompetensi (di luar lisensi)'))}>Tambah kompetensi</button>
      <Tbl rows={rows} onRow={edit} cols={[
        { h: 'Nama', r: i => who(i.nama, i.id) }, { h: 'Jabatan', r: i => i.jab || '—' }, { h: 'Kompetensi', r: i => i.kom || '—' }, { h: 'Kategori', r: i => i.kat || '—' },
        { h: 'No. registrasi', r: i => i.reg || '—' }, { h: 'Expired', r: i => fd(i.exp) }, { h: 'Sisa waktu', r: i => sisa(i.left) || '—' },
        { h: 'Status', r: i => <Bdg s={s(i)} /> }, { h: 'Keterangan', r: i => i.ket || '' }]} />
    </Panel>
  </Wrap>;
}

/* ============ UNIT ============ */
function UnitPage({ data, loading, onRefresh, onOpen }) {
  const [win, setWin] = useState(30);
  const { units, veh } = useMemo(() => {
    const t = today();
    const mk = d => (d ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : null);
    const units = rowsOf(data, 'Data_Unit').map((r, i) => {
      const kom = toDate(pick(r, /komisioning|commissioning/i));
      const exp = toDate(pick(r, /masa\s*berlaku|berlaku|expired|habis/i)) || mk(kom);
      return { k: i, cn: pick(r, /^cn/i), eq: pick(r, /^(equipment|jenis|tipe|type)/i), model: pick(r, /^model/i), thn: pick(r, /^(tahun|year)/i), remark: pick(r, /^remark/i), ket: pick(r, /^(keterangan|ket)/i), kom, exp, left: exp ? Math.round((exp - t) / DAY) : null };
    }).sort(cmpLeft);
    const veh = rowsOf(data, 'Data_LV & Bus').map((r, i) => {
      const d = { pajak: pick(r, /pajak/i), stnk: pick(r, /stnk/i), kir: pick(r, /kir/i), kom: pick(r, /komisioning|commissioning/i) };
      const lefts = Object.values(d).map(v => daysLeft(v, t)).filter(x => x !== null);
      return { k: i, cn: pick(r, /^cn/i), jenis: pick(r, /^jenis/i), nopol: pick(r, /polisi|nopol|plat/i), model: pick(r, /^model/i), thn: pick(r, /^(tahun|year)/i), ...d, cat: pick(r, /catatan|keterangan|^ket/i), left: lefts.length ? Math.min(...lefts) : null };
    }).sort(cmpLeft);
    return { units, veh };
  }, [data]);
  const types = count(units, u => u.eq && String(u.eq)).slice(0, 3);
  const open = (module, nav, f, label) => onOpen(module, RAW(nav, f, label));
  return <Wrap loading={loading} data={data}>
    <Head title="Unit" sub="Masa berlaku komisioning unit, pajak, STNK, dan KIR kendaraan."><WinSel win={win} setWin={setWin} /><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[...types.map(([name, v]) => ({ v: fmt(v, 0), l: name, t: 'blue' })),
      { v: fmt(units.filter(u => u.left !== null && u.left <= win).length, 0), l: 'Unit: komisioning lewat / segera', t: 'amber' },
      { v: fmt(veh.filter(v => v.left !== null && v.left <= win).length, 0), l: 'Kendaraan: dokumen lewat / segera', t: 'red' }]} />
    <Panel title="Unit produksi" sub={`${units.length} unit. Klik baris untuk mengubah tanggal.`}>
      <Tbl limit0={10} rows={units} onRow={u => open('Data_Unit', 'unit', r => String(pick(r, /^cn/i) ?? '') === String(u.cn ?? ''), `Unit ${u.cn}`)} cols={[
        { h: 'CN unit', r: u => <strong>{u.cn || '—'}</strong> }, { h: 'Equipment', r: u => u.eq || '—' }, { h: 'Model', r: u => u.model || '—' }, { h: 'Tahun', r: u => u.thn || '—' },
        { h: 'Remark', r: u => u.remark || '—' }, { h: 'Komisioning', r: u => fd(u.kom) }, { h: 'Masa berlaku', r: u => <DCell v={u.exp} win={win} /> }, { h: 'Keterangan', r: u => u.ket || '' }]} />
    </Panel>
    <Panel title="Kendaraan ringan dan bus" sub={`${veh.length} kendaraan. Klik baris untuk mengubah tanggal. Status mengikuti batas peringatan ${win} hari.`}>
      <Tbl limit0={10} rows={veh} onRow={v => open('Data_LV & Bus', 'unit', r => String(pick(r, /^cn/i) ?? '') === String(v.cn ?? ''), `Kendaraan ${v.cn}`)} cols={[
        { h: 'CN', r: v => <strong>{v.cn || '—'}</strong> }, { h: 'Jenis', r: v => v.jenis || '—' }, { h: 'No. polisi', r: v => v.nopol || '—' }, { h: 'Model', r: v => v.model || '—' }, { h: 'Tahun', r: v => v.thn || '—' },
        { h: 'Pajak', r: v => <DCell v={v.pajak} win={win} /> }, { h: 'STNK', r: v => <DCell v={v.stnk} win={win} /> }, { h: 'KIR', r: v => <DCell v={v.kir} win={win} /> },
        { h: 'Komisioning', r: v => <DCell v={v.kom} win={win} /> }, { h: 'Catatan', r: v => v.cat || '' }]} />
    </Panel>
  </Wrap>;
}

/* ============ ATR ============ */
function ATRPage({ data, loading, onRefresh }) {
  const [q, setQ] = useState(''); const [tab, setTab] = useState('semua'); const [dept, setDept] = useState('');
  const all = useMemo(() => rowsOf(data, 'Data_ATR').map((r, i) => {
    const m = MONTHS.map(x => pctOf(val(r, x)));
    return { k: i, nama: val(r, 'Nama', 'NAMA'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'Jabatan', 'JABATAN'), dept: val(r, 'Departemen', 'DEPARTEMEN', 'Department'), m, ytd: pctOf(val(r, 'YTD')) };
  }).sort((a, b) => (a.ytd ?? 999) - (b.ytd ?? 999)), [data]);
  const monthly = MONTHS.map((_, i) => avg(all.map(r => r.m[i]).filter(x => x !== null)));
  const lastI = monthly.reduce((l, v, i) => (v !== null ? i : l), -1);
  const used = MONTHS.map((_, i) => i).filter(i => all.some(r => r.m[i] !== null));
  const ok = all.filter(r => r.ytd !== null && r.ytd >= ATR_TARGET).length;
  const low = all.filter(r => r.ytd !== null && r.ytd < ATR_TARGET).length;
  const needle = norm(q);
  const rows = all.filter(r => (tab === 'semua' || (tab === 'low' ? r.ytd !== null && r.ytd < ATR_TARGET : r.ytd !== null && r.ytd >= ATR_TARGET)) && (!dept || r.dept === dept) && (!needle || hay(r.nama, r.id).includes(needle)));
  const P = v => (v === null ? <span className="muted-cell">-</span> : <span style={v < ATR_TARGET ? { color: 'var(--alert)' } : undefined}>{fmt(v, 1)}%</span>);
  return <Wrap loading={loading} data={data}>
    <Head title="ATR" sub="Attendance Rate karyawan per bulan dan YTD. Target kehadiran 95%."><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[{ v: lastI < 0 ? '—' : `${fmt(avg(all.map(r => r.ytd).filter(x => x !== null)), 1)}%`, l: 'Rata-rata ATR YTD', t: 'blue' }, { v: fmt(ok, 0), l: 'Sesuai target', t: 'green', go: () => setTab('ok'), on: tab === 'ok' },
      { v: fmt(low, 0), l: 'Di bawah target', t: 'red', go: () => setTab('low'), on: tab === 'low' }, { v: lastI < 0 ? '—' : `${fmt(monthly[lastI], 1)}%`, l: `Rata-rata ATR ${MONTHS[lastI] || ''}`, t: 'teal' }, { v: fmt(all.length, 0), l: 'Karyawan', t: 'gray' }]} />
    <Panel title="Tren ATR per bulan" sub="Rata-rata seluruh karyawan, bulan yang sudah terisi.">
      <Columns items={MONTHS.map((m, i) => ({ lbl: m, v: monthly[i], text: monthly[i] === null ? '' : `${fmt(monthly[i], 1)}%` }))} base={90} max={100} />
      <p className="subtle">Sumbu batang dimulai dari 90% supaya selisih antarbulan terlihat.</p>
    </Panel>
    <Panel title="ATR per karyawan" sub="Default terurut dari YTD terendah. Status mengikuti target kehadiran.">
      <Bar q={q} setQ={setQ} ph="Cari nama atau AMODI" tab={tab} setTab={setTab} tabs={[['semua', 'Semua'], ['low', 'Di bawah target'], ['ok', 'Sesuai target']]} total={`${rows.length} karyawan`}
        selects={[{ l: 'Semua departemen', v: dept, set: setDept, opts: uniq(all, r => r.dept) }]} />
      <Tbl rows={rows} cols={[{ h: 'Nama', r: r => who(r.nama, r.id) }, { h: 'Jabatan', r: r => r.jab || '—' },
        ...used.map(i => ({ h: MONTHS[i], num: true, r: r => P(r.m[i]) })), { h: 'YTD', num: true, r: r => P(r.ytd) },
        { h: 'Status', r: r => (r.ytd === null ? '—' : <Bdg tone={r.ytd >= ATR_TARGET ? 'green' : 'red'} text={r.ytd >= ATR_TARGET ? '✓ Sesuai target' : '✕ Di bawah target'} />) }]} />
    </Panel>
  </Wrap>;
}

/* ============ TURNOVER ============ */
function TurnoverPage({ data, loading, onRefresh, onInput }) {
  const [yr, setYr] = useState(String(today().getFullYear()));
  const T = useMemo(() => {
    const t = today(); const y = Number(yr);
    const emp = rowsOf(data, 'Data_Karyawan'); const res = rowsOf(data, 'Data_Resign');
    const active = emp.filter(r => !val(r, 'Tanggal Resign')).length;
    const masuk = emp.filter(r => yearOf(val(r, 'Tanggal Masuk')) === y).map((r, i) => {
      const d = toDate(val(r, 'Tanggal Masuk')); const out = toDate(val(r, 'Tanggal Resign'));
      return { k: i, d, nama: val(r, 'Nama', 'NAMA'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'Jabatan'), st: val(r, 'Status Karyawan'), pkwt: !!val(r, 'Akhir Kontrak'), mk: masaKerja(d, out || t), out: !!out };
    }).sort((a, b) => b.d - a.d);
    const keluar = res.filter(r => yearOf(val(r, 'Tanggal Resign')) === y).map((r, i) => ({ k: i, d: toDate(val(r, 'Tanggal Resign')), nama: val(r, 'Nama', 'NAMA'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'Jabatan'), jenis: val(r, 'Jenis'), ket: val(r, 'Keterangan') })).sort((a, b) => b.d - a.d);
    let awal = active - masuk.length + keluar.length; const head = awal;
    const last = y === t.getFullYear() ? t.getMonth() : 11;
    const months = [];
    for (let m = 0; m <= last; m++) {
      const mi = masuk.filter(x => x.d.getMonth() === m).length; const ko = keluar.filter(x => x.d && x.d.getMonth() === m).length;
      const akhir = awal + mi - ko; const a = (awal + akhir) / 2;
      months.push({ k: m, bln: `${BLN[m]} ${y}`, awal, mi, ko, akhir, rate: a > 0 ? (ko / a) * 100 : 0 }); awal = akhir;
    }
    const years = [...new Set([...emp.map(r => yearOf(val(r, 'Tanggal Masuk'))), ...res.map(r => yearOf(val(r, 'Tanggal Resign'))), t.getFullYear()].filter(Boolean))].sort((a, b) => b - a);
    const avgHead = (head + awal) / 2;
    return { active, masuk, keluar, months, years, rate: avgHead > 0 ? (keluar.length / avgHead) * 100 : null };
  }, [data, yr]);
  return <Wrap loading={loading} data={data}>
    <Head title="Turnover" sub="Rekap karyawan masuk dan keluar per bulan beserta persentase turnover."><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[{ v: fmt(T.active, 0), l: 'Karyawan aktif saat ini', t: 'blue' }, { v: fmt(T.masuk.length, 0), l: `Masuk di ${yr}`, t: 'green' }, { v: fmt(T.keluar.length, 0), l: `Keluar di ${yr}`, t: 'red' }, { v: T.rate === null ? '—' : `${fmt(T.rate, 1)}%`, l: `Turnover ${yr}`, t: 'amber' }]} />
    <div className="idrow-bar"><YearSel years={T.years} value={yr} set={setYr} /><button type="button" className="btn primary" onClick={onInput}>Catat karyawan keluar</button></div>
    <Panel title={`Per bulan, ${yr}`} sub="Turnover = jumlah keluar dibagi rata-rata karyawan (awal dan akhir bulan). Karyawan masuk dihitung dari tanggal masuk.">
      <Tbl limit0={12} rows={T.months} cols={[{ h: 'Bulan', r: m => <strong>{m.bln}</strong> }, { h: 'Awal', num: 1, r: m => m.awal }, { h: 'Masuk', num: 1, r: m => m.mi }, { h: 'Keluar', num: 1, r: m => m.ko }, { h: 'Akhir', num: 1, r: m => m.akhir }, { h: 'Turnover', num: 1, r: m => `${fmt(m.rate, 1)}%` }]} />
    </Panel>
    <Panel title="Daftar karyawan masuk" sub={`${T.masuk.length} orang masuk di ${yr}, dihitung dari tanggal masuk. Termasuk yang sudah keluar setelah masuk di tahun yang sama.`}>
      <Tbl limit0={12} rows={T.masuk} cols={[{ h: 'Tanggal masuk', r: x => fd(x.d) }, { h: 'Nama', r: x => who(x.nama, x.id) }, { h: 'Jabatan', r: x => x.jab || '—' }, { h: 'Status karyawan', r: x => x.st || '—' },
        { h: 'Kontrak', r: x => <Bdg tone={x.pkwt ? 'amber' : 'green'} text={x.pkwt ? 'PKWT' : 'PKWTT'} /> }, { h: 'Masa kerja', r: x => x.mk }, { h: 'Status', r: x => <Bdg tone={x.out ? 'red' : 'green'} text={x.out ? 'Keluar' : '✓ Aktif'} /> }]} />
    </Panel>
    <Panel title="Daftar karyawan keluar" sub={`${T.keluar.length} orang keluar di ${yr}.`}>
      <Tbl limit0={12} rows={T.keluar} cols={[{ h: 'Tanggal keluar', r: x => fd(x.d) }, { h: 'Nama', r: x => who(x.nama, x.id) }, { h: 'Jabatan', r: x => x.jab || '—' }, { h: 'Jenis', r: x => x.jenis || '—' }, { h: 'Keterangan', r: x => x.ket || '' }]} />
    </Panel>
  </Wrap>;
}

/* ============ KONTRAK ============ */
function KontrakPage({ data, loading, onRefresh, onOpen }) {
  const [win, setWin] = useState(30); const [yr, setYr] = useState(String(today().getFullYear()));
  const K = useMemo(() => {
    const t = today(); const y = Number(yr);
    const kon = rowsOf(data, 'Data_Kontrak');
    const ket = r => String(val(r, 'Keterangan') ?? '');
    const thn = kon.filter(r => yearOf(val(r, 'Awal Kontrak')) === y);
    const bln = BLN.map((b, m) => {
      const a = thn.filter(r => toDate(val(r, 'Awal Kontrak')).getMonth() === m);
      return { k: m, b: `${b} ${y}`, total: a.length, baru: a.filter(r => /baru/i.test(ket(r))).length, pj: a.filter(r => /perpanjang/i.test(ket(r))).length, tetap: a.filter(r => /pkwtt|tetap|permanen/i.test(ket(r))).length,
        akhir: kon.filter(r => { const d = toDate(val(r, 'Akhir Kontrak')); return d && d.getFullYear() === y && d.getMonth() === m; }).length };
    });
    const soon = rowsOf(data, 'Data_Karyawan').filter(r => !val(r, 'Tanggal Resign') && daysLeft(val(r, 'Akhir Kontrak'), t) !== null).map((r, i) => ({
      k: i, nama: val(r, 'Nama', 'NAMA'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'Jabatan'), dept: val(r, 'Departemen'), akhir: toDate(val(r, 'Akhir Kontrak')), left: daysLeft(val(r, 'Akhir Kontrak'), t)
    })).filter(x => x.left <= win).sort(cmpLeft);
    const years = [...new Set([...kon.map(r => yearOf(val(r, 'Awal Kontrak'))), today().getFullYear()].filter(Boolean))].sort((a, b) => b - a);
    return { thn, bln, soon, years, baru: bln.reduce((s, x) => s + x.baru, 0), pj: bln.reduce((s, x) => s + x.pj, 0), tetap: bln.reduce((s, x) => s + x.tetap, 0), akhir: bln.reduce((s, x) => s + x.akhir, 0) };
  }, [data, yr, win]);
  const edit = x => onOpen('Data_Karyawan', RAW('kontrak', r => String(val(r, 'AMODI', 'NRP') ?? '') === String(x.id ?? ''), `Kontrak • ${x.nama || x.id}`));
  return <Wrap loading={loading} data={data}>
    <Head title="Kontrak" sub="Rekap penandatanganan kontrak per bulan: karyawan baru, perpanjangan, dan yang menjadi PKWTT."><WinSel win={win} setWin={setWin} /><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[{ v: fmt(K.thn.length, 0), l: `Kontrak ditandatangani ${yr}`, t: 'blue' }, { v: fmt(K.baru, 0), l: 'Karyawan baru', t: 'green' }, { v: fmt(K.pj, 0), l: 'Perpanjangan', t: 'amber' }, { v: fmt(K.tetap, 0), l: 'Menjadi PKWTT', t: 'violet' }, { v: fmt(K.akhir, 0), l: `Kontrak berakhir di ${yr}`, t: 'gray' }, { v: fmt(K.soon.length, 0), l: `Berakhir ≤ ${win} hari (termasuk lewat)`, t: 'red' }]} />
    <div className="idrow-bar"><YearSel years={K.years} value={yr} set={setYr} /></div>
    <Panel title="Kontrak segera berakhir" sub={`Karyawan PKWT yang kontraknya sudah lewat atau berakhir dalam ${win} hari (${K.soon.length} orang). Klik baris untuk memperpanjang kontrak atau menjadikannya PKWTT.`}>
      <Tbl limit0={10} rows={K.soon} onRow={edit} empty="Tidak ada kontrak yang segera berakhir." cols={[{ h: 'Nama', r: x => who(x.nama, x.id) }, { h: 'Jabatan', r: x => x.jab || '—' }, { h: 'Departemen', r: x => x.dept || '—' }, { h: 'Akhir kontrak', r: x => fd(x.akhir) },
        { h: 'Sisa', r: x => <Bdg s={stOf(x.left, win)} text={x.left < 0 ? `Lewat ${-x.left} hari` : `${x.left} hari`} /> }, { h: '', r: () => <span className="muted-cell">Perpanjang / PKWTT</span> }]} />
    </Panel>
    <Panel title={`Per bulan, ${yr}`} sub="Dihitung dari tanggal awal kontrak (tanda tangan).">
      <Tbl limit0={12} rows={K.bln} cols={[{ h: 'Bulan', r: m => <strong>{m.b}</strong> }, { h: 'Total TTD', num: 1, r: m => m.total }, { h: 'Baru', num: 1, r: m => m.baru }, { h: 'Perpanjangan', num: 1, r: m => m.pj }, { h: 'Menjadi PKWTT', num: 1, r: m => m.tetap }, { h: 'Kontrak berakhir', num: 1, r: m => m.akhir }]} />
    </Panel>
  </Wrap>;
}

/* ============ DATABASE MANPOWER ============ */
function ManpowerPage({ data, loading, onRefresh, onOpen }) {
  const needs = useMemo(() => needsOf(data), [data]);
  const plan = needs.reduce((s, n) => s + n.plan, 0); const akt = needs.reduce((s, n) => s + n.akt, 0);
  const pica = useMemo(() => rowsOf(data, 'Data_PICA').map((r, i) => {
    const vals = Object.values(r).filter(v => v !== '' && v !== null && v !== undefined).map(String);
    return { k: i, title: pick(r, /temuan|masalah|isu|issue|gap|uraian|jabatan|posisi|item/i) ?? vals[0], desc: pick(r, /tindak|action|rencana|progress|keterangan|deskripsi/i), pic: pick(r, /^pic/i), target: pick(r, /target|due|deadline|selesai/i), status: val(r, 'Status') };
  }), [data]);
  const closed = s => /(closed|close|selesai|complete|completed)/i.test(String(s ?? ''));
  return <Wrap loading={loading} data={data}>
    <Head title="Database Manpower" sub="Rencana kebutuhan dibanding aktual dan tindak lanjut (PICA). Klik baris untuk memperbarui pemenuhan atau status."><Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[{ v: plan > 0 ? `${fmt((akt / plan) * 100, 1)}%` : '—', l: 'Pemenuhan manpower', t: 'green' }, { v: fmt(plan, 0), l: 'Plan kebutuhan', t: 'blue' }, { v: fmt(akt, 0), l: 'Aktual', t: 'teal' }, { v: fmt(Math.max(plan - akt, 0), 0), l: 'Kekurangan', t: 'red' }]} />
    <div className="grid2 wide-left">
      <Panel title="Plan dibanding aktual per jabatan" sub="Klik baris untuk memperbarui plan atau aktual setelah ada pemenuhan. Jabatan yang paling kurang tampil di atas.">
        <Bars items={needs.map(n => ({ name: n.jab, sub: n.sub, value: n.plan ? n.akt / n.plan : 1, text: n.kurang ? `-${fmt(n.kurang, 0)}` : 'Penuh', color: n.kurang ? '#e8793a' : undefined }))} max={1} empty="Belum ada data kebutuhan tenaga kerja." />
        <button type="button" className="btn light" onClick={() => onOpen('Data_Kebutuhan', RAW('manpower', null, 'Kebutuhan tenaga kerja'))}>Ubah data kebutuhan</button>
      </Panel>
      <Panel title="Tindak lanjut (PICA)" right={<button type="button" className="btn primary mini" onClick={() => onOpen('Data_PICA', RAW('manpower', null, 'PICA'))}>Tambah PICA</button>}>
        {!pica.length && <p className="subtle">Belum ada catatan PICA.</p>}
        {pica.map(p => <div className="pica" key={p.k}>
          <div className="pica-head"><strong>{p.title || '—'}</strong>{p.status && <Bdg tone={closed(p.status) ? 'green' : 'amber'} text={String(p.status)} />}</div>
          {p.desc && <p>{String(p.desc)}</p>}
          <small>{p.pic ? `PIC: ${p.pic}` : ''}{p.pic && p.target ? ' | ' : ''}{p.target ? `Target selesai: ${toDate(p.target) ? fd(p.target) : p.target}` : ''}</small>
        </div>)}
      </Panel>
    </div>
  </Wrap>;
}

/* ============ REKRUTMEN ============ */
const STAGES = ['Lamaran Masuk', 'Screening', 'Test Tulis', 'Interview HR/PJO', 'Test Praktek', 'Interview User', 'Medical Check Up', 'Follow Up', 'Offering Letter', 'Pengajuan Mine Permit / Badge', 'Induksi Karyawan Baru', 'Training', 'Orientasi', 'Validasi 1', 'Validasi 2', 'Validasi 3', 'Assessment ICLH', 'Diterima'];
const TAHAP_COLS = ['tahapsaatini', 'tahapseleksi', 'tahap'];
const nk = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const filled = v => v !== undefined && v !== null && String(v).trim() !== '';

function RekrutmenPage({ data, loading, onRefresh, onOpen, canPrivate, canWrite, onAddKandidat, onEditKandidat }) {
  const [tab, setTab] = useState('semua'); const [q, setQ] = useState('');
  // NIK lengkap hanya dimuat untuk admin/HR (database menolak role lain)
  const [priv, setPriv] = useState({});
  useEffect(() => {
    if (!canPrivate) { setPriv({}); return undefined; }
    let live = true;
    supabase.from('app_private_data').select('row_index,data').eq('module', 'Data_Rekrutmen').range(0, 4999).then(({ data: d, error }) => {
      if (!live || error) return;
      const m = {}; (d || []).forEach(r => { m[r.row_index] = r.data || {}; }); setPriv(m);
    });
    return () => { live = false; };
  }, [canPrivate, data]);
  const R = useMemo(() => {
    const recRows = data.filter(x => x.module === 'Data_Rekrutmen');
    const rec = recRows.map(x => x.data || {});
    const keys = [...new Set(rec.flatMap(Object.keys))];
    const wideStages = STAGES.map(s => ({ s, key: keys.find(k => nk(k) === nk(s)) })).filter(x => x.key);
    // Format Excel saat ini: satu kolom "Tahap Saat Ini". Dipakai kalau tidak ada kolom per tahap.
    const tahapKey = wideStages.length ? undefined : keys.find(k => TAHAP_COLS.includes(nk(k)));
    const idxOf = r => (tahapKey ? STAGES.findIndex(s => nk(s) === nk(r[tahapKey] ?? '')) : -1);
    const maxIdx = tahapKey ? Math.max(-1, ...rec.map(idxOf)) : -1;
    const stages = tahapKey ? STAGES.slice(0, maxIdx + 1).map(s => ({ s })) : wideStages;
    const DONE = /diterima|hired|join/i; const NO = /tolak|reject|gagal/i;
    const rows = rec.map((r, i) => {
      const hasil = String(val(r, 'Hasil Akhir') ?? '');
      const last = tahapKey ? null : [...stages].reverse().find(x => filled(r[x.key]));
      return { k: i, ri: recRows[i]?.row_index, r, nama: pick(r, /^nama/i), jab: pick(r, /^(jabatan|posisi|position)/i), sumber: pick(r, /sumber/i), alasan: pick(r, /alasan|reason/i), hasil, done: DONE.test(hasil), no: NO.test(hasil), tth: num(val(r, 'Time to Hire (Hari)')), tahap: tahapKey ? (filled(r[tahapKey]) ? String(r[tahapKey]) : '—') : last ? last.s : '—' };
    });
    const sc = name => {
      if (tahapKey) { const i = STAGES.findIndex(s => nk(s) === nk(name)); return i < 0 ? null : rec.filter(r => idxOf(r) >= i).length; }
      const st = stages.find(x => nk(x.s) === nk(name)); return st ? rec.filter(r => filled(r[st.key])).length : null;
    };
    const lamKey = (stages.find(x => nk(x.s) === 'lamaranmasuk') || {}).key || keys.find(k => /lamar|apply/i.test(k));
    const trend = new Map();
    if (lamKey) rec.forEach(r => { const d = toDate(r[lamKey]); if (d) { const key = d.getFullYear() * 12 + d.getMonth(); trend.set(key, { lbl: `${BLN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, v: (trend.get(key)?.v || 0) + 1 }); } });
    const th = new Map();
    rows.filter(x => x.done && x.tth !== null && x.jab).forEach(x => { const e = th.get(x.jab) || []; e.push(x.tth); th.set(x.jab, e); });
    const needs = needsOf(data).filter(n => n.kurang > 0);
    const proses = x => !x.done && !x.no;
    return { rows, stages, sc, needs, proses,
      trend: [...trend].sort((a, b) => a[0] - b[0]).slice(-6).map(([, v]) => ({ lbl: v.lbl, v: v.v })),
      tth: [...th].map(([jab, a]) => ({ k: jab, jab, n: a.length, avg: avg(a), min: Math.min(...a), max: Math.max(...a) })).sort((a, b) => b.n - a.n),
      sumber: count(rows, x => x.sumber && String(x.sumber)), alasan: count(rows.filter(x => x.no), x => x.alasan && String(x.alasan)).slice(0, 6) };
  }, [data]);
  const { rows, stages, sc, needs } = R;
  const offers = sc('Offering Letter'); const diterima = rows.filter(x => x.done).length;
  const needle = norm(q);
  const nikOf = x => (canPrivate ? digits(getKey(priv[x.ri] || {}, 'NIK')) : '');
  const tanpaNik = rows.filter(x => canPrivate && !nikOf(x)).length;
  const inTab = x => (tab === 'semua' || (tab === 'proses' ? R.proses(x) : tab === 'diterima' ? x.done : tab === 'nik' ? !nikOf(x) : x.no));
  const list = rows.filter(x => inTab(x) && (!needle || hay(x.nama, x.jab, x.sumber, nikOf(x)).includes(needle)));
  return <Wrap loading={loading} data={data}>
    <Head title="Rekrutmen" sub="Kebutuhan jabatan yang masih kurang, kandidat pelamar, tahap seleksi, sumber, dan time to hire. Klik baris kandidat untuk memperbarui.">{canWrite && onAddKandidat && <button type="button" className="btn primary" onClick={onAddKandidat}><Icon name="plus" size={15} /> Tambah kandidat</button>}<Refresh onRefresh={onRefresh} /></Head>
    <Cards items={[{ v: fmt(needs.length, 0), l: 'Jabatan perlu diisi', t: 'red' }, { v: fmt(needs.reduce((s, n) => s + n.kurang, 0), 0), l: 'Total kebutuhan orang', t: 'amber' }, { v: fmt(rows.length, 0), l: 'Total kandidat', t: 'blue', go: () => setTab('semua'), on: tab === 'semua' },
      { v: fmt(rows.filter(R.proses).length, 0), l: 'Sedang diproses', t: 'teal', go: () => setTab('proses'), on: tab === 'proses' }, { v: sc('Medical Check Up') === null ? '—' : fmt(sc('Medical Check Up'), 0), l: 'Lolos Medical Check Up ke atas', t: 'violet' },
      { v: fmt(diterima, 0), l: 'Diterima', t: 'green', go: () => setTab('diterima'), on: tab === 'diterima' }, { v: fmt(rows.filter(x => x.no).length, 0), l: 'Ditolak', t: 'red', go: () => setTab('ditolak'), on: tab === 'ditolak' },
      { v: fmt(avg(rows.filter(x => x.done && x.tth !== null).map(x => x.tth)), 1), l: 'Rata-rata time to hire (hari)', t: 'gray' }, { v: offers ? `${fmt((diterima / offers) * 100, 0)}%` : '—', l: 'Offer acceptance rate', t: 'green' }]} />
    <div className="grid2">
      <Panel title="Kebutuhan rekrutmen per jabatan" sub="Dibandingkan jumlah kandidat yang masih diproses.">
        <Bars items={needs.map(n => ({ name: n.jab, sub: `${n.sub} · ${rows.filter(x => R.proses(x) && norm(x.jab) === norm(n.jab)).length} kandidat proses`, value: n.kurang, text: `-${fmt(n.kurang, 0)}`, color: '#e8793a' }))} empty="Tidak ada jabatan yang kurang." />
      </Panel>
      <Panel title="Tahap seleksi (funnel)" sub="Jumlah kandidat yang pernah mencapai tiap tahap.">
        <Bars items={stages.map(x => ({ name: x.s, value: sc(x.s) }))} max={Math.max(1, rows.length)} empty="Kolom tahap seleksi belum ditemukan di Data_Rekrutmen." />
      </Panel>
    </div>
    <div className="grid3">
      <Panel title="Sumber kandidat" sub="Dari mana kandidat datang."><Bars items={R.sumber.map(([name, value]) => ({ name, value }))} /></Panel>
      <Panel title="Alasan ditolak" sub="Alasan kandidat yang tidak lolos."><Bars items={R.alasan.map(([name, value]) => ({ name, value }))} empty="Belum ada alasan penolakan." /></Panel>
      <Panel title="Tren lamaran per bulan" sub="6 bulan terakhir yang ada datanya."><Columns items={R.trend.length ? R.trend : []} /></Panel>
    </div>
    <Panel title="Time to hire per jabatan" sub="Selisih tanggal diterima dan tanggal lamaran, hanya kandidat berstatus Diterima.">
      <Tbl limit0={10} rows={R.tth} cols={[{ h: 'Jabatan', r: x => x.jab }, { h: 'Diterima', num: 1, r: x => x.n }, { h: 'Rata-rata (hari)', num: 1, r: x => fmt(x.avg, 1) }, { h: 'Tercepat', num: 1, r: x => x.min }, { h: 'Terlama', num: 1, r: x => x.max }]} />
    </Panel>
    <Panel title="Daftar kandidat" sub="Klik baris untuk mengubah hasil, tahap, atau tanggal.">
      <Bar q={q} setQ={setQ} ph={canPrivate ? 'Cari nama, NIK, jabatan, sumber' : 'Cari nama, jabatan, sumber'} tab={tab} setTab={setTab} tabs={[['semua', 'Semua'], ['proses', 'Proses'], ['diterima', 'Diterima'], ['ditolak', 'Ditolak'], ...(canPrivate ? [['nik', `NIK belum lengkap (${tanpaNik})`]] : [])]} total={`${list.length} kandidat`} />
      <Tbl rows={list} onRow={x => (canWrite && onEditKandidat && x.ri ? onEditKandidat(x.ri) : onOpen('Data_Rekrutmen', RAW('rekrutmen', r => norm(pick(r, /^nama/i)) === norm(x.nama), `Kandidat • ${x.nama}`)))} cols={[{ h: 'Nama', r: x => <strong>{x.nama || '—'}</strong> }, ...(canPrivate ? [{ h: 'NIK', r: x => nikOf(x) || <Bdg tone="amber" text="NIK belum lengkap" /> }] : []), { h: 'Jabatan', r: x => x.jab || '—' }, { h: 'Sumber', r: x => x.sumber || '—' },
        { h: 'Tahap terakhir', r: x => x.tahap }, { h: 'Hasil akhir', r: x => <Bdg tone={x.done ? 'green' : x.no ? 'red' : 'amber'} text={x.hasil || 'Proses'} /> }, { h: 'Time to hire', num: 1, r: x => (x.tth === null ? '—' : `${fmt(x.tth, 0)} hari`) }]} />
    </Panel>
  </Wrap>;
}

/* ============ PEMBINAAN KARYAWAN ============ */
const isSP = j => /^(sp\s*\d|surat\s*teguran|teguran)/i.test(String(j ?? ''));
function PembinaanPage({ data, loading, onRefresh, onOpen }) {
  const [yr, setYr] = useState(String(today().getFullYear())); const [jenis, setJenis] = useState(''); const [st, setSt] = useState(''); const [dept, setDept] = useState(''); const [q, setQ] = useState('');
  const all = useMemo(() => rowsOf(data, 'REKAP_SP').map((r, i) => {
    const d = toDate(val(r, 'TANGGAL')); const sisaN = num(val(r, 'SISA PEMBINAAN'));
    const aktif = sisaN !== null ? sisaN > 0 : /aktif|berlaku/i.test(String(val(r, 'STATUS') ?? ''));
    return { k: i, d, nama: val(r, 'NAMA', 'Nama'), id: val(r, 'AMODI', 'NRP'), jab: val(r, 'JABATAN'), dept: val(r, 'DEPARTEMEN', 'Departemen'), jenis: String(val(r, 'JENIS PEMBINAAN') ?? 'Lainnya'), desk: val(r, 'DESKRIPSI PELANGGARAN'), until: val(r, 'MASA BERLAKU'), sisa: sisaN, aktif, stText: val(r, 'STATUS') };
  }).sort((a, b) => (b.d || 0) - (a.d || 0)), [data]);
  const years = uniq(all, x => x.d && x.d.getFullYear()).reverse();
  const rows = all.filter(x => (!yr || (x.d && String(x.d.getFullYear()) === yr)) && (!jenis || x.jenis === jenis) && (!dept || x.dept === dept) && (!st || (st === 'aktif' ? x.aktif : !x.aktif)));
  const shown = rows.filter(x => !q || hay(x.nama, x.id, x.jab, x.desk).includes(norm(q)));
  const person = x => x.id || x.nama;
  const rep = count(rows, person).filter(([, n]) => n >= 2);
  const nameOf = id => (rows.find(x => String(person(x)) === String(id)) || {}).nama || id;
  const sp = rows.filter(x => isSP(x.jenis));
  const perBln = BLN.map((b, m) => ({ lbl: `${b} ${String(yr || '').slice(2)}`.trim(), v: rows.filter(x => x.d && x.d.getMonth() === m).length }));
  return <Wrap loading={loading} data={data}>
    <Head title="Pembinaan Karyawan" sub="Rekap pembinaan dan Surat Peringatan karyawan. Klik baris untuk melihat riwayat karyawan itu."><Refresh onRefresh={onRefresh} /></Head>
    <Panel>
      <div className="lic-bar">
        <YearSel years={years} value={yr} set={setYr} all />
        <label className="fl">Jenis<select value={jenis} onChange={e => setJenis(e.target.value)}><option value="">Semua</option>{uniq(all, x => x.jenis).map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="fl">Status<select value={st} onChange={e => setSt(e.target.value)}><option value="">Semua</option><option value="aktif">Masih berlaku</option><option value="selesai">Sudah berakhir</option></select></label>
        <label className="fl">Departemen<select value={dept} onChange={e => setDept(e.target.value)}><option value="">Semua</option>{uniq(all, x => x.dept).map(o => <option key={o}>{o}</option>)}</select></label>
        <button type="button" className="btn primary" onClick={() => onOpen('REKAP_SP', RAW('pembinaan', null, 'Pembinaan'))}>+ Tambah pembinaan</button>
      </div>
    </Panel>
    <Cards items={[{ v: fmt(rows.length, 0), l: 'Total kasus pembinaan', t: 'blue' }, { v: fmt(new Set(rows.map(person)).size, 0), l: 'Karyawan terkait', t: 'teal' }, { v: fmt(sp.length, 0), l: 'Surat Teguran dan SP (SP1 s.d. SP3)', t: 'gray' },
      { v: fmt(sp.filter(x => x.aktif).length, 0), l: 'SP masih berlaku', t: 'amber' }, { v: fmt(sp.filter(x => x.sisa !== null && x.sisa > 0 && x.sisa <= 30).length, 0), l: 'SP berakhir dalam 30 hari', t: 'red' }, { v: fmt(rep.length, 0), l: 'Karyawan 2 kasus atau lebih', t: 'violet' }]} />
    <div className="grid2">
      <Panel title="Kasus per bulan" sub="Berdasarkan tanggal pembinaan."><Columns items={perBln} /></Panel>
      <Panel title="Per jenis pembinaan" sub="Jumlah kasus per jenis."><Bars items={count(rows, x => x.jenis).map(([name, value]) => ({ name, value }))} /></Panel>
      <Panel title="Per departemen" sub="Jumlah kasus per departemen."><Bars items={count(rows, x => x.dept && String(x.dept)).map(([name, value]) => ({ name, value }))} /></Panel>
      <Panel title="Perlu perhatian: kasus berulang" sub="Karyawan dengan 2 kasus atau lebih."><Bars items={rep.slice(0, 8).map(([id, value]) => ({ name: String(nameOf(id)), value }))} empty="Tidak ada karyawan dengan kasus berulang." /></Panel>
    </div>
    <Panel title="Daftar pembinaan" sub="Terbaru di atas. Klik baris untuk melihat riwayat karyawan.">
      <div className="lic-bar"><input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, jabatan, atau deskripsi" /><span className="count">{shown.length} kasus</span></div>
      <Tbl limit0={10} rows={shown} onRow={x => onOpen('REKAP_SP', RAW('pembinaan', r => String(val(r, 'AMODI', 'NRP') ?? '') === String(x.id ?? '') || norm(val(r, 'NAMA', 'Nama')) === norm(x.nama), `Riwayat • ${x.nama || x.id}`))} cols={[
        { h: 'Tanggal', r: x => fd(x.d) }, { h: 'Karyawan', r: x => who(x.nama, [x.id, x.jab].filter(Boolean).join(' | ')) }, { h: 'Departemen', r: x => x.dept || '—' },
        { h: 'Jenis', r: x => <Bdg tone={isSP(x.jenis) ? 'amber' : 'gray'} text={x.jenis} /> }, { h: 'Pelanggaran', r: x => <span className="clip">{x.desk || '—'}</span> }, { h: 'Berlaku s.d.', r: x => (x.until ? fd(x.until) : '—') },
        { h: 'Status', r: x => <Bdg tone={x.aktif ? 'amber' : 'gray'} text={x.aktif ? `Aktif${x.sisa !== null ? `, sisa ${fmt(x.sisa, 0)} hari` : ''}` : String(x.stText || 'Selesai')} /> }]} />
    </Panel>
  </Wrap>;
}

export const PAGES = {
  Data_Kompetensi: KompetensiPage, Data_Unit: UnitPage, 'Data_LV & Bus': UnitPage, Data_ATR: ATRPage, Data_Resign: TurnoverPage, Data_Kontrak: KontrakPage,
  Data_Kebutuhan: ManpowerPage, Data_PICA: ManpowerPage, Data_Rekrutmen: RekrutmenPage, REKAP_SP: PembinaanPage
};
