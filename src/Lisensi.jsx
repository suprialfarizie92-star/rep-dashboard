import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { fmt, licenseDocs, norm, val } from './utils.js';
import './dashboard.css';

const TABS = [['perhatian', 'Perlu perhatian'], ['lewat', 'Lewat'], ['segera', 'Segera'], ['aktif', 'Aktif'], ['semua', 'Semua']];
const TONE = { lewat: 'red', segera: 'amber', aktif: 'green', none: 'gray' };
const LABEL = { lewat: 'Lewat', segera: 'Segera', aktif: 'Aktif', none: 'Tanpa tanggal' };
const fmtDate = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const sisa = left => (left === null ? '—' : left < 0 ? `${-left} hari lewat` : left === 0 ? 'Hari ini' : `${left} hari lagi`);

export default function Lisensi({ data, loading, canWrite, preset, onRefresh, onOpen }) {
  const [win, setWin] = useState(30);
  const [tab, setTab] = useState(preset?.initial || 'perhatian');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [asc, setAsc] = useState(true);
  useEffect(() => { if (preset?.initial) setTab(preset.initial); }, [preset]);

  const all = useMemo(() => licenseDocs(data), [data]);

  const statusOf = it => (it.left === null ? 'none' : it.left < 0 ? 'lewat' : it.left <= win ? 'segera' : 'aktif');
  const count = s => all.filter(it => statusOf(it) === s).length;
  const types = useMemo(() => [...new Set(all.map(i => i.type))].sort(), [all]);

  const rows = useMemo(() => {
    const needle = norm(q);
    return all
      .filter(it => {
        const s = statusOf(it);
        if (tab === 'perhatian' ? !(s === 'lewat' || s === 'segera') : tab !== 'semua' && s !== tab) return false;
        if (type && it.type !== type) return false;
        return !needle || [it.nama, it.id, it.jabatan].some(v => norm(v).includes(needle));
      })
      .sort((a, b) => {
        if (a.left === null) return 1;
        if (b.left === null) return -1;
        return asc ? a.left - b.left : b.left - a.left;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, type, q, asc, win]);

  // Tanggal lisensi tersimpan di baris karyawan, jadi "Perpanjang" membuka baris itu untuk diedit.
  const perpanjang = it => onOpen('Data_Karyawan', {
    label: `Perpanjang ${it.type} • ${it.nama || it.id}`, nav: 'lisensi',
    test: r => (it.id ? String(val(r, 'AMODI', 'NRP') ?? '') === String(it.id) : String(val(r, 'Nama', 'NAMA') ?? '') === String(it.nama ?? ''))
  }, 'lisensi');

  const stat = (value, label, tone, to) => (
    <button type="button" className={`dcard${tab === to ? ' on' : ''}`} data-tone={tone} onClick={() => setTab(to)} aria-pressed={tab === to}><b>{fmt(value, 0)}</b><span>{label}</span></button>
  );

  return (
    <div className="page-content dash">
      <div className="dash-top">
        <div>
          <h1>Lisensi</h1>
          <p className="subtle">Masa berlaku lisensi tiap karyawan: Authority, Escorting, HighRisk, PowerTools, Simper, dan Simpol.</p>
        </div>
        <div className="dash-filters">
          <label>Batas peringatan<select value={win} onChange={e => setWin(Number(e.target.value))}>{[30, 60, 90].map(d => <option key={d} value={d}>{d} hari</option>)}</select></label>
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      <div className="dgrid">
        {stat(count('lewat'), 'Sudah lewat', 'red', 'lewat')}
        {stat(count('segera'), `Habis dalam ${win} hari`, 'amber', 'segera')}
        {stat(count('aktif'), 'Masih aktif', 'green', 'aktif')}
        {stat(all.length, 'Total dokumen', 'gray', 'semua')}
      </div>

      <section className="panel tr-panel">
        <div className="lic-bar">
          <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, AMODI, atau jabatan" aria-label="Cari lisensi" />
          <div className="seg-tabs" role="group" aria-label="Status lisensi">
            {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
          </div>
          <select className="dash-select" value={type} onChange={e => setType(e.target.value)} aria-label="Jenis lisensi">
            <option value="">Semua</option>{types.map(x => <option key={x}>{x}</option>)}
          </select>
          <span className="count">{rows.length} dokumen</span>
        </div>

        {loading && !data.length ? (
          <div className="loading-state"><div className="spinner" />Memuat data...</div>
        ) : (
          <div className="tr-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Nama</th><th>Jabatan</th><th>Lisensi</th><th>Berlaku s.d.</th>
                  <th><button type="button" className="sortbtn" onClick={() => setAsc(a => !a)}>Sisa waktu {asc ? '▲' : '▼'}</button></th>
                  <th>Status</th>{canWrite && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(it => {
                  const s = statusOf(it);
                  return (
                    <tr key={it.k}>
                      <td className="lic-name"><strong>{it.nama || '—'}</strong><small>{it.id || '—'}</small></td>
                      <td>{it.jabatan || '—'}</td>
                      <td>{it.type}</td>
                      <td>{it.exp ? fmtDate(it.exp) : '—'}</td>
                      <td>{sisa(it.left)}</td>
                      <td><span className="badge" data-tone={TONE[s]}>{LABEL[s]}</span></td>
                      {canWrite && <td><button type="button" className="btn amber mini" onClick={() => perpanjang(it)}>Perpanjang</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <div className="no-results">{all.length ? 'Tidak ada lisensi yang cocok dengan filter ini.' : 'Belum ada tanggal lisensi di Data Karyawan. Pastikan kolom Authority, Escorting, HighRisk, PowerTools, Simper, atau Simpol berisi tanggal berlaku.'}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
