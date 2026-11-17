import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { DAY, toDate } from './utils.js';

// Form tambah / ubah kandidat Rekrutmen.
// NIK dan No. HP lengkap disimpan di app_private_data (hanya admin/HR). Data lain di app_data.

export const REK = 'Data_Rekrutmen';
export const SUMBER = ['Job Portal', 'Referensi Karyawan', 'Website Perusahaan', 'Media Sosial', 'Lainnya'];
export const ALASAN = ['Tidak Sesuai Kualifikasi', 'Tidak Hadir Test Teori', 'Tidak Lulus Test Teori', 'Pengalaman Kurang', 'Gaji Tidak Sesuai Ekspektasi', 'Tidak Hadir Interview', 'Tidak Hadir Test Praktek', 'Tidak Lulus Test Praktek', 'Tidak Lulus MCU', 'Lainnya'];
export const TAHAP = ['Lamaran Masuk', 'Screening', 'Test Tulis', 'Interview HR/PJO', 'Test Praktek', 'Interview User', 'Medical Check Up', 'Follow Up', 'Offering Letter', 'Pengajuan Mine Permit / Badge', 'Induksi Karyawan Baru', 'Training', 'Orientasi', 'Validasi 1', 'Validasi 2', 'Validasi 3', 'Assessment ICLH', 'Diterima'];
const HASIL = ['Proses', 'Diterima', 'Ditolak'];

// Nama kolom di database
export const K = {
  nama: 'Nama Kandidat', jab: 'Jabatan Dilamar', sumber: 'Sumber', lamar: 'Tanggal Lamar', tahap: 'Tahap Saat Ini', hasil: 'Hasil Akhir',
  alasan: 'Alasan Ditolak', detail: 'Keterangan Penolakan', terima: 'Tanggal Diterima', catatan: 'Catatan', tth: 'Time to Hire (Hari)', nik: 'NIK', hp: 'No. HP'
};
// Kolom yang dianggap privat untuk Rekrutmen (dicocokkan tanpa huruf besar/kecil dan tanda baca)
const nk = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const PRIV = new Set(['nik', 'nohp', 'nomorhp', 'hp', 'ktp']);
export const isPrivKey = k => PRIV.has(nk(k));
export const splitRek = rec => {
  const pub = {}; const priv = {};
  Object.entries(rec || {}).forEach(([k, v]) => { (isPrivKey(k) ? priv : pub)[k] = v; });
  return { pub, priv };
};
export const getKey = (d, name) => { const k = Object.keys(d || {}).find(x => nk(x) === nk(name)); return k === undefined ? undefined : d[k]; };
export const digits = s => String(s ?? '').replace(/\D/g, '');

const iso = v => {
  const d = v instanceof Date ? v : toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayIso = () => iso(new Date());

export default function KandidatForm({ rowIndex = null, data = [], canPrivate, onClose, onSaved }) {
  const [loading, setLoading] = useState(Boolean(rowIndex));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rec, setRec] = useState(null); // baris asli (id, row_index, data) saat mengubah
  const [hapusMode, setHapusMode] = useState(false);
  const [ketik, setKetik] = useState('');
  const [priv, setPriv] = useState({});
  const [f, setF] = useState({ nama: '', jab: '', sumber: SUMBER[0], lamar: todayIso(), tahap: TAHAP[0], hasil: 'Proses', alasan: '', detail: '', terima: '', catatan: '', nik: '', hp: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const jabList = useMemo(() => {
    const out = new Set();
    data.forEach(x => {
      if (x.module !== 'Data_Kebutuhan' && x.module !== REK) return;
      const d = x.data || {};
      const k = Object.keys(d).find(y => /^(jabatan|posisi)/i.test(y));
      const v = k ? String(d[k] ?? '').trim() : '';
      if (v) out.add(v);
    });
    return [...out].sort((a, b) => a.localeCompare(b, 'id'));
  }, [data]);

  // Muat baris yang diubah
  useEffect(() => {
    if (!rowIndex) return undefined;
    let live = true;
    (async () => {
      const a = await supabase.from('app_data').select('id,row_index,data').eq('module', REK).eq('row_index', rowIndex).maybeSingle();
      if (!live) return;
      if (a.error || !a.data) { setError(a.error ? `Gagal memuat data: ${a.error.message}` : 'Data kandidat tidak ditemukan.'); setLoading(false); return; }
      let p = {};
      if (canPrivate) {
        const b = await supabase.from('app_private_data').select('data').eq('module', REK).eq('row_index', rowIndex).maybeSingle();
        p = b.data?.data || {};
      }
      if (!live) return;
      const d = a.data.data || {};
      const merged = { ...d, ...p };
      const alasan = String(getKey(d, K.alasan) ?? '');
      setRec(a.data); setPriv(p);
      setF({
        nama: String(getKey(d, K.nama) ?? ''), jab: String(getKey(d, K.jab) ?? ''), sumber: String(getKey(d, K.sumber) ?? '') || SUMBER[0],
        lamar: iso(getKey(d, K.lamar)), tahap: String(getKey(d, K.tahap) ?? '') || TAHAP[0], hasil: String(getKey(d, K.hasil) ?? '') || 'Proses',
        alasan, detail: String(getKey(d, K.detail) ?? ''), terima: iso(getKey(d, K.terima)), catatan: String(getKey(d, K.catatan) ?? ''),
        nik: digits(getKey(merged, K.nik)), hp: String(getKey(merged, K.hp) ?? '')
      });
      setLoading(false);
    })();
    return () => { live = false; };
  }, [rowIndex, canPrivate]);

  const ditolak = /tolak|reject|gagal/i.test(f.hasil);
  const diterima = /diterima|hired|join/i.test(f.hasil);
  // Nilai lama di luar daftar tetap ditampilkan supaya tidak hilang
  const opsi = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);

  const submit = async e => {
    e.preventDefault(); setError('');
    const nama = f.nama.trim(); const jab = f.jab.trim();
    if (!nama) { setError('Nama kandidat wajib diisi.'); return; }
    if (!jab) { setError('Jabatan yang dilamar wajib diisi.'); return; }
    const nik = digits(f.nik);
    if (canPrivate && nik && nik.length !== 16) { setError('NIK harus 16 digit angka. Kosongkan dulu bila belum ada.'); return; }
    if (ditolak && !f.alasan) { setError('Pilih alasan penolakan.'); return; }
    if (ditolak && f.alasan === 'Lainnya' && !f.detail.trim()) { setError('Isi keterangan alasan penolakan (pilihan Lainnya).'); return; }
    if (diterima && !f.terima) { setError('Isi tanggal diterima.'); return; }
    setBusy(true);
    try {
      if (canPrivate && nik) {
        const q = await supabase.from('app_private_data').select('row_index,data').eq('module', REK).range(0, 4999);
        if (q.error) throw q.error;
        const dup = (q.data || []).find(r => r.row_index !== (rec?.row_index ?? -1) && digits(getKey(r.data, K.nik)) === nik);
        if (dup) throw new Error('NIK ini sudah dipakai kandidat lain.');
      }
      const lamar = f.lamar ? new Date(`${f.lamar}T00:00:00`) : null; const terima = f.terima ? new Date(`${f.terima}T00:00:00`) : null;
      const tth = diterima && lamar && terima ? Math.max(0, Math.round((terima - lamar) / DAY)) : '';
      const base = { ...(rec?.data || {}) };
      // Satu nama kolom per isi: hapus varian lama supaya tidak dobel
      Object.keys(base).forEach(k => { if (isPrivKey(k)) delete base[k]; });
      const pub = {
        ...base,
        [K.nama]: nama, [K.jab]: jab, [K.sumber]: f.sumber, [K.lamar]: f.lamar, [K.tahap]: f.tahap, [K.hasil]: f.hasil,
        [K.alasan]: ditolak ? f.alasan : '', [K.detail]: ditolak && f.alasan === 'Lainnya' ? f.detail.trim() : '',
        [K.terima]: diterima ? f.terima : '', [K.catatan]: f.catatan.trim(), [K.tth]: tth
      };
      let idx = rec?.row_index;
      if (rec) {
        const r = await supabase.from('app_data').update({ data: pub, updated_at: new Date().toISOString() }).eq('id', rec.id);
        if (r.error) throw r.error;
      } else {
        const m = await supabase.from('app_data').select('row_index').eq('module', REK).order('row_index', { ascending: false }).limit(1);
        if (m.error) throw m.error;
        idx = (m.data?.[0]?.row_index || 0) + 1;
        const r = await supabase.from('app_data').insert({ module: REK, row_index: idx, data: pub });
        if (r.error) throw r.error;
      }
      if (canPrivate) {
        const keep = { ...priv };
        Object.keys(keep).forEach(k => { if (isPrivKey(k)) delete keep[k]; });
        const p = { ...keep, [K.nik]: nik, [K.hp]: f.hp.trim() };
        const r = await supabase.from('app_private_data').upsert({ module: REK, row_index: idx, data: p, updated_at: new Date().toISOString() }, { onConflict: 'module,row_index' });
        if (r.error) {
          // Data umum sudah masuk; beri tahu bahwa bagian privat belum tersimpan
          throw new Error(`Data kandidat tersimpan, tetapi NIK/No. HP belum tersimpan: ${r.error.message}`);
        }
      }
      await onSaved?.();
      onClose();
    } catch (err) { setError(err.message || 'Gagal menyimpan data.'); }
    finally { setBusy(false); }
  };

  // Hapus kandidat (hanya admin/HR): NIK/HP privat dihapus dulu supaya tidak menggantung dan menempel ke kandidat baru
  const hapusKandidat = async () => {
    if (!rec || ketik.trim().toUpperCase() !== 'HAPUS') return;
    setError(''); setBusy(true);
    try {
      const p = await supabase.from('app_private_data').delete().eq('module', REK).eq('row_index', rec.row_index);
      if (p.error) throw p.error;
      const a = await supabase.from('app_data').delete().eq('id', rec.id).select('id');
      if (a.error) throw a.error;
      if (!a.data || !a.data.length) throw new Error('Kandidat tidak terhapus. Periksa izin akun Anda.');
      await onSaved?.();
      onClose();
    } catch (err) { setError(err.message || 'Gagal menghapus kandidat.'); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="record-modal" onSubmit={submit}>
      <div className="modal-head"><div><div className="eyebrow muted">{rec ? 'PERBARUI KANDIDAT' : 'KANDIDAT BARU'}</div><h2>{rec ? 'Ubah kandidat' : 'Tambah kandidat'}</h2>
        <p className="subtle">Isi data pelamar. Jabatan mengikuti daftar kebutuhan manpower.</p></div>
        <button type="button" className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
      {loading ? <div className="loading-state"><div className="spinner" />Memuat data...</div> : <>
        <div className="modal-fields">
          <label className="field-wide"><span>Nama kandidat *</span><input value={f.nama} onChange={e => set('nama', e.target.value)} autoFocus /></label>
          <label><span>Jabatan dilamar *</span><input value={f.jab} list="kdt-jabatan" placeholder="Ketik untuk mencari jabatan" onChange={e => set('jab', e.target.value)} /></label>
          <label><span>Sumber</span><select value={f.sumber} onChange={e => set('sumber', e.target.value)}>{opsi(SUMBER, f.sumber).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label><span>Tanggal lamar</span><input type="date" value={f.lamar} onChange={e => set('lamar', e.target.value)} /></label>
          <label><span>Tahap saat ini</span><select value={f.tahap} onChange={e => set('tahap', e.target.value)}>{opsi(TAHAP, f.tahap).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label><span>Hasil akhir</span><select value={f.hasil} onChange={e => set('hasil', e.target.value)}>{opsi(HASIL, f.hasil).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          {diterima && <label><span>Tanggal diterima *</span><input type="date" value={f.terima} onChange={e => set('terima', e.target.value)} /></label>}
          {ditolak && <label><span>Alasan ditolak *</span><select value={f.alasan} onChange={e => set('alasan', e.target.value)}>
            <option value="">— Pilih alasan —</option>{opsi(ALASAN, f.alasan).map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
          {ditolak && f.alasan === 'Lainnya' && <label className="field-wide"><span>Keterangan alasan (ketik manual) *</span><input value={f.detail} onChange={e => set('detail', e.target.value)} /></label>}
          {canPrivate && <label><span>NIK<em className="private-tag">PRIVAT</em></span><input inputMode="numeric" maxLength={16} value={f.nik} placeholder="16 digit, boleh kosong dulu" onChange={e => set('nik', digits(e.target.value).slice(0, 16))} /></label>}
          {canPrivate && <label><span>No. HP<em className="private-tag">PRIVAT</em></span><input inputMode="tel" value={f.hp} onChange={e => set('hp', e.target.value)} /></label>}
          <label className="field-wide"><span>Catatan</span><textarea rows="3" value={f.catatan} onChange={e => set('catatan', e.target.value)} /></label>
        </div>
        <datalist id="kdt-jabatan">{jabList.map(j => <option key={j} value={j} />)}</datalist>
        {canPrivate && !digits(f.nik) && <p className="subtle">NIK belum diisi: kandidat akan ditandai “NIK belum lengkap” sampai HR melengkapinya.</p>}
        {error && <div className="form-error">{error}</div>}
        {hapusMode && rec ? (
          <div style={{ border: '1px solid #f1b5b0', background: '#fff5f4', borderRadius: 10, padding: 12, marginTop: 10 }}>
            <p style={{ margin: '0 0 6px', color: '#b42318' }}><b>Hapus kandidat {f.nama || ''}?</b> Data kandidat beserta NIK dan No. HP-nya terhapus dan tidak bisa dikembalikan. Peserta dengan nama ini di sesi Tes Teori tidak ikut terhapus.</p>
            <label style={{ display: 'block' }}>Ketik <b>HAPUS</b> untuk melanjutkan
              <input value={ketik} onChange={e => setKetik(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="HAPUS" autoComplete="off" style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn light" disabled={busy} onClick={() => { setHapusMode(false); setKetik(''); }}>Batal hapus</button>
              <button type="button" className="btn amber" disabled={busy || ketik.trim().toUpperCase() !== 'HAPUS'} onClick={hapusKandidat}>{busy ? 'Menghapus...' : 'Hapus kandidat'}</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions" style={{ justifyContent: rec && canPrivate ? 'space-between' : undefined }}>
            {rec && canPrivate && <button type="button" className="btn light" style={{ color: '#b42318' }} onClick={() => { setHapusMode(true); setKetik(''); setError(''); }}>Hapus kandidat</button>}
            <span style={{ display: 'flex', gap: 8 }}><button type="button" className="btn light" onClick={onClose}>Batal</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button></span>
          </div>
        )}
      </>}
    </form>
  </div>;
}

// Dipakai juga oleh Tes Teori: buat kandidat baru dari peserta manual bila belum ada.
export async function buatKandidatDariTes({ nama, hp, jabatan }) {
  const m = await supabase.from('app_data').select('row_index').eq('module', REK).order('row_index', { ascending: false }).limit(1);
  if (m.error) throw m.error;
  const idx = (m.data?.[0]?.row_index || 0) + 1;
  const pub = { [K.nama]: nama, [K.jab]: jabatan || '', [K.sumber]: 'Lainnya', [K.lamar]: todayIso(), [K.tahap]: 'Test Tulis', [K.hasil]: 'Proses', [K.alasan]: '', [K.detail]: '', [K.terima]: '', [K.catatan]: 'Ditambahkan dari Tes Teori', [K.tth]: '' };
  const a = await supabase.from('app_data').insert({ module: REK, row_index: idx, data: pub });
  if (a.error) throw a.error;
  const b = await supabase.from('app_private_data').upsert({ module: REK, row_index: idx, data: { [K.nik]: '', [K.hp]: hp }, updated_at: new Date().toISOString() }, { onConflict: 'module,row_index' });
  if (b.error) throw b.error;
  return idx;
}
