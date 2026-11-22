// Ekspor laporan SHE bulanan ke PowerPoint (pptxgenjs). Tata letak mengikuti laporan Oktober 2026.
import { cellText } from './laporan.js';
import { BULAN_PENDEK, KRITIS, nf, usd } from './she.js';
import { BULAN, fd } from './laporan.js';
import { SAP_KAT, daysIn, inspeksiTotal, pctTxt } from './she3.js';
import { bmiTone, pctN } from './she5.js';
import { toIso } from './smkp.js';

const C = { navy: '1F3864', blue: '2F5597', red: 'C00000', line: '000000', zebra: 'F3F6FB', red2: 'FDE2E1', amber: 'FEF3C7', green: 'DCFCE7' };
const TONE = { red: C.red2, amber: C.amber, green: C.green };
const W = 12.5; const X0 = 0.4; const Y0 = 1.3; const H_AVAIL = 5.75;

function frame(pptx, label, title) {
  const s = pptx.addSlide();
  s.addShape('roundRect', { x: X0, y: 0.15, w: 5.6, h: 0.34, fill: { color: C.red }, line: { color: C.red }, rectRadius: 0.12 });
  s.addText(label, { x: X0, y: 0.15, w: 5.6, h: 0.34, align: 'center', valign: 'middle', fontSize: 10, color: 'FFFFFF', fontFace: 'Arial' });
  s.addShape('roundRect', { x: 6.2, y: 0.15, w: 5.6, h: 0.34, fill: { color: C.blue }, line: { color: C.blue }, rectRadius: 0.12 });
  s.addText('SHE MONTHLY REPORT', { x: 6.2, y: 0.15, w: 5.6, h: 0.34, align: 'center', valign: 'middle', fontSize: 10, color: 'FFFFFF', fontFace: 'Arial' });
  s.addText('PT. REP', { x: 11.9, y: 0.1, w: 1.0, h: 0.4, align: 'right', valign: 'middle', fontSize: 12, bold: true, color: C.red, fontFace: 'Arial' });
  s.addText(title, { x: X0, y: 0.62, w: W, h: 0.5, align: 'center', valign: 'middle', fontSize: 22, bold: true, color: '000000', fontFace: 'Arial' });
  return s;
}

const txt = c => { const v = cellText(c); return v === undefined || v === null || v === '' ? '' : String(v); };
const tone = c => (c !== null && typeof c === 'object' ? c.tone : undefined);

/** Bagi baris tabel ke beberapa slide menurut perkiraan tinggi baris (teks panjang membungkus). */
function paginate(rows, widths, fs, minH = 0) {
  const cpi = 140 / fs; // perkiraan karakter per inci
  const lh = (fs * 1.28) / 72;
  const pages = []; let cur = []; let used = 0;
  rows.forEach(r => {
    const lines = Math.max(1, ...r.map((c, i) => Math.ceil(txt(c).length / Math.max(2, widths[i] * cpi - 1))));
    const h = Math.max(minH, lines * lh + 0.09);
    if (cur.length && used + h > H_AVAIL - 0.45) { pages.push(cur); cur = []; used = 0; }
    cur.push(r); used += h;
  });
  if (cur.length || !pages.length) pages.push(cur);
  return pages;
}

function weights(head, rows) {
  const w = head.map((h, i) => {
    const sample = rows.slice(0, 25).map(r => txt(r[i]).length);
    const avg = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 0;
    return Math.min(34, Math.max(String(h).length * 0.8, avg, 3));
  });
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map(x => (x / sum) * W);
  // Kolom nama dan nomor diberi lebar minimum supaya tidak terpotong; sisanya dibagi ulang.
  const min = head.map(h => (/^no$/i.test(String(h)) ? 0.4 : /^nama/i.test(String(h)) ? 1.7 : 0));
  const fixed = out.map((x, i) => (min[i] && x < min[i] ? min[i] : null));
  const fixedSum = fixed.reduce((a, b) => a + (b || 0), 0);
  const restSum = out.reduce((a, x, i) => a + (fixed[i] === null ? x : 0), 0);
  return out.map((x, i) => (fixed[i] !== null ? fixed[i] : x * ((W - fixedSum) / restSum)));
}

export function tableSlides(pptx, label, title, head, rows, { note, fs: fsOpt, align, rowH } = {}) {
  const base = head.length <= 6 ? 11 : head.length <= 9 ? 9.5 : head.length <= 12 ? 8.5 : 7.5;
  const fs = fsOpt || (rows.length <= 10 && head.length <= 9 ? base + 1.5 : base);
  const widths = weights(head, rows);
  const pages = paginate(rows, widths, fs, rowH || 0);
  pages.forEach((pg, pi) => {
    const s = frame(pptx, label, pages.length > 1 ? `${title} (${pi + 1}/${pages.length})` : title);
    const header = head.map(h => ({ text: String(h), options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center', valign: 'middle', fontSize: fs, fontFace: 'Arial' } }));
    const body = pg.map((r, ri) => r.map((c, ci) => {
      const t = tone(c);
      return { text: txt(c), options: { fontSize: fs, fontFace: 'Arial', valign: 'middle', align: align ? align[ci] : (ci === 0 && /^no$/i.test(String(head[0]))) || String(head[ci]).match(/^(No|Tgl|Tanggal|Shift|Akses|Usia|Plan|Aktual|Kekurangan|Tahun|Expired)/i) ? 'center' : 'left', fill: { color: t ? TONE[t] : ri % 2 ? C.zebra : 'FFFFFF' } } };
    }));
    if (!body.length) body.push(head.map((_, i) => ({ text: i === 0 ? 'Tidak ada data' : '', options: { fontSize: fs, italic: true, color: '666666' } })));
    s.addTable([header, ...body], { x: X0, y: Y0, w: W, colW: widths, ...(rowH ? { rowH } : {}), border: { type: 'solid', pt: 0.5, color: C.line }, margin: [0.03, 0.05, 0.03, 0.05], autoPage: false });
    if (note && pi === pages.length - 1) s.addText(note, { x: X0, y: 7.0, w: W, h: 0.3, fontSize: 9, italic: true, color: '444444', fontFace: 'Arial' });
  });
}

function statSlide(pptx, stat, year) {
  const s = frame(pptx, 'SHE STATISTIK', `Incident Statistic ${year}`);
  const fs = 7; const hd = t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center', valign: 'middle', fontSize: fs, fontFace: 'Arial' } });
  const hs = (t, o) => ({ text: t, options: { ...hd(t).options, ...o } });
  const r1 = [...['NO', 'MONTH', 'FATAL', 'POTENTIAL FATAL', 'LTI', 'MINOR INJURY', 'PROPERTY DAMAGE', 'ENVIRO', 'NEAR MISS', 'TOTAL INCIDENT'].map(t => hs(t, { rowspan: 2 })),
    ...['DAY LOSS', 'LTIFR', 'SEVERITY RATE', 'MAN HOURS', 'LTI FREE MAN HOURS', 'PROPERTY DAMAGE COST'].map(t => hs(t, { colspan: 2 }))];
  const r2 = Array.from({ length: 6 }, () => [hd('Month'), hd('YTD')]).flat();
  const cell = (t, o = {}) => ({ text: t === undefined || t === null ? '' : String(t), options: { fontSize: fs, fontFace: 'Arial', align: 'center', valign: 'middle', ...o } });
  const body = stat.map((x, i) => {
    const f = x.filled;
    const v = fn => (f ? fn(x) : '');
    return [cell(i + 1), cell(BULAN_PENDEK[i], { bold: true }), cell(v(a => a.fatal)), cell(v(a => a.pf)), cell(v(a => a.lti)), cell(v(a => a.minor)), cell(v(a => a.pd)), cell(v(a => a.env)), cell(v(a => a.nm)), cell(v(a => a.total), { bold: true }),
      cell(v(a => a.dl)), cell(v(a => a.ytd.dl)), cell(v(a => nf(a.ltifr, 2))), cell(v(a => nf(a.ltifrYtd, 2))), cell(v(a => nf(a.sev, 2))), cell(v(a => nf(a.sevYtd, 2))),
      cell(v(a => nf(a.mh))), cell(v(a => nf(a.ytd.mh))), cell(v(a => nf(a.freeMonth))), cell(v(a => nf(a.freeYtd))), cell(v(a => (a.cost ? usd(a.cost) : '-'))), cell(v(a => (a.ytd.cost ? usd(a.ytd.cost) : '-')))];
  });
  const filled = stat.filter(x => x.filled); const l = filled[filled.length - 1];
  const tot = l ? [cell('TOTAL', { bold: true, colspan: 2 }), cell(l.ytd.fatal, { bold: true }), cell(l.ytd.pf, { bold: true }), cell(l.ytd.lti, { bold: true }), cell(l.ytd.minor, { bold: true }), cell(l.ytd.pd, { bold: true }), cell(l.ytd.env, { bold: true }), cell(l.ytd.nm, { bold: true }), cell(l.ytd.total, { bold: true }),
    cell(l.ytd.dl, { bold: true }), cell(l.ytd.dl, { bold: true }), cell(nf(l.ltifrYtd, 2), { bold: true }), cell(nf(l.ltifrYtd, 2), { bold: true }), cell(nf(l.sevYtd, 2), { bold: true }), cell(nf(l.sevYtd, 2), { bold: true }),
    cell(nf(l.ytd.mh), { bold: true }), cell(nf(l.ytd.mh), { bold: true }), cell(nf(l.freeYtd), { bold: true }), cell(nf(l.freeYtd), { bold: true }), cell(usd(l.ytd.cost), { bold: true }), cell(usd(l.ytd.cost), { bold: true })] : null;
  const widths = [0.35, 0.5, 0.45, 0.55, 0.4, 0.55, 0.65, 0.5, 0.5, 0.6, 0.4, 0.4, 0.5, 0.5, 0.5, 0.5, 0.65, 0.7, 0.65, 0.7, 0.75, 0.8];
  const sc = W / widths.reduce((a, b) => a + b, 0);
  s.addTable([r1, r2, ...body, ...(tot ? [tot] : [])], { x: X0, y: 1.25, w: W, colW: widths.map(x => x * sc), rowH: 0.3, border: { type: 'solid', pt: 0.5, color: C.line }, margin: [0.02, 0.03, 0.02, 0.03] });
}

function inspeksiSlide(pptx, insp, year, month) {
  const n = daysIn(year, month); const fs = 5.5;
  const s = frame(pptx, 'SHE INSPEKSI', `Jadwal Inspeksi • ${BULAN[month]} ${year}`);
  const hd = (t, o = {}) => ({ text: String(t), options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center', valign: 'middle', fontSize: fs, fontFace: 'Arial', ...o } });
  const head = [hd('NO'), hd('INSPEKSI'), hd(''), ...Array.from({ length: n }, (_, i) => hd(i + 1)), hd('PLAN'), hd('DONE'), hd('ACH')];
  const body = [];
  insp.forEach(it => ['plan', 'actual'].forEach((k, ri) => {
    const row = [];
    if (ri === 0) { row.push({ text: String(it.No), options: { rowspan: 2, fontSize: fs + 1, align: 'center', valign: 'middle' } }, { text: it.Inspeksi, options: { rowspan: 2, fontSize: fs + 1, bold: true, valign: 'middle' } }); }
    row.push({ text: ri === 0 ? 'Plan' : 'Actual', options: { fontSize: fs, align: 'left' } });
    for (let d = 1; d <= n; d += 1) row.push({ text: '', options: { fill: { color: it[k].includes(d) ? (ri === 0 ? 'C00000' : '00A550') : 'FFFFFF' } } });
    row.push({ text: String(it[k].length), options: { fontSize: fs, align: 'center' } });
    if (ri === 0) row.push({ text: String(it.done), options: { rowspan: 2, fontSize: fs + 1, align: 'center', valign: 'middle' } }, { text: pctTxt(it.ach), options: { rowspan: 2, fontSize: fs + 1, bold: true, align: 'center', valign: 'middle' } });
    body.push(row);
  }));
  const t = inspeksiTotal(insp);
  if (!body.length) body.push([{ text: 'Tidak ada data', options: { colspan: n + 6, italic: true, fontSize: 9 } }]);
  else body.push([{ text: 'TOTAL', options: { colspan: 3, bold: true, fontSize: fs + 1 } }, ...Array.from({ length: n }, () => ({ text: '' })), { text: String(t.plan), options: { bold: true, align: 'center', fontSize: fs + 1 } }, { text: String(t.done), options: { bold: true, align: 'center', fontSize: fs + 1 } }, { text: pctTxt(t.ach), options: { bold: true, align: 'center', fontSize: fs + 1 } }]);
  const colW = [0.3, 1.9, 0.45, ...Array.from({ length: n }, () => 0.27), 0.4, 0.4, 0.5];
  const sc = W / colW.reduce((a, b) => a + b, 0);
  s.addTable([head, ...body], { x: X0, y: 1.25, w: W, colW: colW.map(x => x * sc), rowH: 0.165, border: { type: 'solid', pt: 0.5, color: C.line }, margin: [0, 0.02, 0, 0.02] });
}

/** Kegiatan SHE: tabel dengan kolom foto; foto ditempatkan di atas sel kolom terakhir. */
function kegiatanSlides(pptx, keg, photos, bulanLabel) {
  const widths = [0.5, 3.6, 2.2, 2.8, 3.4]; const HH = 0.3; const RH = 1.15; const GH = 0.28; const PER = 4;
  const items = [...keg.rutin.map(x => ({ x, g: 'KEGIATAN RUTIN' })), ...keg.khusus.map(x => ({ x, g: 'KEGIATAN KHUSUS' }))];
  const pages = []; for (let i = 0; i < items.length; i += PER) pages.push(items.slice(i, i + PER));
  if (!pages.length) pages.push([]);
  pages.forEach((pg, pi) => {
    const s = frame(pptx, 'SHE ACTIVITY', pages.length > 1 ? `SHE Activity Report • ${bulanLabel} (${pi + 1}/${pages.length})` : `SHE Activity Report • ${bulanLabel}`);
    const hd = t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center', valign: 'middle', fontSize: 10, fontFace: 'Arial' } });
    const rows = [[hd('NO'), hd('ACTIVITY / KEGIATAN'), hd('DATE / TANGGAL'), hd('LOCATION / TEMPAT'), hd('ATTACHMENT / FOTO')]]; const rowH = [HH]; const pos = [];
    let y = Y0 + HH; let last = null;
    pg.forEach(({ x, g }) => {
      if (g !== last) { rows.push([{ text: g, options: { colspan: 5, bold: true, fontSize: 9, fill: { color: 'D9E2F3' }, fontFace: 'Arial' } }]); rowH.push(GH); y += GH; last = g; }
      const cell = (t, o = {}) => ({ text: t, options: { fontSize: 10, fontFace: 'Arial', valign: 'middle', ...o } });
      rows.push([cell(String(x.No), { align: 'center' }), cell(x.Kegiatan, { bold: true }), cell(x.Tanggal || ''), cell(x.Lokasi || ''), cell('')]);
      rowH.push(RH); pos.push({ y, x }); y += RH;
    });
    s.addTable(rows, { x: X0, y: Y0, w: W, colW: widths, rowH, border: { type: 'solid', pt: 0.5, color: C.line }, margin: [0.03, 0.06, 0.03, 0.06] });
    const fx = X0 + widths.slice(0, 4).reduce((a, b) => a + b, 0);
    pos.forEach(({ y: py, x }) => { const d = photos && photos[x.fotos[0]]; if (d) s.addImage({ data: d, x: fx + 0.08, y: py + 0.05, w: widths[4] - 0.16, h: RH - 0.1, sizing: { type: 'contain', w: widths[4] - 0.16, h: RH - 0.1 } }); });
  });
}

/** Karyawan masuk dan keluar dalam satu slide seperti hal. 6 (kalau muat), selain itu dipisah per slide. */
function masukKeluarSlides(pptx, T, bulanLabel) {
  if (T.masuk.rows.length > 7 || T.keluar.rows.length > 7) {
    tableSlides(pptx, 'MANPOWER', 'Daftar Karyawan yang Masuk', T.masuk.head, T.masuk.rows);
    tableSlides(pptx, 'MANPOWER', 'Daftar Karyawan yang Keluar', T.keluar.head, T.keluar.rows);
    return;
  }
  const s = frame(pptx, 'MANPOWER', 'Daftar Karyawan yang Masuk');
  const widths = [0.7, 3.8, 3.0, 2.4, 2.6];
  const hd = t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center', valign: 'middle', fontSize: 11, fontFace: 'Arial' } });
  const tab = (t, rows, y, sub) => {
    s.addText(sub, { x: X0, y: y - 0.32, w: 6, h: 0.3, fontSize: 11, bold: true, fontFace: 'Arial' });
    const body = Array.from({ length: Math.max(3, rows.length) }, (_, i) => (rows[i] || [i + 1, '', '', '', '']).map((c, ci) => ({ text: txt(c), options: { fontSize: 10, fontFace: 'Arial', valign: 'middle', align: ci === 0 || ci === 3 ? 'center' : 'left' } })));
    s.addTable([t.head.map(hd), ...body], { x: X0, y, w: 12.5, colW: widths, rowH: 0.3, border: { type: 'solid', pt: 0.5, color: C.line } });
  };
  tab(T.masuk, T.masuk.rows, 1.55, `PERIODE : ${bulanLabel.toUpperCase()}`);
  s.addText('Daftar Karyawan yang Keluar', { x: X0, y: 3.95, w: W, h: 0.45, align: 'center', fontSize: 22, bold: true, fontFace: 'Arial' });
  tab(T.keluar, T.keluar.rows, 4.75, `PERIODE : ${bulanLabel.toUpperCase()}`);
}

const dtx = v => (toIso(v) ? fd(new Date(`${toIso(v)}T00:00:00`)) : String(v ?? ''));
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function imageSlide(pptx, label, title, data) {
  const s = frame(pptx, label, title);
  if (data) s.addImage({ data, x: X0, y: 1.2, w: W, h: 5.9, sizing: { type: 'contain', w: W, h: 5.9 } });
  else s.addText('Gambar belum diunggah', { x: X0, y: 3.5, w: W, h: 0.5, align: 'center', italic: true, color: '666666', fontSize: 14, fontFace: 'Arial' });
}

function penyakitRows(M) {
  const rows = []; let no = 0;
  M.forEach(({ m, items }) => {
    if (!items.length) { no += 1; rows.push([no, BULAN[m].slice(0, 3).toUpperCase(), 'NIHIL', '', '', '', '', '', '', '']); return; }
    items.forEach(x => { no += 1; rows.push([no, BULAN[m].slice(0, 3).toUpperCase(), x.Nomor || '', `${dtx(x.Tanggal)}${x.Waktu ? ` ${x.Waktu}` : ''}`, x.Lokasi || '', x.Pekerja || '', x.Kronologis || '', x.Akibat || '', x.Dilaporkan || '', x.Catatan || '']); });
  });
  return rows;
}
const PEN_HEAD = ['NO', 'MONTH', 'NOMOR URUT KEJADIAN', 'WAKTU / HARI / TANGGAL', 'LOKASI', 'DEPARTEMEN, JABATAN, LAMA BEKERJA', 'KRONOLOGIS KEJADIAN', 'AKIBAT KEJADIAN', 'DILAPORKAN KE KAIT / KADIS', 'CATATAN'];

function kkpSlides(pptx, kkp, photos, bulanLabel) {
  const h = kkp.head; const tgl = h?.Tanggal ? new Date(`${toIso(h.Tanggal)}T00:00:00`) : null;
  const sub = h ? `${tgl ? `${HARI_ID[tgl.getDay()]}, ${fd(tgl)}` : ''}${h.Tempat ? ` • ${h.Tempat}` : ''}` : '';
  const head = ['NO', 'PROBLEM', 'ACTION', 'PIC', 'ISSUE DATE', 'DUE DATE', 'REMARK'];
  const rows = items => items.map(x => [x.No, x.Problem, x.Action || '', x.PIC || '', dtx(x['Issue Date']), dtx(x['Due Date']), x.Remark || '']);
  tableSlides(pptx, 'SHE ACTIVITY', `KKP Meeting Level II • Problem dari Bulan Lalu${sub ? ` (${sub})` : ''}`, head, rows(kkp.lalu));
  tableSlides(pptx, 'SHE ACTIVITY', `KKP Meeting Level II • Problem Bulan Ini${sub ? ` (${sub})` : ''}`, head, rows(kkp.ini));
  const ab = photos[kkp.absen[0]]; const mt = kkp.fotos.map(f => photos[f]).filter(Boolean).slice(0, 4);
  if (ab || mt.length) {
    const s = frame(pptx, 'SHE ACTIVITY', `KKP Meeting Level II • Foto dan Absensi • ${bulanLabel}`);
    if (ab) s.addImage({ data: ab, x: X0, y: 1.25, w: 4.0, h: 5.9, sizing: { type: 'contain', w: 4.0, h: 5.9 } });
    mt.forEach((d, i) => s.addImage({ data: d, x: 4.6 + (i % 2) * 4.2, y: 1.25 + Math.floor(i / 2) * 3.0, w: 4.0, h: 2.85, sizing: { type: 'contain', w: 4.0, h: 2.85 } }));
  }
}

function ringkasKe(label, A) {
  return ['NO', label, 'PERIODE I PLAN', 'ACTUAL', 'ACHIEV', 'PERIODE II PLAN', 'ACTUAL', 'ACHIEV', 'MTD PLAN', 'ACTUAL', 'ACHIEV'].length && [[1, A.n, A.n, A.p1, pctN(A.a1), A.n, A.p2, pctN(A.a2), A.n * 2, A.p1 + A.p2, pctN(A.mtd)]];
}
const RINGKAS_HEAD = ['NO', 'JUMLAH KARYAWAN', 'PERIODE I PLAN', 'ACTUAL', 'ACHIEV', 'PERIODE II PLAN', 'ACTUAL', 'ACHIEV', 'MTD PLAN', 'ACTUAL', 'ACHIEV'];

/** Susun seluruh deck. `PptxGenJS` diberikan dari luar supaya bisa diuji tanpa browser. */
export function buildDeck(PptxGenJS, ctx) {
  const { T, stat, kin, ins, pen, sap, insp, keg, photos = {}, year, month, pica = [], kkp, struktur, penyakit, kk, bmi } = ctx;
  const bulanLabel = `${BULAN[month]} ${year}`;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; pptx.title = `SHE Monthly Report ${bulanLabel}`; pptx.company = 'PT. REP';

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addShape('rect', { x: 0, y: 2.6, w: 13.33, h: 1.9, fill: { color: C.navy }, line: { color: C.navy } });
  cover.addText('SHE MONTHLY REPORT', { x: 0.6, y: 2.75, w: 12, h: 0.9, fontSize: 38, bold: true, color: 'FFFFFF', fontFace: 'Arial' });
  cover.addText(`${bulanLabel.toUpperCase()}  •  PT. RYAN EKA PRATAMA`, { x: 0.6, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: 'DDE6F5', fontFace: 'Arial' });

  imageSlide(pptx, 'MANPOWER', 'Struktur Organisasi REP Site PAMA IMM', struktur?.path ? photos[struktur.path] : null);
  tableSlides(pptx, 'MANPOWER', 'Daftar Karyawan Aktif', T.aktif.head, T.aktif.rows);
  masukKeluarSlides(pptx, T, bulanLabel);
  tableSlides(pptx, 'MANPOWER', 'Daftar Manpower', T.manpower.head, T.manpower.rows);
  tableSlides(pptx, 'MANPOWER', 'PICA Kebutuhan Manpower', ['NO', 'PROBLEMS / PERMASALAHAN', 'CORRECTIVE ACTION / TINDAKAN PERBAIKAN', 'PIC', 'DUE DATE', 'STATUS'],
    pica.map(x => [x.No, x.Problem, x.Action || '', x.PIC || '', dtx(x['Due Date']), x.Status || '']));
  if (T.pengawas.rows.length) tableSlides(pptx, 'MANPOWER', T.pengawas.title, T.pengawas.head, T.pengawas.rows);
  T.highrisk.filter(g => g.rows.length).forEach(g => tableSlides(pptx, 'MANPOWER', g.title, g.head, g.rows));
  // Unit dengan keterangan off hire tidak ditampilkan di PowerPoint; nomor urut disusun ulang.
  T.unit.map(g => ({ ...g, rows: g.rows.filter(r => !/off\s*hire/i.test(txt(r[r.length - 1]))).map((r, i) => [i + 1, ...r.slice(1)]) }))
    .filter(g => g.rows.length).forEach(g => tableSlides(pptx, 'UNIT', g.title, g.head, g.rows));
  tableSlides(pptx, 'SHE PERFORMANCE', `SHE Performance Monitoring • ${bulanLabel}`, ['DESCRIPTION', 'OBJECTIVE', 'ACTUAL', 'YEAR TO DATE', 'COMMENTS'],
    kin.map((r, i) => [...r, i === 0 ? (stat[month]?.catatan || '') : '']), { fs: 14, rowH: 0.5, align: ['left', 'center', 'center', 'center', 'left'] });
  statSlide(pptx, stat, year);
  const biaya = x => (Number(x['Biaya Perbaikan']) || 0) + (Number(x['Biaya Medis']) || 0);
  tableSlides(pptx, 'SHE INCIDENT', `Summary Sheet of Incident • ${bulanLabel}`, ['No', 'Tanggal / waktu', 'Lokasi', 'Departemen', 'Nama / jabatan', 'Kategori', 'Uraian kejadian', 'Hari hilang', 'Biaya perbaikan (Rp)', 'Biaya medis (Rp)', 'Total (Rp)', 'Penyebab'],
    ins.map((x, i) => [i + 1, `${fd(x.d)}${x.Waktu ? ` ${x.Waktu}` : ''}`, x.Lokasi || '', x.Departemen || '', x['Nama / Jabatan'] || '', x.Kategori || '', x.Uraian || '', x['Hari Hilang'] || 0, nf(Number(x['Biaya Perbaikan']) || 0), nf(Number(x['Biaya Medis']) || 0), nf(biaya(x)), x.Penyebab || '']));
  tableSlides(pptx, 'SHE LAW ENFORCEMENT', `SHE Law Enforcement Report • ${bulanLabel}`, ['No', 'Tanggal', 'Nama karyawan', 'NRP', 'Dept.', 'Jabatan', 'Deskripsi insiden / pelanggaran', 'Sanksi disiplin', 'Keterangan'],
    pen.map((x, i) => [i + 1, fd(x.d), x.nama, x.nrp, x.dept, x.jabatan, x.desk, x.sanksi, x.ket]));
  tableSlides(pptx, 'SHE INCIDENT', 'Rekapitulasi Kejadian Berbahaya dan Kecelakaan Kerja', ['No', 'Nomor kecelakaan', 'Tanggal', 'Waktu', 'Lokasi', 'Kronologis kejadian berbahaya', 'Akibat kejadian', 'Dilaporkan ke KaIT', 'Catatan'],
    ins.filter(x => KRITIS.includes(x.Kategori)).map((x, i) => [i + 1, x['Nomor Kecelakaan'] || '', fd(x.d), x.Waktu || '', x.Lokasi || '', x.Uraian || '', x.Akibat || '', x['Dilaporkan ke KaIT'] || '', x.Catatan || '']));
  if (penyakit) {
    tableSlides(pptx, 'SHE KESEHATAN', `Rekapitulasi Penyakit Akibat Kerja ${year}`, PEN_HEAD, penyakitRows(penyakit.pak));
    tableSlides(pptx, 'SHE KESEHATAN', `Rekapitulasi Kejadian Akibat Penyakit Tenaga Kerja ${year}`, PEN_HEAD, penyakitRows(penyakit.kaptk));
  }
  if (keg && keg.all.length) kegiatanSlides(pptx, keg, photos, bulanLabel);
  if (kkp && (kkp.head || kkp.lalu.length || kkp.ini.length)) kkpSlides(pptx, kkp, photos, bulanLabel);
  if (sap && sap.rows.length) {
    const head = ['No', 'Nama', ...SAP_KAT.flatMap(([, n]) => [`${n} plan`, `${n} actual`])];
    const rows = sap.rows.map((r, i) => [i + 1, r.Nama, ...SAP_KAT.flatMap(([k]) => [r[`${k} Plan`] ?? '', r[`${k} Actual`] ?? ''])]);
    rows.push(['', 'TOTAL', ...SAP_KAT.flatMap(([k]) => [sap.tot[k].plan, sap.tot[k].actual])]);
    rows.push(['', `ACH (keseluruhan ${pctTxt(sap.overall)})`, ...SAP_KAT.flatMap(([k]) => [pctTxt(sap.ach[k]), ''])]);
    tableSlides(pptx, 'SHE SAP', `Safety Accountability Program (SAP) • ${bulanLabel}`, head, rows);
  }
  if (kk && kk.n) {
    tableSlides(pptx, 'SHE KESEHATAN', `Monitoring Kontrol Kritis Kronis • ${bulanLabel}`, ['NO', 'NRP', 'NRPSAP', 'NAMA KARYAWAN', 'USIA', 'JABATAN', 'P1 HASIL KUNJUNGAN', 'P1 CATATAN PENGOBATAN', 'P1 KONSUMSI OBAT', 'P2 TANGGAL', 'P2 TEMPAT', 'P2 HASIL KUNJUNGAN', 'P2 CATATAN PENGOBATAN', 'P2 KONSUMSI OBAT', 'STATUS'],
      kk.rows.map(x => [x.No, x.NRP, x.NRPSAP, x.Nama, x.Usia, x.Jabatan, x['P1 Hasil'] || '', x['P1 Catatan'] || '', x['P1 Obat'] || '', dtx(x['P2 Tanggal']), x['P2 Tempat'] || '', x['P2 Hasil'] || '', x['P2 Catatan'] || '', x['P2 Obat'] || '', x.Status || '']));
    tableSlides(pptx, 'SHE KESEHATAN', 'Monitoring Kontrol Kritis Kronis • Ringkasan', RINGKAS_HEAD, ringkasKe('KK', kk), { fs: 12, rowH: 0.5 });
  }
  if (bmi && bmi.n) {
    const b = v => (v === null ? '' : { t: v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), tone: bmiTone(v) });
    tableSlides(pptx, 'SHE KESEHATAN', `Monitoring Kontrol BMI • ${bulanLabel}`, ['NO', 'NRP', 'NAMA KARYAWAN', 'JABATAN', 'W1&2 TEMPAT', 'TB (M)', 'BB', 'BMI', 'W3&4 TGL KONTROL', 'TEMPAT', 'TB (M)', 'BB', 'BMI', 'STATUS'],
      bmi.rows.map(x => [x.No, x.NRP, x.Nama, x.Jabatan, x['W12 Tempat'] || '', x['W12 TB'] || '', x['W12 BB'] || '', b(x.bmi1), dtx(x['W34 Tanggal']), x['W34 Tempat'] || '', x['W34 TB'] || '', x['W34 BB'] || '', b(x.bmi2), x.Status || '']));
    tableSlides(pptx, 'SHE KESEHATAN', 'Monitoring Kontrol BMI • Ringkasan', RINGKAS_HEAD, ringkasKe('BMI', bmi), { fs: 12, rowH: 0.5 });
  }
  inspeksiSlide(pptx, insp || [], year, month);
  return pptx;
}

/** Unduh dari browser. pptxgenjs dimuat saat tombol diklik, jadi tidak membebani halaman lain. */
export async function exportPptx(ctx) {
  const mod = await import('pptxgenjs');
  const PptxGenJS = mod.default || mod;
  const pptx = buildDeck(PptxGenJS, ctx);
  await pptx.writeFile({ fileName: `SHE_Monthly_Report_${BULAN[ctx.month]}_${ctx.year}.pptx` });
}
