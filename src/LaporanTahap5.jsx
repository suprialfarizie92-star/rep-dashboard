import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { BUCKET } from './she4.js';
import { BULAN, fd } from './laporan.js';
import { FormModal, deleteRec, saveMany, saveRec } from './LaporanShe.jsx';
import { uploadFotos, useFotoUrls } from './LaporanTahap4.jsx';
import { M5, STATUS_PICA, bmiTone, buildBMI, buildKK, buildKkp, buildPenyakit, buildPica, buildStruktur, join, list, parseBmi, parseKk, parseMom, pctN, personKey, KK_ID, BMI_ID } from './she5.js';
import { toIso } from './smkp.js';

const SB = { Open: 'amber', Continue: 'blue', Closed: 'green', Belum: 'gray' };
const dt = v => (toIso(v) ? fd(new Date(`${toIso(v)}T00:00:00`)) : (v ? String(v) : '—'));

const Tbl = ({ head, rows, empty, groups }) => (
  <div className="tr-scroll"><table className="ttable"><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={/Problem|Action|Kronologis|Akibat|Catatan|Agenda|Lokasi|Departemen|Hasil|Obat/i.test(head[j]) ? 'lap-wrap' : undefined}>{c}</td>)}</tr>)}</tbody></table>
    {!rows.length && <div className="no-results">{empty}</div>}</div>
);
const EditBtn = ({ on, label = 'Ubah' }) => <button type="button" className="btn light mini" onClick={on}><Icon name="edit" size={13} /> {label}</button>;

/** Penyimpanan umum: setiap aksi menyimpan lalu memuat ulang data. */
function useRunner(onRefresh, onNotice) {
  const [busy, setBusy] = useState('');
  const run = async (fn, ok, label = 'Menyimpan...') => { setBusy(label); try { await fn(); if (ok) onNotice?.(ok); await onRefresh?.(); return true; } catch (e) { onNotice?.(`Gagal: ${e.message}`); return false; } finally { setBusy(''); } };
  return [busy, run];
}

function FotoStrip({ paths, urls, canWrite, onDelete, alt }) {
  return (
    <div className="keg-fotos">
      {paths.map(p => (
        <figure key={p} className="keg-foto">
          {urls[p] ? <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt={alt} loading="lazy" /></a> : <div className="keg-ph">Memuat...</div>}
          {canWrite && <button type="button" aria-label="Hapus foto" onClick={() => onDelete(p)}>×</button>}
        </figure>
      ))}
      {!paths.length && <div className="keg-ph">Belum ada foto</div>}
    </div>
  );
}

// ---------- PICA kebutuhan manpower (otomatis dari menu Database Manpower) ----------
export function PicaPanel({ data }) {
  const L = useMemo(() => buildPica(data), [data]);
  return (
    <section className="panel tr-panel">
      <h3 className="lap-title">PICA Kebutuhan Manpower</h3>
      <p className="lap-hint">Diambil otomatis dari menu Database Manpower (bagian Tindak lanjut / PICA). Untuk menambah atau mengubah, buka menu Database Manpower; tampilan di sini dan PowerPoint ikut berubah.</p>
      <Tbl head={['No', 'Problems / permasalahan', 'Corrective action / tindakan perbaikan', 'PIC', 'Due date', 'Status']}
        rows={L.map(x => [x.No, x.Problem, x.Action || '—', x.PIC || '—', dt(x['Due Date']), <span key="s" className="badge" data-tone={SB[x.Status] || 'gray'}>{x.Status || 'Open'}</span>])}
        empty="Belum ada PICA di menu Database Manpower." />
    </section>
  );
}

// ---------- Rekap penyakit (PAK dan KAPTK) ----------
const penFields = [
  { key: 'Nomor', label: 'Nomor urut kejadian' }, { key: 'Tanggal', label: 'Tanggal', type: 'date', required: true }, { key: 'Waktu', label: 'Waktu' }, { key: 'Lokasi', label: 'Lokasi' },
  { key: 'Pekerja', label: 'Departemen, jabatan, lama bekerja', wide: true }, { key: 'Kronologis', label: 'Kronologis kejadian', type: 'textarea', wide: true },
  { key: 'Akibat', label: 'Akibat kejadian', type: 'textarea', wide: true }, { key: 'Dilaporkan', label: 'Dilaporkan kepada KaIT / Kadis' }, { key: 'Catatan', label: 'Catatan', type: 'textarea', wide: true }
];
export function PenyakitTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const [jenis, setJenis] = useState('PAK'); const [modal, setModal] = useState(null); const [busy, run] = useRunner(onRefresh, onNotice);
  const M = useMemo(() => buildPenyakit(data, year, jenis, month), [data, year, jenis, month]);
  const all = (data || []).filter(r => r.module === M5.penyakit && Number(r.data?.Tahun) === year).map(r => r.row_index);
  const save = (f, row) => run(async () => {
    const d = new Date(`${f.Tanggal}T00:00:00`);
    await saveRec(M5.penyakit, row ? row.row_index : Math.max(year * 10000, ...all) + 1, { Tahun: year, Bulan: d.getMonth() + 1, Jenis: jenis, ...f });
    setModal(null);
  }, 'Catatan disimpan.');
  const del = row => window.confirm('Hapus catatan ini?') && run(() => deleteRec(M5.penyakit, row.row_index), 'Catatan dihapus.');
  const rows = []; let no = 0;
  M.forEach(({ m, items }) => {
    if (!items.length) { no += 1; rows.push([no, BULAN[m].slice(0, 3).toUpperCase(), 'NIHIL', '', '', '', '', '', '', '']); return; }
    items.forEach(x => { no += 1; rows.push([no, BULAN[m].slice(0, 3).toUpperCase(), x.Nomor || '—', `${dt(x.Tanggal)}${x.Waktu ? ` ${x.Waktu}` : ''}`, x.Lokasi || '—', x.Pekerja || '—', x.Kronologis || '—', x.Akibat || '—', x.Dilaporkan || '—', x.Catatan || '—', ...(canWrite ? [<span key="a" style={{ display: 'flex', gap: 6 }}><EditBtn on={() => setModal({ row: x })} /><button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={() => del(x)}>Hapus</button></span>] : [])]); });
  });
  const head = ['No', 'Bulan', 'Nomor urut kejadian', 'Waktu / hari / tanggal', 'Lokasi', 'Departemen, jabatan, lama bekerja', 'Kronologis kejadian', 'Akibat kejadian', 'Dilaporkan ke KaIT / Kadis', 'Catatan', ...(canWrite ? [''] : [])];
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <div className="seg-tabs" role="group" aria-label="Jenis rekap"><button type="button" aria-pressed={jenis === 'PAK'} onClick={() => setJenis('PAK')}>Penyakit akibat kerja (PAK)</button><button type="button" aria-pressed={jenis === 'KAPTK'} onClick={() => setJenis('KAPTK')}>Kejadian akibat penyakit tenaga kerja (KAPTK)</button></div>
        {canWrite && <button type="button" className="btn primary mini" disabled={Boolean(busy)} style={{ marginLeft: 'auto' }} onClick={() => setModal({})}>+ Catat kejadian</button>}
      </div>
      <h3 className="lap-title">{jenis === 'PAK' ? 'Rekapitulasi Penyakit Akibat Kerja' : 'Rekapitulasi Kejadian Akibat Penyakit Tenaga Kerja'} {year}</h3>
      <p className="lap-hint">Dari Januari sampai {BULAN[month]}. Bulan tanpa catatan tampil NIHIL, seperti di formulir rekapitulasi.</p>
      <Tbl head={head} rows={rows} empty="" />
      {modal && <FormModal eyebrow={jenis} title={modal.row ? 'Ubah catatan' : 'Catat kejadian'} fields={penFields}
        init={modal.row ? Object.fromEntries(penFields.map(f => [f.key, f.key === 'Tanggal' ? toIso(modal.row.Tanggal) : modal.row[f.key] ?? ''])) : { Tanggal: toIso(new Date(year, month, 1)) }}
        onClose={() => setModal(null)} onSave={f => save(f, modal.row)} />}
    </section>
  );
}

// ---------- Meeting KKP + MOM ----------
const kkpFields = [
  { key: 'Tanggal', label: 'Hari, tanggal rapat', type: 'date', required: true }, { key: 'Tempat', label: 'Tempat' }, { key: 'Pimpinan', label: 'Pimpinan rapat' }, { key: 'Notulen', label: 'Notulen' },
  { key: 'Agenda', label: 'Agenda', type: 'textarea', wide: true }, { key: 'Peserta', label: 'Peserta', type: 'textarea', wide: true }
];
const momFields = [
  { key: 'Seksi', label: 'Bagian', type: 'select', options: ['Bulan lalu', 'Bulan ini'] }, { key: 'Problem', label: 'Problem / pembahasan', type: 'textarea', wide: true, required: true },
  { key: 'Action', label: 'Action', type: 'textarea', wide: true }, { key: 'PIC', label: 'PIC' }, { key: 'Issue Date', label: 'Issue date', type: 'date' }, { key: 'Due Date', label: 'Due date', type: 'date' },
  { key: 'Remark', label: 'Remark', type: 'select', options: STATUS_PICA }
];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export function KkpTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const K = useMemo(() => buildKkp(data, year, month), [data, year, month]);
  const urlsM = useFotoUrls(useMemo(() => [...K.fotos, ...K.absen], [K]));
  const [modal, setModal] = useState(null); const [busy, run] = useRunner(onRefresh, onNotice);
  const fm = useRef(null); const fa = useRef(null);
  const base = year * 10000 + (month + 1) * 100; const headIdx = base + 1;
  const raw = K.head ? (({ row_index, ...d }) => d)(K.head) : { Tahun: year, Bulan: month + 1 };
  const saveHead = f => run(async () => { await saveRec(M5.kkp, headIdx, { ...raw, Tahun: year, Bulan: month + 1, ...f }); setModal(null); }, 'Data meeting disimpan.');
  const nextIdx = () => Math.max(base + 10, ...K.lalu.map(x => x.row_index), ...K.ini.map(x => x.row_index)) + 1;
  const saveMom = (f, row) => run(async () => {
    const sek = f.Seksi || 'Bulan ini'; const no = row && row.Seksi === sek ? row.No : Math.max(0, ...(sek === 'Bulan lalu' ? K.lalu : K.ini).map(x => Number(x.No) || 0)) + 1;
    await saveRec(M5.mom, row ? row.row_index : nextIdx(), { Tahun: year, Bulan: month + 1, Seksi: sek, No: no, Problem: f.Problem, Action: f.Action || '', PIC: f.PIC || '', 'Issue Date': f['Issue Date'] || '', 'Due Date': f['Due Date'] || '', Remark: f.Remark || 'Open' });
    setModal(null);
  }, 'MOM disimpan.');
  const momRef = useRef(null);
  const importMom = async file => {
    try {
      const p = parseMom(XLSX, XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      if (!p.length) { onNotice?.('Tidak ada poin MOM yang terbaca. Pastikan ada kolom Problem dan Action.'); return; }
      if (p.length > 85) { onNotice?.('Terlalu banyak poin (maksimal 85 per bulan).'); return; }
      const nL = p.filter(x => x.Seksi === 'Bulan lalu').length;
      if (!window.confirm(`Impor MOM ${BULAN[month]} ${year}: ${p.length} poin (${nL} bulan lalu, ${p.length - nL} bulan ini).\nPoin MOM bulan ini yang sudah ada akan diganti.`)) return;
      const cnt = { 'Bulan lalu': 0, 'Bulan ini': 0 };
      const recs = p.map((d, i) => { cnt[d.Seksi] += 1; return { row_index: base + 11 + i, data: { Tahun: year, Bulan: month + 1, No: cnt[d.Seksi], ...d } }; });
      await run(async () => {
        await saveMany(M5.mom, recs);
        const keep = new Set(recs.map(r => r.row_index));
        for (const r of [...K.lalu, ...K.ini]) if (!keep.has(r.row_index)) await deleteRec(M5.mom, r.row_index);
      }, `${p.length} poin MOM diimpor.`, 'Mengimpor MOM...');
    } catch (e) { onNotice?.(`Impor MOM gagal: ${e.message}`); }
  };
  const delMom = row => window.confirm('Hapus baris MOM ini?') && run(() => deleteRec(M5.mom, row.row_index), 'MOM dihapus.');
  const bawa = async () => {
    const py = month === 0 ? year - 1 : year; const pm = month === 0 ? 11 : month - 1;
    const prev = buildKkp(data, py, pm).ini;
    if (!prev.length) { onNotice?.(`Tidak ada MOM "Bulan ini" di ${BULAN[pm]} ${py} untuk dibawa.`); return; }
    if (!window.confirm(`Bawa ${prev.length} poin MOM dari ${BULAN[pm]} ${py} menjadi bagian "Bulan lalu"? Remark tetap sama dan bisa Anda ubah.`)) return;
    let idx = nextIdx() - 1; let no = Math.max(0, ...K.lalu.map(x => Number(x.No) || 0));
    run(() => saveMany(M5.mom, prev.map(p => { idx += 1; no += 1; return { row_index: idx, data: { Tahun: year, Bulan: month + 1, Seksi: 'Bulan lalu', No: no, Problem: p.Problem, Action: p.Action, PIC: p.PIC, 'Issue Date': p['Issue Date'] || '', 'Due Date': p['Due Date'] || '', Remark: p.Remark || 'Open' } }; })), 'MOM bulan lalu dibawa.');
  };
  const upload = async (files, field, prefix) => {
    if (!files.length) return;
    await run(async () => {
      const paths = await uploadFotos(files, `kkp/${year}/${String(month + 1).padStart(2, '0')}/${prefix}`, (i, n) => { /* progres ditampilkan lewat label busy */ void i; void n; });
      await saveRec(M5.kkp, headIdx, { ...raw, Tahun: year, Bulan: month + 1, [field]: join([...list(raw[field]), ...paths]) });
    }, `${files.length} foto ditambahkan.`, 'Mengunggah foto...');
  };
  const delFoto = (field, p) => window.confirm('Hapus foto ini?') && run(async () => { await supabase.storage.from(BUCKET).remove([p]); await saveRec(M5.kkp, headIdx, { ...raw, [field]: join(list(raw[field]).filter(x => x !== p)) }); }, 'Foto dihapus.');
  const tgl = K.head?.Tanggal ? new Date(`${toIso(K.head.Tanggal)}T00:00:00`) : null;
  const momTable = (title, items) => (
    <>
      <h4 className="keg-h">{title}</h4>
      <Tbl head={['No', 'Problem', 'Action', 'PIC', 'Issue date', 'Due date', 'Remark', ...(canWrite ? [''] : [])]}
        rows={items.map(x => [x.No, x.Problem, x.Action || '—', x.PIC || '—', dt(x['Issue Date']), dt(x['Due Date']), <span key="r" className="badge" data-tone={SB[x.Remark] || 'gray'}>{x.Remark || 'Open'}</span>, ...(canWrite ? [<span key="a" style={{ display: 'flex', gap: 6 }}><EditBtn on={() => setModal({ type: 'mom', row: x })} /><button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={() => delMom(x)}>Hapus</button></span>] : [])])}
        empty="Belum ada poin." />
    </>
  );
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>KKP Meeting Level II • {BULAN[month]} {year}</h3>
        {canWrite && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={() => momRef.current?.click()}><Icon name="upload" size={13} /> Upload MOM (Excel)</button>
          <button type="button" className="btn light mini" onClick={() => setModal({ type: 'head' })}><Icon name="edit" size={13} /> Edit data meeting</button>
          <button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={bawa}>Bawa MOM dari bulan lalu</button>
          <button type="button" className="btn primary mini" onClick={() => setModal({ type: 'mom' })}>+ Tambah poin MOM</button></span>}
      </div>
      <input ref={momRef} type="file" accept=".xlsx,.xls,.csv" className="sm-hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importMom(f); }} />
      {busy && <p className="lap-hint"><b>{busy}</b></p>}
      {canWrite && !K.head && !K.ini.length && !K.lalu.length && <div className="lap-note" style={{ margin: '10px 0' }}>
        <b>Mulai dari sini:</b> klik <b>Upload MOM (Excel)</b> untuk memasukkan seluruh poin sekaligus (kolom: Problem, Action, PIC, Issue date, Due date, Remark; judul "Bulan lalu" / "Bulan ini" memisahkan bagian). Lalu isi <b>Edit data meeting</b> dan unggah foto. Setiap poin bisa diubah lewat tombol Ubah di barisnya.</div>}
      <div className="lap-note" style={{ margin: '10px 0' }}>
        <b>Komite Keselamatan Pertambangan (KKP)</b>{K.head ? '' : ' • Data meeting belum diisi.'}
        {K.head && <div style={{ marginTop: 4 }}>{tgl ? `${HARI[tgl.getDay()]}, ${fd(tgl)}` : '—'} • Tempat: {K.head.Tempat || '—'} • Pimpinan: {K.head.Pimpinan || '—'} • Notulen: {K.head.Notulen || '—'}{K.head.Agenda ? <div>Agenda: {K.head.Agenda}</div> : null}{K.head.Peserta ? <div>Peserta: {K.head.Peserta}</div> : null}</div>}
      </div>
      {momTable('Problem dari bulan lalu', K.lalu)}
      {momTable('Problem bulan ini', K.ini)}
      <h4 className="keg-h">Foto meeting</h4>
      <FotoStrip paths={K.fotos} urls={urlsM} canWrite={canWrite} alt="Foto meeting KKP" onDelete={p => delFoto('Foto Meeting', p)} />
      {canWrite && <div className="keg-act" style={{ marginTop: 8 }}><button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={() => fm.current?.click()}><Icon name="upload" size={13} /> Tambah foto meeting</button></div>}
      <h4 className="keg-h">Absensi (daftar hadir)</h4>
      <FotoStrip paths={K.absen} urls={urlsM} canWrite={canWrite} alt="Absensi meeting KKP" onDelete={p => delFoto('Foto Absensi', p)} />
      {canWrite && <div className="keg-act" style={{ marginTop: 8 }}><button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={() => fa.current?.click()}><Icon name="upload" size={13} /> Tambah foto absensi</button></div>}
      <input ref={fm} type="file" accept="image/*" multiple className="sm-hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; upload(f, 'Foto Meeting', 'meeting'); }} />
      <input ref={fa} type="file" accept="image/*" multiple className="sm-hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; upload(f, 'Foto Absensi', 'absensi'); }} />
      {modal?.type === 'head' && <FormModal eyebrow={`KKP ${BULAN[month].toUpperCase()} ${year}`} title="Data meeting" fields={kkpFields} init={Object.fromEntries(kkpFields.map(f => [f.key, f.key === 'Tanggal' ? toIso(K.head?.Tanggal) : K.head?.[f.key] ?? '']))} onClose={() => setModal(null)} onSave={saveHead} />}
      {modal?.type === 'mom' && <FormModal eyebrow={`MOM ${BULAN[month].toUpperCase()} ${year}`} title={modal.row ? 'Ubah poin MOM' : 'Tambah poin MOM'} fields={momFields}
        init={modal.row ? { Seksi: modal.row.Seksi || 'Bulan ini', Problem: modal.row.Problem, Action: modal.row.Action || '', PIC: modal.row.PIC || '', 'Issue Date': toIso(modal.row['Issue Date']), 'Due Date': toIso(modal.row['Due Date']), Remark: modal.row.Remark || 'Open' } : { Seksi: 'Bulan ini', Problem: '', Action: '', PIC: '', 'Issue Date': toIso(K.head?.Tanggal), 'Due Date': '', Remark: 'Open' }}
        onClose={() => setModal(null)} onSave={f => saveMom(f, modal.row)} />}
    </section>
  );
}

// ---------- Struktur organisasi ----------
export function StrukturTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const S = useMemo(() => buildStruktur(data, year, month), [data, year, month]);
  const urls = useFotoUrls(useMemo(() => (S?.path ? [S.path] : []), [S]));
  const [busy, run] = useRunner(onRefresh, onNotice); const ref = useRef(null);
  const upload = files => run(async () => {
    const [p] = await uploadFotos(files.slice(0, 1), `struktur/${year}/${String(month + 1).padStart(2, '0')}`);
    await saveRec(M5.lamp, year * 10000 + (month + 1) * 100 + 1, { Tahun: year, Bulan: month + 1, Jenis: 'struktur', Foto: p });
  }, 'Struktur organisasi diperbarui.', 'Mengunggah...');
  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>Struktur Organisasi REP Site PAMA IMM</h3>
        {canWrite && <button type="button" className="btn light mini" style={{ marginLeft: 'auto' }} disabled={Boolean(busy)} onClick={() => ref.current?.click()}><Icon name="upload" size={13} /> {S ? 'Ganti gambar' : 'Unggah gambar'}</button>}
        <input ref={ref} type="file" accept="image/*" className="sm-hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) upload(f); }} />
      </div>
      <p className="lap-hint">{busy || (S ? `Gambar yang dipakai: unggahan ${BULAN[Number(S.Bulan) - 1]} ${S.Tahun}. Bulan berikutnya otomatis memakai gambar ini sampai diganti.` : 'Belum ada gambar. Unggah gambar struktur organisasi (JPG atau PNG).')}</p>
      {S?.path && urls[S.path] && <img src={urls[S.path]} alt="Struktur organisasi" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />}
    </section>
  );
}

// ---------- KK dan BMI (data kesehatan, akses terbatas) ----------
const Ringkas = ({ A, label }) => (
  <div className="tr-scroll" style={{ marginTop: 14 }}><table className="ttable"><thead><tr><th rowSpan={2}>No</th><th rowSpan={2}>{label}</th><th colSpan={3} className="num">Periode I</th><th colSpan={3} className="num">Periode II</th><th colSpan={3} className="num">MTD</th></tr>
    <tr>{['Plan', 'Actual', 'Achiev', 'Plan', 'Actual', 'Achiev', 'Plan', 'Actual', 'Achiev'].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
    <tbody><tr><td>1</td><td><strong>{A.n}</strong></td><td>{A.n}</td><td>{A.p1}</td><td>{pctN(A.a1)}</td><td>{A.n}</td><td>{A.p2}</td><td>{pctN(A.a2)}</td><td>{A.n * 2}</td><td>{A.p1 + A.p2}</td><td>{pctN(A.mtd)}</td></tr></tbody></table></div>
);
function ImportBar({ onFile, canWrite, onAdd, children }) {
  const r = useRef(null);
  return (
    <div className="lic-bar">{children}{canWrite && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn light mini" onClick={() => r.current?.click()}><Icon name="upload" size={13} /> Impor dari Excel</button>
      <button type="button" className="btn primary mini" onClick={onAdd}>+ Tambah orang</button>
      <input ref={r} type="file" accept=".xlsx,.xls" className="sm-hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} /></span>}</div>
  );
}
async function importer({ file, parse, label, A, module, year, month, run }) {
  const p = parse(XLSX, XLSX.read(await file.arrayBuffer(), { type: 'array' }));
  if (!p.length) throw new Error('Tidak ada baris yang terbaca. Pastikan ini file KK dan BMI.');
  if (p.length > 95) throw new Error('Terlalu banyak baris (maksimal 95 orang per bulan).');
  if (!window.confirm(`Impor ${label} ${BULAN[month]} ${year}: ${p.length} orang.\nData ${label} bulan ini yang sudah ada akan diganti. Orang yang belum ada di daftar tetap akan ditambahkan, sehingga muncul di bulan-bulan berikutnya.`)) return;
  const base = year * 10000 + (month + 1) * 100;
  await run(async () => {
    await saveMany(module, p.map((d, i) => ({ row_index: base + i + 1, data: { Tahun: year, Bulan: month + 1, ...d } })));
    const keep = new Set(p.map((_, i) => base + i + 1));
    for (const r of A.stored) if (!keep.has(r.row_index)) await deleteRec(module, r.row_index);
    const have = new Set(A.roster.map(personKey)); let next = Math.max(0, ...A.roster.map(r => r.row_index));
    const baru = [];
    p.forEach(d => { const k = personKey(d); if (k && !have.has(k)) { have.add(k); next += 1; baru.push({ row_index: next, data: { Roster: 1, ...Object.fromEntries((module === M5.kk ? KK_ID : BMI_ID).map(f => [f, d[f] ?? ''])) } }); } });
    if (baru.length) await saveMany(module, baru);
  }, `${label} ${BULAN[month]} ${year} diimpor.`, 'Mengimpor...');
}

/** Tambah / ubah / hapus orang pada daftar tetap KK atau BMI. */
function usePeopleOps({ module, idKeys, A, year, month, run }) {
  const base = year * 10000 + (month + 1) * 100;
  const save = (f, row) => run(async () => {
    const ident = Object.fromEntries(idKeys.map(k => [k, String(f[k] ?? '').trim()])); ident.Nama = ident.Nama.toUpperCase();
    const meas = Object.fromEntries(Object.entries(f).filter(([k]) => !idKeys.includes(k)).map(([k, v]) => [k, /( TB| BB)$/.test(k) && v !== '' ? Number(String(v).replace(',', '.')) : v]));
    let pid = row?.pid;
    if (!row) { const dup = A.roster.find(r => personKey(r) === personKey(ident)); if (dup) throw new Error(`${ident.Nama} sudah ada di daftar.`); }
    if (!row || pid) {
      pid = pid || Math.max(0, ...A.roster.map(r => r.row_index)) + 1;
      const old = A.roster.find(r => r.row_index === pid) || {};
      const { row_index, ...oldData } = old;
      await saveRec(module, pid, { ...oldData, Roster: 1, ...ident });
    }
    let idx = row?.rowIdx;
    if (!idx) { idx = Math.max(base, ...A.stored.map(r => r.row_index)) + 1; if (idx > base + 99) throw new Error('Terlalu banyak baris bulan ini (maksimal 99).'); }
    const prev = A.stored.find(r => r.row_index === idx) || {};
    const { row_index: _r, ...prevData } = prev;
    await saveRec(module, idx, { ...prevData, Tahun: year, Bulan: month + 1, No: row?.No ?? A.rows.length + 1, ...ident, ...meas });
  }, 'Data disimpan.');
  const del = row => window.confirm(`Hapus ${row.Nama} dari daftar?\n\nOrang ini tidak akan muncul lagi di bulan ini dan bulan-bulan berikutnya. Data bulan-bulan lalu tetap tersimpan.`)
    && run(async () => { if (row.pid) await deleteRec(module, row.pid); if (row.rowIdx) await deleteRec(module, row.rowIdx); }, `${row.Nama} dihapus dari daftar.`);
  const promote = () => {
    if (!A.only.length) return;
    if (!window.confirm(`Jadikan ${A.only.length} orang di bulan ini sebagai daftar tetap?\nMereka akan muncul setiap bulan sampai Anda hapus.`)) return;
    let next = Math.max(0, ...A.roster.map(r => r.row_index));
    run(() => saveMany(module, A.only.map(r => { next += 1; return { row_index: next, data: { Roster: 1, ...Object.fromEntries(idKeys.map(k => [k, r[k] ?? ''])) } }; })), 'Daftar tetap diperbarui.');
  };
  return { save, del, promote };
}
const PromoteBar = ({ A, canWrite, onPromote }) => (canWrite && A.only.length > 0 ? <div className="lap-note" style={{ margin: '10px 0' }}>{A.only.length} orang di bulan ini belum masuk daftar tetap, jadi tidak akan muncul di bulan berikutnya. <button type="button" className="btn light mini" style={{ marginLeft: 8 }} onClick={onPromote}>Jadikan daftar tetap</button></div> : null);
const RowBtns = ({ onEdit, onDel }) => <span style={{ display: 'flex', gap: 6 }}><EditBtn on={onEdit} /><button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={onDel}>Hapus</button></span>;
const initOf = (fields, row, dateKeys) => Object.fromEntries(fields.map(f => [f.key, dateKeys.includes(f.key) ? toIso(row?.[f.key]) : row?.[f.key] ?? '']));
const tbm = (a, b) => (a || b ? `${a || ''}${a && b ? ' / ' : ''}${b || ''}` : '—');

const kkFields = [
  { key: 'Nama', label: 'Nama karyawan', required: true }, { key: 'NRP', label: 'NRP' }, { key: 'NRPSAP', label: 'NRP SAP' }, { key: 'Usia', label: 'Usia', type: 'number' },
  { key: 'Jabatan', label: 'Jabatan' }, { key: 'Perusahaan', label: 'Perusahaan' }, { key: 'Status', label: 'Status (bulan ini)' },
  { key: 'P1 Tanggal', label: 'P1: tanggal kunjungan', type: 'date' }, { key: 'P1 Tempat', label: 'P1: tempat' }, { key: 'P1 Hasil', label: 'P1: hasil kunjungan', type: 'textarea', wide: true },
  { key: 'P1 Catatan', label: 'P1: catatan pengobatan', type: 'textarea', wide: true }, { key: 'P1 Obat', label: 'P1: konsumsi obat' },
  { key: 'P2 Tanggal', label: 'P2: tanggal kunjungan', type: 'date' }, { key: 'P2 Tempat', label: 'P2: tempat' }, { key: 'P2 Hasil', label: 'P2: hasil kunjungan', type: 'textarea', wide: true },
  { key: 'P2 Catatan', label: 'P2: catatan pengobatan', type: 'textarea', wide: true }, { key: 'P2 Obat', label: 'P2: konsumsi obat' }
];
const bmiFields = [
  { key: 'Nama', label: 'Nama karyawan', required: true }, { key: 'NRP', label: 'NRP' }, { key: 'Jabatan', label: 'Jabatan' }, { key: 'Perusahaan', label: 'Perusahaan' }, { key: 'Status', label: 'Status (bulan ini)' },
  { key: 'W12 Tanggal', label: 'W1&2: tanggal kontrol', type: 'date' }, { key: 'W12 Tempat', label: 'W1&2: tempat' }, { key: 'W12 TB', label: 'W1&2: TB (m)', type: 'number' }, { key: 'W12 BB', label: 'W1&2: BB (kg)', type: 'number' },
  { key: 'W34 Tanggal', label: 'W3&4: tanggal kontrol', type: 'date' }, { key: 'W34 Tempat', label: 'W3&4: tempat' }, { key: 'W34 TB', label: 'W3&4: TB (m)', type: 'number' }, { key: 'W34 BB', label: 'W3&4: BB (kg)', type: 'number' }
];

export function KkTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const A = useMemo(() => buildKK(data, year, month), [data, year, month]); const [busy, run] = useRunner(onRefresh, onNotice);
  const [modal, setModal] = useState(null);
  const ops = usePeopleOps({ module: M5.kk, idKeys: KK_ID, A, year, month, run });
  const onFile = f => importer({ file: f, parse: parseKk, label: 'KK', A, module: M5.kk, year, month, run }).catch(e => onNotice?.(`Impor gagal: ${e.message}`));
  return (
    <section className="panel tr-panel">
      <ImportBar onFile={onFile} canWrite={canWrite} onAdd={() => setModal({})}><h3 className="lap-title" style={{ margin: 0 }}>Monitoring Kontrol Kritis Kronis • {BULAN[month]} {year}</h3></ImportBar>
      <div className="lap-note" style={{ margin: '10px 0' }}>Data kesehatan karyawan: hanya untuk yang berwenang. Orang yang ditambahkan muncul setiap bulan (kosong bila belum ada hasil kontrol) sampai dihapus. {busy}</div>
      <PromoteBar A={A} canWrite={canWrite} onPromote={ops.promote} />
      <Tbl head={['No', 'NRP', 'NRPSAP', 'Nama karyawan', 'Usia', 'Jabatan', 'P1: hasil kunjungan', 'P1: catatan pengobatan', 'P1: konsumsi obat', 'P2: tanggal', 'P2: tempat', 'P2: hasil kunjungan', 'P2: catatan pengobatan', 'P2: konsumsi obat', 'Status', ...(canWrite ? [''] : [])]}
        rows={A.rows.map(x => [x.No, x.NRP, x.NRPSAP, x.Nama, x.Usia, x.Jabatan, x['P1 Hasil'] || '—', x['P1 Catatan'] || '—', x['P1 Obat'] || '—', dt(x['P2 Tanggal']), x['P2 Tempat'] || '—', x['P2 Hasil'] || '—', x['P2 Catatan'] || '—', x['P2 Obat'] || '—', <span key="s" className="badge" data-tone={x.Status ? 'green' : 'gray'}>{x.Status || '—'}</span>, ...(canWrite ? [<RowBtns key="a" onEdit={() => setModal({ row: x })} onDel={() => ops.del(x)} />] : [])])}
        empty={canWrite ? 'Belum ada orang. Klik "+ Tambah orang" atau "Impor dari Excel".' : 'Belum ada data KK.'} />
      {A.n > 0 && <Ringkas A={A} label="Jumlah karyawan kontrol KK" />}
      {modal && <FormModal eyebrow={`KK ${BULAN[month].toUpperCase()} ${year}`} title={modal.row ? `Ubah ${modal.row.Nama}` : 'Tambah orang'} fields={kkFields} init={initOf(kkFields, modal.row, ['P1 Tanggal', 'P2 Tanggal'])}
        onClose={() => setModal(null)} onSave={async f => { if (await ops.save(f, modal.row)) setModal(null); }} onDelete={modal.row ? () => { const r = modal.row; setModal(null); ops.del(r); } : undefined} />}
    </section>
  );
}
export function BmiTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const A = useMemo(() => buildBMI(data, year, month), [data, year, month]); const [busy, run] = useRunner(onRefresh, onNotice);
  const [modal, setModal] = useState(null);
  const ops = usePeopleOps({ module: M5.bmi, idKeys: BMI_ID, A, year, month, run });
  const onFile = f => importer({ file: f, parse: parseBmi, label: 'BMI', A, module: M5.bmi, year, month, run }).catch(e => onNotice?.(`Impor gagal: ${e.message}`));
  const b = v => (v === null ? '—' : <span className="badge" data-tone={bmiTone(v)}>{v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>);
  return (
    <section className="panel tr-panel">
      <ImportBar onFile={onFile} canWrite={canWrite} onAdd={() => setModal({})}><h3 className="lap-title" style={{ margin: 0 }}>Monitoring Kontrol BMI • {BULAN[month]} {year}</h3></ImportBar>
      <div className="lap-note" style={{ margin: '10px 0' }}>Data kesehatan karyawan: hanya untuk yang berwenang. BMI dihitung dari BB dibagi TB kuadrat (merah ≥ 30, kuning 25 sampai 29,9). Orang yang ditambahkan muncul setiap bulan sampai dihapus. {busy}</div>
      <PromoteBar A={A} canWrite={canWrite} onPromote={ops.promote} />
      <Tbl head={['No', 'NRP', 'Nama karyawan', 'Jabatan', 'W1&2: tempat', 'TB (m)', 'BB', 'BMI', 'W3&4: tgl kontrol', 'Tempat', 'TB (m)', 'BB', 'BMI', 'Status', ...(canWrite ? [''] : [])]}
        rows={A.rows.map(x => [x.No, x.NRP, x.Nama, x.Jabatan, x['W12 Tempat'] || '—', x['W12 TB'] || '—', x['W12 BB'] || '—', b(x.bmi1), dt(x['W34 Tanggal']), x['W34 Tempat'] || '—', x['W34 TB'] || '—', x['W34 BB'] || '—', b(x.bmi2), <span key="s" className="badge" data-tone={x.Status ? 'green' : 'gray'}>{x.Status || '—'}</span>, ...(canWrite ? [<RowBtns key="a" onEdit={() => setModal({ row: x })} onDel={() => ops.del(x)} />] : [])])}
        empty={canWrite ? 'Belum ada orang. Klik "+ Tambah orang" atau "Impor dari Excel".' : 'Belum ada data BMI.'} />
      {A.n > 0 && <Ringkas A={A} label="Jumlah karyawan kontrol BMI" />}
      {modal && <FormModal eyebrow={`BMI ${BULAN[month].toUpperCase()} ${year}`} title={modal.row ? `Ubah ${modal.row.Nama}` : 'Tambah orang'} fields={bmiFields} init={initOf(bmiFields, modal.row, ['W12 Tanggal', 'W34 Tanggal'])}
        onClose={() => setModal(null)} onSave={async f => { if (await ops.save(f, modal.row)) setModal(null); }} onDelete={modal.row ? () => { const r = modal.row; setModal(null); ops.del(r); } : undefined} />}
    </section>
  );
}
