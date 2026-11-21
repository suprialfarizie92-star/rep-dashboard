import React, { useRef } from 'react';
import Icon from './Icon.jsx';
import { HARI, SAP_FIELDS, SAP_KAT, daysIn, inspeksiTotal, pctTxt } from './she3.js';
import { BULAN } from './laporan.js';

const tone = v => (v === null ? 'gray' : v >= 1 ? 'green' : v >= 0.8 ? 'amber' : 'red');

export function SapTab({ sap, year, month, canWrite, onImport, onAdd, onEdit, onApplyPerf, statAda }) {
  const ref = useRef(null);
  const { rows, tot, ach, overall } = sap;
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>Safety Accountability Program (SAP) • {BULAN[month]} {year}</h3>
        {canWrite && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn light mini" onClick={() => ref.current?.click()}><Icon name="upload" size={13} /> Impor file SAP (Excel)</button>
            <button type="button" className="btn light mini" onClick={onAdd}>+ Tambah orang</button>
          </span>
        )}
        <input ref={ref} type="file" accept=".xlsx,.xls" className="sm-hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
      </div>
      <p className="lap-hint">Achievement tiap kategori = total actual dibagi total plan. Achievement keseluruhan = rata-rata achievement kategori yang punya plan, sama seperti file SAP Anda.</p>
      <div className="tr-scroll">
        <table className="ttable">
          <thead>
            <tr><th rowSpan={2}>No</th><th rowSpan={2}>Nama</th>{SAP_KAT.map(([k, n]) => <th key={k} colSpan={2} className="num">{n}</th>)}{canWrite && <th rowSpan={2} />}</tr>
            <tr>{SAP_KAT.flatMap(([k]) => [<th key={`${k}p`}>Plan</th>, <th key={`${k}a`}>Actual</th>])}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.row_index}>
                <td>{i + 1}</td><td><strong>{r.Nama}</strong></td>
                {SAP_FIELDS.map(([key]) => <td key={key}>{r[key] === '' || r[key] === undefined ? '' : r[key]}</td>)}
                {canWrite && <td><button type="button" className="btn light mini" onClick={() => onEdit(r)}><Icon name="edit" size={13} /> Ubah</button></td>}
              </tr>
            ))}
            {rows.length > 0 && (
              <>
                <tr className="sm-group"><td colSpan={2}>TOTAL</td>{SAP_KAT.flatMap(([k]) => [<td key={`${k}p`}>{tot[k].plan}</td>, <td key={`${k}a`}>{tot[k].actual}</td>])}{canWrite && <td />}</tr>
                <tr className="sm-group"><td colSpan={2}>ACH</td>{SAP_KAT.map(([k]) => <td key={k} colSpan={2} className="num"><span className="badge" data-tone={tone(ach[k])}>{pctTxt(ach[k])}</span></td>)}{canWrite && <td />}</tr>
              </>
            )}
          </tbody>
        </table>
        {!rows.length && <div className="no-results">Belum ada data SAP di bulan ini. {canWrite ? 'Impor file SAP atau tambah orang satu per satu.' : ''}</div>}
      </div>
      {rows.length > 0 && (
        <div className="sm-import" style={{ marginTop: 12 }}>
          <span><b>Achievement SAP keseluruhan: {pctTxt(overall)}</b>{overall > 1 ? ' (di laporan Performance biasanya ditulis maksimal 100%).' : ''}</span>
          {canWrite && <button type="button" className="btn light mini" disabled={!statAda} onClick={onApplyPerf} title={statAda ? '' : 'Isi dulu statistik bulan ini di tab Statistik insiden'}>Terapkan ke Performance (maks 100%)</button>}
        </div>
      )}
    </section>
  );
}

export function InspeksiTab({ list, year, month, canWrite, onToggle, onAdd, onDelete, onCopyPrev }) {
  const n = daysIn(year, month);
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const t = inspeksiTotal(list);
  const dow = d => HARI[new Date(year, month, d).getDay()];
  const cell = (it, key, d) => {
    const on = it[key === 'Plan' ? 'plan' : 'actual'].includes(d);
    return (
      <td key={d} className="insp-cell" data-on={on ? key : undefined} data-weekend={[0, 6].includes(new Date(year, month, d).getDay()) ? '1' : undefined}>
        {canWrite ? <button type="button" aria-label={`${it.Inspeksi} ${key} tanggal ${d}`} aria-pressed={on} onClick={() => onToggle(it, key, d)} /> : null}
      </td>
    );
  };
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>Jadwal Inspeksi • {BULAN[month]} {year}</h3>
        {canWrite && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn light mini" onClick={onCopyPrev}>Salin rencana dari bulan lalu</button>
            <button type="button" className="btn light mini" onClick={onAdd}>+ Tambah inspeksi</button>
          </span>
        )}
      </div>
      <p className="lap-hint">{canWrite ? 'Klik kotak pada baris Plan untuk menandai hari rencana, dan pada baris Actual untuk hari yang sudah dilakukan. ' : ''}Achievement = hari rencana yang sudah dilakukan dibagi jumlah hari rencana.</p>
      <div className="tr-scroll">
        <table className="ttable insp">
          <thead>
            <tr><th>No</th><th>Inspeksi</th><th /><th colSpan={n} className="num">Tanggal</th><th>Plan</th><th>Done</th><th>ACH</th>{canWrite && <th />}</tr>
            <tr><th /><th /><th />{days.map(d => <th key={d} className="insp-day"><div>{d}</div><div className="insp-dow">{dow(d)[0]}</div></th>)}<th /><th /><th />{canWrite && <th />}</tr>
          </thead>
          <tbody>
            {list.flatMap(it => [
              <tr key={`${it.row_index}p`}><td rowSpan={2}>{it.No}</td><td rowSpan={2}><strong>{it.Inspeksi}</strong></td><td>Plan</td>{days.map(d => cell(it, 'Plan', d))}<td>{it.plan.length}</td><td rowSpan={2}>{it.done}</td><td rowSpan={2}><span className="badge" data-tone={tone(it.ach)}>{pctTxt(it.ach)}</span></td>{canWrite && <td rowSpan={2}><button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={() => onDelete(it)}>Hapus</button></td>}</tr>,
              <tr key={`${it.row_index}a`}><td>Actual</td>{days.map(d => cell(it, 'Actual', d))}<td>{it.actual.length}</td></tr>
            ])}
            {list.length > 0 && <tr className="sm-group"><td colSpan={3}>TOTAL</td><td colSpan={n} /><td>{t.plan}</td><td>{t.done}</td><td><span className="badge" data-tone={tone(t.ach)}>{pctTxt(t.ach)}</span></td>{canWrite && <td />}</tr>}
          </tbody>
        </table>
        {!list.length && <div className="no-results">Belum ada jadwal inspeksi di bulan ini. {canWrite ? 'Salin dari bulan lalu atau tambah inspeksi.' : ''}</div>}
      </div>
    </section>
  );
}

export const sapFields = [{ key: 'Nama', label: 'Nama', required: true }, ...SAP_FIELDS.map(([key, label]) => ({ key, label, type: 'number' }))];
export const inspFields = [{ key: 'Inspeksi', label: 'Nama inspeksi', required: true }];
