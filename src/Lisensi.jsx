import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { fmt, licenseDocs, norm, val } from './utils.js';
import './dashboard.css';

const TABS = [['perhatian', 'Perlu perhatian'], ['lewat', 'Lewat'], ['segera', 'Segera'], ['aktif', 'Aktif'], ['semua', 'Semua'], ['bulan', 'Per bulan']];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const SURVEY_LEAD = 2; // Authority masuk Form Need Survey 2 bulan (hitungan bulan kalender) sebelum habis berlaku
const addMonth = (y, m, k) => { const t = y * 12 + m + k; return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; };
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
  const now = new Date();
  const [bm, setBm] = useState(now.getMonth());
  const [by, setBy] = useState(now.getFullYear());
  const [acuan, setAcuan] = useState('expiry'); // 'expiry' = bulan habis berlaku, 'form' = bulan form survey
  const [dl, setDl] = useState(false);
  useEffect(() => { if (preset?.initial) setTab(preset.initial); }, [preset]);

  const all = useMemo(() => licenseDocs(data), [data]);

  const statusOf = it => (it.left === null ? 'none' : it.left < 0 ? 'lewat' : it.left <= win ? 'segera' : 'aktif');
  const count = s => all.filter(it => statusOf(it) === s).length;
  const types = useMemo(() => [...new Set(all.map(i => i.type))].sort(), [all]);

  // Bulan habis berlaku yang dicari: langsung (acuan expiry) atau 2 bulan setelah bulan form (acuan form).
  const target = acuan === 'form' ? addMonth(by, bm, SURVEY_LEAD) : { y: by, m: bm };
  const formAt = acuan === 'form' ? { y: by, m: bm } : addMonth(by, bm, -SURVEY_LEAD);
  const inTarget = it => it.exp && it.exp.getFullYear() === target.y && it.exp.getMonth() === target.m;
  const survey = useMemo(() => {
    const seen = new Set();
    return all.filter(it => it.type === 'Authority' && inTarget(it) && !seen.has(it.id || it.nama) && seen.add(it.id || it.nama))
      .sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, target.y, target.m]);
  const unduhForm = async () => {
    setDl(true);
    try { const { downloadNeedSurvey } = await import('./needSurvey.js'); await downloadNeedSurvey(survey.map(it => ({ nama: it.nama, exp: it.exp })), { month: formAt.m, year: formAt.y }); } catch (e) { window.alert(`Gagal membuat form: ${e.message}`); } finally { setDl(false); }
  };

  const rows = useMemo(() => {
    const needle = norm(q);
    return all
      .filter(it => {
        const s = statusOf(it);
        if (tab === 'bulan') { if (!inTarget(it)) return false; if ((acuan === 'form' ? 'Authority' : type) && it.type !== (acuan === 'form' ? 'Authority' : type)) return false; return !needle || [it.nama, it.id, it.jabatan].some(v => norm(v).includes(needle)); }
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
  }, [all, tab, type, q, asc, win, bm, by, acuan]);

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
          <select className="dash-select" value={tab === 'bulan' && acuan === 'form' ? 'Authority' : type} disabled={tab === 'bulan' && acuan === 'form'} onChange={e => setType(e.target.value)} aria-label="Jenis lisensi">
            <option value="">Semua</option>{types.map(x => <option key={x}>{x}</option>)}
          </select>
          <span className="count">{rows.length} dokumen{tab === 'bulan' ? ` • ${NAMA_BULAN[target.m]} ${target.y}` : ''}</span>
        </div>

        {tab === 'bulan' && (
          <div className="lic-bar" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
            <label>Acuan<select className="dash-select" value={acuan} onChange={e => setAcuan(e.target.value)}>
              <option value="expiry">Bulan habis berlaku</option><option value="form">Bulan form survey (Authority)</option></select></label>
            <label>Bulan<select className="dash-select" value={bm} onChange={e => setBm(Number(e.target.value))}>{NAMA_BULAN.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>
            <label>Tahun<select className="dash-select" value={by} onChange={e => setBy(Number(e.target.value))}>{Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}</select></label>
            <span className="subtle" style={{ flex: '1 1 260px' }}>
              Menampilkan lisensi yang habis berlaku di <b>{NAMA_BULAN[target.m]} {target.y}</b>.
              {' '}Authority yang habis di bulan itu masuk <b>Form Need Survey {NAMA_BULAN[formAt.m]} {formAt.y}</b> ({SURVEY_LEAD} bulan sebelumnya).
            </span>
            <button type="button" className="btn primary" disabled={dl || !survey.length} onClick={unduhForm}><Icon name="download" size={15} /> {dl ? 'Membuat...' : `Unduh Form Need Survey (${survey.length} orang)`}</button>
          </div>
        )}
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
