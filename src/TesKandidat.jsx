import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import './tes.css';

// Halaman tes untuk kandidat (alamat /tes). Tanpa login. Semua lewat fungsi database (RPC).
// Kandidat tidak pernah menerima skor, kunci jawaban, atau status lulus.

const KEY = 'rep-tes-token';
const KEY_KODE = 'rep-tes-kode';
const KEY_NAMA = 'rep-tes-nama';
const KEY_PINDAH = 'rep-tes-pindah';
// Peringatan pindah halaman. Ubah angka di bawah bila perlu.
const PERINGATAN_AKTIF = true; // false = hanya spanduk biasa, tanpa jendela peringatan
const BATAS_PERINGATAN = 3;    // mulai perpindahan ke-3, muncul jendela peringatan layar penuh
const TAHAN_BACA_DETIK = 4;    // tombol "Saya mengerti" aktif setelah sekian detik
const store = {
  get: k => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* penyimpanan browser tidak tersedia */ } },
  del: k => { try { sessionStorage.removeItem(k); } catch { /* abaikan */ } }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

async function rpc(name, args) {
  if (!supabase) throw new Error('Aplikasi belum terhubung ke database.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error('Koneksi bermasalah. Periksa sinyal Anda lalu coba lagi.');
  return data;
}

export default function TesKandidat() {
  const [step, setStep] = useState(() => (store.get(KEY) ? 'memuat' : 'mulai'));
  const [kode, setKode] = useState(() => (new URLSearchParams(window.location.search).get('kode') || store.get(KEY_KODE) || '').toUpperCase().slice(0, 6));
  const [info, setInfo] = useState(null);
  const [pilih, setPilih] = useState('');
  const [hp4, setHp4] = useState('');
  const [nama, setNama] = useState(() => store.get(KEY_NAMA));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [soal, setSoal] = useState([]);
  const [jawab, setJawab] = useState({});
  const [idx, setIdx] = useState(0);
  const [sisa, setSisa] = useState(0);
  const [offline, setOffline] = useState(false);
  const [grid, setGrid] = useState(false);
  const [pindah, setPindah] = useState(false);
  const [kali, setKali] = useState(() => Number(store.get(KEY_PINDAH)) || 0);
  const [peringatan, setPeringatan] = useState(0);
  const [pesanMasuk, setPesanMasuk] = useState([]);
  const [siapPesan, setSiapPesan] = useState(false);
  const [siapTutup, setSiapTutup] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);

  const tokenRef = useRef(store.get(KEY));
  const deadline = useRef(0);
  const pending = useRef(new Map());
  const saving = useRef(false);
  const finishing = useRef(false);
  const pesanSeen = useRef(new Set());

  const akhiri = useCallback(() => {
    store.del(KEY); store.del(KEY_NAMA); store.del(KEY_PINDAH);
    tokenRef.current = '';
    setStep('selesai');
  }, []);

  const cariSesi = useCallback(async k => {
    setErr(''); setBusy(true);
    try {
      const r = await rpc('tes_info_sesi', { p_kode: k });
      if (!r?.ada) setErr('Kode sesi tidak ditemukan. Periksa kembali kode dari petugas HR.');
      else if (r.status === 'ditutup') setErr('Sesi tes ini sudah ditutup.');
      else { setInfo(r); setPilih(''); setHp4(''); setStep('nama'); store.set(KEY_KODE, k); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, []);

  const muatSoal = useCallback(async () => {
    try {
      const r = await rpc('tes_ambil_soal', { p_token: tokenRef.current });
      if (!r?.siap) {
        if (r?.peserta === 'selesai' || r?.sesi === 'ditutup') akhiri();
        else if (r?.pesan) setErr(r.pesan);
        return false;
      }
      const jw = {};
      r.soal.forEach(q => { if (q.dijawab !== null && q.dijawab !== undefined) jw[q.id] = q.dijawab; });
      setSoal(r.soal); setJawab(jw);
      const first = r.soal.findIndex(q => jw[q.id] === undefined);
      setIdx(first < 0 ? 0 : first);
      deadline.current = Date.now() + r.sisa_detik * 1000;
      setSisa(r.sisa_detik); setErr(''); setStep('soal');
      return true;
    } catch (e) { setErr(e.message); return false; }
  }, [akhiri]);

  // Kirim jawaban yang belum tersimpan. Bila sinyal putus, dicoba lagi sampai berhasil.
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (pending.current.size) {
        const [sid, p] = pending.current.entries().next().value;
        let r = null;
        try { r = await rpc('tes_jawab', { p_token: tokenRef.current, p_soal: sid, p_pilihan: p }); } catch { r = null; }
        if (r === null) { setOffline(true); await sleep(2000); continue; }
        if (pending.current.get(sid) === p) pending.current.delete(sid);
      }
      setOffline(false);
    } finally { saving.current = false; }
  }, []);

  const selesai = useCallback(async auto => {
    if (finishing.current) return;
    finishing.current = true; setBusy(true); setErr('');
    try {
      flush();
      for (let i = 0; i < 15 && (pending.current.size || saving.current); i++) await sleep(1000);
      await rpc('tes_selesai', { p_token: tokenRef.current });
    } catch (e) {
      if (!auto) { setErr(e.message); finishing.current = false; setBusy(false); return; }
    }
    akhiri(); setBusy(false);
  }, [flush, akhiri]);

  // Saat halaman dibuka: lanjutkan tes yang sedang berjalan, atau cari sesi dari kode di alamat.
  useEffect(() => {
    const t = tokenRef.current;
    if (!t) { if (kode.length === 6) cariSesi(kode); return; }
    (async () => {
      try {
        const r = await rpc('tes_status', { p_token: t });
        if (!r?.ok) { store.del(KEY); tokenRef.current = ''; setStep('mulai'); if (kode.length === 6) cariSesi(kode); return; }
        if (r.peserta === 'selesai' || r.sesi === 'ditutup') { akhiri(); return; }
        if (r.sesi === 'berjalan') { if (!(await muatSoal())) setStep('tunggu'); } else setStep('tunggu');
      } catch (e) { setErr(e.message); setStep('tunggu'); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ruang tunggu: cek tiap 3 detik apakah HR sudah menekan Mulai.
  useEffect(() => {
    if (step !== 'tunggu') return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await rpc('tes_status', { p_token: tokenRef.current });
        if (stop || !r?.ok) return;
        if (r.peserta === 'selesai' || r.sesi === 'ditutup') akhiri();
        else if (r.sesi === 'berjalan') muatSoal();
      } catch { /* coba lagi pada putaran berikutnya */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [step, akhiri, muatSoal]);

  // Hitung mundur (berdasarkan jam server saat soal dimuat) dan sinkron berkala.
  useEffect(() => {
    if (step !== 'soal') return undefined;
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setSisa(s);
      if (s <= 0) { clearInterval(id); selesai(true); }
    }, 1000);
    const sync = setInterval(async () => {
      try {
        const r = await rpc('tes_status', { p_token: tokenRef.current });
        if (!r?.ok) return;
        if (r.peserta === 'selesai' || r.sesi === 'ditutup') akhiri();
        else if (r.sisa_detik !== null && r.sisa_detik !== undefined) deadline.current = Date.now() + r.sisa_detik * 1000;
      } catch { /* abaikan */ }
    }, 30000);
    return () => { clearInterval(id); clearInterval(sync); };
  }, [step, selesai, akhiri]);

  // Catat bila kandidat berpindah ke aplikasi lain (hanya catatan untuk HR).
  useEffect(() => {
    if (step !== 'soal') return undefined;
    const on = () => {
      if (document.hidden) {
        const n = (Number(store.get(KEY_PINDAH)) || 0) + 1;
        store.set(KEY_PINDAH, String(n)); setKali(n);
        rpc('tes_catat_pindah', { p_token: tokenRef.current }).catch(() => {});
      } else {
        const n = Number(store.get(KEY_PINDAH)) || 0;
        if (PERINGATAN_AKTIF && n >= BATAS_PERINGATAN) setPeringatan(n); else setPindah(true);
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [step]);
  useEffect(() => {
    if (!peringatan) { setSiapTutup(false); return undefined; }
    const id = setTimeout(() => setSiapTutup(true), TAHAN_BACA_DETIK * 1000);
    return () => clearTimeout(id);
  }, [peringatan]);
  useEffect(() => {
    if (!pindah) return undefined;
    const id = setTimeout(() => setPindah(false), 6000);
    return () => clearTimeout(id);
  }, [pindah]);

  // Pesan dari panitia: dicek tiap 5 detik selama tes berjalan, lalu tampil layar penuh.
  useEffect(() => {
    if (step !== 'soal') return undefined;
    let stop = false;
    const cek = async () => {
      try {
        const r = await rpc('tes_ambil_pesan', { p_token: tokenRef.current });
        if (stop || !r?.ok || !Array.isArray(r.pesan)) return;
        const baru = r.pesan.filter(m => !pesanSeen.current.has(m.id));
        if (!baru.length) return;
        baru.forEach(m => pesanSeen.current.add(m.id));
        setPesanMasuk(q => [...q, ...baru]);
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch { /* abaikan */ }
      } catch { /* coba lagi pada putaran berikutnya */ }
    };
    cek();
    const id = setInterval(cek, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [step]);
  const pesanId = pesanMasuk[0]?.id;
  useEffect(() => {
    setSiapPesan(false);
    if (!pesanId) return undefined;
    const id = setTimeout(() => setSiapPesan(true), TAHAN_BACA_DETIK * 1000);
    return () => clearTimeout(id);
  }, [pesanId]);
  const tutupPesan = () => {
    const m = pesanMasuk[0];
    if (!m) return;
    setPesanMasuk(q => q.slice(1));
    rpc('tes_baca_pesan', { p_token: tokenRef.current, p_pesan: m.id }).catch(() => { pesanSeen.current.delete(m.id); });
  };

  const masuk = async e => {
    e.preventDefault();
    if (!pilih) { setErr('Pilih nama Anda terlebih dahulu.'); return; }
    if (!/^\d{4}$/.test(hp4)) { setErr('Isi 4 digit terakhir nomor HP Anda.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await rpc('tes_masuk', { p_kode: kode, p_peserta: pilih, p_hp4: hp4 });
      if (!r?.ok) { setErr(r?.pesan || 'Tidak dapat masuk.'); return; }
      tokenRef.current = r.token; store.set(KEY, r.token); store.del(KEY_PINDAH); setKali(0); store.set(KEY_NAMA, r.nama || '');
      setNama(r.nama || ''); setStep('tunggu');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const pilihJawaban = (q, i) => {
    setJawab(j => ({ ...j, [q.id]: i }));
    pending.current.set(q.id, i);
    flush();
  };

  const q = soal[idx];
  const terjawab = Object.keys(jawab).length;
  const belum = soal.length - terjawab;

  if (!isSupabaseConfigured) return <div className="tk"><div className="tk-wrap"><div className="tk-card"><h1>Tes belum tersedia</h1><p>Aplikasi belum terhubung ke database. Hubungi petugas HR.</p></div></div></div>;

  return (
    <div className="tk">
      <div className="tk-wrap">
        <div className="tk-brand"><img src="/logo-pt-rep.png" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} /><div><strong>PT. RYAN EKA PRATAMA</strong><span>Tes Teori Calon Karyawan</span></div></div>

        {step === 'memuat' && <div className="tk-card tk-center"><div className="tk-spin" /><p>Memuat...</p></div>}

        {step === 'mulai' && (
          <form className="tk-card" onSubmit={e => { e.preventDefault(); if (kode.length === 6) cariSesi(kode); else setErr('Kode sesi terdiri dari 6 karakter.'); }}>
            <h1>Masuk ke tes</h1>
            <p>Masukkan kode sesi yang diberikan petugas HR, atau scan kode QR di lokasi tes.</p>
            <input className="tk-in tk-kode" value={kode} onChange={e => setKode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="KODE SESI" autoCapitalize="characters" autoComplete="off" aria-label="Kode sesi" />
            {err && <div className="tk-err">{err}</div>}
            <button className="tk-btn" type="submit" disabled={busy}>{busy ? 'Memeriksa...' : 'Lanjut'}</button>
          </form>
        )}

        {step === 'nama' && info && (
          <form className="tk-card" onSubmit={masuk}>
            <h1>{info.judul}</h1>
            <p>Pilih nama Anda, lalu isi 4 digit terakhir nomor HP untuk verifikasi.</p>
            <label className="tk-lbl">Nama
              <select className="tk-in" value={pilih} onChange={e => setPilih(e.target.value)}>
                <option value="">— Pilih nama —</option>
                {(info.peserta || []).map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
            </label>
            <label className="tk-lbl">4 digit terakhir nomor HP
              <input className="tk-in" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={hp4} onChange={e => setHp4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="mis. 1234" autoComplete="off" />
            </label>
            {err && <div className="tk-err">{err}</div>}
            <button className="tk-btn" type="submit" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
            <button className="tk-btn alt" type="button" onClick={() => { setStep('mulai'); setErr(''); }}>Ganti kode sesi</button>
            {!(info.peserta || []).length && <p className="tk-note">Belum ada nama peserta di sesi ini. Beri tahu petugas HR.</p>}
          </form>
        )}

        {step === 'tunggu' && (
          <div className="tk-card tk-center">
            <div className="tk-spin" />
            <h1>Halo{nama ? `, ${nama}` : ''}</h1>
            <p>Anda sudah masuk. Tes akan dimulai oleh petugas HR. Jangan tutup atau pindah dari halaman ini.</p>
            {err && <div className="tk-err">{err}</div>}
          </div>
        )}

        {step === 'soal' && q && (
          <>
            <div className="tk-bar">
              <div><small>Soal</small><b>{idx + 1} / {soal.length}</b></div>
              <div className={`tk-timer${sisa <= 300 ? ' low' : ''}`}><small>Sisa waktu</small><b>{mmss(sisa)}</b></div>
            </div>
            <div className="tk-prog"><i style={{ width: `${(terjawab / soal.length) * 100}%` }} /></div>
            {pindah && <div className="tk-warn">Tetap berada di halaman tes sampai selesai. Perpindahan halaman ke-{kali} dicatat dan dapat dilihat petugas HR.</div>}
            {offline && <div className="tk-warn">Sinyal terputus. Jawaban Anda akan dikirim otomatis begitu tersambung.</div>}

            <div className="tk-card tk-soal">
              <p className="tk-q">{q.pertanyaan}</p>
              {q.gambar_url && <img className="tk-img" src={q.gambar_url} alt="" />}
              <div className="tk-opsi">
                {q.pilihan.map((teks, i) => (
                  <button type="button" key={i} className={`tk-opsi-btn${jawab[q.id] === i ? ' on' : ''}`} onClick={() => pilihJawaban(q, i)} aria-pressed={jawab[q.id] === i}>
                    <span>{'ABCDEF'[i]}</span><em>{teks}</em>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="tk-link" onClick={() => setGrid(g => !g)}>{grid ? 'Tutup daftar soal' : `Daftar soal (${terjawab} dijawab, ${belum} belum)`}</button>
            {grid && (
              <div className="tk-grid">
                {soal.map((s, i) => <button type="button" key={s.id} className={`${jawab[s.id] !== undefined ? 'done' : ''}${i === idx ? ' cur' : ''}`} onClick={() => { setIdx(i); setGrid(false); }}>{i + 1}</button>)}
              </div>
            )}

            {err && <div className="tk-err">{err}</div>}
            <div className="tk-nav">
              <button type="button" className="tk-btn alt" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>Sebelumnya</button>
              {idx < soal.length - 1
                ? <button type="button" className="tk-btn" onClick={() => setIdx(i => i + 1)}>Berikutnya</button>
                : <button type="button" className="tk-btn done" onClick={() => setKonfirmasi(true)}>Selesai</button>}
            </div>
            {idx < soal.length - 1 && <button type="button" className="tk-link" onClick={() => setKonfirmasi(true)}>Akhiri tes sekarang</button>}

            {peringatan > 0 && (
              <div className="tk-modal" role="alertdialog" aria-modal="true">
                <div className="tk-card">
                  <h1>Peringatan</h1>
                  <p>Anda sudah meninggalkan halaman tes sebanyak <b>{peringatan} kali</b>. Setiap perpindahan dicatat dan dapat dilihat petugas HR.</p>
                  <p>Tetaplah di halaman ini sampai tes selesai. Jangan membuka aplikasi atau tab lain.</p>
                  <button type="button" className="tk-btn" disabled={!siapTutup} onClick={() => setPeringatan(0)}>{siapTutup ? 'Saya mengerti' : 'Harap baca peringatan ini...'}</button>
                </div>
              </div>
            )}

            {pesanMasuk.length > 0 && (
              <div className="tk-modal" role="alertdialog" aria-modal="true">
                <div className="tk-card">
                  <h1>Pesan dari panitia</h1>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{pesanMasuk[0].isi}</p>
                  <button type="button" className="tk-btn" disabled={!siapPesan} onClick={tutupPesan}>{siapPesan ? 'Saya mengerti' : 'Harap baca pesan ini...'}</button>
                </div>
              </div>
            )}

            {konfirmasi && (
              <div className="tk-modal" role="dialog" aria-modal="true">
                <div className="tk-card">
                  <h1>Akhiri tes?</h1>
                  <p>{belum > 0 ? `Masih ada ${belum} soal yang belum dijawab. ` : 'Semua soal sudah dijawab. '}Setelah diakhiri, jawaban tidak bisa diubah.</p>
                  <button className="tk-btn done" disabled={busy} onClick={() => { setKonfirmasi(false); selesai(false); }}>{busy ? 'Mengirim...' : 'Ya, akhiri tes'}</button>
                  <button className="tk-btn alt" onClick={() => setKonfirmasi(false)}>Kembali mengerjakan</button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'selesai' && (
          <div className="tk-card tk-center">
            <div className="tk-check">✓</div>
            <h1>Terima kasih</h1>
            <p>Tes Anda sudah tercatat. Hasil akan disampaikan oleh petugas HR. Anda boleh menutup halaman ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}
