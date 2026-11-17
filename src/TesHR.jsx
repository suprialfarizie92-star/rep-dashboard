import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { norm } from './utils.js';
import { buatKandidatDariTes, getKey } from './KandidatForm.jsx';
import './dashboard.css';
import './tes.css';

// Halaman HR/admin untuk sistem tes teori. Skor dan jawaban baru terbaca setelah sesi ditutup
// (aturan ini dijaga oleh database, bukan oleh halaman ini).

const S_TONE = { menunggu: 'amber', berjalan: 'green', ditutup: 'gray' };
const S_LABEL = { menunggu: 'Menunggu dimulai', berjalan: 'Berjalan', ditutup: 'Ditutup' };
const P_LABEL = { terdaftar: 'Belum masuk', masuk: 'Di ruang tunggu', mengerjakan: 'Mengerjakan', selesai: 'Selesai' };
const P_TONE = { terdaftar: 'gray', masuk: 'amber', mengerjakan: 'blue', selesai: 'green' };

const digits = s => String(s ?? '').replace(/\D/g, '');
const waktu = s => (s === null || s === undefined ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
// Detik sekali bila ada sesi berjalan, supaya hitung mundur bergerak
function useNow(aktif) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { if (!aktif) return undefined; setN(Date.now()); const id = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(id); }, [aktif]);
  return n;
}
const BATAS_MERAH = 300; // detik: sisa waktu di bawah ini tampil merah, dan jumlah pindah tab dari 3 ditandai
const BATAS_PINDAH = 3;
// Sisa detik; null bila belum bisa dihitung. tambahan = menit tambahan khusus peserta.
const sisaDetik = (s, pk, now, tambahan = 0) => (s?.mulai_at && pk?.durasi_menit ? Math.round((new Date(s.mulai_at).getTime() + (Number(pk.durasi_menit) + Number(tambahan || 0)) * 60000 - now) / 1000) : null);
const tgl = v => (v ? new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const hasilOf = p => (Array.isArray(p.tes_hasil) ? p.tes_hasil[0] : p.tes_hasil) || null;
const pick = (r, re) => { const k = Object.keys(r).find(x => re.test(x) && r[x] !== null && r[x] !== ''); return k === undefined ? undefined : r[k]; };

async function ok(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export default function TesHR({ data = [], onChanged }) {
  const [tab, setTab] = useState('sesi');
  const [paket, setPaket] = useState([]);
  const [sesi, setSesi] = useState([]);
  const [soal, setSoal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [aktif, setAktif] = useState('');
  const notify = useCallback(m => setMsg(m), []);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        ok(supabase.from('tes_paket').select('*').order('created_at', { ascending: false })),
        ok(supabase.from('tes_sesi').select('*').order('created_at', { ascending: false }))
      ]);
      const semua = [];
      for (let from = 0; ; from += 1000) {
        const r = await ok(supabase.from('tes_soal').select('*').order('created_at', { ascending: true }).range(from, from + 999));
        semua.push(...(r || []));
        if (!r || r.length < 1000) break;
      }
      setPaket(a || []); setSesi(b || []); setSoal(semua);
    } catch (e) { setMsg({ err: e.message }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { if (!msg?.ok) return undefined; const id = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(id); }, [msg]);

  return (
    <div className="page-content dash">
      <div className="dash-top">
        <div>
          <h1>Tes Teori</h1>
          <p className="subtle">Tes teori calon karyawan di lokasi. Kandidat mengerjakan lewat HP, hasil hanya terlihat oleh HR setelah sesi ditutup.</p>
        </div>
        <div className="dash-filters">
          <button type="button" className="btn light" onClick={muat}><Icon name="refresh" size={15} /> Perbarui</button>
        </div>
      </div>

      <div className="seg-tabs tes-tabs" role="group" aria-label="Bagian Tes Teori">
        {[['sesi', 'Sesi tes'], ['soal', `Bank soal (${soal.length})`], ['paket', 'Paket tes']].map(([k, l]) => (
          <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {msg?.err && <div className="form-error" role="alert">{msg.err}</div>}
      {msg?.ok && <div className="idok" role="status">{msg.ok}</div>}

      {loading && !sesi.length && !soal.length
        ? <div className="loading-state"><div className="spinner" />Memuat data...</div>
        : tab === 'sesi' ? <SesiTab paket={paket} sesi={sesi} soal={soal} data={data} aktif={aktif} setAktif={setAktif} muat={muat} notify={notify} onChanged={onChanged} />
          : tab === 'soal' ? <SoalTab soal={soal} muat={muat} notify={notify} />
            : <PaketTab paket={paket} soal={soal} muat={muat} notify={notify} />}
    </div>
  );
}

/* ====================== SESI ====================== */
function SesiTab({ paket, sesi, soal, data, aktif, setAktif, muat, notify, onChanged }) {
  const [paketId, setPaketId] = useState('');
  const [judul, setJudul] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!paketId && paket.length) setPaketId((paket.find(p => p.aktif) || paket[0]).id); }, [paket, paketId]);

  const buat = async () => {
    if (!paketId) { notify({ err: 'Buat paket tes terlebih dahulu.' }); return; }
    setBusy(true);
    try {
      const nama = paket.find(p => p.id === paketId)?.nama || 'Tes teori';
      const j = judul.trim() || `${nama} - ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      const id = await ok(supabase.rpc('tes_buat_sesi', { p_paket: paketId, p_judul: j }));
      setJudul(''); await muat(); setAktif(id);
      notify({ ok: 'Sesi dibuat. Tambahkan peserta, lalu bagikan QR ke kandidat.' });
    } catch (e) { notify({ err: e.message }); } finally { setBusy(false); }
  };

  const adaJalan = sesi.some(x => x.status === 'berjalan');
  const now = useNow(adaJalan && !aktif);
  const cur = sesi.find(s => s.id === aktif);
  if (cur) return <SesiDetail key={cur.id} s={cur} paket={paket} soal={soal} data={data} muat={muat} notify={notify} onChanged={onChanged} kembali={() => setAktif('')} />;

  return (
    <section className="panel tr-panel">
      <div className="panel-heading"><div><h3>Buat sesi baru</h3><p className="subtle">Satu sesi = satu kali tes untuk beberapa kandidat sekaligus, dengan waktu mulai yang sama.</p></div></div>
      <div className="tes-row">
        <label>Paket tes<select value={paketId} onChange={e => setPaketId(e.target.value)}>{paket.map(p => <option key={p.id} value={p.id}>{p.nama}{p.aktif ? '' : ' (nonaktif)'}</option>)}</select></label>
        <label>Judul sesi (opsional)<input value={judul} onChange={e => setJudul(e.target.value)} placeholder="mis. Tes Mekanik Gelombang 3" style={{ minWidth: 260 }} /></label>
        <button type="button" className="btn primary" onClick={buat} disabled={busy || !paket.length}>{busy ? 'Membuat...' : 'Buat sesi'}</button>
      </div>
      <div className="tes-sesi-list">
        {sesi.map(s => (
          <button type="button" key={s.id} className="tes-sesi-item" onClick={() => setAktif(s.id)}>
            <span><strong>{s.judul}</strong><small>Kode {s.kode} • dibuat {tgl(s.created_at)}</small></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.status === 'berjalan' && (() => { const sd = sisaDetik(s, paket.find(p => p.id === s.paket_id), now); return sd === null ? null : <small style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: sd <= BATAS_MERAH ? '#b42318' : undefined }}>{sd > 0 ? `Sisa ${waktu(sd)}` : 'Waktu habis'}</small>; })()}
              <span className="badge" data-tone={S_TONE[s.status]}>{S_LABEL[s.status]}</span>
            </span>
          </button>
        ))}
        {!sesi.length && <div className="no-results">Belum ada sesi tes.</div>}
      </div>
    </section>
  );
}

async function semuaJawaban(ids) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await ok(supabase.from('tes_jawaban').select('peserta_id,soal_id,pilihan_asli').in('peserta_id', ids).range(from, from + 999));
    out.push(...(r || []));
    if (!r || r.length < 1000) break;
  }
  return out;
}

function SesiDetail({ s, paket, soal, data, muat, notify, kembali, onChanged }) {
  const pk = paket.find(p => p.id === s.paket_id);
  const url = `${window.location.origin}/tes?kode=${s.kode}`;
  const ditutup = s.status === 'ditutup';
  const now = useNow(s.status === 'berjalan');
  const sisaSesi = s.status === 'berjalan' ? sisaDetik(s, pk, now) : null;
  const [qr, setQr] = useState('');
  const [besar, setBesar] = useState(false);
  const [peserta, setPeserta] = useState([]);
  const [jawaban, setJawaban] = useState([]);
  const [teks, setTeks] = useState('');
  const [rek, setRek] = useState('');
  const [jabTes, setJabTes] = useState('');
  const [priv, setPriv] = useState({});
  const [busy, setBusy] = useState(false);

  // No. HP lengkap kandidat disimpan di tabel privat (halaman ini hanya untuk admin/HR)
  const muatPriv = useCallback(async () => {
    const { data: d, error } = await supabase.from('app_private_data').select('row_index,data').eq('module', 'Data_Rekrutmen').range(0, 4999);
    if (error) return {};
    const m = {}; (d || []).forEach(r => { m[r.row_index] = r.data || {}; });
    setPriv(m);
    return m;
  }, []);
  useEffect(() => { muatPriv(); }, [muatPriv, data]);
  const jabList = useMemo(() => {
    const out = new Set();
    data.forEach(x => {
      if (x.module !== 'Data_Kebutuhan' && x.module !== 'Data_Rekrutmen') return;
      const d = x.data || {}; const k = Object.keys(d).find(y => /^(jabatan|posisi)/i.test(y));
      const v = k ? String(d[k] ?? '').trim() : ''; if (v) out.add(v);
    });
    return [...out].sort((a, b) => a.localeCompare(b, 'id'));
  }, [data]);

  useEffect(() => {
    let on = true;
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then(d => { if (on) setQr(d); }).catch(() => {});
    return () => { on = false; };
  }, [url]);

  const muatPeserta = useCallback(async () => {
    try {
      const rows = await ok(supabase.from('tes_peserta')
        .select('id,nama,hp4,status,gagal_masuk,tambahan_menit,pindah_tab,mulai_at,selesai_at,soal_urutan,tes_hasil(*)')
        .eq('sesi_id', s.id).order('nama'));
      setPeserta(rows || []);
      setJawaban(ditutup && rows?.length ? await semuaJawaban(rows.map(r => r.id)) : []);
    } catch (e) { notify({ err: e.message }); }
  }, [s.id, ditutup, notify]);

  useEffect(() => {
    muatPeserta();
    if (ditutup) return undefined;
    const id = setInterval(muatPeserta, 5000);
    return () => clearInterval(id);
  }, [muatPeserta, ditutup]);

  const aksi = async (fn, pesan) => {
    setBusy(true);
    try { await fn(); if (pesan) notify({ ok: pesan }); } catch (e) { notify({ err: e.message }); } finally { setBusy(false); }
  };

  const hitung = useMemo(() => {
    const c = { terdaftar: 0, masuk: 0, mengerjakan: 0, selesai: 0 };
    peserta.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [peserta]);

  const mulai = () => {
    if (!peserta.length) { notify({ err: 'Tambahkan peserta terlebih dahulu.' }); return; }
    const belumMasuk = hitung.terdaftar;
    if (!window.confirm(`Mulai tes sekarang?${belumMasuk ? `\n\n${belumMasuk} peserta belum masuk. Mereka masih bisa masuk setelah tes dimulai, tetapi waktunya sama dengan peserta lain.` : ''}`)) return;
    aksi(async () => { await ok(supabase.rpc('tes_mulai_sesi', { p_sesi: s.id })); await muat(); }, 'Tes dimulai. Peserta di ruang tunggu langsung melihat soal.');
  };
  const tutup = () => {
    if (!window.confirm('Tutup sesi ini?\n\nPeserta yang belum selesai akan dinilai dari jawaban yang sudah masuk. Setelah ditutup, skor terbuka untuk HR dan sesi tidak bisa dibuka lagi.')) return;
    aksi(async () => { await ok(supabase.rpc('tes_tutup_sesi', { p_sesi: s.id })); await muat(); }, 'Sesi ditutup. Hasil sudah bisa dilihat.');
  };

  const kandidat = useMemo(() => {
    const seen = new Set();
    return data.filter(x => x.module === 'Data_Rekrutmen').map(x => ({ r: x.data || {}, p: priv[x.row_index] || {} })).map(({ r, p }) => ({
      nama: String(pick(r, /^nama/i) ?? '').trim(),
      hp: digits(getKey(p, 'No. HP') ?? pick(r, /hp|telp|telepon|phone/i)),
      jabatan: String(pick(r, /^(jabatan|posisi)/i) ?? '').trim(),
      hasil: norm(pick(r, /hasil akhir/i))
    })).filter(k => {
      const key = `${k.nama}|${k.hp}`;
      if (!k.nama || k.hp.length < 4 || ['ditolak', 'diterima'].includes(k.hasil) || seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [data, priv]);

  const tambah = () => aksi(async () => {
    const rows = []; const salah = []; const lengkap = [];
    teks.split('\n').map(x => x.trim()).filter(Boolean).forEach(b => {
      const parts = b.split(/[;\t|,]/);
      const nama = (parts[0] || '').trim(); const hp = digits(parts.slice(1).join(''));
      if (nama && hp.length >= 4) { rows.push({ sesi_id: s.id, nama, hp4: hp.slice(-4) }); lengkap.push({ nama, hp }); } else salah.push(b);
    });
    if (salah.length) throw new Error(`Baris tidak valid (butuh nama dan nomor HP, dipisah titik koma): ${salah.slice(0, 3).join(' | ')}`);
    if (!rows.length) throw new Error('Isi minimal satu baris: Nama; Nomor HP.');
    await ok(supabase.from('tes_peserta').insert(rows));
    setTeks(''); await muatPeserta();
    // Peserta yang belum ada di Rekrutmen otomatis dibuat sebagai kandidat (dicocokkan lewat No. HP lengkap)
    const ada = await muatPriv();
    const hpAda = new Set(Object.values(ada).map(p => digits(getKey(p, 'No. HP'))).filter(Boolean));
    const baru = lengkap.filter((k, i) => !hpAda.has(k.hp) && lengkap.findIndex(z => z.hp === k.hp) === i);
    try {
      for (const k of baru) await buatKandidatDariTes({ nama: k.nama, hp: k.hp, jabatan: jabTes });
    } catch (e) { throw new Error(`Peserta sudah masuk sesi, tetapi gagal membuat kandidat di Rekrutmen: ${e.message}`); }
    finally { if (baru.length) onChanged?.(); }
  }, `Peserta ditambahkan.`);

  const tambahWaktu = p => {
    const m = Number(window.prompt(`Tambah waktu untuk ${p.nama} (menit):`, '5'));
    if (!(m > 0)) return;
    aksi(async () => { await ok(supabase.rpc('tes_tambah_waktu', { p_peserta: p.id, p_menit: Math.round(m) })); await muatPeserta(); }, `Waktu ${p.nama} ditambah ${Math.round(m)} menit.`);
  };
  const bukaKunci = p => aksi(async () => { await ok(supabase.from('tes_peserta').update({ gagal_masuk: 0 }).eq('id', p.id)); await muatPeserta(); }, `Akses ${p.nama} dibuka kembali.`);
  const hapus = p => {
    if (!window.confirm(`Hapus ${p.nama} dari sesi ini?`)) return;
    aksi(async () => { await ok(supabase.from('tes_peserta').delete().eq('id', p.id)); await muatPeserta(); }, `${p.nama} dihapus.`);
  };
  const salin = async () => { try { await navigator.clipboard.writeText(url); notify({ ok: 'Link tes disalin.' }); } catch { notify({ err: 'Tidak bisa menyalin. Salin manual dari kotak di bawah QR.' }); } };

  const hasil = useMemo(() => (ditutup ? peserta.map(p => ({ p, h: hasilOf(p) })).sort((a, b) => (b.h?.skor ?? -1) - (a.h?.skor ?? -1)) : []), [peserta, ditutup]);
  const ringkas = useMemo(() => {
    const ada = hasil.filter(x => x.h);
    return { lulus: ada.filter(x => x.h.lulus).length, tidak: ada.filter(x => !x.h.lulus).length, rata: ada.length ? ada.reduce((t, x) => t + Number(x.h.skor), 0) / ada.length : null };
  }, [hasil]);

  const analisis = useMemo(() => {
    if (!ditutup) return [];
    const info = new Map(soal.map(q => [q.id, q]));
    const tampil = new Map(); const benar = new Map();
    peserta.forEach(p => (p.soal_urutan || []).forEach(e => tampil.set(e.id, (tampil.get(e.id) || 0) + 1)));
    jawaban.forEach(j => { const q = info.get(j.soal_id); if (q && j.pilihan_asli === q.kunci) benar.set(j.soal_id, (benar.get(j.soal_id) || 0) + 1); });
    return [...tampil].map(([id, n]) => ({ id, q: info.get(id), n, salah: n - (benar.get(id) || 0) }))
      .filter(x => x.q).map(x => ({ ...x, pct: (x.salah / x.n) * 100 })).sort((a, b) => b.pct - a.pct).slice(0, 10);
  }, [ditutup, soal, peserta, jawaban]);

  const unduh = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const baris = [['Nama', '4 digit HP', 'Skor', 'Benar', 'Total soal', 'Lulus', 'Durasi (mm:ss)', 'Pindah tab', 'Diselesaikan sistem']];
    hasil.forEach(({ p, h }) => baris.push([p.nama, p.hp4, h?.skor ?? '', h?.benar ?? '', h?.total ?? '', h ? (h.lulus ? 'Ya' : 'Tidak') : '', waktu(h?.durasi_detik), p.pindah_tab, h?.otomatis ? 'Ya' : 'Tidak']));
    const blob = new Blob([`\ufeff${baris.map(r => r.map(esc).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `hasil-tes-${s.kode}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <section className="panel tr-panel">
        <div className="panel-heading">
          <div><h3>{s.judul}</h3><p className="subtle">Paket: {pk?.nama || '—'} • {pk?.jumlah_soal} soal • {pk?.durasi_menit} menit • nilai lulus {pk?.nilai_lulus}</p></div>
          <button type="button" className="btn light mini" onClick={kembali}>← Semua sesi</button>
        </div>
        <div className="tes-head">
          <div>
            <span className="badge" data-tone={S_TONE[s.status]}>{S_LABEL[s.status]}</span>
            {s.status === 'berjalan' && sisaSesi !== null && (
              <div style={{ margin: '8px 0 2px', fontSize: 13 }}>
                <span className="subtle">Sisa waktu sesi </span>
                <strong style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', color: sisaSesi <= BATAS_MERAH ? '#b42318' : undefined }}>{sisaSesi > 0 ? waktu(sisaSesi) : 'Waktu habis'}</strong>
                <span className="subtle"> • berakhir pukul {new Date(new Date(s.mulai_at).getTime() + Number(pk?.durasi_menit) * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            <div className="tes-kode" aria-label="Kode sesi">{s.kode}</div>
            <div className="tes-url">{url}</div>
            <div className="tes-actions">
              {s.status === 'menunggu' && <button type="button" className="btn primary" disabled={busy} onClick={mulai}>Mulai tes</button>}
              {s.status === 'berjalan' && <button type="button" className="btn amber" disabled={busy} onClick={tutup}>Tutup sesi</button>}
              {!ditutup && <button type="button" className="btn light" onClick={() => setBesar(true)}>QR layar penuh</button>}
              {!ditutup && <button type="button" className="btn light" onClick={salin}>Salin link</button>}
              {ditutup && <button type="button" className="btn light" onClick={unduh}>Unduh hasil (CSV)</button>}
            </div>
            {s.status === 'menunggu' && <p className="tes-note">Kandidat scan QR, pilih nama, dan masuk ke ruang tunggu. Tekan Mulai setelah semua siap.</p>}
            {s.status === 'berjalan' && <p className="tes-note">Skor tidak terlihat selama sesi berjalan. Tutup sesi setelah semua kandidat selesai atau waktu habis.</p>}
          </div>
          {!ditutup && qr && <img className="tes-qr" src={qr} alt={`QR sesi ${s.kode}`} onClick={() => setBesar(true)} />}
        </div>
      </section>

      <div className="dgrid" style={{ marginTop: 14 }}>
        <div className="dcard static" data-tone="gray"><b>{peserta.length}</b><span>Peserta</span></div>
        <div className="dcard static" data-tone="amber"><b>{hitung.masuk}</b><span>Di ruang tunggu</span></div>
        <div className="dcard static" data-tone="blue"><b>{hitung.mengerjakan}</b><span>Mengerjakan</span></div>
        <div className="dcard static" data-tone="green"><b>{hitung.selesai}</b><span>Selesai</span></div>
        {ditutup && <div className="dcard static" data-tone="green"><b>{ringkas.lulus}</b><span>Lulus</span></div>}
        {ditutup && <div className="dcard static" data-tone="red"><b>{ringkas.tidak}</b><span>Tidak lulus</span></div>}
        {ditutup && <div className="dcard static" data-tone="blue"><b>{ringkas.rata === null ? '—' : ringkas.rata.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b><span>Rata-rata skor</span></div>}
      </div>

      <div className="tes-split">
        {!ditutup && (
          <section className="panel tr-panel">
            <div className="panel-heading"><div><h3>Tambah peserta</h3><p className="subtle">Satu baris satu orang: Nama; Nomor HP. Sistem hanya menyimpan 4 digit terakhir nomor HP untuk verifikasi.</p></div></div>
            <div className="tes-form">
              {kandidat.length > 0 && (
                <label>Ambil dari Rekrutmen (kandidat yang masih diproses)
                  <select value={rek} onChange={e => { const k = kandidat[Number(e.target.value)]; if (k) setTeks(t => `${t ? `${t}\n` : ''}${k.nama}; ${k.hp}`); setRek(''); }}>
                    <option value="">— Pilih kandidat —</option>
                    {kandidat.map((k, i) => <option key={`${k.nama}${k.hp}`} value={i}>{k.nama}{k.jabatan ? ` — ${k.jabatan}` : ''}</option>)}
                  </select>
                </label>
              )}
              <label>Jabatan untuk kandidat baru di Rekrutmen (bila peserta belum terdaftar)
                <input value={jabTes} list="tes-jabatan" placeholder="Ketik untuk mencari jabatan" onChange={e => setJabTes(e.target.value)} />
                <datalist id="tes-jabatan">{jabList.map(j => <option key={j} value={j} />)}</datalist>
              </label>
              <label>Daftar peserta<textarea value={teks} onChange={e => setTeks(e.target.value)} placeholder={'Budi Santoso; 081234567890\nAndi Wijaya; 085212345678'} /></label>
              <div><button type="button" className="btn primary" disabled={busy || !teks.trim()} onClick={tambah}>Tambahkan peserta</button></div>
            </div>
          </section>
        )}

        <section className="panel tr-panel" style={ditutup ? { gridColumn: '1 / -1' } : undefined}>
          <div className="panel-heading"><div><h3>{ditutup ? 'Hasil tes' : 'Peserta dan status'}</h3><p className="subtle">{ditutup ? 'Diurutkan dari skor tertinggi.' : 'Diperbarui otomatis tiap 5 detik. Skor belum ditampilkan.'}</p></div></div>
          <div className="tr-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Nama</th><th>HP</th><th>Status</th>{!ditutup && s.status === 'berjalan' ? <th className="num">Sisa waktu</th> : null}
                  {ditutup ? <><th className="num">Skor</th><th className="num">Benar</th><th>Hasil</th><th className="num">Durasi</th></> : null}
                  <th className="num">Pindah tab</th><th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(ditutup ? hasil : peserta.map(p => ({ p, h: null }))).map(({ p, h }) => (
                  <tr key={p.id}>
                    <td><strong>{p.nama}</strong>{p.tambahan_menit > 0 && <small className="tes-mini"> +{p.tambahan_menit} mnt</small>}</td>
                    <td>••••{p.hp4}</td>
                    <td><span className="badge" data-tone={P_TONE[p.status]}>{P_LABEL[p.status]}</span>{p.gagal_masuk >= 5 && <span className="badge" data-tone="red" style={{ marginLeft: 6 }}>Terkunci</span>}</td>
                    {!ditutup && s.status === 'berjalan' ? <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{(() => {
                      if (p.status === 'selesai') return 'Selesai';
                      if (p.status !== 'mengerjakan') return '—';
                      const sd = sisaDetik(s, pk, now, p.tambahan_menit);
                      return sd === null ? '—' : <span style={{ fontWeight: 600, color: sd <= BATAS_MERAH ? '#b42318' : undefined }}>{sd > 0 ? waktu(sd) : 'Habis'}</span>;
                    })()}</td> : null}
                    {ditutup ? <>
                      <td className="num">{h ? Number(h.skor).toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '—'}</td>
                      <td className="num">{h ? `${h.benar}/${h.total}` : '—'}</td>
                      <td>{h ? <span className="badge" data-tone={h.lulus ? 'green' : 'red'}>{h.lulus ? 'Lulus' : 'Tidak lulus'}</span> : '—'}{h?.otomatis && <small className="tes-mini"> otomatis</small>}</td>
                      <td className="num">{waktu(h?.durasi_detik)}</td>
                    </> : null}
                    <td className="num">{p.pindah_tab >= BATAS_PINDAH ? <span className="badge" data-tone="red" title="Sering berpindah halaman">{p.pindah_tab}×</span> : p.pindah_tab}</td>
                    <td>
                      <div className="tes-actions">
                        {!ditutup && p.status !== 'selesai' && s.status === 'berjalan' && <button type="button" className="btn light mini" onClick={() => tambahWaktu(p)}>+ Waktu</button>}
                        {!ditutup && p.gagal_masuk >= 5 && <button type="button" className="btn amber mini" onClick={() => bukaKunci(p)}>Buka kunci</button>}
                        {s.status === 'menunggu' && <button type="button" className="btn light mini" onClick={() => hapus(p)}>Hapus</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!peserta.length && <div className="no-results">Belum ada peserta.</div>}
          </div>
        </section>
      </div>

      {ditutup && analisis.length > 0 && (
        <section className="panel tr-panel" style={{ marginTop: 14 }}>
          <div className="panel-heading"><div><h3>Soal yang paling sering salah</h3><p className="subtle">Soal yang jawabannya salah atau kosong paling banyak. Cek apakah soal atau kuncinya perlu ditinjau.</p></div></div>
          <div className="tr-scroll">
            <table className="ttable">
              <thead><tr><th>Soal</th><th>Kategori</th><th className="num">Salah</th><th className="num">Persen</th></tr></thead>
              <tbody>{analisis.map(x => (
                <tr key={x.id}><td><span className="tes-q-text">{x.q.pertanyaan}</span></td><td className="muted-cell">{x.q.kategori || '—'}</td><td className="num">{x.salah}/{x.n}</td><td className="num">{x.pct.toLocaleString('id-ID', { maximumFractionDigits: 0 })}%</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {besar && (
        <div className="tes-modal-bg" onClick={() => setBesar(false)} role="dialog" aria-modal="true">
          <div className="tes-modal tes-big" onClick={e => e.stopPropagation()}>
            <h3>{s.judul}</h3>
            {qr && <img src={qr} alt={`QR sesi ${s.kode}`} />}
            <div className="tes-kode">{s.kode}</div>
            <p className="tes-note">Scan QR dengan kamera HP, atau buka {window.location.host}/tes lalu ketik kode di atas.</p>
            <div><button type="button" className="btn light" onClick={() => setBesar(false)}>Tutup</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ====================== BANK SOAL ====================== */
function SoalTab({ soal, muat, notify }) {
  const [q, setQ] = useState('');
  const [kat, setKat] = useState('');
  const [aktifSaja, setAktifSaja] = useState('');
  const [edit, setEdit] = useState(null);
  const [impor, setImpor] = useState(null);
  const bacaFile = async e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('Sheet pertama kosong.');
      setImpor(rows);
    } catch (err) { notify({ err: `Gagal membaca file: ${err.message}` }); }
  };
  const kategori = useMemo(() => [...new Set(soal.map(x => x.kategori).filter(Boolean))].sort(), [soal]);
  const rows = useMemo(() => {
    const n = norm(q);
    return soal.filter(x => (!kat || x.kategori === kat) && (!aktifSaja || String(x.aktif) === aktifSaja) && (!n || norm(x.pertanyaan).includes(n)));
  }, [soal, q, kat, aktifSaja]);

  const ubahAktif = async x => {
    try { await ok(supabase.from('tes_soal').update({ aktif: !x.aktif }).eq('id', x.id)); await muat(); } catch (e) { notify({ err: e.message }); }
  };

  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari isi soal" aria-label="Cari soal" />
        <select className="dash-select" value={kat} onChange={e => setKat(e.target.value)} aria-label="Kategori"><option value="">Semua kategori</option>{kategori.map(k => <option key={k}>{k}</option>)}</select>
        <select className="dash-select" value={aktifSaja} onChange={e => setAktifSaja(e.target.value)} aria-label="Status soal"><option value="">Aktif dan nonaktif</option><option value="true">Aktif</option><option value="false">Nonaktif</option></select>
        <span className="count">{rows.length} soal</span>
        <button type="button" className="btn light mini" onClick={unduhTemplate}>Template Excel</button>
        <label className="btn light mini" style={{ cursor: 'pointer' }}>Impor Excel<input type="file" accept=".xlsx,.xls" onChange={bacaFile} style={{ display: 'none' }} /></label>
        <button type="button" className="btn primary mini" onClick={() => setEdit({})}>+ Soal baru</button>
      </div>
      <div className="tr-scroll">
        <table className="ttable">
          <thead><tr><th>Soal</th><th>Kategori</th><th>Jabatan</th><th>Kunci jawaban</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>{rows.map(x => (
            <tr key={x.id}>
              <td><span className="tes-q-text">{x.pertanyaan}</span></td>
              <td className="muted-cell">{x.kategori || '—'}</td>
              <td className="muted-cell">{x.jabatan || 'Umum'}</td>
              <td><span className="tes-ok">{'ABCDEF'[x.kunci]}.</span> {x.pilihan?.[x.kunci]}</td>
              <td><span className="badge" data-tone={x.aktif ? 'green' : 'gray'}>{x.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
              <td><div className="tes-actions"><button type="button" className="btn light mini" onClick={() => setEdit(x)}>Ubah</button><button type="button" className="btn light mini" onClick={() => ubahAktif(x)}>{x.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <div className="no-results">Tidak ada soal yang cocok.</div>}
      </div>
      {impor && <ImporSoal rows={impor} ada={soal} onClose={() => setImpor(null)} onDone={async n => { setImpor(null); await muat(); notify({ ok: `${n} soal diimpor. Buat atau cek paket tes untuk jabatan ini di tab Paket tes.` }); }} notify={notify} />}
      {edit && <SoalForm soal={edit} jabatanList={[...new Set(soal.map(x => x.jabatan).filter(Boolean))]} kategoriList={kategori} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await muat(); notify({ ok: 'Soal tersimpan.' }); }} notify={notify} />}
    </section>
  );
}

function SoalForm({ soal, jabatanList, kategoriList, onClose, onSaved, notify }) {
  const [f, setF] = useState(() => ({
    jabatan: soal.jabatan || '', kategori: soal.kategori || '', pertanyaan: soal.pertanyaan || '',
    pil: [0, 1, 2, 3].map(i => soal.pilihan?.[i] || ''), kunci: soal.kunci ?? 0, gambar_url: soal.gambar_url || '', aktif: soal.aktif ?? true
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const simpan = async () => {
    setErr('');
    const pil = f.pil.map(x => x.trim());
    while (pil.length && !pil[pil.length - 1]) pil.pop();
    if (!f.pertanyaan.trim()) { setErr('Pertanyaan wajib diisi.'); return; }
    if (pil.length < 2 || pil.some(x => !x)) { setErr('Isi minimal dua pilihan, berurutan tanpa baris kosong di tengah.'); return; }
    if (f.kunci >= pil.length) { setErr('Kunci jawaban menunjuk pilihan yang kosong.'); return; }
    setBusy(true);
    const row = { jabatan: f.jabatan.trim() || null, kategori: f.kategori.trim() || null, pertanyaan: f.pertanyaan.trim(), pilihan: pil, kunci: f.kunci, gambar_url: f.gambar_url.trim() || null, aktif: f.aktif };
    try {
      if (soal.id) await ok(supabase.from('tes_soal').update(row).eq('id', soal.id));
      else await ok(supabase.from('tes_soal').insert(row));
      await onSaved();
    } catch (e) { setErr(e.message); notify({ err: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="tes-modal-bg" role="dialog" aria-modal="true">
      <div className="tes-modal tes-form">
        <h3>{soal.id ? 'Ubah soal' : 'Soal baru'}</h3>
        <label>Pertanyaan<textarea value={f.pertanyaan} onChange={e => setF({ ...f, pertanyaan: e.target.value })} /></label>
        {f.pil.map((p, i) => (
          <div className="tes-opt" key={i}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="radio" name="kunci" checked={f.kunci === i} onChange={() => setF({ ...f, kunci: i })} style={{ height: 'auto' }} /> {'ABCD'[i]}</label>
            <input type="text" value={p} placeholder={`Pilihan ${'ABCD'[i]}${i > 1 ? ' (opsional)' : ''}`} onChange={e => setF({ ...f, pil: f.pil.map((x, j) => (j === i ? e.target.value : x)) })} />
          </div>
        ))}
        <p className="tes-note">Pilih tombol di sebelah huruf untuk menandai kunci jawaban. Urutan pilihan diacak otomatis untuk tiap kandidat.</p>
        <div className="tes-row">
          <label>Kategori<input list="tes-kat" value={f.kategori} onChange={e => setF({ ...f, kategori: e.target.value })} /></label>
          <label>Jabatan (kosong = umum)<input list="tes-jab" value={f.jabatan} onChange={e => setF({ ...f, jabatan: e.target.value })} /></label>
        </div>
        <datalist id="tes-kat">{kategoriList.map(k => <option key={k} value={k} />)}</datalist>
        <datalist id="tes-jab">{jabatanList.map(k => <option key={k} value={k} />)}</datalist>
        <label>Alamat gambar (opsional)<input value={f.gambar_url} onChange={e => setF({ ...f, gambar_url: e.target.value })} placeholder="https://..." /></label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.aktif} onChange={e => setF({ ...f, aktif: e.target.checked })} style={{ height: 'auto' }} /> Soal aktif (dipakai di tes)</label>
        {err && <div className="form-error">{err}</div>}
        <div className="tes-actions"><button type="button" className="btn primary" disabled={busy} onClick={simpan}>{busy ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="btn light" onClick={onClose}>Batal</button></div>
      </div>
    </div>
  );
}

/* ====================== PAKET ====================== */
function PaketTab({ paket, soal, muat, notify }) {
  const [baru, setBaru] = useState(false);
  return (
    <section className="panel tr-panel">
      <div className="panel-heading">
        <div><h3>Paket tes</h3><p className="subtle">Paket menentukan jabatan, jumlah soal, durasi, dan nilai lulus. Soal diambil acak dari bank soal yang aktif.</p></div>
        <button type="button" className="btn primary mini" onClick={() => setBaru(true)} disabled={baru}>+ Paket baru</button>
      </div>
      {baru && <PaketBaris p={{}} soal={soal} baru onDone={async () => { setBaru(false); await muat(); }} onCancel={() => setBaru(false)} notify={notify} />}
      {paket.map(p => <PaketBaris key={p.id} p={p} soal={soal} onDone={muat} notify={notify} />)}
      {!paket.length && !baru && <div className="no-results">Belum ada paket tes.</div>}
    </section>
  );
}

function PaketBaris({ p, soal, baru, onDone, onCancel, notify }) {
  const [f, setF] = useState({ nama: p.nama || '', jabatan: p.jabatan || '', jumlah_soal: p.jumlah_soal ?? 20, durasi_menit: p.durasi_menit ?? 30, nilai_lulus: p.nilai_lulus ?? 70, aktif: p.aktif ?? true });
  const [busy, setBusy] = useState(false);
  const tersedia = useMemo(() => soal.filter(x => x.aktif && (!x.jabatan || !f.jabatan.trim() || norm(x.jabatan) === norm(f.jabatan))).length, [soal, f.jabatan]);
  const simpan = async () => {
    if (!f.nama.trim()) { notify({ err: 'Nama paket wajib diisi.' }); return; }
    const row = { nama: f.nama.trim(), jabatan: f.jabatan.trim() || null, jumlah_soal: Math.max(1, Number(f.jumlah_soal) || 1), durasi_menit: Math.max(1, Number(f.durasi_menit) || 1), nilai_lulus: Math.min(100, Math.max(0, Number(f.nilai_lulus) || 0)), aktif: f.aktif };
    setBusy(true);
    try {
      if (p.id) await ok(supabase.from('tes_paket').update(row).eq('id', p.id)); else await ok(supabase.from('tes_paket').insert(row));
      notify({ ok: 'Paket tersimpan.' }); await onDone();
    } catch (e) { notify({ err: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="tes-form" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
      <div className="tes-row">
        <label>Nama paket<input value={f.nama} onChange={e => setF({ ...f, nama: e.target.value })} style={{ minWidth: 220 }} /></label>
        <label>Jabatan (kosong = semua)<input value={f.jabatan} onChange={e => setF({ ...f, jabatan: e.target.value })} /></label>
        <label>Jumlah soal<input type="number" min="1" value={f.jumlah_soal} onChange={e => setF({ ...f, jumlah_soal: e.target.value })} style={{ width: 90 }} /></label>
        <label>Durasi (menit)<input type="number" min="1" value={f.durasi_menit} onChange={e => setF({ ...f, durasi_menit: e.target.value })} style={{ width: 90 }} /></label>
        <label>Nilai lulus (0-100)<input type="number" min="0" max="100" value={f.nilai_lulus} onChange={e => setF({ ...f, nilai_lulus: e.target.value })} style={{ width: 100 }} /></label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={f.aktif} onChange={e => setF({ ...f, aktif: e.target.checked })} style={{ height: 'auto' }} /> Aktif</label>
        <button type="button" className="btn primary mini" disabled={busy} onClick={simpan}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
        {baru && <button type="button" className="btn light mini" onClick={onCancel}>Batal</button>}
      </div>
      <p className="tes-note">Soal aktif yang tersedia untuk paket ini: {tersedia}.{Number(f.jumlah_soal) > tersedia ? ' Jumlah soal melebihi yang tersedia, kandidat hanya akan mendapat sebanyak soal yang ada.' : ''}</p>
    </div>
  );
}

/* ====================== IMPOR SOAL DARI EXCEL ====================== */
const KOLOM = ['Jabatan', 'Kategori', 'Pertanyaan', 'A', 'B', 'C', 'D', 'E', 'F', 'Kunci'];

function unduhTemplate() {
  const contoh = [{ Jabatan: 'Operator DT', Kategori: 'K3', Pertanyaan: 'CONTOH: Apa kepanjangan APD?', A: 'Alat Pelindung Diri', B: 'Alat Perlengkapan Dasar', C: 'Alat Pengaman Dump', D: 'Alat Penerangan Darurat', E: '', F: '', Kunci: 'A' }];
  const ws = XLSX.utils.json_to_sheet(contoh, { header: KOLOM });
  ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 8 }];
  const petunjuk = [['Petunjuk'], ['1. Satu baris = satu soal. Hapus baris contoh (pertanyaan yang diawali CONTOH).'], ['2. Kolom Jabatan kosong = soal umum, atau diisi saat impor.'], ['3. Isi minimal pilihan A dan B. Pilihan E dan F boleh dikosongkan.'], ['4. Kolom Kunci berisi huruf jawaban yang benar (A sampai F).'], ['5. Urutan pilihan diacak otomatis untuk tiap kandidat saat tes.']];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Soal');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(petunjuk), 'Petunjuk');
  XLSX.writeFile(wb, 'template-soal-tes.xlsx');
}

export function bacaSoal(rows, jabatanDefault, ada) {
  const siap = []; const salah = []; let duplikat = 0;
  const dipakai = new Set(ada.map(x => `${norm(x.jabatan)}|${norm(x.pertanyaan)}`));
  rows.forEach((r, i) => {
    const baris = i + 2;
    const get = (...names) => { const k = Object.keys(r).find(key => names.includes(norm(key))); return k === undefined ? '' : String(r[k] ?? '').trim(); };
    const pertanyaan = get('pertanyaan', 'soal');
    if (!pertanyaan && !get('a')) return;
    if (/^contoh/i.test(pertanyaan)) return;
    const jabatan = get('jabatan', 'posisi') || jabatanDefault.trim();
    const pil = ['a', 'b', 'c', 'd', 'e', 'f'].map(l => get(l, `pilihan ${l}`));
    while (pil.length && !pil[pil.length - 1]) pil.pop();
    if (!pertanyaan) { salah.push(`Baris ${baris}: pertanyaan kosong`); return; }
    if (pil.length < 2 || pil.some(x => !x)) { salah.push(`Baris ${baris}: isi minimal pilihan A dan B, berurutan tanpa celah`); return; }
    const kRaw = get('kunci', 'kunci jawaban', 'jawaban');
    const kunci = /^[a-f]$/i.test(kRaw) ? 'ABCDEF'.indexOf(kRaw.toUpperCase()) : pil.findIndex(p => norm(p) === norm(kRaw));
    if (kunci < 0 || kunci >= pil.length) { salah.push(`Baris ${baris}: kunci "${kRaw}" tidak valid`); return; }
    const key = `${norm(jabatan)}|${norm(pertanyaan)}`;
    if (dipakai.has(key)) { duplikat += 1; return; }
    dipakai.add(key);
    siap.push({ jabatan: jabatan || null, kategori: get('kategori') || null, pertanyaan, pilihan: pil, kunci, aktif: true });
  });
  return { siap, salah, duplikat };
}

function ImporSoal({ rows, ada, onClose, onDone, notify }) {
  const [jabDefault, setJabDefault] = useState('');
  const [busy, setBusy] = useState(false);
  const hasil = useMemo(() => bacaSoal(rows, jabDefault, ada), [rows, jabDefault, ada]);
  const perJabatan = useMemo(() => {
    const m = new Map();
    hasil.siap.forEach(x => m.set(x.jabatan || 'Umum', (m.get(x.jabatan || 'Umum') || 0) + 1));
    return [...m];
  }, [hasil]);
  const impor = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < hasil.siap.length; i += 200) await ok(supabase.from('tes_soal').insert(hasil.siap.slice(i, i + 200)));
      await onDone(hasil.siap.length);
    } catch (e) { notify({ err: e.message }); setBusy(false); }
  };
  return (
    <div className="tes-modal-bg" role="dialog" aria-modal="true">
      <div className="tes-modal tes-form">
        <h3>Pratinjau impor soal</h3>
        <label>Jabatan untuk baris yang kolom Jabatan-nya kosong (kosong = soal umum)
          <input value={jabDefault} onChange={e => setJabDefault(e.target.value)} placeholder="mis. Operator DT" />
        </label>
        <p><strong>{hasil.siap.length}</strong> soal siap diimpor{hasil.duplikat ? `, ${hasil.duplikat} dilewati karena sudah ada` : ''}{hasil.salah.length ? `, ${hasil.salah.length} baris bermasalah` : ''}.</p>
        {perJabatan.length > 0 && <p className="tes-note">{perJabatan.map(([j, n]) => `${j}: ${n} soal`).join(' • ')}</p>}
        {hasil.salah.length > 0 && (
          <div className="form-error">
            <strong>Baris yang tidak diimpor:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{hasil.salah.slice(0, 10).map(x => <li key={x}>{x}</li>)}</ul>
            {hasil.salah.length > 10 && <p className="tes-note">dan {hasil.salah.length - 10} baris lainnya.</p>}
          </div>
        )}
        <p className="tes-note">Perbaiki baris yang bermasalah di Excel lalu impor ulang. Soal yang sama tidak akan digandakan.</p>
        <div className="tes-actions">
          <button type="button" className="btn primary" disabled={busy || !hasil.siap.length} onClick={impor}>{busy ? 'Mengimpor...' : `Impor ${hasil.siap.length} soal`}</button>
          <button type="button" className="btn light" disabled={busy} onClick={onClose}>Batal</button>
        </div>
      </div>
    </div>
  );
}
