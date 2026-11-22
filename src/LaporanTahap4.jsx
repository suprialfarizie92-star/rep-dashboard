import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { BUCKET, KEG_MOD, KATEGORI_KEG, buildKegiatan, cocokkanFoto, fotoJoin, parseKegiatanSheet } from './she4.js';
import { BULAN } from './laporan.js';
import { FormModal, deleteRec, saveMany, saveRec } from './LaporanShe.jsx';

/** Perkecil foto di browser (maks 1280 px, JPEG) supaya unggahan ringan. */
export async function kompres(file, maxSide = 1280, q = 0.8) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Foto tidak bisa diproses'))), 'image/jpeg', q));
}

/** URL sementara (1 jam) untuk foto di bucket privat. */
export function useFotoUrls(paths) {
  const [urls, setUrls] = useState({});
  const key = paths.join('|');
  useEffect(() => {
    let off = false;
    if (!paths.length) { setUrls({}); return undefined; }
    supabase.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (!off && data) setUrls(Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])));
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

const kegFields = [
  { key: 'Kategori', label: 'Kategori', type: 'select', options: KATEGORI_KEG }, { key: 'Kegiatan', label: 'Kegiatan', required: true, wide: true },
  { key: 'Tanggal', label: 'Tanggal (teks, mis. 3,6,7 Oktober 2026)' }, { key: 'Lokasi', label: 'Lokasi / tempat', wide: true }
];

export function KegiatanTab({ data, year, month, canWrite, onRefresh, onNotice }) {
  const K = useMemo(() => buildKegiatan(data, year, month), [data, year, month]);
  const urls = useFotoUrls(useMemo(() => K.all.flatMap(x => x.fotos), [K]));
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState('');
  const [hasil, setHasil] = useState(null);
  const fileRef = useRef(null); const impRef = useRef(null); const banyakRef = useRef(null); const target = useRef(null);
  const base = year * 10000 + (month + 1) * 100;
  const bulanLabel = `${BULAN[month]} ${year}`;
  const run = async (label, fn, ok) => { setBusy(label); try { await fn(); if (ok) onNotice?.(ok); await onRefresh?.(); } catch (e) { onNotice?.(`Gagal: ${e.message}`); } finally { setBusy(''); } };
  const raw = it => { const { row_index, fotos, ...d } = it; return d; };

  const save = (f, row) => run('simpan', async () => {
    const no = row ? row.No : Math.max(0, ...K.all.filter(x => x.Kategori === f.Kategori).map(x => Number(x.No) || 0)) + 1;
    const idx = row ? row.row_index : Math.max(base + 50 * (f.Kategori === 'Khusus' ? 1 : 0), ...K.all.map(x => x.row_index)) + 1;
    await saveRec(KEG_MOD, idx, { ...(row ? raw(row) : { Foto: '' }), Tahun: year, Bulan: month + 1, No: no, Kategori: f.Kategori, Kegiatan: String(f.Kegiatan).trim(), Tanggal: f.Tanggal || '', Lokasi: f.Lokasi || '' });
    setModal(null);
  }, 'Kegiatan disimpan.');
  const del = it => window.confirm(`Hapus kegiatan "${it.Kegiatan}" beserta ${it.fotos.length} foto?`) && run('hapus', async () => {
    if (it.fotos.length) await supabase.storage.from(BUCKET).remove(it.fotos);
    await deleteRec(KEG_MOD, it.row_index);
  }, 'Kegiatan dihapus.');
  const upload = async files => {
    const it = target.current; if (!it || !files.length) return;
    await run('unggah', async () => {
      const added = [];
      for (let i = 0; i < files.length; i += 1) {
        setBusy(`Mengunggah foto ${i + 1} dari ${files.length}...`);
        const blob = await kompres(files[i]);
        const path = `${year}/${String(month + 1).padStart(2, '0')}/${it.row_index}-${Date.now()}-${i}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'Bucket she-kegiatan belum dibuat. Jalankan siapkan_storage_kegiatan.sql di Supabase.' : error.message);
        added.push(path);
      }
      await saveRec(KEG_MOD, it.row_index, { ...raw(it), Foto: fotoJoin([...it.fotos, ...added]) });
    }, `${files.length} foto ditambahkan.`);
  };
  // Unggah banyak foto sekaligus: nama file menentukan kegiatan (R01_..., K02_...).
  const unggahBanyak = async files => {
    if (!files.length) return;
    const { cocok, tidak } = cocokkanFoto(files.map(f => f.name), K.all);
    if (!cocok.length) { setHasil({ ok: 0, tidak, gagal: [] }); return; }
    const per = new Map(); cocok.forEach(c => per.set(c.item.row_index, [...(per.get(c.item.row_index) || []), c]));
    const gagal = []; let ok = 0;
    setBusy(`Mengunggah 0 dari ${cocok.length} foto...`);
    try {
      for (const [, grup] of per) {
        const it = grup[0].item; const baru = [];
        for (const c of grup) {
          setBusy(`Mengunggah ${ok + gagal.length + 1} dari ${cocok.length} foto...`);
          try {
            const blob = await kompres(files[c.i]);
            const path = `${year}/${String(month + 1).padStart(2, '0')}/${it.row_index}-${Date.now()}-${c.i}.jpg`;
            const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
            if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'bucket she-kegiatan belum dibuat' : error.message);
            baru.push(path); ok += 1;
          } catch (e) { gagal.push({ name: c.name, alasan: e.message }); }
        }
        if (baru.length) await saveRec(KEG_MOD, it.row_index, { ...raw(it), Foto: fotoJoin([...it.fotos, ...baru]) });
      }
    } catch (e) { onNotice?.(`Gagal: ${e.message}`); }
    setBusy(''); setHasil({ ok, tidak, gagal });
    await onRefresh?.();
  };
  const delFoto = (it, p) => window.confirm('Hapus foto ini?') && run('hapus', async () => {
    await supabase.storage.from(BUCKET).remove([p]);
    await saveRec(KEG_MOD, it.row_index, { ...raw(it), Foto: fotoJoin(it.fotos.filter(x => x !== p)) });
  }, 'Foto dihapus.');
  const importXlsx = async file => {
    try {
      const p = parseKegiatanSheet(XLSX, XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      if (!p.rows.length) throw new Error('Tidak ada kegiatan yang terbaca.');
      const bln = BULAN.findIndex(b => new RegExp(b, 'i').test(p.title));
      const warn = bln >= 0 && bln !== month ? `\n\nPERHATIAN: judul file menyebut ${BULAN[bln]}, sedangkan bulan yang dipilih ${BULAN[month]}.` : '';
      const ada = K.all.length ? `\nKegiatan bulan ini yang namanya sama dipertahankan (termasuk fotonya); sisanya ditambahkan.` : '';
      if (!window.confirm(`Impor ${p.rows.length} kegiatan ke ${bulanLabel}?${ada}${warn}`)) return;
      await run('impor', async () => {
        let idx = Math.max(base + 1, ...K.all.map(x => x.row_index + 1)) - 1;
        const baru = p.rows.filter(r => !K.all.some(x => x.Kegiatan.toLowerCase() === r.Kegiatan.toLowerCase()));
        await saveMany(KEG_MOD, baru.map(r => { idx += 1; return { row_index: idx, data: { Tahun: year, Bulan: month + 1, ...r, Foto: '' } }; }));
      }, 'Kegiatan diimpor. Tambahkan foto di tiap kegiatan.');
    } catch (e) { onNotice?.(`Impor gagal: ${e.message}`); }
  };

  const card = it => (
    <article key={it.row_index} className="sm-item keg">
      <div className="sm-item-head">
        <div><strong>{it.No}.</strong> {it.Kegiatan}</div>
        <span className="sm-ref">{it.Tanggal || '—'} • {it.Lokasi || '—'}</span>
      </div>
      <div className="keg-fotos">
        {it.fotos.map(p => (
          <figure key={p} className="keg-foto">
            {urls[p] ? <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt={it.Kegiatan} loading="lazy" /></a> : <div className="keg-ph">Memuat...</div>}
            {canWrite && <button type="button" aria-label="Hapus foto" onClick={() => delFoto(it, p)}>×</button>}
          </figure>
        ))}
        {!it.fotos.length && <div className="keg-ph">Belum ada foto</div>}
      </div>
      {canWrite && (
        <div className="keg-act">
          <button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={() => { target.current = it; fileRef.current?.click(); }}><Icon name="upload" size={13} /> Tambah foto</button>
          <button type="button" className="btn light mini" onClick={() => setModal({ row: it })}><Icon name="edit" size={13} /> Ubah</button>
          <button type="button" className="btn light mini" style={{ color: 'var(--alert)' }} onClick={() => del(it)}>Hapus</button>
        </div>
      )}
    </article>
  );

  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <h3 className="lap-title" style={{ margin: 0 }}>SHE Activity Report • {bulanLabel}</h3>
        {canWrite && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn light mini" disabled={Boolean(busy)} onClick={() => impRef.current?.click()}><Icon name="upload" size={13} /> Impor kegiatan (Excel)</button>
            <button type="button" className="btn light mini" disabled={Boolean(busy) || !K.all.length} onClick={() => banyakRef.current?.click()}><Icon name="upload" size={13} /> Unggah banyak foto</button>
            <button type="button" className="btn primary mini" onClick={() => setModal({})}>+ Tambah kegiatan</button>
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="sm-hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; upload(f); }} />
        <input ref={banyakRef} type="file" accept="image/*" multiple className="sm-hidden" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; unggahBanyak(f); }} />
        <input ref={impRef} type="file" accept=".xlsx,.xls" className="sm-hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importXlsx(f); }} />
      </div>
      <p className="lap-hint">Foto diperkecil otomatis sebelum diunggah dan disimpan di Supabase Storage. Untuk "Unggah banyak foto", awali nama file dengan R01 (rutin no. 1) atau K02 (khusus no. 2). {busy && <b>{busy}</b>}</p>
      {hasil && (
        <div className="lap-note" style={{ marginBottom: 12 }}>
          <b>{hasil.ok} foto terpasang.</b>
          {hasil.tidak.length > 0 && <div style={{ marginTop: 6 }}>Tidak dipasang ({hasil.tidak.length}), tambahkan manual lewat "Tambah foto":<ul style={{ margin: '4px 0 0 18px' }}>{hasil.tidak.map(x => <li key={x.name}>{x.name}: {x.alasan}</li>)}</ul></div>}
          {hasil.gagal.length > 0 && <div style={{ marginTop: 6 }}>Gagal diunggah ({hasil.gagal.length}):<ul style={{ margin: '4px 0 0 18px' }}>{hasil.gagal.map(x => <li key={x.name}>{x.name}: {x.alasan}</li>)}</ul></div>}
          <button type="button" className="btn light mini" style={{ marginTop: 8 }} onClick={() => setHasil(null)}>Tutup</button>
        </div>
      )}
      {!K.all.length && <div className="no-results">Belum ada kegiatan di bulan ini. {canWrite ? 'Impor file SHE Activity Report atau tambah kegiatan satu per satu.' : ''}</div>}
      {K.rutin.length > 0 && <><h4 className="keg-h">Kegiatan rutin</h4><div className="sm-items">{K.rutin.map(card)}</div></>}
      {K.khusus.length > 0 && <><h4 className="keg-h">Kegiatan khusus</h4><div className="sm-items">{K.khusus.map(card)}</div></>}
      {modal && <FormModal eyebrow={`KEGIATAN SHE ${bulanLabel.toUpperCase()}`} title={modal.row ? 'Ubah kegiatan' : 'Tambah kegiatan'} fields={kegFields}
        init={modal.row ? { Kategori: modal.row.Kategori || 'Rutin', Kegiatan: modal.row.Kegiatan, Tanggal: modal.row.Tanggal || '', Lokasi: modal.row.Lokasi || '' } : { Kategori: 'Rutin', Kegiatan: '', Tanggal: '', Lokasi: '' }}
        onClose={() => setModal(null)} onSave={f => save(f, modal.row)} />}
    </section>
  );
}

/** Unduh foto (via URL sementara) sebagai data URL untuk PowerPoint. Foto yang gagal dimuat dilewati. */
export async function fotoDataUrls(paths) {
  const out = {};
  if (!paths.length) return out;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 600);
  await Promise.all((data || []).filter(d => d.signedUrl).map(async d => {
    try {
      const blob = await (await fetch(d.signedUrl)).blob();
      out[d.path] = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    } catch { /* lewati foto yang gagal */ }
  }));
  return out;
}

/** Unggah beberapa foto ke bucket (diperkecil dulu); mengembalikan daftar jalur yang berhasil. */
export async function uploadFotos(files, prefix, onProgress) {
  const out = [];
  for (let i = 0; i < files.length; i += 1) {
    onProgress?.(i + 1, files.length);
    const blob = await kompres(files[i]);
    const path = `${prefix}/${Date.now()}-${i}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'Bucket she-kegiatan belum dibuat. Jalankan siapkan_storage_kegiatan.sql di Supabase.' : error.message);
    out.push(path);
  }
  return out;
}
