import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import Icon from './Icon.jsx';

// Form tambah/ubah data unit. Isian menyesuaikan jenis: unit produksi atau kendaraan ringan dan bus.
// Nama kolom di database dicari dari data yang sudah ada (pola yang sama dengan halaman Unit),
// sehingga data lama tetap terbaca dan kolom lain yang tidak ditampilkan di sini tidak berubah.

export const UNIT_MODULES = ['Data_Unit', 'Data_LV & Bus'];

const JENIS = {
  Data_Unit: {
    judul: 'Unit produksi',
    info: 'Dump Truck, Excavator, Bulldozer',
    fields: [
      { id: 'cn', label: 'CN unit', re: /^cn/i, def: 'CN Unit', req: 1 },
      { id: 'eq', label: 'Equipment', re: /^(equipment|jenis|tipe|type)/i, def: 'Equipment', req: 1, list: 1, defaults: ['Dump Truck', 'Excavator', 'Bulldozer'] },
      { id: 'model', label: 'Model', re: /^model/i, def: 'Model', req: 1 },
      { id: 'thn', label: 'Tahun', re: /^(tahun|year)/i, def: 'Tahun', num: 1 },
      { id: 'remark', label: 'Remark', re: /^remark/i, def: 'Remark', list: 1 },
      { id: 'kom', label: 'Tanggal komisioning', re: /komisioning|commissioning/i, def: 'Komisioning', date: 1, req: 1 },
      { id: 'ber', label: 'Masa berlaku (otomatis 1 tahun dari komisioning)', re: /masa\s*berlaku|berlaku|expired|habis/i, def: 'Masa Berlaku', date: 1, hanyaBilaAda: 1 },
      { id: 'ket', label: 'Keterangan', re: /^(keterangan|ket)/i, def: 'Keterangan', wide: 1 }
    ]
  },
  'Data_LV & Bus': {
    judul: 'Kendaraan ringan dan bus',
    info: 'LV dan Bus',
    fields: [
      { id: 'cn', label: 'CN kendaraan', re: /^cn/i, def: 'CN', req: 1 },
      { id: 'jenis', label: 'Jenis', re: /^jenis/i, def: 'Jenis', req: 1, list: 1, defaults: ['LV', 'Bus'] },
      { id: 'nopol', label: 'No. polisi', re: /polisi|nopol|plat/i, def: 'No. Polisi' },
      { id: 'model', label: 'Model', re: /^model/i, def: 'Model', req: 1 },
      { id: 'thn', label: 'Tahun', re: /^(tahun|year)/i, def: 'Tahun', num: 1 },
      { id: 'pajak', label: 'Pajak', re: /pajak/i, def: 'Pajak', date: 1 },
      { id: 'stnk', label: 'STNK', re: /stnk/i, def: 'STNK', date: 1 },
      { id: 'kir', label: 'KIR', re: /kir/i, def: 'KIR', date: 1 },
      { id: 'kom', label: 'Komisioning (masa berlaku)', re: /komisioning|commissioning/i, def: 'Komisioning (Masa Berlaku)', date: 1 },
      { id: 'cat', label: 'Keterangan', re: /keterangan|catatan|^ket/i, def: 'Keterangan', wide: 1 }
    ]
  }
};

const tambahTahun = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y + 1, m - 1, d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const norm = s => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const tglId = iso => { const [y, m, d] = String(iso).split('-'); return y && m && d ? `${d}/${m}/${y}` : ''; };
const kartu = { textAlign: 'left', padding: '16px 18px', borderRadius: 12, cursor: 'pointer', border: '1px solid rgba(128,128,128,.4)', background: 'rgba(128,128,128,.08)', color: 'inherit', font: 'inherit', display: 'block', width: '100%' };

export default function UnitForm({ row, module, data, toDate, onClose, onSaved }) {
  const [mod, setMod] = useState(row ? module : '');
  const [form, setForm] = useState({});
  const [init, setInit] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = mod ? JENIS[mod] : null;

  // Nama kolom asli di database (dicari dari data yang sudah ada).
  const keys = useMemo(() => {
    if (!mod) return [];
    const s = new Set();
    data.filter(x => x.module === mod).forEach(x => Object.keys(x.data || {}).forEach(k => s.add(k)));
    return [...s];
  }, [mod, data]);
  const fields = useMemo(() => (cfg ? cfg.fields.map(f => {
    const found = keys.find(k => f.re.test(k));
    return { ...f, key: found || f.def, ada: !!found };
  }).filter(f => !f.hanyaBilaAda || f.ada) : []), [cfg, keys]);

  useEffect(() => {
    if (!cfg) return;
    const v = {};
    fields.forEach(f => {
      const raw = row?.data?.[f.key];
      v[f.id] = row ? (f.date ? (toDate(raw) || '') : String(raw ?? '')) : '';
    });
    setForm(v); setInit(v); setErr('');
  }, [mod]); // eslint-disable-line react-hooks/exhaustive-deps

  const opsi = useMemo(() => {
    const o = {};
    fields.filter(f => f.list).forEach(f => {
      const s = new Set(f.defaults || []);
      data.filter(x => x.module === mod).forEach(x => { const v = String(x.data?.[f.key] ?? '').trim(); if (v) s.add(v); });
      o[f.id] = [...s].sort();
    });
    return o;
  }, [fields, data, mod]);

  // Saran nomor CN berikutnya: awalan yang paling sering dipakai + nomor tertinggi + 1.
  const saran = useMemo(() => {
    if (row || !mod) return '';
    const cnKey = fields.find(f => f.id === 'cn')?.key;
    const grup = new Map();
    data.filter(x => x.module === mod).forEach(x => {
      const m = String(x.data?.[cnKey] ?? '').trim().match(/^(.*?)(\d+)\s*$/);
      if (!m) return;
      const g = grup.get(m[1]) || { n: 0, max: 0, w: m[2].length };
      g.n += 1; g.max = Math.max(g.max, Number(m[2])); grup.set(m[1], g);
    });
    if (!grup.size) return '';
    const [pre, g] = [...grup.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return `${pre}${String(g.max + 1).padStart(g.w, '0')}`;
  }, [row, mod, fields, data]);

  const set = (id, v) => setForm(f => ({ ...f, [id]: v }));
  // Mengubah tanggal komisioning ikut mengisi masa berlaku (1 tahun) selama masa berlaku belum diubah manual.
  const ubah = (f, v) => setForm(cur => {
    const next = { ...cur, [f.id]: f.num ? v.replace(/\D/g, '').slice(0, 4) : v };
    if (f.id === 'kom' && mod === 'Data_Unit' && 'ber' in cur && (!cur.ber || cur.ber === tambahTahun(cur.kom))) next.ber = tambahTahun(v);
    return next;
  });

  // Masa berlaku unit produksi dihitung otomatis 1 tahun dari komisioning (sama seperti halaman Unit).
  const berlakuOtomatis = useMemo(() => {
    if (mod !== 'Data_Unit' || !form.kom || form.ber || fields.some(f => f.id === 'ber')) return '';
    const d = new Date(`${form.kom}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return tglId(`${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [mod, form.kom, form.ber, fields]);

  const submit = async e => {
    e.preventDefault(); setErr('');
    for (const f of fields) if (f.req && !String(form[f.id] ?? '').trim()) { setErr(`${f.label} wajib diisi.`); return; }
    const cnF = fields.find(f => f.id === 'cn');
    const cn = String(form.cn).trim();
    if (data.some(x => x.module === mod && x.row_index !== row?.row_index && norm(x.data?.[cnF.key]) === norm(cn))) {
      setErr(`CN ${cn} sudah dipakai di ${cfg.judul.toLowerCase()}.`); return;
    }
    setBusy(true);
    try {
      const out = { ...(row?.data || {}) };
      fields.forEach(f => {
        const v = String(form[f.id] ?? '').trim();
        if (row && v === String(init[f.id] ?? '').trim()) return; // yang tidak diubah dibiarkan apa adanya
        out[f.key] = f.num && /^\d{4}$/.test(v) ? Number(v) : v;
      });
      if (row) {
        const r = await supabase.from('app_data').update({ data: out, updated_at: new Date().toISOString() }).eq('id', row.id).select('id');
        if (r.error) throw r.error;
        if (!r.data?.length) throw new Error('Perubahan tidak tersimpan. Akun Anda mungkin tidak punya izin mengubah data ini.');
      } else {
        const m = await supabase.from('app_data').select('row_index').eq('module', mod).order('row_index', { ascending: false }).limit(1);
        if (m.error) throw m.error;
        const next = (Number(m.data?.[0]?.row_index) || 0) + 1;
        const r = await supabase.from('app_data').insert({ module: mod, row_index: next, data: out });
        if (r.error) throw r.error;
      }
      await onSaved?.(mod, !row, cn);
    } catch (ex) { setErr(ex.message || 'Gagal menyimpan data.'); } finally { setBusy(false); }
  };

  const judul = !mod ? 'Tambah unit' : `${row ? 'Edit' : 'Tambah'} ${cfg.judul.toLowerCase()}`;
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="record-modal" onSubmit={submit}>
        <div className="modal-head">
          <div><div className="eyebrow muted">{row ? 'PERBARUI CATATAN' : 'CATATAN BARU'}</div><h2>{judul}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="close" /></button>
        </div>

        {!mod && (
          <>
            <p className="subtle" style={{ margin: '4px 0 12px' }}>Pilih jenis yang mau ditambahkan. Isian akan menyesuaikan.</p>
            <div className="modal-fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {Object.entries(JENIS).map(([k, j]) => (
                <button key={k} type="button" style={kartu} onClick={() => setMod(k)}>
                  <strong style={{ display: 'block', fontSize: 16 }}>{j.judul}</strong>
                  <span className="subtle">{j.info}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions"><button type="button" className="btn light" onClick={onClose}>Batal</button></div>
          </>
        )}

        {mod && (
          <>
            {!row && <p className="subtle" style={{ margin: '4px 0 10px' }}>Jenis: <strong>{cfg.judul}</strong>{' '}<button type="button" className="btn light" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setMod('')}>Ganti jenis</button></p>}
            {Object.entries(opsi).map(([id, list]) => <datalist key={id} id={`uf-${id}`}>{list.map(v => <option key={v} value={v} />)}</datalist>)}
            <div className="modal-fields">
              {fields.map(f => {
                const raw = row?.data?.[f.key];
                const lama = row && f.date && raw && !toDate(raw) ? String(raw) : '';
                return (
                  <label key={f.id} className={f.wide ? 'field-wide' : ''}>
                    <span>{f.label}{f.req ? ' *' : ''}</span>
                    {f.wide
                      ? <textarea rows="2" value={form[f.id] ?? ''} onChange={e => ubah(f, e.target.value)} />
                      : <input type={f.date ? 'date' : 'text'} inputMode={f.num ? 'numeric' : undefined} maxLength={f.num ? 4 : undefined}
                          value={form[f.id] ?? ''} list={f.list ? `uf-${f.id}` : undefined} autoComplete="off"
                          onChange={e => ubah(f, e.target.value)} />}
                    {f.id === 'cn' && !row && saran && form.cn !== saran && <small className="subtle">Nomor berikutnya: <button type="button" className="btn light" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => set('cn', saran)}>{saran}</button></small>}
                    {f.id === 'kom' && berlakuOtomatis && <small className="subtle">Masa berlaku otomatis: {berlakuOtomatis}</small>}
                    {lama && <small className="subtle">Isi lama: {lama} (format tidak dikenali)</small>}
                  </label>
                );
              })}
            </div>
            {err && <div className="form-error">{err}</div>}
            <div className="modal-actions">
              <button type="button" className="btn light" disabled={busy} onClick={onClose}>Batal</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : (row ? 'Simpan perubahan' : 'Tambahkan')}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
