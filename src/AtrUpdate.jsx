import React, { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { avg, norm, num, resignedChecker, val } from './utils.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const keyOf = (r, name) => Object.keys(r).find(k => norm(k) === norm(name));
// Nilai tersimpan bisa pecahan (0,936) atau persen (93,6). Hasilnya selalu persen.
const pctOf = v => { const n = num(v); return n === null ? null : n <= 1.5 ? n * 100 : n; };
const show = p => (p === null ? '' : String(+p.toFixed(2)).replace('.', ','));

// Input selalu dalam persen: "93,6", "93.6", "93,6%". Kosong atau "-" berarti belum ada data.
function parsePct(s) {
  const t = String(s ?? '').trim();
  if (t === '' || t === '-') return { blank: true };
  const n = num(t);
  if (n === null || n < 0 || n > 100) return { bad: true };
  return { v: n };
}

export default function AtrUpdate({ data, onClose, onSaved }) {
  const rows = useMemo(() => {
    const gone = resignedChecker(data);
    return data.filter(x => x.module === 'Data_ATR' && !gone(x.data || {}))
      .map(x => ({ ri: x.row_index, rec: x.data || {} }))
      .sort((a, b) => a.ri - b.ri);
  }, [data]);

  // Bulan yang sudah terisi paling akhir; default menuju bulan berikutnya.
  const lastFilled = useMemo(() => MONTHS.reduce((l, m, i) => (rows.some(r => pctOf(val(r.rec, m)) !== null) ? i : l), -1), [rows]);
  const [month, setMonth] = useState(Math.min(lastFilled + 1, 11));
  const [vals, setVals] = useState({});
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Gaya penyimpanan data lama: pecahan (0,936) atau persen (93,6).
  const asFraction = useMemo(() => {
    let small = 0; let big = 0;
    rows.forEach(r => MONTHS.concat('YTD').forEach(m => { const v = val(r.rec, m); if (typeof v === 'number' && v > 0) { if (v <= 1.01) small++; else big++; } }));
    return small >= big;
  }, [rows]);

  const existing = r => show(pctOf(val(r.rec, MONTHS[month])));
  const current = r => (vals[r.ri] !== undefined ? vals[r.ri] : existing(r));
  const setVal = (ri, v) => setVals(c => ({ ...c, [ri]: v }));
  const changeMonth = m => { setMonth(m); setVals({}); setInfo(''); setError(''); };

  const needle = norm(q);
  const shown = rows.filter(r => !needle || [val(r.rec, 'Nama', 'NAMA'), val(r.rec, 'AMODI'), val(r.rec, 'NRP')].some(v => norm(v).includes(needle)));
  const changed = rows.filter(r => vals[r.ri] !== undefined && vals[r.ri] !== existing(r));
  const invalid = changed.filter(r => parsePct(vals[r.ri]).bad);

  // Tempel dari Excel: tiap baris "AMODI/NRP/Nama <tab> nilai ATR".
  const applyPaste = () => {
    const next = { ...vals }; let ok = 0; const miss = [];
    paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const cells = line.split(/\t|;/).map(c => c.trim());
      if (cells.length < 2) { miss.push(line); return; }
      const key = norm(cells[0]); const value = cells[cells.length - 1];
      const hit = rows.find(r => [val(r.rec, 'AMODI'), val(r.rec, 'NRP')].some(v => v !== undefined && norm(v) === key))
        || rows.find(r => norm(val(r.rec, 'Nama', 'NAMA')) === key);
      if (hit) { next[hit.ri] = value; ok++; } else miss.push(cells[0]);
    });
    setVals(next);
    setInfo(`${ok} baris cocok${miss.length ? `, ${miss.length} tidak ditemukan (mungkin sudah resign atau belum ada di ATR): ${miss.slice(0, 5).join(', ')}${miss.length > 5 ? ', …' : ''}` : ''}.`);
    setPaste('');
  };

  const save = async () => {
    if (invalid.length) { setError(`${invalid.length} nilai tidak valid. Isi angka 0–100, contoh 93,6.`); return; }
    if (!changed.length) { setError('Belum ada nilai yang berubah.'); return; }
    setBusy(true); setError('');
    try {
      const div = asFraction ? 100 : 1;
      const jobs = changed.map(r => {
        const rec = { ...r.rec };
        const p = parsePct(vals[r.ri]);
        rec[keyOf(rec, MONTHS[month]) || MONTHS[month]] = p.blank ? '' : p.v / div;
        // YTD = rata-rata semua bulan yang terisi.
        const ytd = avg(MONTHS.map(m => pctOf(val(rec, m))).filter(x => x !== null));
        rec[keyOf(rec, 'YTD') || 'YTD'] = ytd === null ? '' : ytd / div;
        return { ri: r.ri, rec };
      });
      for (let i = 0; i < jobs.length; i += 10) {
        const res = await Promise.all(jobs.slice(i, i + 10).map(j => supabase.from('app_data')
          .update({ data: j.rec, updated_at: new Date().toISOString() }).eq('module', 'Data_ATR').eq('row_index', j.ri)));
        const bad = res.find(x => x.error);
        if (bad) throw bad.error;
      }
      await onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan ATR.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="record-modal" style={{ width: 'min(100%, 880px)' }} role="dialog" aria-modal="true" aria-label="Update ATR bulanan">
        <div className="modal-head">
          <div><small>ATR</small><h2>Update ATR {NAMA_BULAN[month]}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Tutup"><Icon name="close" size={17} /></button>
        </div>

        <div style={{ padding: '14px 23px 0', display: 'grid', gap: 10 }}>
          <div className="lic-bar" style={{ margin: 0 }}>
            <select className="dash-select" value={month} onChange={e => changeMonth(Number(e.target.value))} aria-label="Bulan">
              {MONTHS.map((m, i) => <option key={m} value={i}>{NAMA_BULAN[i]}</option>)}
            </select>
            <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau AMODI" aria-label="Cari karyawan" />
            <span className="count">{changed.length} diubah dari {rows.length} karyawan</span>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '.75rem', fontWeight: 700 }}>Tempel dari Excel (AMODI/NRP/Nama, lalu nilai ATR)</summary>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} style={{ width: '100%', marginTop: 8, fontSize: '.75rem' }}
              placeholder={'REP0186\t93,6\nREP0213\t100'} />
            <button type="button" className="btn light mini" onClick={applyPaste} disabled={!paste.trim()}>Terapkan</button>
          </details>
          <p className="subtle" style={{ margin: 0 }}>Isi dalam persen (contoh 93,6). Kosongkan bila belum ada data. YTD dihitung otomatis dari rata-rata semua bulan yang terisi.</p>
          {info && <p className="subtle" style={{ margin: 0 }}>{info}</p>}
          {error && <p role="alert" style={{ margin: 0, color: 'var(--alert)', fontSize: '.75rem' }}>{error}</p>}
        </div>

        <div className="tr-scroll" style={{ margin: '10px 23px', maxHeight: 380 }}>
          <table className="ttable">
            <thead><tr><th>Nama</th><th>Jabatan</th><th className="num">{MONTHS[month]} (%)</th></tr></thead>
            <tbody>{shown.map(r => {
              const bad = vals[r.ri] !== undefined && parsePct(vals[r.ri]).bad;
              return (
                <tr key={r.ri}>
                  <td><div className="lic-name"><strong>{val(r.rec, 'Nama', 'NAMA') || '—'}</strong><small>{val(r.rec, 'AMODI', 'NRP') || '—'}</small></div></td>
                  <td>{val(r.rec, 'Jabatan', 'JABATAN') || '—'}</td>
                  <td className="num">
                    <input value={current(r)} onChange={e => setVal(r.ri, e.target.value)} inputMode="decimal" aria-label={`ATR ${MONTHS[month]} ${val(r.rec, 'Nama', 'NAMA') || ''}`}
                      style={{ width: 80, textAlign: 'right', padding: '5px 8px', borderRadius: 6, border: `1px solid ${bad ? 'var(--alert)' : 'var(--line)'}`, background: 'var(--surface-2)', color: 'var(--text)' }} />
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {!shown.length && <div className="no-results">Tidak ada karyawan yang cocok.</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn light" onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !changed.length}>{busy ? 'Menyimpan…' : `Simpan ${changed.length} perubahan`}</button>
        </div>
      </div>
    </div>
  );
}
