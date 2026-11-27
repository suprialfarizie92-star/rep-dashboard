// FORM NEED SURVEY (INDO/SOPT/F-043): survei kebutuhan training subcontractor.
// Template asli (logo, kolom versatility, catatan, tanda tangan) disalin apa adanya; hanya judul bulan, baris nama, dan tanggal yang diisi.
import TPL from './needSurveyTpl.js';

export const BULAN_FORM = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
const SHEET_NAME = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const TEMPLATE_ROWS = 13; // baris nama yang tersedia di template (baris 12 sampai 24)
const FIRST_ROW = 12;
const TAIL_ROW = 25; // baris pertama setelah tabel nama

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const serial = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
const proper = s => String(s || '').trim().toLowerCase().replace(/(^|[\s.'(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const istr = (ref, style, text) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const COLS = 'CDEFGHIJKLMNOPQRSTUV'.split('');

/** Satu baris nama: nomor, nama, masa berlaku authority, kolom versatility kosong, status LAMA diberi tanda V. */
function personRow(r, i, p) {
  const cells = COLS.map(c => {
    const ref = `${c}${r}`;
    if (c === 'C') return p ? `<c r="${ref}" s="17"><v>${i + 1}</v></c>` : `<c r="${ref}" s="17"/>`;
    if (c === 'D') return p ? istr(ref, 22, proper(p.nama)) : `<c r="${ref}" s="22"/>`;
    if (c === 'E') return p && p.exp ? `<c r="${ref}" s="19"><v>${serial(p.exp)}</v></c>` : `<c r="${ref}" s="19"/>`;
    if (c === 'U') return p ? istr(ref, 17, 'V') : `<c r="${ref}" s="17"/>`;
    return `<c r="${ref}" s="20"/>`;
  }).join('');
  return `<row r="${r}" spans="3:22" x14ac:dyDescent="0.35">${cells}</row>`;
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
 * @param {{nama: string, exp: Date}[]} people Authority yang habis berlaku 2 bulan setelah bulan form (sudah diurutkan)
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
