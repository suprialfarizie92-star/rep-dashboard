// FORM NEED SURVEY (INDO/SOPT/F-043): survei kebutuhan training subcontractor.
// Template asli (logo, kolom versatility, catatan, tanda tangan) disalin apa adanya; hanya judul bulan, baris nama, dan tanggal yang diisi.
import TPL from './needSurveyTpl.js';

export const BULAN_FORM = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
const SHEET_NAME = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const TEMPLATE_ROWS = 13; // baris nama yang tersedia di template (baris 12 sampai 24)
const FIRST_ROW = 12;
const TAIL_ROW = 25; // baris pertama setelah tabel nama

export const isOn = v => { const x = String(v ?? '').trim().toLowerCase(); return x !== '' && !['0', '-', 'false', 'tidak', 'no', 'n'].includes(x); };
/** Urutan di form: GL, Mekanik, Welder, jabatan lain, Operator DT, lalu Operator A2B (termasuk Operator Excavator dan Operator Dozer) paling akhir; di dalam kelompok urut nama. */
export const jabatanRank = j => {
  const t = String(j || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/\b(gl|group leader|grup leader)\b/.test(t)) return 0; // 1. GL
  if (/mekanik|mechanic/.test(t)) return 1; // 2. Mekanik
  if (/welder|juru las/.test(t)) return 2; // 3. Welder
  if (/a2b|excavator|dozer|doser/.test(t)) return 5; // 6. Operator A2B, Excavator, Dozer paling akhir
  if (/\bdt\b|dump ?truck/.test(t)) return 4; // 5. Operator DT
  return 3; // 4. jabatan lain
};
export const sortSurvey = list => [...list].sort((a, b) => jabatanRank(a.jabatan) - jabatanRank(b.jabatan) || String(a.nama).localeCompare(String(b.nama), 'id'));

/** Kolom bulatan di template (indeks kolom mulai 0, offset kiri dan kanan dalam EMU); kolom OTHER memang tanpa bulatan. */
const CIRCLES = [[5, 143784, 295276], [6, 143784, 295276], [7, 142875, 294367], [8, 143784, 295276], [10, 194583, 346075], [11, 194583, 346075], [12, 182562, 334054], [14, 175536, 327028], [15, 166008, 317500], [17, 166008, 317500], [18, 168729, 320221], [20, 121104, 272596], [21, 121104, 272596]];
/** Kolom form yang punya centang di Data Karyawan (kolom G = P360, H = FMX420, K = PC210/300, L = PC350, O = D85 SS). */
export const CERT_COL = { 6: 'P360', 7: 'FMX420', 10: 'PC210', 11: 'PC350', 14: 'D85' };
const COL_LAMA = 20;
const oval = (id, col, c1, c2, row0, on) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${c1}</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>18822</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col}</xdr:col><xdr:colOff>${c2}</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>171450</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="Oval ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="151492" cy="152628"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="${on ? 'tx1' : 'bg1'}"/></a:solidFill><a:ln w="3175"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const serial = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
const proper = s => String(s || '').trim().toLowerCase().replace(/(^|[\s.'(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const istr = (ref, style, text) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const COLS = 'CDEFGHIJKLMNOPQRSTUV'.split('');

/** Satu baris nama: nomor, nama, masa berlaku authority. Bulatan versatility dan status digambar terpisah (lihat circlesXml). */
function personRow(r, i, p) {
  const cells = COLS.map(c => {
    const ref = `${c}${r}`;
    if (c === 'C') return p ? `<c r="${ref}" s="17"><v>${i + 1}</v></c>` : `<c r="${ref}" s="17"/>`;
    if (c === 'D') return p ? istr(ref, 22, proper(p.nama)) : `<c r="${ref}" s="22"/>`;
    if (c === 'E') return p && p.exp ? `<c r="${ref}" s="19"><v>${serial(p.exp)}</v></c>` : `<c r="${ref}" s="19"/>`;
    return `<c r="${ref}" s="20"/>`;
  }).join('');
  return `<row r="${r}" spans="3:22" x14ac:dyDescent="0.35">${cells}</row>`;
}

/** Bulatan di setiap kolom versatility dan status: hitam bila sesuai checklist di Data Karyawan, putih bila tidak. */
function circlesXml(people, total) {
  let id = 100; let out = '';
  for (let i = 0; i <= total; i += 1) { // total baris nama + 1 baris penutup tabel
    const p = people[i]; const row0 = FIRST_ROW - 1 + i;
    CIRCLES.forEach(([col, c1, c2]) => {
      const on = Boolean(p) && (col === COL_LAMA || (CERT_COL[col] && p.certs && p.certs[CERT_COL[col]]));
      out += oval(id, col, c1, c2, row0, on); id += 1;
    });
  }
  return out;
}

/** Geser nomor baris (>= TAIL_ROW) sejauh k baris pada sheetData dan daftar merge. */
function shiftTail(xml, k) {
  if (!k) return xml;
  return xml
    .replace(/<row r="(\d+)"/g, (m, r) => (Number(r) >= TAIL_ROW ? `<row r="${Number(r) + k}"` : m))
    .replace(/<c r="([A-Z]+)(\d+)"/g, (m, c, r) => (Number(r) >= TAIL_ROW ? `<c r="${c}${Number(r) + k}"` : m))
    .replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, (m, c1, r1, c2, r2) => `<mergeCell ref="${c1}${Number(r1) >= TAIL_ROW ? Number(r1) + k : r1}:${c2}${Number(r2) >= TAIL_ROW ? Number(r2) + k : r2}"`);
}

/**
 * @param {{nama: string, exp: Date, certs?: Record<string, boolean>}[]} people Authority yang habis berlaku 2 bulan setelah bulan form (sudah diurutkan dengan sortSurvey)
 * @param {{month: number, year: number, date?: Date, type?: 'blob'|'nodebuffer'}} opt month = 0..11 (bulan form)
 */
export async function buildNeedSurvey(people, { month, year, date = new Date(), type = 'blob' }) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(TPL, { base64: true });
  let sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');

  const total = Math.max(people.length, TEMPLATE_ROWS);
  const k = total - TEMPLATE_ROWS;
  const iTail = sheet.indexOf(`<row r="${TAIL_ROW}"`);
  if (iTail < 0) throw new Error('Template form tidak valid.');
  const head = sheet.slice(0, iTail); let tail = sheet.slice(iTail);

  const rows = Array.from({ length: total }, (_, i) => personRow(FIRST_ROW + i, i, people[i])).join('');
  const tgl = `Bontang, ${date.getDate()} ${BULAN_FORM[date.getMonth()].charAt(0)}${BULAN_FORM[date.getMonth()].slice(1).toLowerCase()} ${date.getFullYear()}`;
  tail = tail.replace(/<c r="R35" s="34" t="s"><v>\d+<\/v><\/c>/, istr('R35', 34, tgl));
  tail = shiftTail(tail, k);

  const judul = istr('C6', 7, `BULAN / TAHUN  :  ${BULAN_FORM[month]} / ${year}`);
  const headNew = head
    .replace(/<c r="C6" s="7" t="s"><v>\d+<\/v><\/c>/, judul)
    .replace(/<dimension ref="C2:V41"\/>/, `<dimension ref="C2:V${41 + k}"/>`);
  zip.file('xl/worksheets/sheet1.xml', headNew + rows + tail);
  const drawing = await zip.file('xl/drawings/drawing1.xml').async('string');
  zip.file('xl/drawings/drawing1.xml', drawing.replace('</xdr:wsDr>', `${circlesXml(people, total)}</xdr:wsDr>`));

  const nm = SHEET_NAME[month];
  let wb = await zip.file('xl/workbook.xml').async('string');
  wb = wb.replace('<sheet name="DES"', `<sheet name="${nm}"`).replace('DES!$B$2:$V$41', `${nm}!$B$2:$V$${41 + k}`);
  zip.file('xl/workbook.xml', wb);

  return zip.generateAsync({ type, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

/** Unduh dari browser. */
export async function downloadNeedSurvey(people, opt) {
  const blob = await buildNeedSurvey(people, { ...opt, type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `FORM_NEED_SURVEY_${BULAN_FORM[opt.month]}_${opt.year}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
