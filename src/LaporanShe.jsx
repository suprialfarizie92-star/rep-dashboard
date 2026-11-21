import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { KATEGORI, BULAN_PENDEK, IND, STAT_FIELDS, SHE, KRITIS, nf, usd } from './she.js';
import { BULAN, fd } from './laporan.js';

export const toIsoDate = d => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

/** Simpan satu baris ke app_data (tambah atau ganti), dengan pesan galat yang jelas. */
export async function saveRec(module, row_index, data) {
  const { error } = await supabase.from('app_data').upsert({ module, row_index, data, updated_at: new Date().toISOString() }, { onConflict: 'module,row_index' });
  if (error) throw new Error(error.message);
}
/** Simpan banyak baris sekaligus (per 100 baris). */
export async function saveMany(module, records) {
  for (let i = 0; i < records.length; i += 100) {
    const part = records.slice(i, i + 100).map(r => ({ module, row_index: r.row_index, data: r.data, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('app_data').upsert(part, { onConflict: 'module,row_index' });
    if (error) throw new Error(error.message);
  }
}
export async function deleteRec(module, row_index) {
  const { error } = await supabase.from('app_data').delete().eq('module', module).eq('row_index', row_index);
  if (error) throw new Error(error.message);
}

/** Form modal sederhana untuk semua isian di bagian ini. */
export function FormModal({ title, eyebrow, init, fields, onSave, onClose, onDelete }) {
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(c => ({ ...c, [k]: v }));
  const submit = async e => { e.preventDefault(); setBusy(true); try { await onSave(f); } finally { setBusy(false); } };
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="record-modal" onSubmit={submit}>
        <div className="modal-head"><div><div className="eyebrow muted">{eyebrow}</div><h2>{title}</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div>
        <div className="modal-fields">
          {fields.map(x => (
            <label key={x.key} className={x.wide ? 'field-wide' : undefined}><span>{x.label}</span>
              {x.type === 'textarea' ? <textarea rows="3" value={f[x.key] ?? ''} onChange={e => set(x.key, e.target.value)} />
                : x.type === 'select' ? <select value={f[x.key] ?? ''} onChange={e => set(x.key, e.target.value)}>{x.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select>
                : <input type={x.type || 'text'} step={x.type === 'number' ? 'any' : undefined} value={f[x.key] ?? ''} onChange={e => set(x.key, e.target.value)} required={x.required} />}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          {onDelete && <button type="button" className="btn light" style={{ marginRight: 'auto', color: 'var(--alert)' }} onClick={onDelete}>Hapus</button>}
          <button type="button" className="btn light" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </div>
  );
}

const Tbl = ({ head, rows, empty }) => (
  <div className="tr-scroll"><table className="ttable"><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={String(head[j]).match(/Uraian|Kronologis|Penyebab|Deskripsi|Catatan|Nama/) ? 'lap-wrap' : undefined}>{c}</td>)}</tr>)}</tbody></table>
    {!rows.length && <div className="no-results">{empty}</div>}</div>
);

export function Kinerja({ rows, month, year, canWrite, onTarget, catatan }) {
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>SHE Performance Monitoring • {BULAN[month]} {year}</h3>
        {canWrite && <button type="button" className="btn light mini" onClick={onTarget} style={{ marginLeft: 'auto' }}>Atur target (objective)</button>}
      </div>
      <p className="lap-hint">Aktual dan YTD dihitung dari tab Statistik insiden. SAP Achievement dan Implementasi PSMS dari isian bulanan di tab itu (YTD = rata-rata bulan yang terisi).</p>
      <Tbl head={['Description', 'Objective', 'Actual', 'Year to date']} rows={rows} empty="Belum ada data." />
      {catatan && <div className="lap-note" style={{ marginTop: 12 }}><b>Comments:</b> {catatan}</div>}
    </section>
  );
}

export function Statistik({ stat, year, canWrite, onEdit }) {
  const th = (t, extra) => <th key={t} {...extra}>{t}</th>;
  const cell = (s, f) => (s.filled ? f(s) : '');
  const tot = stat.filter(s => s.filled);
  const last = tot[tot.length - 1];
  return (
    <section className="panel tr-panel">
      <h3 className="lap-title">Incident Statistic {year}</h3>
      <p className="lap-hint">Isi angka tiap bulan lewat tombol "Isi / ubah". YTD, LTIFR, severity rate, dan LTI-free man hours dihitung otomatis. LTI-free dihitung dari akumulasi man hours sejak bulan terakhir yang ada LTI atau fatal.</p>
      <div className="tr-scroll">
        <table className="ttable">
          <thead>
            <tr>{['No', 'Bulan', 'Fatal', 'Pot. fatal', 'LTI', 'Minor injury', 'Property damage', 'Enviro', 'Near miss', 'Total insiden'].map(h => th(h, { rowSpan: 2 }))}
              {['Day loss', 'LTIFR', 'Severity rate', 'Man hours', 'LTI-free man hours', 'Biaya property damage'].map(h => th(h, { colSpan: 2, className: 'num' }))}{canWrite && th('', { rowSpan: 2 })}</tr>
            <tr>{Array.from({ length: 6 }, (_, i) => [<th key={`m${i}`}>Bulan</th>, <th key={`y${i}`}>YTD</th>])}</tr>
          </thead>
          <tbody>
            {stat.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td><td><strong>{BULAN_PENDEK[i]}</strong></td>
                <td>{cell(s, x => x.fatal)}</td><td>{cell(s, x => x.pf)}</td><td>{cell(s, x => x.lti)}</td><td>{cell(s, x => x.minor)}</td><td>{cell(s, x => x.pd)}</td><td>{cell(s, x => x.env)}</td><td>{cell(s, x => x.nm)}</td><td><strong>{cell(s, x => x.total)}</strong></td>
                <td>{cell(s, x => x.dl)}</td><td>{cell(s, x => x.ytd.dl)}</td>
                <td>{cell(s, x => nf(x.ltifr, 2))}</td><td>{cell(s, x => nf(x.ltifrYtd, 2))}</td>
                <td>{cell(s, x => nf(x.sev, 2))}</td><td>{cell(s, x => nf(x.sevYtd, 2))}</td>
                <td>{cell(s, x => nf(x.mh))}</td><td>{cell(s, x => nf(x.ytd.mh))}</td>
                <td>{cell(s, x => nf(x.freeMonth))}</td><td>{cell(s, x => nf(x.freeYtd))}</td>
                <td>{cell(s, x => (x.cost ? usd(x.cost) : '-'))}</td><td>{cell(s, x => (x.ytd.cost ? usd(x.ytd.cost) : '-'))}</td>
                {canWrite && <td><button type="button" className="btn light mini" onClick={() => onEdit(i)}><Icon name="edit" size={13} /> {s.filled ? 'Ubah' : 'Isi'}</button></td>}
              </tr>
            ))}
            {last && <tr className="sm-group"><td colSpan={2}>TOTAL</td><td>{last.ytd.fatal}</td><td>{last.ytd.pf}</td><td>{last.ytd.lti}</td><td>{last.ytd.minor}</td><td>{last.ytd.pd}</td><td>{last.ytd.env}</td><td>{last.ytd.nm}</td><td>{last.ytd.total}</td>
              <td>{last.ytd.dl}</td><td>{last.ytd.dl}</td><td>{nf(last.ltifrYtd, 2)}</td><td>{nf(last.ltifrYtd, 2)}</td><td>{nf(last.sevYtd, 2)}</td><td>{nf(last.sevYtd, 2)}</td><td>{nf(last.ytd.mh)}</td><td>{nf(last.ytd.mh)}</td><td>{nf(last.freeYtd)}</td><td>{nf(last.freeYtd)}</td><td>{usd(last.ytd.cost)}</td><td>{usd(last.ytd.cost)}</td>{canWrite && <td />}</tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const rp = v => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? '' : Number(v));
export function Insiden({ list, sub, setSub, canWrite, onAdd, onEdit, bulanLabel }) {
  const biaya = x => rp(x['Biaya Perbaikan']) + rp(x['Biaya Medis']);
  const totalHari = list.reduce((s, x) => s + (Number(x['Hari Hilang']) || 0), 0);
  const totalBiaya = list.reduce((s, x) => s + biaya(x), 0);
  const edit = x => canWrite && <button type="button" className="btn light mini" onClick={() => onEdit(x)}><Icon name="edit" size={13} /> Ubah</button>;
  const kritis = list.filter(x => KRITIS.includes(x.Kategori));
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <div className="seg-tabs" role="group" aria-label="Tampilan insiden">
          <button type="button" aria-pressed={sub === 'summary'} onClick={() => setSub('summary')}>Summary sheet (hal. 17)</button>
          <button type="button" aria-pressed={sub === 'bahaya'} onClick={() => setSub('bahaya')}>Kejadian berbahaya (hal. 19)</button>
        </div>
        {canWrite && <button type="button" className="btn primary mini" onClick={onAdd} style={{ marginLeft: 'auto' }}>+ Catat insiden</button>}
      </div>
      <h3 className="lap-title">{sub === 'summary' ? `Summary Sheet of Incident • ${bulanLabel}` : `Rekapitulasi Kejadian Berbahaya dan Kecelakaan Kerja • ${bulanLabel}`}</h3>
      <p className="lap-hint">{sub === 'summary' ? 'Semua insiden bulan ini, termasuk property damage.' : 'Insiden berkategori fatal, potential fatal, LTI, minor injury, enviro, dan near miss.'}</p>
      {sub === 'summary' ? (
        <>
          <Tbl head={['No', 'Tanggal / waktu', 'Lokasi', 'Departemen', 'Nama / jabatan', 'Kategori', 'Uraian kejadian', 'Hari hilang', 'Biaya perbaikan (Rp)', 'Biaya medis (Rp)', 'Total (Rp)', 'Penyebab', '']}
            rows={list.map((x, i) => [i + 1, `${fd(x.d)}${x.Waktu ? ` ${x.Waktu}` : ''}`, x.Lokasi || '—', x.Departemen || '—', x['Nama / Jabatan'] || '—', x.Kategori || '—', x.Uraian || '—', x['Hari Hilang'] || 0,
              nf(rp(x['Biaya Perbaikan']) || 0), nf(rp(x['Biaya Medis']) || 0), nf(biaya(x)), x.Penyebab || '—', edit(x)])} empty="Tidak ada insiden tercatat di bulan ini." />
          <div className="lap-note" style={{ marginTop: 12 }}><b>Total:</b> {totalHari} hari hilang • Rp {nf(totalBiaya)}</div>
        </>
      ) : (
        <Tbl head={['No', 'Nomor kecelakaan', 'Tanggal', 'Waktu', 'Lokasi', 'Kronologis kejadian', 'Akibat kejadian', 'Dilaporkan ke KaIT', 'Catatan', '']}
          rows={kritis.map((x, i) => [i + 1, x['Nomor Kecelakaan'] || '—', fd(x.d), x.Waktu || '—', x.Lokasi || '—', x.Uraian || '—', x.Akibat || '—', x['Dilaporkan ke KaIT'] || '—', x.Catatan || '—', edit(x)])} empty="Tidak ada kejadian berbahaya atau kecelakaan kerja di bulan ini." />
      )}
    </section>
  );
}

export function Penegakan({ list, bulanLabel }) {
  return (
    <section className="panel tr-panel">
      <h3 className="lap-title">SHE Law Enforcement Report • {bulanLabel}</h3>
      <p className="lap-hint">Diambil dari menu Pembinaan Karyawan (tanggal pembinaan pada bulan ini). Sanksi disiplin = jenis pembinaan.</p>
      <Tbl head={['No', 'Tanggal', 'Nama karyawan', 'NRP', 'Dept.', 'Jabatan', 'Deskripsi insiden / pelanggaran', 'Sanksi disiplin', 'Keterangan']}
        rows={list.map((x, i) => [i + 1, fd(x.d), x.nama || '—', x.nrp || '—', x.dept || '—', x.jabatan || '—', x.desk || '—', x.sanksi || '—', x.ket || '—'])} empty="Tidak ada pembinaan di bulan ini." />
    </section>
  );
}

export const insidenFields = [
  { key: 'Tanggal', label: 'Tanggal', type: 'date', required: true }, { key: 'Waktu', label: 'Waktu', type: 'time' },
  { key: 'Kategori', label: 'Kategori', type: 'select', options: KATEGORI }, { key: 'Lokasi', label: 'Lokasi atau nomor unit' },
  { key: 'Departemen', label: 'Departemen' }, { key: 'Nama / Jabatan', label: 'Nama / jabatan' },
  { key: 'Uraian', label: 'Uraian / kronologis kejadian', type: 'textarea', wide: true },
  { key: 'Hari Hilang', label: 'Hari hilang (LTI)', type: 'number' }, { key: 'Biaya Perbaikan', label: 'Biaya perbaikan (Rp)', type: 'number' }, { key: 'Biaya Medis', label: 'Biaya medis (Rp)', type: 'number' },
  { key: 'Penyebab', label: 'Remark / penyebab', type: 'textarea', wide: true },
  { key: 'Nomor Kecelakaan', label: 'Nomor kecelakaan' }, { key: 'Akibat', label: 'Akibat kejadian' },
  { key: 'Dilaporkan ke KaIT', label: 'Dilaporkan ke KaIT', type: 'select', options: ['', 'Ya', 'Tidak'] }, { key: 'Catatan', label: 'Catatan', type: 'textarea', wide: true }
];
export const statFields = [...STAT_FIELDS.map(([key, label]) => ({ key, label, type: 'number' })), { key: 'Catatan', label: 'Comments untuk bulan ini', type: 'textarea', wide: true }];
export const targetFields = [...IND.map(([key, label]) => ({ key, label: `Objective: ${label}` })), { key: 'faktor', label: 'Faktor LTIFR dan severity rate (jam kerja)' }];
export { SHE };
