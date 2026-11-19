import React, { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { DEPT, fmt, norm, resignedChecker, val } from './utils.js';
import { computeTraining, idOf, isPlanned } from './training.js';
import './dashboard.css';

const TONE = { Selesai: 'green', Sebagian: 'amber', 'Belum mulai': 'red' };

function Stat({ value, label, tone, active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`dcard${onClick ? '' : ' static'}${active ? ' on' : ''}`} data-tone={tone} onClick={onClick} aria-pressed={onClick ? !!active : undefined}>
      <b>{value}</b>
      <span>{label}</span>
    </Tag>
  );
}

export default function Training({ data, loading, onRefresh, onOpen }) {
  const [dept, setDept] = useState('');
  const [asc, setAsc] = useState(true);
  const [only, setOnly] = useState('');
  const [expanded, setExpanded] = useState('');

  const depts = useMemo(() => {
    const gone = resignedChecker(data);
    return [...new Set(data.filter(x => x.module === 'TNA_Plan' && !gone(x.data || {})).map(x => val(x.data || {}, ...DEPT)).filter(Boolean).map(String))].sort();
  }, [data]);
  const T = useMemo(() => computeTraining(data, r => !dept || norm(val(r, ...DEPT)) === norm(dept)), [data, dept]);
  const rows = useMemo(
    () => T.items.filter(i => !only || i.status === only).sort((a, b) => (asc ? a.pct - b.pct : b.pct - a.pct)),
    [T, asc, only]
  );
  const toggle = s => setOnly(cur => (cur === s ? '' : s));

  return (
    <div className="page-content dash">
      <div className="dash-top">
        <div>
          <h1>Training</h1>
          <p className="subtle">Pemenuhan training (TNA) gabungan Plan dan Realisasi. Klik baris untuk melihat siapa yang belum, klik kartu status untuk menyaring tabel.</p>
        </div>
        <div className="dash-filters">
          <label>Departemen<select value={dept} onChange={e => setDept(e.target.value)}><option value="">Semua</option>{depts.map(d => <option key={d}>{d}</option>)}</select></label>
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      <div className="dgrid tr-stats">
        <Stat value={fmt(T.items.length, 0)} label="Jenis training" tone="gray" />
        <Stat value={T.rate === null ? '—' : `${fmt(T.rate)}%`} label={`Pemenuhan keseluruhan (${fmt(T.totalDone, 0)} dari ${fmt(T.totalPlan, 0)})`} tone="blue" />
        <Stat value={fmt(T.tuntas, 0)} label="Training tuntas (100%)" tone="green" active={only === 'Selesai'} onClick={() => toggle('Selesai')} />
        <Stat value={fmt(T.sebagian, 0)} label="Sebagian" tone="amber" active={only === 'Sebagian'} onClick={() => toggle('Sebagian')} />
        <Stat value={fmt(T.belum, 0)} label="Belum dimulai" tone="red" active={only === 'Belum mulai'} onClick={() => toggle('Belum mulai')} />
        <Stat value={fmt(T.pendingPeople, 0)} label="Karyawan masih punya training tertunda" tone="gray" />
      </div>

      <section className="panel tr-panel">
        <div className="panel-heading">
          <div>
            <h3>Pencapaian per training</h3>
            <p className="subtle">Plan = karyawan yang dijadwalkan. Aktual = yang sudah punya tanggal training. Sisa = Plan dikurangi Aktual.</p>
          </div>
        </div>

        {loading && !data.length ? (
          <div className="loading-state"><div className="spinner" />Memuat data...</div>
        ) : !T.items.length ? (
          <div className="empty-state"><strong>Belum ada data TNA</strong><span>Impor sheet TNA_Plan dan TNA_Realisasi terlebih dahulu.</span></div>
        ) : (
          <div className="tr-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Training</th><th>Kategori</th><th className="num">Plan</th><th className="num">Aktual</th><th className="num">Sisa</th>
                  <th><button type="button" className="sortbtn" onClick={() => setAsc(a => !a)}>Pencapaian {asc ? '▲' : '▼'}</button></th>
                  <th>Status</th><th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(it => {
                  const isOpen = expanded === it.name;
                  const ids = new Set(it.pending.map(p => p.id));
                  return (
                    <React.Fragment key={it.name}>
                      <tr className={`trow${isOpen ? ' open' : ''}`} onClick={() => setExpanded(isOpen ? '' : it.name)}>
                        <td><button type="button" className="linkbtn" aria-expanded={isOpen}>{it.name}</button></td>
                        <td className="muted-cell">{it.cat}</td>
                        <td className="num">{it.plan}</td>
                        <td className="num">{it.aktual}</td>
                        <td className="num" data-zero={it.sisa === 0}>{it.sisa}</td>
                        <td><div className="pcell"><div className="pbar"><i data-tone={TONE[it.status]} style={{ width: `${it.pct}%` }} /></div><span>{fmt(it.pct, 0)}%</span></div></td>
                        <td><span className="badge" data-tone={TONE[it.status]}>{it.status}</span></td>
                        <td>
                          <button type="button" className="btn light mini" onClick={e => { e.stopPropagation(); onOpen('TNA_Plan', { label: `Plan ${it.name}`, nav: 'training', test: r => isPlanned(val(r, it.name)) }, 'training'); }}>Atur plan</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="tdetail">
                          <td colSpan={8}>
                            {it.sisa === 0 ? <p className="subtle">Semua karyawan yang dijadwalkan sudah menyelesaikan training ini.</p> : (
                              <>
                                <div className="tdetail-head">
                                  <strong>{it.sisa} karyawan belum selesai</strong>
                                  <button type="button" className="btn light mini" onClick={() => onOpen('TNA_Realisasi', { label: `Belum ${it.name}`, nav: 'training', test: r => ids.has(idOf(r)) }, 'training')}>Buka di TNA Realisasi</button>
                                </div>
                                <ul className="tlist">
                                  {it.pending.map(p => <li key={p.id}><span>{p.nama || '—'}</span><small>{p.id || '—'}{p.dept ? ` • ${p.dept}` : ''}</small></li>)}
                                </ul>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <div className="no-results">Tidak ada training dengan status ini.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
