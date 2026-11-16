import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './inputdata.css';

// Isi sel bila sertifikat dicentang. Hanya dipakai untuk sertifikat yang diubah; yang tidak disentuh dibiarkan.
const CERT_ON = 'V';
const CERTS = [['LV', 'LV'], ['Bus', 'BUS'], ['P360', 'P360/CWE'], ['FMX420', 'FMX420'], ['FMX400', 'FMX400'], ['PC210', 'PC210/300'], ['PC350', 'PC350LC'], ['D85', 'D85SS']];
const LICENSES = [['Simpol', 'Simpol'], ['Simper', 'Simper'], ['Authority', 'Authority'], ['Escorting', 'Escorting'], ['HighRisk', 'HighRisk'], ['PowerTools', 'PowerTools']];
const isOn = v => { const s = String(v ?? '').trim().toLowerCase(); return s !== '' && !['0', '-', 'false', 'tidak', 'no', 'n'].includes(s); };
const F = (key, label, o = {}) => ({ key, label, ...o });

const SECTIONS = [
  ['Identitas kerja', [
    F('AMODI', 'AMODI', { req: 1 }), F('NRP', 'NRP'), F('NRPP', 'NRPP'), F('Nama', 'Nama lengkap', { req: 1 }), F('District', 'District', { list: 1 }),
    F('Perusahaan', 'Company', { list: 1 }), F('Jabatan', 'Jabatan', { req: 1, list: 1 }), F('Departemen', 'Departemen', { list: 1 }),
    F('Status Karyawan', 'Status karyawan', { list: 1 }), F('Status', 'Status (keluarga)', { list: 1 }), F('Ring', 'Ring', { list: 1 }), F('Tanggal Masuk', 'Tanggal masuk', { date: 1 })
  ], 'Masa kerja dan umur dihitung otomatis dari tanggal masuk dan tanggal lahir.'],
  ['Data pribadi', [
    F('Tempat Lahir', 'Tempat lahir'), F('Tanggal Lahir', 'Tanggal lahir', { date: 1 }), F('Jenis Kelamin', 'Jenis kelamin', { list: 1 }), F('Agama', 'Agama', { list: 1 }),
    F('Pendidikan', 'Pendidikan terakhir', { list: 1 }), F('Gol. Darah', 'Golongan darah', { list: 1 }), F('Email', 'Email (untuk pengingat lisensi)'), F('NIK', 'NIK'),
    F('NPWP', 'NPWP'), F('BPJS TK', 'BPJS Ketenagakerjaan'), F('BPJS Kes', 'BPJS Kesehatan')
  ]],
  ['Alamat dan keluarga', [
    F('Alamat', 'Alamat rumah', { wide: 1 }), F('Domisili', 'Alamat domisili', { wide: 1 }), F('Ibu', 'Ibu kandung'), F('Istri', 'Istri / keluarga'),
    F('HP Istri', 'HP istri'), F('Kontak Darurat', 'Kontak darurat update'), F('CP', 'Contact person')
  ]]
];
const RESIGN = [F('Tanggal Resign', 'Tanggal resign', { date: 1 }), F('Jenis Resign', 'Jenis resign', { list: 1 })];
const OTHER = [F('Keterangan', 'Keterangan'), F('Foto', 'Foto (path file)')];
const ALL_FIELDS = [...SECTIONS.flatMap(s => s[1]), ...RESIGN, ...LICENSES.map(([k, l]) => F(k, l, { date: 1 })), F('Awal Kontrak', 'Awal kontrak', { date: 1 }), F('Akhir Kontrak', 'Akhir kontrak', { date: 1 }), ...OTHER];
const DATE_KEYS = ALL_FIELDS.filter(f => f.date).map(f => f.key);

export default function InputData({ canPrivate, isAdmin, initialRow, split, toDate, onImport, onSaved }) {
  const [rows, setRows] = useState([]);
  const [priv, setPriv] = useState({});
  const [sel, setSel] = useState('');
  const [form, setForm] = useState({});
  const [certs, setCerts] = useState({});
  const [kontrak, setKontrak] = useState('PKWT');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const isPrivate = useCallback(k => Object.keys(split({ [k]: 1 }).privateData).length > 0, [split]);

  const load = useCallback(async () => {
    const a = await supabase.from('app_data').select('id,row_index,data').eq('module', 'Data_Karyawan').order('row_index', { ascending: true }).range(0, 4999);
    if (a.error) { setMsg({ err: `Gagal memuat data: ${a.error.message}` }); return []; }
    const map = {};
    if (canPrivate) {
      const b = await supabase.from('app_private_data').select('row_index,data').eq('module', 'Data_Karyawan').range(0, 4999);
      (b.data || []).forEach(r => { map[r.row_index] = r.data || {}; });
    }
    setRows(a.data || []); setPriv(map);
    return a.data || [];
  }, [canPrivate]);

  const fill = useCallback((row, privMap) => {
    const base = { ...(row?.data || {}), ...(privMap?.[row?.row_index] || {}) };
    DATE_KEYS.forEach(k => { base[k] = toDate(base[k]) || ''; });
    setForm(base);
    setCerts(Object.fromEntries(CERTS.map(([k]) => [k, isOn(row?.data?.[k])])));
    setKontrak(row ? (base['Akhir Kontrak'] ? 'PKWT' : 'PKWTT') : 'PKWT');
    setSel(row ? row.id : '');
    setMsg(null);
  }, [toDate]);

  useEffect(() => { (async () => {
    const list = await load();
    if (initialRow) {
      const r = list.find(x => x.id === initialRow.id);
      if (r) fill(r, null);
    }
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Data pribadi baru tersedia setelah dimuat; isi ulang form bila baris sudah dipilih.
  useEffect(() => { if (sel) { const r = rows.find(x => x.id === sel); if (r) fill(r, priv); } }, [priv]); // eslint-disable-line react-hooks/exhaustive-deps

  const editing = rows.find(r => r.id === sel) || null;
  const suggestions = useMemo(() => {
    const out = { 'Jenis Kelamin': new Set(['Laki-laki', 'Perempuan']), 'Gol. Darah': new Set(['A', 'B', 'AB', 'O']) };
    rows.forEach(r => {
      const d = { ...(r.data || {}), ...(priv[r.row_index] || {}) };
      ALL_FIELDS.filter(f => f.list).forEach(f => { const v = String(d[f.key] ?? '').trim(); if (v) (out[f.key] = out[f.key] || new Set()).add(v); });
    });
    return out;
  }, [rows, priv]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const field = f => {
    if (isPrivate(f.key) && !canPrivate) return null;
    return <label key={f.key} className={`idf${f.wide ? ' wide' : ''}`}><span>{f.label}{f.req ? ' *' : ''}</span>
      <input type={f.date ? 'date' : 'text'} value={form[f.key] ?? ''} required={!!f.req} disabled={f.key === 'AMODI' && !!editing}
        list={f.list ? `dl-${f.key}` : undefined} onChange={e => set(f.key, e.target.value)} /></label>;
  };

  const save = async e => {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const out = { ...form };
      if (kontrak === 'PKWTT') { out['Awal Kontrak'] = ''; out['Akhir Kontrak'] = ''; }
      CERTS.forEach(([k]) => { if (certs[k] !== isOn(editing?.data?.[k])) out[k] = certs[k] ? CERT_ON : ''; else if (editing) out[k] = editing.data?.[k] ?? ''; });
      const amodi = String(out.AMODI || '').trim();
      if (!amodi || !String(out.Nama || '').trim() || !String(out.Jabatan || '').trim()) throw new Error('AMODI, nama, dan jabatan wajib diisi.');
      if (!editing && rows.some(r => String(r.data?.AMODI || '').trim().toLowerCase() === amodi.toLowerCase())) throw new Error('AMODI sudah dipakai karyawan lain.');
      const { publicData, privateData } = split(out);
      const pub = canPrivate ? publicData : out;
      let rowIndex = editing?.row_index;
      if (editing) {
        const r = await supabase.from('app_data').update({ data: pub }).eq('id', editing.id);
        if (r.error) throw r.error;
      } else {
        rowIndex = rows.reduce((m, r) => Math.max(m, Number(r.row_index) || 0), 0) + 1;
        const r = await supabase.from('app_data').insert({ module: 'Data_Karyawan', row_index: rowIndex, data: pub });
        if (r.error) throw r.error;
      }
      if (canPrivate) {
        const r = await supabase.from('app_private_data').upsert({ module: 'Data_Karyawan', row_index: rowIndex, data: privateData }, { onConflict: 'module,row_index' });
        if (r.error) throw r.error;
      }
      let note = 'Data berhasil disimpan.';
      if (out['Tanggal Resign']) {
        const rs = await supabase.from('app_data').select('row_index,data').eq('module', 'Data_Resign').range(0, 4999);
        if (!rs.error && !(rs.data || []).some(x => String(x.data?.AMODI || '').trim().toLowerCase() === amodi.toLowerCase())) {
          const next = (rs.data || []).reduce((m, x) => Math.max(m, Number(x.row_index) || 0), 0) + 1;
          const ins = await supabase.from('app_data').insert({ module: 'Data_Resign', row_index: next, data: { AMODI: amodi, NRP: out.NRP || '', Nama: out.Nama, Jabatan: out.Jabatan, Departemen: out.Departemen || '', 'Tanggal Masuk': out['Tanggal Masuk'] || '', 'Tanggal Resign': out['Tanggal Resign'], Jenis: out['Jenis Resign'] || '', Keterangan: out.Keterangan || '' } });
          note += ins.error ? ` Catatan resign belum masuk ke Turnover: ${ins.error.message}` : ' Karyawan juga dicatat di Turnover.';
        }
      }
      const list = await load();
      const saved = list.find(r => r.row_index === rowIndex);
      setMsg({ ok: note });
      if (saved) setSel(saved.id);
      onSaved?.();
    } catch (err) { setMsg({ err: err.message || 'Gagal menyimpan data.' }); }
    finally { setBusy(false); }
  };

  return <div className="idpage">
    <div className="idhead"><div><h1>Input data</h1><p className="subtle">Tambah karyawan baru atau perbarui data yang sudah ada.</p></div>
      {isAdmin && <button type="button" className="btn light" onClick={onImport}>Impor file Excel</button>}</div>
    {Object.entries(suggestions).map(([k, s]) => <datalist key={k} id={`dl-${k}`}>{[...s].sort().map(v => <option key={v} value={v} />)}</datalist>)}
    <form onSubmit={save}>
      <section className="idbox"><label className="idf"><span>Ubah data karyawan yang sudah ada</span>
        <div className="idrow"><select value={sel} onChange={e => { const r = rows.find(x => x.id === e.target.value); r ? fill(r, priv) : fill(null, priv); }}>
          <option value="">— Karyawan baru —</option>
          {rows.map(r => <option key={r.id} value={r.id}>{r.data?.Nama} ({r.data?.AMODI}){r.data?.Jabatan ? ` - ${r.data.Jabatan}` : ''}</option>)}
        </select><button type="button" className="btn light" onClick={() => fill(null, priv)}>Kosongkan form</button></div></label>
        <p className="subtle">{editing ? `Mode: mengubah data ${editing.data?.Nama} (${editing.data?.AMODI}). AMODI tidak bisa diganti.` : 'Mode: menambah karyawan baru.'}</p></section>
      {SECTIONS.map(([title, fields, hint]) => <section className="idbox" key={title}><h2>{title}</h2><div className="idgrid">{fields.map(field)}</div>{hint && <p className="subtle">{hint}</p>}</section>)}
      <section className="idbox"><h2>Kontrak</h2>
        <div className="idrow"><label><input type="radio" name="kontrak" checked={kontrak === 'PKWTT'} onChange={() => setKontrak('PKWTT')} /> Tetap (PKWTT)</label>
          <label><input type="radio" name="kontrak" checked={kontrak === 'PKWT'} onChange={() => setKontrak('PKWT')} /> Kontrak berjangka (PKWT)</label></div>
        {kontrak === 'PKWT' && <div className="idgrid">{field(F('Awal Kontrak', 'Awal kontrak', { date: 1 }))}{field(F('Akhir Kontrak', 'Akhir kontrak', { date: 1 }))}</div>}</section>
      <section className="idbox"><h2>Karyawan keluar</h2><p className="subtle">Isi tanggal dan jenis sekaligus bila karyawan keluar. Data juga dicatat di Turnover. Hanya untuk karyawan yang sudah ada.</p>
        <div className="idgrid">{RESIGN.map(field)}</div></section>
      <section className="idbox"><h2>Sertifikat operasi unit</h2><div className="idrow wrap">{CERTS.map(([k, l]) =>
        <label key={k} className="idchip"><input type="checkbox" checked={!!certs[k]} onChange={e => setCerts(c => ({ ...c, [k]: e.target.checked }))} /> {l}</label>)}</div></section>
      <section className="idbox"><h2>Masa berlaku lisensi</h2><p className="subtle">Kosongkan tanggal bila karyawan tidak memiliki lisensi tersebut.</p>
        <div className="idgrid">{LICENSES.map(([k, l]) => field(F(k, l, { date: 1 })))}</div></section>
      <section className="idbox"><h2>Lainnya</h2><div className="idgrid">{OTHER.map(field)}</div></section>
      {msg?.err && <div className="form-error">{msg.err}</div>}
      {msg?.ok && <div className="idok">{msg.ok}</div>}
      <div className="idrow"><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button><span className="subtle">Tanda * wajib diisi.</span></div>
    </form>
  </div>;
}
