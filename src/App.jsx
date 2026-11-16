import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { isSupabaseConfigured, supabase } from './supabase';
import Icon from './Icon.jsx';
import { MODULES } from './modules.js';
import { ModeToggle, ThemeDots, useAppearance } from './appearance.jsx';
import SettingsPage from './Settings.jsx';
import Dashboard from './Dashboard.jsx';
import Training from './Training.jsx';
import Lisensi from './Lisensi.jsx';
import TesHR from './TesHR.jsx';
import TesKandidat from './TesKandidat.jsx';
import { NAV, TAB_LABEL } from './nav.js';
import { licenseExpiringPeople } from './utils.js';
import InputData from './InputData.jsx';
import { PAGES } from './Pages.jsx';

const PRIVATE_EMPLOYEE_FIELDS = new Set([
  'tempat lahir', 'tanggal lahir', 'jenis kelamin', 'status', 'agama', 'pendidikan',
  'email', 'gol. darah', 'alamat', 'ibu', 'istri', 'domisili', 'ring', 'hp istri',
  'kontak darurat', 'nik', 'cp', 'npwp', 'bpjs tk', 'bpjs kes', 'foto', 'no. hp', 'no hp', 'nomor hp'
]);

const DATE_FIELD = /(tanggal|date|expired|berlaku|komisioning|pajak|stnk|kir|lahir|resign|due)/i;

function fieldIsPrivate(key) {
  return PRIVATE_EMPLOYEE_FIELDS.has(String(key).trim().toLowerCase());
}

function splitEmployeeRecord(record) {
  const publicData = {};
  const privateData = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    (fieldIsPrivate(key) ? privateData : publicData)[key] = value;
  });
  return { publicData, privateData };
}

function excelSerialToDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
    if (match) {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',aug:'08',agu:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12'};
      const month = months[match[2].slice(0,3).toLowerCase()];
      let year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      if (month) return `${year}-${month}-${String(Number(match[1])).padStart(2,'0')}`;
    }
  }
  return '';
}

function displayValue(value, key = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (DATE_FIELD.test(key)) {
    const iso = excelSerialToDate(value);
    if (iso) {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }
  }
  if (typeof value === 'number' && value > 0 && value < 1.01 && /(pemenuhan|ytd|jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)/i.test(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}


function makeHeaders(rows, moduleKey) {
  const specialTna =
    moduleKey === 'TNA_Plan' ||
    moduleKey === 'TNA_Realisasi';

  // Header khusus Data Rekrutmen
if (moduleKey === 'Data_Rekrutmen') {
  return [
    'ID',
    'Nama Kandidat',
    'Jabatan Dilamar',
    'Sumber',
    'Tanggal Lamar',
    'Tahap Saat Ini',
    'Hasil Akhir',
    'Alasan Ditolak',
    'Tanggal Diterima',
    'No. HP',
    'Catatan',
    'Time to Hire (Hari)'
  ];
}

  const baseHeader = specialTna
    ? (rows[2] || [])
    : (rows[0] || []);

  const secondaryHeader = specialTna
    ? (rows[1] || [])
    : [];

  const count = Math.max(
    baseHeader.length,
    secondaryHeader.length
  );

  const headers = [];
  const used = new Set();

  for (let i = 0; i < count; i += 1) {
    let label = baseHeader[i];

    if (specialTna && i >= 7 && secondaryHeader[i]) {
      label = secondaryHeader[i];
    }

    if (
      label === null ||
      label === undefined ||
      String(label).trim() === ''
    ) {
      if (moduleKey === 'Data_Kebutuhan' && i === 1) {
        label = 'Departemen';
      } else if (moduleKey === 'Data_ATR' && i === 4) {
        label = 'Departemen';
      } else {
        label = `Kolom_${i + 1}`;
      }
    }

    let clean = String(label).trim();

    if (used.has(clean)) {
      clean = `${clean}_${i + 1}`;
    }

    used.add(clean);
    headers.push(clean);
  }

  return headers;
}


function parseWorkbookSheet(sheet, moduleKey) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });
  const specialTna = moduleKey === 'TNA_Plan' || moduleKey === 'TNA_Realisasi';
  const headers = makeHeaders(rows, moduleKey);
  const startAt = specialTna ? 3 : 1;
  const result = [];
  rows.slice(startAt).forEach((row, index) => {
    if (!row || !row.some((cell) => cell !== null && cell !== undefined && cell !== '')) return;
    const data = {};
    headers.forEach((header, colIndex) => {
      const value = row[colIndex];
      data[header] = value instanceof Date ? value.toISOString().slice(0, 10) : (value === undefined ? null : value);
    });
    result.push({ row_index: startAt + index + 1, data });
  });
  return result;
}

function Login({ onLogin, busy, error, appearance }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event) => {
    event.preventDefault();
    onLogin(username.trim(), password);
  };
  return (
    <main className="login-shell">
      <div className="login-tools"><ThemeDots appearance={appearance} /><ModeToggle appearance={appearance} /></div>
      <div className="login-card">
        <div className="login-brand">
  <img
    src="/logo-pt-rep.png"
    alt="Logo PT. Ryan Eka Pratama"
    className="login-logo"
  />
  <div>
    <strong>PT. RYAN EKA PRATAMA</strong>
    <span>SITE BONTANG</span>
  </div>
</div>
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow muted">SELAMAT DATANG KEMBALI</div><h2>Masuk ke dashboard</h2><p className="subtle">Gunakan username dan password yang diberikan administrator.</p>
          <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Masukkan username" autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary full" type="submit" disabled={busy}>{busy ? 'Memverifikasi...' : 'Masuk'} <span>→</span></button>
          <div className="login-security"><Icon name="lock" size={15}/> Akses terbatas untuk pengguna terdaftar</div>
        </form>
      </div>
      <div className="login-foot">INTERNAL MANAGEMENT SYSTEM • 2026</div>
    </main>
  );
}

function DataTablePage({ module, rows, loading, canWrite, onAdd, onEdit, onDelete, preset, onClearPreset }) {
  const [query, setQuery] = useState('');
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 20;

  useEffect(() => {
    setQuery('');
    setShowAllColumns(false);
    setCurrentPage(1);
  }, [module]);

  useEffect(() => { setCurrentPage(1); }, [preset]);

  
const columns = useMemo(() => {
  const dataColumns = rows.length
    ? Object.keys(rows[0].data || {})
    : [];

  const normalize = (value) =>
    String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const moduleName = normalize(module).replace(/[^a-z0-9]/g, '');

  const employeeColumnOrder = [
    'AMODI', 'NRP', 'NRPP', 'Nama', 'Jabatan',
    'Departemen', 'District', 'Perusahaan',
    'Status Karyawan', 'Tanggal Masuk', 'Awal Kontrak',
    'Akhir Kontrak', 'Keterangan', 'Tanggal Resign',
    'Jenis Resign', 'Tempat Lahir', 'Tanggal Lahir',
    'Jenis Kelamin', 'Status', 'Agama', 'Pendidikan',
    'Email', 'Gol. Darah', 'Alamat', 'Ibu', 'Istri',
    'Domisili', 'Ring', 'HP Istri', 'Kontak Darurat',
    'NIK', 'CP', 'NPWP', 'BPJS TK', 'BPJS Kes',
    'LV', 'Bus', 'P360', 'FMX420', 'FMX400',
    'PC210', 'PC350', 'D85', 'Simpol', 'Simper',
    'Authority', 'Escorting', 'HighRisk',
    'PowerTools', 'Foto'
  ];

  const contractOrder = [
    'AMODI', 'NRP', 'Nama', 'Jabatan', 'Departemen',
    'Awal Kontrak', 'Akhir Kontrak', 'Keterangan', 'Dicatat'
  ];

  const resignOrder = [
    'AMODI', 'NRP', 'Nama', 'Jabatan', 'Departemen',
    'Tanggal Masuk', 'Tanggal Resign', 'Jenis', 'Keterangan'
  ];

  const coachingOrder = [
    'AMODI', 'NRP', 'NAMA', 'JABATAN', 'DEPARTEMEN',
    'TANGGAL', 'JENIS PEMBINAAN', 'DESKRIPSI PELANGGARAN',
    'MASA BERLAKU', 'SISA PEMBINAAN', 'STATUS'
  ];

const tnaOrder = [
  'AMODI', 'NRP', 'NAMA', 'JABATAN', 'DEPARTMENT', 'PLAN',

  // LEGAL COMPLIANCE
  'Ahli K3 Umum',
  'Ahli K3 Kebakaran Kelas C (Regu Penanggulangan Kebakaran)',
  'Ahli K3 Kebakaran Kelas D (Petugas Peran Kebakaran)',
  'Ahli K3 Listrik',
  'Teknisi K3 Listrik',
  'Rigger (Juru Ikat)',
  'Auditor SMKP',
  'Juru Las',
  'AK3 Teknisi Pesawat Angkat Angkut',
  'HIMU',
  'Petugas P3K',
  'POP',
  'POM',
  'TIM TANGGAP DARURAT',

  // MANDATORY PROGRAM
  'DDT',
  'DRD',
  'Fatigue Awareness',
  'SHE Pertama',
  'SHE Pertama Plus',
  'High Risk',
  'Work Readiness',
  'Manual Handling',
  'LOTO',
  'Hand & Finger',
  'Power Tools',
  'Remove & Install Tyre',
  'Job Safety Analysis',
  'Training Simulator 7 Danger',
  'Instruktur Representative',
  'Pengelolaan Hidrocarbon',
  'PSMS Coaching',

  // PROGRAM INTERNAL
  'Sertifikasi BMC',
  'SERTIFIKASI OPERATOR DT',
  'SERTIFIKASI OPERATOR A2B',

];
const tnaRealisasiOrder = [
  'AMODI', 'NRP', 'NAMA', 'POSITION', 'DEPARTMENT',
  'AKTUAL',

  'Ahli K3 Umum',
  'Ahli K3 Kebakaran Kelas C (Regu Penanggulangan Kebakaran)',
  'Ahli K3 Kebakaran Kelas D (Petugas Peran Kebakaran)',
  'Ahli K3 Listrik',
  'Teknisi K3 Listrik',
  'Rigger (Juru Ikat)',
  'Auditor SMKP',
  'Juru Las',
  'AK3 Teknisi Pesawat Angkat Angkut',
  'HIMU',
  'Petugas P3K',
  'POP',
  'POM',
  'TIM TANGGAP DARURAT',

  'DDT',
  'DRD',
  'Fatigue Awareness',
  'SHE Pertama',
  'SHE Pertama Plus',
  'High Risk',
  'Work Readiness',
  'Manual Handling',
  'LOTO',
  'Hand & Finger',
  'Power Tools',
  'Remove & Install Tyre',
  'Job Safety Analysis',
  'Training Simulator 7 Danger',
  'Instruktur Representative',
  'Pengelolaan Hidrocarbon',
  'PSMS Coaching',

  'Sertifikasi BMC',
  'SERTIFIKASI OPERATOR DT',
  'SERTIFIKASI OPERATOR A2B',

  'Induksi Pasca Cuti 1',
  'Induksi Pasca Cuti 2',
  'Induksi Pasca Cuti 3'
];

  const competencyOrder = [
    'AMODI', 'NRP', 'NAMA', 'JABATAN', 'DEPARTEMEN',
    'Kategori', 'Kompetensi', 'No. Registrasi',
    'Tgl Sertifikat', 'Expired', 'Keterangan'
  ];

  const atrOrder = [
    'AMODI', 'NRP', 'Nama', 'Jabatan', 'DEPARTEMEN',
    'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN',
    'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES', 'YTD'
  ];

  // Mencari nama kolom asli tanpa membedakan huruf besar/kecil.
  // Nama kolom asli tetap dipakai agar data tidak hilang.
  const findColumn = (name) => {
    const aliases = {
  'amodi': ['AMODI', 'NRP AMODI'],
  'department': ['DEPARTMENT', 'DEPARTEMEN', 'DEPARTEMENT'],
  'departemen': ['DEPARTEMEN', 'DEPARTEMENT', 'DEPARTMENT'],
  'jenis': ['Jenis', 'Jenis Resign'],

  'induksi pasca cuti 1': [
    'Induksi Pasca Cuti (referensi, tidak dihitung)'
  ],
  'induksi pasca cuti 2': ['Kolom_26'],
  'induksi pasca cuti 3': ['Kolom_27']
};
    const candidates = aliases[normalize(name)] || [name];

    return dataColumns.find(col =>
      candidates.some(candidate =>
        normalize(col) === normalize(candidate)
      )
    );
  };

  const arrangeColumns = (order) => {
  const orderedColumns = order
    .map(findColumn)
    .filter((col, index, arr) =>
      col && arr.indexOf(col) === index
    );

  const remainingColumns = dataColumns.filter(
    col => !orderedColumns.includes(col)
  );

  const isTnaModule =
    moduleName.includes('tnaplan') ||
    moduleName.includes('tnarealisasi');

  return [
    ...orderedColumns,
    ...remainingColumns.filter(col =>
      !(isTnaModule && normalize(col) === 'no')
    )
  ];
};

  if (moduleName === 'datakaryawan') {
    return arrangeColumns(employeeColumnOrder);
  }

  if (moduleName.includes('kontrak')) {
    return arrangeColumns(contractOrder);
  }

  if (moduleName.includes('resign')) {
  return arrangeColumns(resignOrder);
}

if (
  moduleName === 'rekapsp' ||
  moduleName.includes('pembinaan') ||
  moduleName === 'sp'
) {
  return arrangeColumns(coachingOrder);
}

if (moduleName.includes('tnarealisasi')) {
  return arrangeColumns(tnaRealisasiOrder);
}

if (moduleName.includes('tnaplan')) {
  return arrangeColumns(tnaOrder);
}

if (moduleName.includes('kompetensi')) {
  return arrangeColumns(competencyOrder);
}

if (moduleName === 'atr' || moduleName === 'dataatr') {
  return arrangeColumns(atrOrder);
}
  const amodiColumn = findColumn('AMODI');

  return amodiColumn
    ? [amodiColumn, ...dataColumns.filter(col => col !== amodiColumn)]
    : dataColumns;
}, [rows, module]);

const visibleColumns = showAllColumns
  ? columns
  : columns.slice(0, 8);

  
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = preset ? rows.filter(row => preset.test(row.data || {})) : rows;

    if (!q) return base;

    return base.filter(row =>
      Object.entries(row.data || {}).some(([key, value]) =>
        `${key} ${displayValue(value, key)}`.toLowerCase().includes(q)
      )
    );
  }, [rows, query, preset]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize)
  );

  const safePage = Math.min(currentPage, totalPages);

  const startIndex = (safePage - 1) * pageSize;

  const pageRows = filtered.slice(
    startIndex,
    startIndex + pageSize
  );

  const pageNumbers = [
    ...new Set([
      1,
      safePage - 1,
      safePage,
      safePage + 1,
      totalPages
    ].filter(page => page >= 1 && page <= totalPages))
  ].sort((a, b) => a - b);

  const label = MODULES.find(x => x[0] === module)?.[1] || module;

  return (
    <div className="page-content">
      <div className="welcome-row module-title-row">
        <div>
          <div className="eyebrow muted">DATA MASTER / OPERASIONAL</div>
          <h1>{label}</h1>
          <p className="subtle">
            Kelola, cari, dan pantau catatan {label.toLowerCase()}.
          </p>
        </div>

        <div className="module-actions">
          {canWrite && (
            <button className="btn primary" onClick={onAdd}>
              <Icon name="plus" size={16}/> Tambah Data
            </button>
          )}
        </div>
      </div>

      {preset && (
        <div className="preset-chip">
          <span>Menampilkan: <strong>{preset.label}</strong></span>
          <button type="button" onClick={onClearPreset}>Tampilkan semua data</button>
        </div>
      )}

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="table-count">
            <strong>{filtered.length.toLocaleString('id-ID')}</strong>
            {' '}<span>baris data</span>
            <i/>
            <span className="sync-text">
              <span className="pulse"/> realtime aktif
            </span>
          </div>

          <div className="table-tools">
            <div className="search-box">
              <Icon name="search" size={16}/>
              <input
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari data..."
              />
            </div>

            <button
              className="btn light"
              onClick={() => setShowAllColumns(!showAllColumns)}
            >
              {showAllColumns ? 'Ringkas kolom' : 'Semua kolom'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"/>Memuat data...
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-chart-mark">
              <Icon name="grid" size={24}/>
            </div>
            <strong>Belum ada data pada menu ini</strong>
            <span>Admin perlu mengimpor file Excel sumber terlebih dahulu.</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map(col => (
  <th key={col} className="wrap-header">
  {col === 'NRP AMODI'
    ? 'AMODI'
    : col === 'Induksi Pasca Cuti (referensi, tidak dihitung)'
      ? 'Induksi Pasca Cuti 1'
      : col === 'Kolom_26'
        ? 'Induksi Pasca Cuti 2'
        : col === 'Kolom_27'
          ? 'Induksi Pasca Cuti 3'
          : col}
</th>
))}
                    {canWrite && <th className="action-head">AKSI</th>}
                  </tr>
                </thead>

    
<tbody>
  {pageRows.map(row => (
    <tr key={row.id}>
      {visibleColumns.map(col => (
        <td
          key={col}
          title={displayValue(row.data?.[col], col)}
          style={{
            textAlign:
              (module === 'Data_ATR' &&
                ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN',
                 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES', 'YTD']
                  .includes(col.toUpperCase()))
                ? 'center'
                : undefined
          }}
        >
          {displayValue(row.data?.[col], col)}
        </td>
      ))}

      {canWrite && (
        <td className="row-actions">
          <button title="Edit" onClick={() => onEdit(row)}>
            <Icon name="edit" size={15}/>
          </button>
          <button title="Hapus" onClick={() => onDelete(row)}>
            <Icon name="trash" size={15}/>
          </button>
        </td>
      )}
    </tr>
  ))}
</tbody>

              </table>

              {filtered.length === 0 && (
                <div className="no-results">
                  Tidak ada data yang cocok dengan pencarian.
                </div>
              )}
            </div>

            <div className="table-footer">
              Menampilkan {filtered.length === 0 ? 0 : startIndex + 1}
              {'–'}
              {Math.min(startIndex + pageSize, filtered.length)}
              {' '}dari {filtered.length.toLocaleString('id-ID')} baris
              <span>20 baris per halaman</span>
            </div>

            
            
            {filtered.length > 0 && (
              <div className="pagination">
                <button
                  className="btn light"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  &laquo; Sebelumnya
                </button>

                <div className="pagination-pages">
                  {pageNumbers.map((page, index) => (
                    <span className="pagination-item" key={page}>
                      {index > 0 && page - pageNumbers[index - 1] > 1 && (
                        <span className="pagination-dots">...</span>
                      )}

                      <button
                        className={`btn ${safePage === page ? 'primary' : 'light'}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </span>
                  ))}
                </div>

                <button
                  className="btn light"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Berikutnya &raquo;
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {!canWrite && (
        <div className="permission-note">
          <Icon name="lock" size={15}/>
          Anda memiliki akses baca. Hubungi administrator untuk mendapatkan hak edit.
        </div>
      )}
    </div>
  );
}


function RecordModal({ module, row, columns, canEditPrivate, onClose, onSave, busy }) {
  const [form, setForm] = useState(() => ({ ...(row?.data || {}) }));
  const [error, setError] = useState('');
  const isEmployee = module === 'Data_Karyawan';
  const fields = columns.length ? columns : Object.keys(form);
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const result = await onSave(form);
    if (result?.error) setError(result.error);
  };
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><form className="record-modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow muted">{row ? 'PERBARUI CATATAN' : 'CATATAN BARU'}</div><h2>{row ? 'Edit data' : 'Tambah data'}</h2></div><button type="button" className="icon-btn" onClick={onClose}><Icon name="close"/></button></div><div className="modal-fields">{fields.map(key=>{
    const privateField = isEmployee && fieldIsPrivate(key);
    if (privateField && !canEditPrivate) return null;
    const value = form[key];
    const parsedDate = excelSerialToDate(value);
    const isContractDate = /kontrak/i.test(key) && Boolean(parsedDate);
    const type = (DATE_FIELD.test(key) || isContractDate) && Boolean(parsedDate) ? 'date' : 'text';
    const multiline = typeof value === 'string' && value.length > 90 || /(alamat|deskripsi|catatan|tindakan|keterangan)/i.test(key);
    return <label className={multiline ? 'field-wide' : ''} key={key}><span>{key}{privateField && <em className="private-tag">PRIVAT</em>}</span>{multiline ? <textarea rows="3" value={value ?? ''} onChange={e=>change(key,e.target.value)} /> : <input type={type} value={type==='date' ? parsedDate : (value ?? '')} onChange={e=>change(key,e.target.value)} />}</label>;
  })}</div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn light" onClick={onClose}>Batal</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button></div></form></div>;
}

function AppUtama() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [activeNav, setActiveNav] = useState('dashboard');
  const [moduleFilter, setModuleFilter] = useState(null);
  const [inputRow, setInputRow] = useState(null);
  // nav menentukan menu sidebar yang menyala; bila tidak diberikan, dicari dari modulnya.
  const openModule = (key, filter = null, nav) => {
    setModuleFilter(filter);
    setActiveModule(key);
    setActiveNav(nav || filter?.nav || NAV.find(n => n.modules.includes(key))?.id || 'dashboard');
  };
  const [rows, setRows] = useState([]);
  const [overviewData, setOverviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const fileInputRef = React.useRef(null);
  const appearance = useAppearance();

  const isAdmin = profile?.role === 'admin';
  const canEditPrivate = ['admin','hr'].includes(profile?.role);
  const allowedModules = useMemo(() => isAdmin ? MODULES : MODULES.filter(m => permissions.some(p=>p.module_key===m[0] && p.can_read)), [isAdmin, permissions]);
  const canSee = item => item.id === 'dashboard' || (item.id === 'tes' ? canEditPrivate : item.id === 'input' ? (isAdmin || permissions.some(p => p.module_key === 'Data_Karyawan' && p.can_write)) : isAdmin || (item.perms || item.modules).some(k => permissions.some(p => p.module_key === k && p.can_read)));
  const visibleNav = NAV.filter(canSee);
  const lisensiBadge = useMemo(() => licenseExpiringPeople(overviewData, 30), [overviewData]);
  const curNav = NAV.find(n => n.id === activeNav);
  const activeCanWrite = isAdmin || permissions.some(p=>p.module_key===activeModule && p.can_write);
const exportAllData = async (selectedModules = []) => {
  if (!isAdmin || exportBusy) return;

  if (!selectedModules.length) {
    setNotice('Pilih minimal satu sheet untuk diunduh.');
    return;
  }

  setExportBusy(true);

  try {
    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set();

    for (const [moduleKey, moduleLabel] of MODULES) {
      if (!selectedModules.includes(moduleKey)) continue;

      let allRows = [];
      let offset = 0;
      let batch = [];

      do {
        const { data, error } = await supabase
          .from('app_data')
          .select('row_index,data')
          .eq('module', moduleKey)
          .order('row_index', { ascending: true })
          .range(offset, offset + 999);

        if (error) throw new Error(`${moduleLabel}: ${error.message}`);

        batch = data || [];
        allRows.push(...batch);
        offset += batch.length;
      } while (batch.length === 1000);

      const headers = [...new Set(
        allRows.flatMap(row => Object.keys(row.data || {}))
      )];

      const sheetRows = headers.length
        ? [
            headers,
            ...allRows.map(row =>
              headers.map(header => row.data?.[header] ?? '')
            )
          ]
        : [['Tidak ada data']];

      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

      let sheetName = String(moduleLabel || moduleKey)
        .replace(/[\\/?*[\]:]/g, ' ')
        .trim()
        .slice(0, 31) || 'Data';

      const baseName = sheetName;
      let suffix = 2;

      while (usedSheetNames.has(sheetName)) {
        const tail = `_${suffix++}`;
        sheetName = `${baseName.slice(0, 31 - tail.length)}${tail}`;
      }

      usedSheetNames.add(sheetName);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    XLSX.writeFile(
      workbook,
      `REP_Data_Terpilih_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    setNotice('Data terpilih berhasil diunduh.');
  } catch (error) {
    setNotice(`Gagal mengunduh data: ${error.message || 'Terjadi kesalahan.'}`);
  } finally {
    setExportBusy(false);
  }
};
  
  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); setPermissions([]); return; }
    const [{ data: prof }, { data: perms }] = await Promise.all([
      supabase.from('profiles').select('user_id,username,display_name,role').eq('user_id', user.id).maybeSingle(),
      supabase.from('module_permissions').select('module_key,can_read,can_write').eq('user_id', user.id)
    ]);
    setProfile(prof || { user_id: user.id, username: user.email?.split('@')[0] || 'user', display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Pengguna', role: 'viewer' });
    setPermissions(perms || []);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) setTimeout(() => loadProfile(nextSession.user), 0);
      else { setProfile(null); setPermissions([]); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  const loadOverview = useCallback(async () => {
    if (!session?.user) return;
    setOverviewLoading(true);
    let all = [];
    let from = 0;
    let failed = false;
    for (;;) {
      const { data, error } = await supabase.from('app_data').select('module,data').order('id', { ascending: true }).range(from, from + 999);
      if (error) { failed = true; break; }
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    if (!failed) setOverviewData(all);
    setOverviewLoading(false);
  }, [session]);

  
const loadModule = useCallback(async (moduleKey) => {
  if (!session?.user || moduleKey === 'Dashboard' || moduleKey === 'Settings' || moduleKey === 'Training' || moduleKey === 'Lisensi' || moduleKey === 'Tes' || moduleKey === 'Input') return;

  setLoading(true);

  const { data, error } = await supabase
    .from('app_data')
    .select('id,module,row_index,data,updated_at')
    .eq('module', moduleKey)
    .order('row_index', { ascending: true });

  if (error) {
    setNotice(`Gagal memuat data: ${error.message}`);
    setRows([]);
    setLoading(false);
    return;
  }

  setRows(data || []);
  setLoading(false);
}, [session]);


  useEffect(() => {
    if (!session?.user) return;
    loadOverview();
  }, [session, loadOverview]);

  useEffect(() => {
    if (activeModule !== 'Dashboard' && activeModule !== 'Settings') loadModule(activeModule);
  }, [activeModule, loadModule]);

  useEffect(() => {
    if (!session?.user) return;
    const channel = supabase.channel('rep-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_data' }, payload => {
        const changedModule = payload.new?.module || payload.old?.module;
        if (!changedModule) return;
        if (changedModule === activeModule) loadModule(activeModule);
        loadOverview();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_private_data' }, payload => {
        const changedModule = payload.new?.module || payload.old?.module;
        if (changedModule === activeModule) loadModule(activeModule);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, activeModule, loadModule, loadOverview]);

  const handleLogin = async (username, password) => {
    setAuthBusy(true); setAuthError('');
    const clean = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!clean || clean !== username.toLowerCase()) { setAuthError('Username hanya boleh menggunakan huruf, angka, titik, garis bawah, atau strip.'); setAuthBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: `${clean}@login.rep.local`, password });
    if (error) setAuthError('Username atau password tidak sesuai. Hubungi administrator bila akun belum aktif.');
    setAuthBusy(false);
  };

  const logout = async () => { await supabase.auth.signOut(); openModule('Dashboard'); setRows([]); };


const openImport = () => fileInputRef.current?.click();

const importWorkbook = async (file) => {
  if (!file || !isAdmin) return;

  setImportBusy(true);
  setImportStatus('Membaca workbook...');

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true
    });

    // Persiapkan dan validasi semua sheet sebelum mengubah database
    const preparedSheets = [];

    for (const moduleKey of MODULES.map(m => m[0])) {
      const sheet = workbook.Sheets[moduleKey];

      if (!sheet) continue;

      const parsed = parseWorkbookSheet(sheet, moduleKey);

      if (!parsed.length) {
        throw new Error(
          `${moduleKey}: tidak ditemukan data. Impor dibatalkan agar data lama aman.`
        );
      }

      preparedSheets.push({ moduleKey, parsed });
    }

    if (!preparedSheets.length) {
      throw new Error('Tidak ditemukan sheet yang cocok dengan modul aplikasi.');
    }

    let completed = 0;

    for (const { moduleKey, parsed } of preparedSheets) {
      setImportStatus(
        `Mengimpor ${MODULES.find(m => m[0] === moduleKey)?.[1] || moduleKey}...`
      );

      // Semua kolom disimpan langsung, tanpa pemisahan data privat
      const records = parsed.map(record => ({
        module: moduleKey,
        row_index: record.row_index,
        data: record.data
      }));

      // Simpan data baru terlebih dahulu
      for (let i = 0; i < records.length; i += 100) {
        const { error } = await supabase
          .from('app_data')
          .upsert(records.slice(i, i + 100), {
            onConflict: 'module,row_index'
          });

        if (error) {
          throw new Error(`${moduleKey}: ${error.message}`);
        }
      }

      // Setelah data baru berhasil disimpan, bersihkan baris lama
      const { data: existingRows, error: readError } = await supabase
        .from('app_data')
        .select('row_index')
        .eq('module', moduleKey);

      if (readError) {
        throw new Error(`${moduleKey}: gagal memeriksa data lama. ${readError.message}`);
      }

      const validIndexes = new Set(parsed.map(record => record.row_index));

      const staleIndexes = (existingRows || [])
        .map(row => row.row_index)
        .filter(index => !validIndexes.has(index));

      for (let i = 0; i < staleIndexes.length; i += 100) {
        const { error } = await supabase
          .from('app_data')
          .delete()
          .eq('module', moduleKey)
          .in('row_index', staleIndexes.slice(i, i + 100));

        if (error) {
          throw new Error(`${moduleKey}: gagal membersihkan baris lama. ${error.message}`);
        }
      }

      completed += 1;
    }

    setImportStatus(`Impor selesai. ${completed} sheet berhasil diproses.`);
    setNotice(`Impor workbook berhasil: ${completed} sheet diproses.`);

    await loadOverview();

    if (activeModule !== 'Dashboard' && activeModule !== 'Settings') {
      await loadModule(activeModule);
    }

  } catch (error) {
    setImportStatus(`Impor belum selesai: ${error.message}`);
    setNotice(`Impor gagal: ${error.message}`);
  } finally {
    setImportBusy(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
};

  const openAddModal = () => {
    if (activeModule === 'Data_Karyawan') { setInputRow(null); openModule('Input', null, 'input'); return; }
    const columns = rows.length ? Object.keys(rows[0].data || {}) : [];
    setModal({ row: null, columns });
  };
  const openEditModal = (row) => {
    if (activeModule === 'Data_Karyawan') { setInputRow(row); openModule('Input', null, 'input'); return; }
    setModal({ row, columns: Object.keys(row.data || {}) });
  };

  
const saveRecord = async (formData) => {
  setSaveBusy(true);

  try {
    const maxIndex = rows.reduce(
      (max, r) => Math.max(max, Number(r.row_index) || 0),
      0
    );

    const rowIndex = modal.row?.row_index ?? maxIndex + 1;

    if (modal.row) {
      const { error } = await supabase
        .from('app_data')
        .update({
          data: formData,
          updated_at: new Date().toISOString()
        })
        .eq('id', modal.row.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('app_data')
        .insert({
          module: activeModule,
          row_index: rowIndex,
          data: formData
        });

      if (error) throw error;
    }

    setModal(null);
    setNotice('Data berhasil disimpan.');

    await loadModule(activeModule);
    await loadOverview();

    return { ok: true };

  } catch (error) {
    return { error: error.message || 'Gagal menyimpan data.' };
  } finally {
    setSaveBusy(false);
  }
};

  const deleteRecord = async (row) => {
    if (!window.confirm('Hapus baris data ini? Tindakan ini tidak dapat dibatalkan.')) return;
    const { error } = await supabase.from('app_data').delete().eq('id', row.id);
    if (error) setNotice(`Gagal menghapus: ${error.message}`);
    else {
      if (activeModule === 'Data_Karyawan') await supabase.from('app_private_data').delete().eq('module', activeModule).eq('row_index', row.row_index);
      setNotice('Data berhasil dihapus.'); await loadModule(activeModule); await loadOverview();
    }
  };

  if (!isSupabaseConfigured) return <div className="setup-screen"><div className="setup-card"><div className="brand-mark">REP</div><div className="eyebrow muted">PENGATURAN AWAL</div><h1>Hubungkan database Supabase</h1><p>Salin file <code>.env.example</code> menjadi <code>.env</code>, lalu isi URL project dan anon key dari Supabase.</p><div className="setup-code">VITE_SUPABASE_URL=...<br/>VITE_SUPABASE_ANON_KEY=...</div><p className="subtle">Langkah lengkap tersedia di README.md pada paket aplikasi.</p></div></div>;

  if (!session) return <Login onLogin={handleLogin} busy={authBusy} error={authError} appearance={appearance}/>;
  if (!profile) return <div className="loading-screen"><div className="spinner"/>Menyiapkan akun...</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-brand">
  <img
  src="/logo-pt-rep.png"
  alt="Logo PT. Ryan Eka Pratama"
  className="brand-logo"
/>
  <div>
    <strong>PT. RYAN EKA PRATAMA</strong>
    <span>Site Bontang</span>
  </div>
</div>
      <nav className="main-nav">{visibleNav.map(item=>{
        const on = item.id === 'input' ? activeModule === 'Input' : activeModule !== 'Settings' && activeModule !== 'Input' && activeNav === item.id;
        return <button key={item.id} className={`nav-item ${on?'active':''}`} onClick={()=>item.id==='input' ? (setInputRow(null), openModule('Input', null, 'input')) : openModule(item.modules[0], item.preset||null, item.id)}><Icon name={item.icon}/><span>{item.label}</span>{item.id==='lisensi' && lisensiBadge>0 && <em className="nav-badge">{lisensiBadge}</em>}</button>;
      })}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${activeModule==='Settings'?'active':''}`} onClick={()=>setActiveModule('Settings')}><Icon name="settings"/><span>Pengaturan</span></button><div className="database-status"><span className="pulse"/><div><strong>Database online</strong><small>Realtime connected</small></div></div><div className="user-mini"><div className="avatar">{(profile.display_name||profile.username||'U').slice(0,1).toUpperCase()}</div><div className="user-mini-text"><strong>{profile.display_name || profile.username}</strong><small>{String(profile.role || 'viewer').toUpperCase()}</small></div><button title="Keluar" onClick={logout}><Icon name="logout" size={17}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>PT. RYAN EKA PRATAMA</span><b>/</b><strong>{activeModule==='Settings'?'Pengaturan':curNav?.label || activeModule}</strong></div><div className="topbar-right"><span className="secure-label"><Icon name="lock" size={14}/> INTERNAL</span>{activeModule!=='Settings' && <button className="icon-btn refresh-btn" title="Muat ulang" aria-label="Muat ulang" onClick={()=>['Dashboard','Training','Lisensi'].includes(activeModule)?loadOverview():loadModule(activeModule)}><Icon name="refresh" size={17}/></button>}<ModeToggle appearance={appearance}/><button className={`icon-btn ${activeModule==='Settings'?'active':''}`} title="Pengaturan" aria-label="Pengaturan" onClick={()=>setActiveModule('Settings')}><Icon name="settings" size={17}/></button><div className="top-avatar">{(profile.display_name||'U').slice(0,1).toUpperCase()}</div></div></header>
      {activeModule!=='Settings' && curNav?.modules.length>1 && !(PAGES[activeModule] && !moduleFilter?.raw) && <div className="module-tabs" role="tablist">{curNav.modules.filter(k=>k==='Training'||isAdmin||permissions.some(p=>p.module_key===k&&p.can_read)).map(k=><button key={k} type="button" role="tab" aria-selected={activeModule===k} className={`module-tab ${activeModule===k?'active':''}`} onClick={()=>openModule(k,null,curNav.id)}>{TAB_LABEL[k]||MODULES.find(m=>m[0]===k)?.[1]||k}</button>)}</div>}
      {activeModule==='Input' ? <InputData key={inputRow?.id||'new'} canPrivate={canEditPrivate} isAdmin={isAdmin} initialRow={inputRow} split={splitEmployeeRecord} toDate={excelSerialToDate} onImport={openImport} onSaved={loadOverview}/> : activeModule==='Settings' ? <SettingsPage appearance={appearance} isAdmin={isAdmin} profile={profile} onNotice={setNotice} onExportAll={exportAllData} exportBusy={exportBusy}/> : activeModule==='Tes' ? <TesHR data={overviewData}/> : activeModule==='Lisensi' ? <Lisensi data={overviewData} loading={overviewLoading} canWrite={isAdmin||permissions.some(p=>p.module_key==='Data_Karyawan'&&p.can_write)} preset={moduleFilter} onRefresh={loadOverview} onOpen={openModule}/> : activeModule==='Training' ? <Training data={overviewData} loading={overviewLoading} onRefresh={loadOverview} onOpen={openModule}/> : activeModule==='Dashboard' ? <Dashboard data={overviewData} loading={overviewLoading} hasData={overviewData.length>0} isAdmin={isAdmin} onImport={openImport} onRefresh={loadOverview} onOpen={openModule}/> : (PAGES[activeModule] && !moduleFilter?.raw) ? React.createElement(PAGES[activeModule], { data: overviewData, loading: overviewLoading, onRefresh: loadOverview, onOpen: openModule, onInput: () => { setInputRow(null); openModule('Input', null, 'input'); } }) : <DataTablePage module={activeModule} rows={rows} loading={loading} canWrite={activeCanWrite} onAdd={openAddModal} onEdit={openEditModal} onDelete={deleteRecord} preset={moduleFilter} onClearPreset={()=>setModuleFilter(null)}/>}
      <footer className="app-footer"><span>PT. RYAN EKA PRATAMA • SITE BONTANG</span><span>VERSI 1.1.0 <i/> PROTECTED WORKSPACE</span></footer>
    </main>
    <input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={e=>importWorkbook(e.target.files?.[0])}/>
    {importBusy && <div className="modal-backdrop"><div className="progress-modal"><div className="spinner"/><strong>Memproses workbook</strong><p>{importStatus}</p><small>Jangan tutup halaman selama proses impor berlangsung.</small></div></div>}
    {importStatus && !importBusy && <div className="import-status"><div><strong>Status impor</strong><span>{importStatus}</span></div><button onClick={()=>setImportStatus('')}><Icon name="close" size={15}/></button></div>}
    {modal && <RecordModal module={activeModule} row={modal.row} columns={modal.columns} canEditPrivate={canEditPrivate} onClose={()=>setModal(null)} onSave={saveRecord} busy={saveBusy}/>}
    {notice && <div className="toast"><span>{notice}</span><button onClick={()=>setNotice('')}><Icon name="close" size={14}/></button></div>}
  </div>;
}

// Halaman tes untuk kandidat (alamat /tes) dibuka tanpa login dan tanpa menu dashboard.
export default function App() {
  const untukKandidat = typeof window !== 'undefined' && /^\/tes\/?$/i.test(window.location.pathname);
  return untukKandidat ? <TesKandidat /> : <AppUtama />;
}
