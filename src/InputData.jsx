import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// Foto karyawan disimpan di Supabase Storage (bucket privat). Kolom Foto hanya berisi nama file di bucket itu.
const FOTO_BUCKET = 'foto-karyawan';
const FOTO_POLA = /^[A-Za-z0-9_-]+\.jpg$/;
const kecilkan = (file, maks = 800) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const skala = Math.min(1, maks / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * skala)); c.height = Math.max(1, Math.round(img.height * skala));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => (b ? resolve(b) : reject(new Error('Gagal memproses foto.'))), 'image/jpeg', 0.85);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format foto tidak didukung. Gunakan JPG atau PNG.')); };
  img.src = url;
});

export default function InputData({ canPrivate, isAdmin, initialRow, split, toDate, onImport, onSaved }) {
  const [rows, setRows] = useState([]);
  const [priv, setPriv] = useState({});
  const [sel, setSel] = useState('');
  const [form, setForm] = useState({});
  const [certs, setCerts] = useState({});
  const [kontrak, setKontrak] = useState('PKWT');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fotoUrl, setFotoUrl] = useState('');
  const [fotoBusy, setFotoBusy] = useState(false);
  const fotoSesi = useRef('');
  const fileRef = useRef(null);
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

  // Pratinjau foto: tautan sementara (1 jam) karena bucket bersifat privat.
  useEffect(() => {
    let on = true;
    const p = String(form.Foto || '').trim();
    if (!FOTO_POLA.test(p)) { setFotoUrl(''); return undefined; }
    supabase.storage.from(FOTO_BUCKET).createSignedUrl(p, 3600).then(({ data }) => { if (on) setFotoUrl(data?.signedUrl || ''); }).catch(() => { if (on) setFotoUrl(''); });
    return () => { on = false; };
  }, [form.Foto]);

  const pilihFoto = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const amodi = String(form.AMODI || '').trim();
    if (!amodi) { setMsg({ err: 'Isi AMODI terlebih dahulu sebelum mengunggah foto.' }); return; }
    if (!String(file.type || '').startsWith('image/')) { setMsg({ err: 'File harus berupa gambar (JPG atau PNG).' }); return; }
    if (file.size > 15 * 1024 * 1024) { setMsg({ err: 'Ukuran foto terlalu besar (maksimal 15 MB).' }); return; }
    setFotoBusy(true); setMsg(null);
    try {
      const blob = await kecilkan(file);
      const path = `${amodi.replace(/[^A-Za-z0-9_-]/g, '_')}-${Date.now()}.jpg`;
      const up = await supabase.storage.from(FOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
      if (up.error) throw up.error;
      // Bila sebelumnya sudah mengunggah foto di sesi ini tetapi belum disimpan, hapus yang tidak terpakai.
      if (fotoSesi.current && fotoSesi.current === String(form.Foto || '').trim()) supabase.storage.from(FOTO_BUCKET).remove([fotoSesi.current]).catch(() => {});
      fotoSesi.current = path;
      set('Foto', path);
      setMsg({ ok: 'Foto berhasil diunggah. Klik "Simpan perubahan" agar foto tersimpan di data karyawan.' });
    } catch (err) { setMsg({ err: `Gagal mengunggah foto: ${err.message || err}` }); }
    finally { setFotoBusy(false); }
  };
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
      const fotoLama = String({ ...(editing?.data || {}), ...(priv[editing?.row_index] || {}) }.Foto || '').trim();
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
      // Foto lama yang diganti atau dihapus ikut dibersihkan dari Storage.
      if (fotoLama && fotoLama !== String(out.Foto || '').trim() && FOTO_POLA.test(fotoLama)) supabase.storage.from(FOTO_BUCKET).remove([fotoLama]).catch(() => {});
      fotoSesi.current = '';
      const list = await load();
      const saved = list.find(r => r.row_index === rowIndex);
      setMsg({ ok: note });
      if (saved) setSel(saved.id);
      onSaved?.();
    } catch (err) { setMsg({ err: err.message || 'Gagal menyimpan data.' }); }
    finally { setBusy(false); }
  };

  const fotoNilai = String(form.Foto || '').trim();
  const fotoBlok = (isPrivate('Foto') && !canPrivate) ? null : (
    <div key="Foto" className="idf wide">
      <span>Foto karyawan</span>
      <div className="idrow" style={{ alignItems: 'center', gap: 14 }}>
        <div style={{ width: 96, height: 120, flex: '0 0 auto', borderRadius: 8, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'rgba(128,128,128,.12)', border: '1px solid rgba(128,128,128,.35)' }}>
          {fotoUrl ? <img src={fotoUrl} alt="Foto karyawan" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <small className="subtle" style={{ textAlign: 'center', padding: 6 }}>Belum ada foto</small>}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pilihFoto} />
          <div className="idrow">
            <button type="button" className="btn light" disabled={fotoBusy} onClick={() => fileRef.current?.click()}>{fotoBusy ? 'Mengunggah...' : (fotoNilai ? 'Ganti foto' : 'Unggah foto')}</button>
            {fotoNilai && <button type="button" className="btn light" disabled={fotoBusy} onClick={() => set('Foto', '')}>Hapus foto</button>}
          </div>
          <p className="subtle">JPG atau PNG. Foto otomatis dikecilkan. Klik "Simpan perubahan" agar tersimpan.</p>
          {fotoNilai && !FOTO_POLA.test(fotoNilai) && <p className="subtle">Isi lama: {fotoNilai} (bukan dari unggahan). Unggah foto baru untuk menggantinya.</p>}
        </div>
      </div>
    </div>
  );

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
      <section className="idbox"><h2>Lainnya</h2><div className="idgrid">{OTHER.map(f => (f.key === 'Foto' ? fotoBlok : field(f)))}</div></section>
      {msg?.err && <div className="form-error">{msg.err}</div>}
      {msg?.ok && <div className="idok">{msg.ok}</div>}
      <div className="idrow"><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button><span className="subtle">Tanda * wajib diisi.</span></div>
    </form>
  </div>;
}
