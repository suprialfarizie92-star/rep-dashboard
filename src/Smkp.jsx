import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Icon from './Icon.jsx';
import { supabase } from './supabase';
import { fmt, norm, today } from './utils.js';
import { MOD, ROMAN, STATUS, belumAdaTindakLanjut, buildSmkp, buildTrend, isDone, isOverdue, parseAuditWorkbook, refOf, templateRows, toIso } from './smkp.js';
import './dashboard.css';
import './pages.css';
import './smkp.css';

const TABS = [['ringkasan', 'Ringkasan'], ['tren', 'Tren antar tahun'], ['tindak', 'Temuan & tindak lanjut'], ['penilaian', 'Butir penilaian']];
const JENIS_TONE = { Kritikal: 'red', Mayor: 'red', Minor: 'amber' };
const STATUS_TONE = { Belum: 'gray', Proses: 'blue', Selesai: 'green', Terverifikasi: 'violet' };
const pct = (v, d = 1) => `${fmt(v * 100, d)}%`;
const fmtDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default function Smkp({ data, loading, canWrite, canAudit, isAdmin, onRefresh, onNotice }) {
  const [yearSel, setYearSel] = useState(null);
  const [tab, setTab] = useState('ringkasan');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // Perubahan yang baru disimpan ditampilkan langsung (optimistis), supaya input saat audit tidak menunggu muat ulang.
  const [ov, setOv] = useState({});
  const ovRef = useRef({});
  const putOv = next => { ovRef.current = next; setOv(next); };
  useEffect(() => {
    const keys = Object.keys(ovRef.current);
    if (!keys.length) return;
    const byKey = new Map((data || []).filter(r => r.module.startsWith('SMKP_')).map(r => [`${r.module}:${r.row_index}`, r.data || {}]));
    const next = {};
    keys.forEach(k => {
      const base = byKey.get(k) || {};
      const left = Object.fromEntries(Object.entries(ovRef.current[k]).filter(([f, v]) => JSON.stringify(base[f] ?? null) !== JSON.stringify(v ?? null)));
      if (Object.keys(left).length) next[k] = left;
    });
    if (Object.keys(next).length !== keys.length || keys.some(k => next[k] && Object.keys(next[k]).length !== Object.keys(ovRef.current[k]).length)) putOv(next);
  }, [data]);
  const merged = useMemo(() => (Object.keys(ov).length
    ? (data || []).map(r => { const p = ov[`${r.module}:${r.row_index}`]; return p ? { ...r, data: { ...r.data, ...p } } : r; })
    : data), [data, ov]);
  const S = useMemo(() => buildSmkp(merged, yearSel), [merged, yearSel]);
  const now = today();
  const trend = useMemo(() => buildTrend(merged), [merged]);

  const patchRow = async (module, row, patch) => {
    const k = `${module}:${row.row_index}`;
    const orig = (data || []).find(r => r.module === module && r.row_index === row.row_index);
    if (!orig) return false;
    const mergedPatch = { ...(ovRef.current[k] || {}), ...patch };
    putOv({ ...ovRef.current, [k]: mergedPatch });
    const { error } = await supabase.from('app_data').update({ data: { ...orig.data, ...mergedPatch }, updated_at: new Date().toISOString() }).eq('module', module).eq('row_index', row.row_index);
    if (error) {
      const c = { ...ovRef.current }; delete c[k]; putOv(c);
      onNotice?.(`Gagal menyimpan: ${error.message}`);
      return false;
    }
    return true;
  };
  const saveItem = (row, patch) => patchRow(MOD.item, row, patch);
  const saveMeta = async meta => { for (const e of S.elemen) await patchRow(MOD.elemen, e, meta); onNotice?.('Informasi audit disimpan.'); };

  const insertRows = async records => {
    for (const part of chunk(records, 100)) {
      const { error } = await supabase.from('app_data').insert(part);
      if (error) throw new Error(error.message);
    }
  };
  const startYear = async year => {
    setBusy(true);
    try {
      if (!S.years.length) throw new Error('Belum ada audit sebelumnya sebagai acuan struktur butir. Impor formulir audit terlebih dahulu.');
      if (S.years.includes(year)) throw new Error(`Audit ${year} sudah ada.`);
      const t = templateRows(buildSmkp(merged, S.years[0]), year);
      const base = year * 1000;
      await insertRows([...t.elemen.map((d, i) => ({ module: MOD.elemen, row_index: base + i + 1, data: d })), ...t.item.map((d, i) => ({ module: MOD.item, row_index: base + i + 1, data: d }))]);
      setYearSel(year); setTab('input');
      onNotice?.(`Audit ${year} dimulai. Struktur butir disalin dari audit ${S.years[0]}.`);
      await onRefresh?.();
    } catch (err) { onNotice?.(`Gagal memulai audit: ${err.message}`); } finally { setBusy(false); }
  };
  const makeTL = async items => {
    setBusy(true);
    try {
      let idx = Math.max(S.year * 1000, ...S.temuan.map(t => t.row_index)); let no = Math.max(0, ...S.temuan.map(t => Number(t.No) || 0));
      await insertRows(items.map(i => ({ module: MOD.temuan, row_index: ++idx, data: {
        Tahun: S.year, No: ++no, 'Catatan Temuan': i.Keterangan || i.Butir, Referensi: refOf(i.Kode), Elemen: i.Elemen, 'Jenis Temuan': i['Jenis Temuan'], Auditor: S.meta.Auditor || '',
        'Akar Penyebab': '', 'Tindakan Perbaikan': '', 'Due Date': '', Departemen: '', 'Detail Dept': '', 'PIC 1': '', 'PIC 2': '', 'PIC 3': '', 'Tanggal Re-Audit': '', Status: 'Belum'
      } })));
      onNotice?.(`${items.length} item tindak lanjut dibuat. Lengkapi akar penyebab, tindakan, dan PIC di tab Temuan & tindak lanjut.`);
      await onRefresh?.();
    } catch (err) { onNotice?.(`Gagal membuat tindak lanjut: ${err.message}`); } finally { setBusy(false); }
  };

  // ---------- Impor formulir audit (admin) ----------
  const saveYear = async parsed => {
    const base = parsed.tahun * 1000;
    const old = (data || []).filter(r => r.module === MOD.temuan && Number(r.data?.Tahun) === parsed.tahun);
    const keep = new Map(old.map(r => [String(r.data.No), r.data]));
    const sets = [
      [MOD.elemen, parsed.elemen],
      [MOD.item, parsed.item],
      // Status dan tanggal re-audit yang sudah diisi di dashboard tidak ikut tertimpa saat impor ulang.
      [MOD.temuan, parsed.temuan.map(t => {
        const prev = keep.get(String(t.No));
        return prev ? { ...t, Status: prev.Status || t.Status, 'Tanggal Re-Audit': prev['Tanggal Re-Audit'] || t['Tanggal Re-Audit'] } : t;
      })]
    ];
    for (const [module, rows] of sets) {
      const records = rows.map((d, i) => ({ module, row_index: base + i + 1, data: d }));
      for (const part of chunk(records, 100)) {
        const { error } = await supabase.from('app_data').upsert(part, { onConflict: 'module,row_index' });
        if (error) throw new Error(`${module}: ${error.message}`);
      }
      const { data: exist, error: e2 } = await supabase.from('app_data').select('row_index').eq('module', module).gte('row_index', base).lt('row_index', base + 1000);
      if (e2) throw new Error(`${module}: ${e2.message}`);
      const valid = new Set(records.map(r => r.row_index));
      const stale = (exist || []).map(r => r.row_index).filter(i => !valid.has(i));
      for (const part of chunk(stale, 100)) {
        const { error } = await supabase.from('app_data').delete().eq('module', module).in('row_index', part);
        if (error) throw new Error(`${module}: ${error.message}`);
      }
    }
  };

  const onFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseAuditWorkbook(XLSX, XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      if (!parsed.tahun) throw new Error('Tahun audit tidak terbaca dari judul formulir.');
      const ok = window.confirm(`Impor audit SMKP ${parsed.tahun}?\n\n${parsed.elemen.length} elemen, ${parsed.item.length} butir penilaian, ${parsed.temuan.length} catatan tindak lanjut.\nData SMKP tahun ${parsed.tahun} yang sudah ada akan diganti (status tindak lanjut yang sudah diisi dipertahankan, tetapi nilai dan keterangan butir yang diisi lewat dashboard akan diganti isi file).`);
      if (!ok) return;
      await saveYear(parsed);
      setYearSel(parsed.tahun);
      onNotice?.(`Audit SMKP ${parsed.tahun} berhasil diimpor.`);
      await onRefresh?.();
    } catch (err) {
      onNotice?.(`Impor SMKP gagal: ${err.message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Simpan perubahan sebagian (status, PIC, tenggat, tanggal re-audit) ke satu baris temuan.
  const saveRow = async (row, patch) => {
    const { row_index: ri, ...rest } = row;
    const { error } = await supabase.from('app_data')
      .update({ data: { ...rest, ...patch }, updated_at: new Date().toISOString() })
      .eq('module', MOD.temuan).eq('row_index', ri);
    if (error) { onNotice?.(`Gagal menyimpan: ${error.message}`); return false; }
    await onRefresh?.();
    return true;
  };
  const setStatus = (row, status) => saveRow(row, { Status: status });

  const empty = !S.year;
  const tabs = canAudit ? [TABS[0], ['input', 'Input audit'], ...TABS.slice(1)] : TABS;

  return (
    <div className="page-content dash smkp">
      <div className="dash-top">
        <div>
          <h1>SMKP Minerba</h1>
          <p className="subtle">Hasil audit Sistem Manajemen Keselamatan Pertambangan{S.year ? ` tahun ${S.year}` : ''}, temuan, dan tindak lanjutnya.</p>
        </div>
        <div className="dash-filters">
          {S.years.length > 0 && <label>Tahun audit<select value={S.year} onChange={e => setYearSel(Number(e.target.value))}>{S.years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>}
          {isAdmin && <button type="button" className="btn light" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> {busy ? 'Mengimpor...' : 'Impor formulir audit'}</button>}
          <button type="button" className="btn light" onClick={onRefresh}><Icon name="refresh" size={15} /> Perbarui</button>
          <input ref={fileRef} className="sm-hidden" type="file" accept=".xlsx,.xls" onChange={onFile} />
        </div>
      </div>

      {empty ? (
        <section className="panel tr-panel">
          {loading ? <div className="loading-state"><div className="spinner" />Memuat data...</div> : (
            <div className="empty-state"><div className="empty-chart-mark"><Icon name="audit" size={24} /></div>
              <strong>Belum ada hasil audit SMKP</strong>
              <span>{isAdmin ? 'Klik "Impor formulir audit" lalu pilih file Excel Formulir Penilaian Audit SMKP.' : 'Admin perlu mengimpor formulir audit terlebih dahulu.'}</span></div>
          )}
        </section>
      ) : (
        <>
          <div className="seg-tabs" role="group" aria-label="Tampilan SMKP" style={{ justifySelf: 'start' }}>
            {tabs.map(([k, l]) => <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === 'ringkasan' && <Ringkasan S={S} now={now} go={() => setTab('tindak')} />}
          {tab === 'input' && canAudit && <InputAudit S={S} busy={busy} onItem={saveItem} onMeta={saveMeta} onStart={startYear} onMakeTL={makeTL} />}
          {tab === 'tren' && <Tren trend={trend} />}
          {tab === 'tindak' && <Tindak S={S} now={now} canWrite={canWrite} setStatus={setStatus} saveRow={saveRow} />}
          {tab === 'penilaian' && <Penilaian S={S} />}
        </>
      )}
    </div>
  );
}

function Ringkasan({ S, now, go }) {
  const tl = S.temuan;
  const selesai = tl.filter(isDone).length;
  const telat = tl.filter(t => isOverdue(t, now)).length;
  const dept = useMemo(() => {
    const m = new Map();
    tl.forEach(t => String(t.Departemen || '—').split(',').map(x => x.trim()).filter(Boolean).forEach(d => {
      const o = m.get(d) || { n: 0, open: 0 }; o.n += 1; if (!isDone(t)) o.open += 1; m.set(d, o);
    }));
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [tl]);
  const byEl = el => ({
    mayor: S.resmi.filter(i => i.Elemen === el && i['Jenis Temuan'] === 'Mayor').length,
    minor: S.resmi.filter(i => i.Elemen === el && i['Jenis Temuan'] === 'Minor').length,
    tl: tl.filter(t => t.Elemen === el), 
  });
  const card = (v, label, tone) => <div className="dcard static" data-tone={tone}><b>{v}</b><span>{label}</span></div>;

  return (
    <>
      <div className="dgrid">
        {card(pct(S.totalPct, 2), `Nilai penerapan SMKP (${fmt(S.totalNilai, 0)} dari ${fmt(S.totalMax, 0)} poin)`, 'blue')}
        {card(fmt(S.mayor, 0), 'Temuan mayor', 'red')}
        {card(fmt(S.minor, 0), 'Temuan minor', 'amber')}
        {card(`${selesai}/${tl.length}`, 'Tindak lanjut selesai', 'green')}
        {card(fmt(telat, 0), 'Lewat tenggat, belum selesai', telat ? 'red' : 'gray')}
      </div>

      <div className="sm-panels">
        <section className="panel tr-panel">
          <h3 className="sm-panel-title">Pencapaian per elemen</h3>
          <p className="sm-sub">Persentase nilai audit terhadap nilai maksimal elemen. "Potensi" = tambahan nilai total bila elemen itu mencapai 100%.</p>
          <div className="tr-scroll"><table className="ttable"><thead><tr><th>Elemen</th><th className="num">Bobot</th><th className="num">Nilai</th><th>Pencapaian</th><th className="num">Potensi</th></tr></thead>
            <tbody>{S.elemen.map(e => (
              <tr key={e.Kode}><td><strong>{e.Kode}</strong> {e.Elemen}</td><td className="num">{pct(e.bobot, 0)}</td><td className="num">{fmt(e.nilai, 0)}/{fmt(e.max, 0)}</td>
                <td><div className="pcell" data-tone={e.pct < 0.4 ? 'red' : e.pct < 0.7 ? 'amber' : 'green'}><div className="pbar"><i style={{ width: `${Math.min(100, e.pct * 100)}%` }} /></div><span>{pct(e.pct, 1)}</span></div></td>
                <td className="num">+{fmt(e.selisih * 100, 1)}</td></tr>
            ))}</tbody></table></div>
        </section>

        <section className="panel tr-panel">
          <h3 className="sm-panel-title">Temuan dan tindak lanjut per elemen</h3>
          <p className="sm-sub">Temuan resmi dari penilaian, dan item tindak lanjut dari CTTP (satu temuan bisa punya beberapa item).</p>
          <div className="tr-scroll"><table className="ttable"><thead><tr><th>Elemen</th><th className="num">Mayor</th><th className="num">Minor</th><th className="num">Item CTTP</th><th className="num">Selesai</th></tr></thead>
            <tbody>{S.elemen.map(e => { const x = byEl(e.Kode); return (
              <tr key={e.Kode}><td><strong>{e.Kode}</strong> {e.Elemen}</td><td className="num">{x.mayor}</td><td className="num">{x.minor}</td><td className="num">{x.tl.length}</td><td className="num">{x.tl.filter(isDone).length}</td></tr>
            ); })}</tbody></table></div>
          <div className="more"><button type="button" className="btn light mini" onClick={go}>Buka daftar tindak lanjut</button></div>
        </section>
      </div>

      {dept.length > 0 && (
        <section className="panel tr-panel">
          <h3 className="sm-panel-title">Item tindak lanjut per departemen / area</h3>
          <p className="sm-sub">Satu item dihitung untuk setiap departemen yang tertulis di kolom Departemen/Area Temuan.</p>
          <div className="tr-scroll"><table className="ttable"><thead><tr><th>Departemen / area</th><th className="num">Item</th><th className="num">Belum selesai</th></tr></thead>
            <tbody>{dept.map(([d, o]) => <tr key={d}><td>{d}</td><td className="num">{o.n}</td><td className="num">{o.open}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <div className="sm-note">
        Periode audit: {S.meta['Periode Audit'] || '—'} • Audit lapangan: {S.meta['Tanggal Audit'] || '—'} • Auditee: {S.meta.Auditee || '—'}{S.meta.Auditor ? ` • Auditor: ${S.meta.Auditor}` : ''}.
        Kategori tingkat penerapan menurut Kepdirjen Minerba No. 185.K/37.04/DJB/2019 belum ditampilkan; cocokkan angka di atas dengan lampiran resminya.
      </div>
    </>
  );
}

function Tindak({ S, now, canWrite, setStatus, saveRow }) {
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [jn, setJn] = useState(''); const [el, setEl] = useState('');
  const [lw, setLw] = useState(false);
  const rows = useMemo(() => {
    const n = norm(q);
    return S.temuan.filter(t => (!st || t.Status === st) && (!jn || (jn === '-' ? !t['Jenis Temuan'] : t['Jenis Temuan'] === jn)) && (!el || t.Elemen === el) && (!lw || isOverdue(t, now))
      && (!n || [t['Catatan Temuan'], t.Departemen, t['PIC 1'], t['PIC 2'], t['PIC 3'], t.Referensi].some(v => norm(v).includes(n))))
      .sort((a, b) => Number(a.No) - Number(b.No));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.temuan, q, st, jn, el, lw]);
  const sisa = t => { const d = toIso(t['Due Date']); if (!d || isDone(t)) return null; const diff = Math.round((new Date(`${d}T00:00:00`) - now) / 86400000); return diff; };

  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari temuan, departemen, atau PIC" aria-label="Cari temuan" />
        <select className="dash-select" value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">Semua status</option>{STATUS.map(s => <option key={s}>{s}</option>)}</select>
        <select className="dash-select" value={jn} onChange={e => setJn(e.target.value)} aria-label="Jenis temuan"><option value="">Semua jenis</option><option>Mayor</option><option>Minor</option><option value="-">Tanpa jenis</option></select>
        <select className="dash-select" value={el} onChange={e => setEl(e.target.value)} aria-label="Elemen"><option value="">Semua elemen</option>{ROMAN.map(r => <option key={r}>{r}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem' }}><input type="checkbox" checked={lw} onChange={e => setLw(e.target.checked)} /> Hanya yang terlambat</label>
        <span className="count">{rows.length} item</span>
      </div>
      <div className="tr-scroll">
        <table className="ttable">
          <thead><tr><th>No</th><th>Catatan temuan</th><th>Jenis</th><th>Tindakan perbaikan</th><th>Departemen</th><th>PIC</th><th>Tenggat</th><th>Re-audit</th><th>Status</th>{canWrite && <th>Aksi</th>}</tr></thead>
          <tbody>{rows.map(t => {
            const s = sisa(t);
            return (
              <tr key={t.row_index}>
                <td>{t.No}</td>
                <td><span className="clip sm-clip">{t['Catatan Temuan']}</span><span className="sm-ref">{t.Referensi}{t.Elemen ? ` • Elemen ${t.Elemen}` : ''}</span></td>
                <td>{t['Jenis Temuan'] ? <span className="badge" data-tone={JENIS_TONE[t['Jenis Temuan']] || 'gray'}>{t['Jenis Temuan']}</span> : '—'}</td>
                <td><span className="clip sm-clip">{t['Tindakan Perbaikan'] || '—'}</span></td>
                <td>{t.Departemen || '—'}</td>
                <td>{[t['PIC 1'], t['PIC 2'], t['PIC 3']].filter(Boolean).join(', ') || '—'}</td>
                <td>{fmtDate(toIso(t['Due Date']))}{s !== null && s < 0 && <span className="sm-ref" style={{ color: 'var(--alert)' }}>{-s} hari lewat</span>}</td>
                <td>{fmtDate(toIso(t['Tanggal Re-Audit']))}</td>
                <td>{canWrite
                  ? <select className="sm-select" value={t.Status || 'Belum'} onChange={e => setStatus(t, e.target.value)} aria-label={`Status temuan ${t.No}`}>{STATUS.map(x => <option key={x}>{x}</option>)}</select>
                  : <span className="badge" data-tone={STATUS_TONE[t.Status] || 'gray'}>{t.Status || 'Belum'}</span>}</td>
                {canWrite && <td><button type="button" className="btn light mini" onClick={() => setEdit(t)}><Icon name="edit" size={13} /> Ubah</button></td>}
              </tr>
            );
          })}</tbody>
        </table>
        {!rows.length && <div className="no-results">Tidak ada item yang cocok dengan filter ini.</div>}
      </div>
      {edit && <EditTL row={edit} onClose={() => setEdit(null)} onSave={async patch => { if (await saveRow(edit, patch)) setEdit(null); }} />}
    </section>
  );
}

function Penilaian({ S }) {
  const [el, setEl] = useState(''); const [only, setOnly] = useState(false); const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const n = norm(q);
    return S.elemen.filter(e => !el || e.Kode === el).map(e => ({
      e, items: S.item.filter(i => i.Elemen === e.Kode && (!only || i['No Temuan']) && (!n || norm(`${i.Kode} ${i.Butir} ${i.Keterangan}`).includes(n)))
    })).filter(g => g.items.length || (!only && !q));
  }, [S, el, only, q]);

  return (
    <section className="panel tr-panel">
      <div className="lic-bar">
        <input className="dash-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari butir atau keterangan" aria-label="Cari butir" />
        <select className="dash-select" value={el} onChange={e => setEl(e.target.value)} aria-label="Elemen"><option value="">Semua elemen</option>{S.elemen.map(e => <option key={e.Kode} value={e.Kode}>{e.Kode} {e.Elemen}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem' }}><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} /> Hanya yang ada temuan</label>
      </div>
      <div className="tr-scroll">
        <table className="ttable">
          <thead><tr><th>Kode</th><th>Butir</th><th className="num">Nilai</th><th>Temuan</th><th>Keterangan audit</th></tr></thead>
          <tbody>{groups.map(({ e, items }) => (
            <React.Fragment key={e.Kode}>
              <tr className="sm-group"><td colSpan={2}>{e.Kode} • {e.Elemen}</td><td className="num">{fmt(e.nilai, 0)}/{fmt(e.max, 0)}</td><td colSpan={2}>{pct(e.pct, 1)} • bobot {pct(e.bobot, 0)}</td></tr>
              {items.map(i => (
                <tr key={i.row_index} style={i.NA ? { opacity: 0.55 } : undefined}>
                  <td className={i.Level === 3 ? 'sm-lv3' : undefined}>{i.Kode}</td>
                  <td><span className="clip sm-clip">{i.Butir}</span></td>
                  <td className="num">{i.NA ? 'N/A' : `${fmt(i['Nilai Audit'], 0)}/${fmt(i['Nilai Max'], 0)}`}</td>
                  <td>{i['No Temuan'] ? <span className="badge" data-tone={JENIS_TONE[i['Jenis Temuan']] || 'gray'}>{i['No Temuan']}</span> : '—'}</td>
                  <td><span className="clip sm-clip">{i.Keterangan || '—'}</span></td>
                </tr>
              ))}
            </React.Fragment>
          ))}</tbody>
        </table>
        {!groups.length && <div className="no-results">Tidak ada butir yang cocok.</div>}
      </div>
    </section>
  );
}

function EditTL({ row, onClose, onSave }) {
  const [f, setF] = useState({
    'PIC 1': row['PIC 1'] || '', 'PIC 2': row['PIC 2'] || '', 'PIC 3': row['PIC 3'] || '',
    'Due Date': toIso(row['Due Date']), 'Tanggal Re-Audit': toIso(row['Tanggal Re-Audit']), Status: row.Status || 'Belum',
    Departemen: row.Departemen || '', 'Detail Dept': row['Detail Dept'] || '', 'Akar Penyebab': row['Akar Penyebab'] || '', 'Tindakan Perbaikan': row['Tindakan Perbaikan'] || ''
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(c => ({ ...c, [k]: v }));
  const submit = async e => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); };
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="record-modal" onSubmit={submit}>
        <div className="modal-head"><div><div className="eyebrow muted">TINDAK LANJUT NO. {row.No}</div><h2>Ubah tindak lanjut</h2></div><button type="button" className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
        <p className="subtle" style={{ margin: '0 0 12px', fontSize: '.75rem', lineHeight: 1.5 }}>{row['Catatan Temuan']}</p>
        <div className="modal-fields">
          <label className="field-wide"><span>Akar penyebab</span><textarea rows="3" value={f['Akar Penyebab']} onChange={e => set('Akar Penyebab', e.target.value)} /></label>
          <label className="field-wide"><span>Tindakan perbaikan</span><textarea rows="3" value={f['Tindakan Perbaikan']} onChange={e => set('Tindakan Perbaikan', e.target.value)} /></label>
          <label><span>Departemen / area</span><input value={f.Departemen} onChange={e => set('Departemen', e.target.value)} /></label>
          <label><span>Detail dept</span><input value={f['Detail Dept']} onChange={e => set('Detail Dept', e.target.value)} /></label>
          {['PIC 1', 'PIC 2', 'PIC 3'].map(k => <label key={k}><span>Nama {k}</span><input value={f[k]} onChange={e => set(k, e.target.value)} /></label>)}
          <label><span>Tenggat (due date)</span><input type="date" value={f['Due Date']} onChange={e => set('Due Date', e.target.value)} /></label>
          <label><span>Tanggal re-audit</span><input type="date" value={f['Tanggal Re-Audit']} onChange={e => set('Tanggal Re-Audit', e.target.value)} /></label>
          <label><span>Status</span><select value={f.Status} onChange={e => set('Status', e.target.value)}>{STATUS.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <div className="modal-actions"><button type="button" className="btn light" onClick={onClose}>Batal</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
      </form>
    </div>
  );
}

function Tren({ trend }) {
  const n = trend.length;
  const W = 640; const H = 230; const L = 44; const R = 20; const T = 16; const B = 34;
  const x = i => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = v => T + (1 - v) * (H - T - B);
  const pts = trend.map((t, i) => [x(i), y(t.totalPct)]);
  const kodes = ROMAN.filter(k => trend.some(t => t.elemen[k] !== undefined));
  const delta = (k, i) => (i > 0 && trend[i].elemen[k] !== undefined && trend[i - 1].elemen[k] !== undefined ? trend[i].elemen[k] - trend[i - 1].elemen[k] : null);
  return (
    <>
      {n < 2 && <div className="sm-note">Baru ada satu tahun audit ({trend[0]?.year}), jadi belum ada perbandingan. Setelah audit berikutnya diimpor, grafik dan perubahan per elemen akan terisi otomatis.</div>}
      <section className="panel tr-panel">
        <h3 className="sm-panel-title">Nilai penerapan SMKP per tahun audit</h3>
        <p className="sm-sub">Persentase nilai total terbobot.</p>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 760, height: 'auto' }} role="img" aria-label="Grafik nilai SMKP per tahun">
          {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v * 100}%</text></g>)}
          {n > 1 && <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />}
          {trend.map((t, i) => <g key={t.year}><circle cx={pts[i][0]} cy={pts[i][1]} r="5" fill="var(--accent)" /><text x={pts[i][0]} y={pts[i][1] - 11} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">{pct(t.totalPct, 1)}</text><text x={pts[i][0]} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--text-2)">{t.year}</text></g>)}
        </svg>
      </section>
      <section className="panel tr-panel">
        <h3 className="sm-panel-title">Pencapaian per elemen dan jumlah temuan</h3>
        <p className="sm-sub">Angka kecil di bawah persentase adalah selisih dari audit sebelumnya (poin persentase).</p>
        <div className="tr-scroll"><table className="ttable">
          <thead><tr><th>Elemen</th>{trend.map(t => <th key={t.year} className="num">{t.year}</th>)}</tr></thead>
          <tbody>
            {kodes.map(k => <tr key={k}><td><strong>{k}</strong> {trend.map(t => t.nama[k]).find(Boolean)}</td>{trend.map((t, i) => { const d = delta(k, i); return (
              <td key={t.year} className="num">{t.elemen[k] !== undefined ? pct(t.elemen[k], 1) : '—'}{d !== null && <span className="sm-ref" style={{ color: d >= 0 ? 'var(--ok)' : 'var(--alert)' }}>{d >= 0 ? '+' : ''}{fmt(d * 100, 1)}</span>}</td>); })}</tr>)}
            <tr className="sm-group"><td>Temuan mayor</td>{trend.map(t => <td key={t.year} className="num">{t.mayor}</td>)}</tr>
            <tr className="sm-group"><td>Temuan minor</td>{trend.map(t => <td key={t.year} className="num">{t.minor}</td>)}</tr>
            <tr className="sm-group"><td>Tindak lanjut selesai</td>{trend.map(t => <td key={t.year} className="num">{t.done}/{t.tl}</td>)}</tr>
          </tbody>
        </table></div>
      </section>
    </>
  );
}

const JENIS = ['Minor', 'Mayor', 'Kritikal'];

function InputAudit({ S, busy, onItem, onMeta, onStart, onMakeTL }) {
  const [el, setEl] = useState(S.elemen[0]?.Kode || 'I');
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [meta, setMeta] = useState(null);
  const m = meta || { Auditor: S.meta.Auditor || '', Auditee: S.meta.Auditee || '', 'Tanggal Audit': S.meta['Tanggal Audit'] || '', 'Periode Audit': S.meta['Periode Audit'] || '' };
  const setM = (k, v) => setMeta({ ...m, [k]: v });
  const items = S.item.filter(i => i.Elemen === el);
  const { done, total } = S.progress;
  const pending = useMemo(() => belumAdaTindakLanjut(S), [S]);
  const ny = Number(newYear);
  const elData = S.elemen.find(e => e.Kode === el);

  return (
    <>
      <section className="panel tr-panel">
        <h3 className="sm-panel-title">Input penilaian audit {S.year}</h3>
        <p className="sm-sub">Isi nilai tiap butir langsung saat audit. Setiap perubahan tersimpan otomatis, dan nilai total di tab Ringkasan ikut berubah.</p>
        <div className="dgrid">
          <div className="dcard static" data-tone="blue"><b>{pct(S.totalPct, 2)}</b><span>Nilai sementara ({fmt(S.totalNilai, 0)} dari {fmt(S.totalMax, 0)} poin)</span></div>
          <div className="dcard static" data-tone={done === total ? 'green' : 'amber'}><b>{done}/{total}</b><span>Butir sudah dinilai</span></div>
          <div className="dcard static" data-tone="red"><b>{S.mayor + S.kritikal}</b><span>Mayor / kritikal</span></div>
          <div className="dcard static" data-tone="amber"><b>{S.minor}</b><span>Minor</span></div>
        </div>
        <div className="sm-meta">
          {['Auditor', 'Auditee', 'Tanggal Audit', 'Periode Audit'].map(k => <label key={k}><span>{k}</span><input value={m[k]} onChange={e => setM(k, e.target.value)} placeholder={k === 'Tanggal Audit' ? "mis. 27 Okt'26 - 29 Okt'26" : ''} /></label>)}
          <button type="button" className="btn light" disabled={!meta} onClick={async () => { await onMeta(m); setMeta(null); }}>Simpan informasi</button>
        </div>
      </section>

      <section className="panel tr-panel">
        <div className="lic-bar">
          <div className="seg-tabs" role="group" aria-label="Elemen">{S.elemen.map(e => <button type="button" key={e.Kode} aria-pressed={el === e.Kode} onClick={() => setEl(e.Kode)}>{e.Kode}</button>)}</div>
          {elData && <span className="count"><strong>{elData.Elemen}</strong> • {fmt(elData.nilai, 0)}/{fmt(elData.max, 0)} poin • {pct(elData.pct, 1)}</span>}
        </div>
        <div className="sm-items">{items.map(it => <ItemCard key={it.row_index} it={it} onItem={onItem} />)}</div>
      </section>

      <section className="panel tr-panel">
        <h3 className="sm-panel-title">Setelah audit</h3>
        <div className="sm-import">
          <span>{pending.length ? `${pending.length} temuan belum punya item tindak lanjut.` : 'Semua temuan sudah punya item tindak lanjut.'}</span>
          <button type="button" className="btn primary mini" disabled={busy || !pending.length} onClick={() => window.confirm(`Buat ${pending.length} item tindak lanjut dari temuan audit ${S.year}? Isi catatan temuan diambil dari keterangan audit.`) && onMakeTL(pending)}>Buat daftar tindak lanjut</button>
        </div>
        <div className="sm-import" style={{ marginTop: 10 }}>
          <span>Mulai audit tahun baru (struktur butir disalin dari audit {S.years[0]}):</span>
          <input type="number" className="dash-search" style={{ maxWidth: 110 }} value={newYear} onChange={e => setNewYear(e.target.value)} aria-label="Tahun audit baru" />
          <button type="button" className="btn light mini" disabled={busy || !ny || S.years.includes(ny)} onClick={() => window.confirm(`Mulai audit SMKP ${ny}? Semua butir akan disalin dengan nilai kosong.`) && onStart(ny)}>{S.years.includes(ny) ? 'Tahun sudah ada' : `Mulai audit ${ny}`}</button>
        </div>
      </section>
    </>
  );
}

function ItemCard({ it, onItem }) {
  const [open, setOpen] = useState(false);
  const max = Number(it['Nilai Max']) || 0;
  const cur = it['Nilai Audit'] === null || it['Nilai Audit'] === undefined || it['Nilai Audit'] === '' ? null : Number(it['Nilai Audit']);
  const lv = it.Kriteria || [];
  const na = it.NA === 'Ya';
  return (
    <article className="sm-item" data-na={na ? '1' : undefined} data-pending={!it._parent && !it._scored ? '1' : undefined}>
      <div className="sm-item-head">
        <div><strong>{it.Kode}</strong> {it.Butir}</div>
        <span className="sm-ref">{it._parent ? `Nilai otomatis dari butir di bawahnya: ${na ? 'N/A' : `${fmt(it['Nilai Audit'], 0)}/${fmt(max, 0)}`}` : `Nilai maksimal ${fmt(max, 0)}`}</span>
      </div>
      {!it._parent && (
        <div className="sm-score" role="group" aria-label={`Nilai ${it.Kode}`}>
          {Array.from({ length: max + 1 }, (_, k) => k).map(k => (
            <button type="button" key={k} aria-pressed={!na && cur === k} disabled={na} onClick={() => onItem(it, { 'Nilai Audit': cur === k ? null : k, NA: '' })}>{k}</button>
          ))}
          <button type="button" className="na" aria-pressed={na} onClick={() => onItem(it, na ? { NA: '' } : { NA: 'Ya', 'Nilai Audit': null })}>N/A</button>
        </div>
      )}
      {!it._parent && lv.length > 0 && (
        <div className="sm-crit">
          {!na && cur !== null && lv[cur] && <p className="sm-crit-now"><b>Nilai {cur}:</b> {lv[cur]}</p>}
          <button type="button" className="linkbtn" onClick={() => setOpen(o => !o)}>{open ? 'Sembunyikan kriteria' : 'Lihat semua kriteria'}</button>
          {open && <ol className="sm-crit-list" start="0">{lv.map((t, k) => <li key={k} data-on={cur === k ? '1' : undefined}><b>Nilai {k}:</b> {t}</li>)}</ol>}
          {open && it.Panduan && <p className="sm-ref"><b>Panduan:</b> {it.Panduan}</p>}
        </div>
      )}
      {!na && (
        <div className="sm-item-foot">
          <textarea key={`${it.row_index}:${it.Keterangan}`} rows="2" defaultValue={it.Keterangan || ''} placeholder="Keterangan audit (bukti, kondisi yang ditemukan)" aria-label={`Keterangan ${it.Kode}`}
            onBlur={e => { if (e.target.value !== (it.Keterangan || '')) onItem(it, { Keterangan: e.target.value }); }} />
          <label><span>Temuan</span>
            <select className="sm-select" value={it['Jenis Temuan'] || ''} onChange={e => onItem(it, { 'Jenis Temuan': e.target.value, 'No Temuan': '' })} aria-label={`Jenis temuan ${it.Kode}`}>
              <option value="">Tidak ada</option>{JENIS.map(x => <option key={x}>{x}</option>)}
            </select>
            {it['No Temuan'] && <em className="badge" data-tone={JENIS_TONE[it['Jenis Temuan']] || 'gray'}>{it['No Temuan']}</em>}
          </label>
        </div>
      )}
    </article>
  );
}
