import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { fmt, norm } from './utils.js';
import { BULAN, buildLaporan, cellText, fd, tablesOf } from './laporan.js';
import './dashboard.css';
import './pages.css';
import './laporan.css';

const TABS = [['ringkasan', 'Ringkasan'], ['aktif', 'Karyawan aktif'], ['masuk', 'Karyawan masuk'], ['manpower', 'Manpower'], ['pengawas', 'Pengawas & teknis'], ['highrisk', 'High risk'], ['unit', 'Komisioning unit']];

function Cell({ c }) {
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

export default function Laporan({ data, loading, canPrivate, onRefresh }) {
  const [ym, setYm] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [tab, setTab] = useState('ringkasan');
  const [kontak, setKontak] = useState(false);
  const [semuaK, setSemuaK] = useState(false);
  const [q, setQ] = useState('');
  const [hr, setHr] = useState('a2b');
  const [un, setUn] = useState('lv');

  const L = useMemo(() => buildLaporan(data, ym.y, ym.m), [data, ym]);
  const T = useMemo(() => tablesOf(L, { kontak: canPrivate && kontak, semuaKompetensi: semuaK }), [L, canPrivate, kontak, semuaK]);
  const thisYear = new Date().getFullYear();
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
    add('Karyawan Aktif', T.aktif); add('Karyawan Masuk', T.masuk); add('Manpower', T.manpower); add('Pengawas & Teknis', T.pengawas);
    T.highrisk.forEach(g => add(`High Risk ${g.key.toUpperCase()}`, g));
    T.unit.forEach(g => add(g.key === 'lv' ? 'Komisioning LV & Bus' : `Komisioning ${g.key.toUpperCase()}`, g));
    XLSX.writeFile(wb, `SHE_Laporan_${BULAN[ym.m]}_${ym.y}.xlsx`);
  };

  const card = (v, label, tone) => <div className="dcard static" data-tone={tone}><b>{v}</b><span>{label}</span></div>;
  const c = L.cards;
  const cakupan = [
    ['Struktur organisasi', 'hal. 2', 'Belum ada: unggah gambar (tahap 3)', false],
    ['Daftar karyawan aktif', 'hal. 3 sampai 5', `${L.aktif.length} karyawan`, L.aktif.length > 0],
    ['Karyawan yang masuk', 'hal. 6', `${L.masuk.length} karyawan`, true],
    ['Rencana vs aktual manpower', 'hal. 7', `${L.manpower.length} jabatan`, L.manpower.length > 0],
    ['Pengawas dan tenaga teknis', 'hal. 8', `${L.kompAll.filter(k => k.grup).length} catatan`, L.kompAll.some(k => k.grup)],
    ['Authority high risk A2B dan DT', 'hal. 9 sampai 11', `${c.hr} operator`, c.hr > 0],
    ['Komisioning LV, bus, dump truck, alat berat', 'hal. 12 sampai 14', `${L.lv.length} kendaraan, ${L.unitGrup.dt.length + L.unitGrup.alat.length + L.unitGrup.lain.length} unit`, L.lv.length + L.unitGrup.dt.length + L.unitGrup.alat.length > 0],
    ['Performance monitoring, statistik insiden, kejadian berbahaya', 'hal. 15 sampai 19', 'Belum ada: modul input (tahap 2)', false],
    ['Kegiatan SHE, kontrol kritis, BMI, inspeksi', 'hal. 20 sampai 45', 'Belum ada (tahap 2 dan 3)', false]
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
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      <div className="seg-tabs" role="group" aria-label="Bagian laporan" style={{ justifySelf: 'start', flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => <button type="button" key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setQ(''); }}>{l}</button>)}
      </div>

      {loading && !data.length ? <section className="panel tr-panel"><div className="loading-state"><div className="spinner" />Memuat data...</div></section> : (
        <>
          {tab === 'ringkasan' && (
            <>
              <div className="dgrid">
                {card(fmt(c.aktif, 0), `Karyawan aktif per ${fd(L.asOf)}`, 'blue')}
                {card(fmt(c.masuk, 0), `Masuk di ${BULAN[ym.m]} ${ym.y}`, 'green')}
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
              <p className="lap-hint">Karyawan dengan tanggal masuk di bulan ini.</p>
              <Tabel head={T.masuk.head} rows={T.masuk.rows} empty="Tidak ada karyawan yang masuk di bulan ini." />
            </section>
          )}

          {tab === 'manpower' && (
            <section className="panel tr-panel">
              <h3 className="lap-title">{T.manpower.title}</h3>
              <p className="lap-hint">Total plan {fmt(L.mpPlan, 0)}, aktual {fmt(L.mpAkt, 0)}, kekurangan {fmt(c.mpKurang, 0)}. Data dari menu Database Manpower.</p>
              <Tabel head={T.manpower.head} rows={T.manpower.rows} />
            </section>
          )}

          {tab === 'pengawas' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <h3 className="lap-title" style={{ margin: 0 }}>{T.pengawas.title}</h3>
                <label className="lap-check"><input type="checkbox" checked={semuaK} onChange={e => setSemuaK(e.target.checked)} /> Tampilkan semua kompetensi (tanpa filter pengawas)</label>
              </div>
              <p className="lap-hint">Dikelompokkan dari nama kompetensi/kategori di Data Kompetensi. Kalau ada yang tidak muncul, centang opsi di atas untuk melihat semua catatan, lalu beri tahu nama kompetensinya supaya pengelompokannya disesuaikan.</p>
              <Tabel head={T.pengawas.head} rows={T.pengawas.rows} empty="Belum ada kompetensi yang cocok dengan kelompok pengawas atau tenaga teknis." />
            </section>
          )}

          {tab === 'highrisk' && (
            <section className="panel tr-panel">
              <div className="lic-bar">
                <div className="seg-tabs" role="group" aria-label="Kelompok">{T.highrisk.map(g => <button type="button" key={g.key} aria-pressed={hrG.key === g.key} onClick={() => setHr(g.key)}>{g.key.toUpperCase()} ({g.rows.length})</button>)}</div>
              </div>
              <h3 className="lap-title">{hrG.title}</h3>
              <p className="lap-hint">Karyawan aktif yang kolom HighRisk-nya berisi tanggal. Kelompok ditentukan dari jabatan (mengandung A2B atau DT / dump truck).</p>
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
        </>
      )}
    </div>
  );
}
