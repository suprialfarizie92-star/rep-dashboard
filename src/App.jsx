import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { isSupabaseConfigured, supabase } from './supabase';

const MODULES = [
  ['Data_Karyawan', 'Data Karyawan', 'people'],
  ['Data_Kontrak', 'Data Kontrak', 'contract'],
  ['Data_Resign', 'Data Resign', 'exit'],
  ['REKAP_SP', 'Pembinaan / SP', 'discipline'],
  ['TNA_Plan', 'TNA Plan', 'training'],
  ['TNA_Realisasi', 'TNA Realisasi', 'training'],
  ['Data_Kompetensi', 'Data Kompetensi', 'certificate'],
  ['Data_Kebutuhan', 'Kebutuhan Tenaga Kerja', 'staffing'],
  ['Data_PICA', 'PICA', 'action'],
  ['Data_Rekrutmen', 'Rekrutmen', 'recruitment'],
  ['Data_ATR', 'ATR', 'attendance'],
  ['Data_Unit', 'Data Unit', 'truck'],
  ['Data_LV & Bus', 'Data LV & Bus', 'vehicle']
];

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
  const specialTna = moduleKey === 'TNA_Plan' || moduleKey === 'TNA_Realisasi';
  const baseHeader = specialTna ? (rows[2] || []) : (rows[0] || []);
  const secondaryHeader = specialTna ? (rows[1] || []) : [];
  const count = Math.max(baseHeader.length, secondaryHeader.length);
  const headers = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    let label = baseHeader[i];
    if (specialTna && i >= 7 && secondaryHeader[i]) label = secondaryHeader[i];
    if (label === null || label === undefined || String(label).trim() === '') {
      if (moduleKey === 'Data_Kebutuhan' && i === 1) label = 'Departemen';
      else if (moduleKey === 'Data_ATR' && i === 4) label = 'Departemen';
      else label = `Kolom_${i + 1}`;
    }
    let clean = String(label).trim();
    if (used.has(clean)) clean = `${clean}_${i + 1}`;
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

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    contract: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    exit: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    discipline: <><path d="M12 3 3 7v5c0 5 3.8 8 9 9 5.2-1 9-4 9-9V7z"/><path d="M12 8v5M12 16h.01"/></>,
    training: <><path d="m3 7 9-4 9 4-9 4zM5 9v6c4 3 10 3 14 0V9M21 7v7"/></>,
    certificate: <><circle cx="12" cy="8" r="5"/><path d="m8.5 12-1 9 4.5-2.5 4.5 2.5-1-9"/></>,
    staffing: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01"/></>,
    action: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    recruitment: <><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6"/></>,
    attendance: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    truck: <><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7z"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/></>,
    vehicle: <><path d="M5 16h14l-1.3-5.2A2 2 0 0 0 15.8 9H8.2a2 2 0 0 0-1.9 1.8z"/><path d="M3 16v3h2M21 16v3h-2M7 19h10"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    chart: <><path d="M3 3v18h18M8 16V9M13 16V5M18 16v-6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

function Login({ onLogin, busy, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event) => {
    event.preventDefault();
    onLogin(username.trim(), password);
  };
  return (
    <main className="login-shell">
      <div className="login-art">
        <div className="brand-lockup"><div className="brand-mark">REP</div><div><strong>PEOPLE & OPERATIONS</strong><span>INTEGRATED DASHBOARD</span></div></div>
        <div className="login-hero-copy"><div className="eyebrow">REPUBLIC ENGINEERING PARTNER</div><h1>Data terhubung.<br/><em>Keputusan lebih cepat.</em></h1><p>Portal terpusat untuk data karyawan, kompetensi, kontrak, rekrutmen, dan operasional REP.</p></div>
        <div className="login-foot">INTERNAL MANAGEMENT SYSTEM <span>•</span> 2026</div>
      </div>
      <div className="login-panel"><form className="login-form" onSubmit={submit}>
        <div className="mobile-brand">REP <span>PEOPLE & OPERATIONS</span></div>
        <div className="eyebrow muted">SELAMAT DATANG KEMBALI</div><h2>Masuk ke dashboard</h2><p className="subtle">Gunakan username dan password yang diberikan administrator.</p>
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Masukkan username" autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary full" type="submit" disabled={busy}>{busy ? 'Memverifikasi...' : 'Masuk'} <span>→</span></button>
        <div className="login-security"><Icon name="lock" size={15}/> Akses terbatas untuk pengguna terdaftar</div>
      </form></div>
    </main>
  );
}

function StatCard({ label, value, note, icon, tone = 'blue' }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon name={icon} size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}

function DashboardHome({ overview, loading, onOpenModule, isAdmin, onImport }) {
  const departments = overview.departments || [];
  const maxDept = Math.max(1, ...departments.map(x => x.count));
  return <div className="page-content">
    <div className="welcome-row"><div><div className="eyebrow muted">RINGKASAN MANAJEMEN</div><h1>Dashboard Overview</h1><p className="subtle">Pantau kondisi data SDM dan operasional dalam satu tampilan.</p></div><div className="live-pill"><span className="pulse"/> DATA LIVE</div></div>
    {!overview.hasData && <div className="import-banner"><div className="banner-icon"><Icon name="upload" size={20}/></div><div><strong>Data belum diimpor ke database</strong><p>Administrator dapat mengunggah file Data Karyawan REP 2026.xlsx untuk mengisi seluruh menu dashboard.</p></div>{isAdmin && <button className="btn primary" onClick={onImport}>Impor file Excel</button>}</div>}
    <div className="stats-grid">
      <StatCard label="Data Karyawan" value={loading ? '—' : overview.employees} note="Master data tercatat" icon="people" tone="blue"/>
      <StatCard label="Data Kontrak" value={loading ? '—' : overview.contracts} note="Riwayat kontrak" icon="contract" tone="purple"/>
      <StatCard label="Kompetensi" value={loading ? '—' : overview.competencies} note={`${overview.expiringCompetencies} akan kedaluwarsa ≤ 90 hari`} icon="certificate" tone="amber"/>
      <StatCard label="PICA Open" value={loading ? '—' : overview.openPica} note="Tindakan belum selesai" icon="action" tone="red"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel department-panel"><div className="panel-heading"><div><h3>Komposisi Karyawan</h3><p className="subtle">Berdasarkan departemen</p></div><button className="text-link" onClick={()=>onOpenModule('Data_Karyawan')}>Lihat data <span>→</span></button></div>
        {departments.length ? <div className="bar-list">{departments.slice(0,8).map(item=><div className="bar-row" key={item.name}><div className="bar-label"><span>{item.name || 'Tidak diketahui'}</span><b>{item.count}</b></div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(3,item.count/maxDept*100)}%`}}/></div></div>)}</div> : <div className="empty-chart"><div className="empty-chart-mark"><Icon name="chart" size={24}/></div><strong>Belum ada ringkasan</strong><span>Impor workbook untuk melihat komposisi karyawan.</span></div>}
      </section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h3>Akses Cepat</h3><p className="subtle">Menu kerja utama</p></div></div><div className="quick-grid">{[['Data_Karyawan','Data Karyawan','people'],['Data_Kontrak','Data Kontrak','contract'],['Data_Kompetensi','Kompetensi','certificate'],['Data_Rekrutmen','Rekrutmen','recruitment'],['Data_PICA','PICA','action'],['Data_Unit','Data Unit','truck']].map(([key,label,icon])=><button className="quick-item" key={key} onClick={()=>onOpenModule(key)}><span className="quick-icon"><Icon name={icon}/></span><span>{label}</span><b>↗</b></button>)}</div></section>
    </div>
    <div className="bottom-strip"><div className="strip-left"><span className="strip-indicator"/><div><strong>Sinkronisasi database aktif</strong><p>Perubahan data akan diperbarui otomatis pada komputer lain yang sedang membuka dashboard.</p></div></div><span className="strip-caption">SUPABASE REALTIME</span></div>
  </div>;
}

function DataTablePage({ module, rows, loading, canWrite, onAdd, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const [showAllColumns, setShowAllColumns] = useState(false);
  useEffect(() => { setQuery(''); setShowAllColumns(false); }, [module]);
  const columns = useMemo(() => rows.length ? Object.keys(rows[0].data || {}) : [], [rows]);
  const visibleColumns = showAllColumns ? columns : columns.slice(0, 8);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => Object.entries(row.data || {}).some(([key,value]) => `${key} ${displayValue(value,key)}`.toLowerCase().includes(q)));
  }, [rows, query]);
  const label = MODULES.find(x=>x[0]===module)?.[1] || module;
  return <div className="page-content">
    <div className="welcome-row module-title-row"><div><div className="eyebrow muted">DATA MASTER / OPERASIONAL</div><h1>{label}</h1><p className="subtle">Kelola, cari, dan pantau catatan {label.toLowerCase()}.</p></div><div className="module-actions">{canWrite && <button className="btn primary" onClick={onAdd}><Icon name="plus" size={16}/> Tambah Data</button>}</div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="table-count"><strong>{filtered.length.toLocaleString('id-ID')}</strong> <span>baris data</span><i/> <span className="sync-text"><span className="pulse"/> realtime aktif</span></div><div className="table-tools"><div className="search-box"><Icon name="search" size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari data..." /></div><button className="btn light" onClick={()=>setShowAllColumns(!showAllColumns)}>{showAllColumns ? 'Ringkas kolom' : 'Semua kolom'}</button></div></div>
      {loading ? <div className="loading-state"><div className="spinner"/>Memuat data...</div> : rows.length === 0 ? <div className="empty-state"><div className="empty-chart-mark"><Icon name="grid" size={24}/></div><strong>Belum ada data pada menu ini</strong><span>Admin perlu mengimpor file Excel sumber terlebih dahulu.</span></div> : <div className="table-scroll"><table><thead><tr>{visibleColumns.map(col=><th key={col}>{col}</th>)}{canWrite && <th className="action-head">AKSI</th>}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}>{visibleColumns.map(col=><td key={col} title={displayValue(row.data?.[col],col)}>{displayValue(row.data?.[col],col)}</td>)}{canWrite && <td className="row-actions"><button title="Edit" onClick={()=>onEdit(row)}><Icon name="edit" size={15}/></button><button title="Hapus" onClick={()=>onDelete(row)}><Icon name="trash" size={15}/></button></td>}</tr>)}</tbody></table>{filtered.length===0 && <div className="no-results">Tidak ada data yang cocok dengan pencarian.</div>}</div>}
      {rows.length>0 && <div className="table-footer">Menampilkan {filtered.length.toLocaleString('id-ID')} dari {rows.length.toLocaleString('id-ID')} baris <span>Perubahan tersinkron otomatis</span></div>}
    </section>
    {!canWrite && <div className="permission-note"><Icon name="lock" size={15}/> Anda memiliki akses baca. Hubungi administrator untuk mendapatkan hak edit.</div>}
  </div>;
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

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [rows, setRows] = useState([]);
  const [overviewData, setOverviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = React.useRef(null);

  const isAdmin = profile?.role === 'admin';
  const canEditPrivate = ['admin','hr'].includes(profile?.role);
  const allowedModules = useMemo(() => isAdmin ? MODULES : MODULES.filter(m => permissions.some(p=>p.module_key===m[0] && p.can_read)), [isAdmin, permissions]);
  const activeCanWrite = isAdmin || permissions.some(p=>p.module_key===activeModule && p.can_write);

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
    const { data, error } = await supabase.from('app_data').select('module,data');
    if (!error) setOverviewData(data || []);
    setOverviewLoading(false);
  }, [session]);

  const loadModule = useCallback(async (moduleKey) => {
    if (!session?.user || moduleKey === 'Dashboard') return;
    setLoading(true);
    const { data, error } = await supabase.from('app_data').select('id,module,row_index,data,updated_at').eq('module', moduleKey).order('row_index', { ascending: true });
    if (error) { setNotice(`Gagal memuat data: ${error.message}`); setRows([]); setLoading(false); return; }
    let merged = data || [];
    if (moduleKey === 'Data_Karyawan' && canEditPrivate) {
      const { data: privateRows, error: privateError } = await supabase.from('app_private_data').select('row_index,data').eq('module', moduleKey);
      if (!privateError && privateRows?.length) {
        const privateMap = new Map(privateRows.map(r=>[r.row_index,r.data]));
        merged = merged.map(r=>({ ...r, data: { ...(r.data || {}), ...(privateMap.get(r.row_index) || {}) } }));
      }
    }
    setRows(merged);
    setLoading(false);
  }, [session, canEditPrivate]);

  useEffect(() => {
    if (!session?.user) return;
    loadOverview();
  }, [session, loadOverview]);

  useEffect(() => {
    if (activeModule !== 'Dashboard') loadModule(activeModule);
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

  const logout = async () => { await supabase.auth.signOut(); setActiveModule('Dashboard'); setRows([]); };

  const overview = useMemo(() => {
    const grouped = new Map();
    const moduleRows = (name) => overviewData.filter(r=>r.module===name).map(r=>r.data || {});
    const employees = moduleRows('Data_Karyawan');
    employees.forEach(person=>{
      const dept = person.Departemen || person.Department || 'Tidak diketahui';
      grouped.set(dept, (grouped.get(dept) || 0) + 1);
    });
    const competency = moduleRows('Data_Kompetensi');
    const today = new Date(); today.setHours(0,0,0,0);
    const limit = new Date(today.getTime() + 90*86400000);
    const expiring = competency.filter(r=>{
      const dateValue = r.Expired;
      const iso = excelSerialToDate(dateValue);
      if (!iso) return false;
      const date = new Date(`${iso}T00:00:00`);
      return date >= today && date <= limit;
    }).length;
    const pica = moduleRows('Data_PICA');
    const openPica = pica.filter(r=>!/(closed|close|selesai|complete|completed)/i.test(String(r.Status || ''))).length;
    const contracts = moduleRows('Data_Kontrak');
    return {
      hasData: overviewData.length > 0,
      employees: employees.length,
      contracts: contracts.length,
      competencies: competency.length,
      expiringCompetencies: expiring,
      openPica,
      departments: [...grouped.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
    };
  }, [overviewData]);

  const openImport = () => fileInputRef.current?.click();
  const importWorkbook = async (file) => {
    if (!file || !isAdmin) return;
    setImportBusy(true); setImportStatus('Membaca workbook...');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const expected = MODULES.map(m=>m[0]);
      let completed = 0;
      for (const moduleKey of expected) {
        const sheet = workbook.Sheets[moduleKey];
        if (!sheet) continue;
        const parsed = parseWorkbookSheet(sheet, moduleKey);
        setImportStatus(`Mengimpor ${MODULES.find(m=>m[0]===moduleKey)?.[1] || moduleKey}...`);
        const { error: deleteError } = await supabase.from('app_data').delete().eq('module', moduleKey);
        if (deleteError) throw new Error(`${moduleKey}: ${deleteError.message}`);
        if (moduleKey === 'Data_Karyawan') {
          const { error: privateDeleteError } = await supabase.from('app_private_data').delete().eq('module', moduleKey);
          if (privateDeleteError) throw new Error(`Data privat: ${privateDeleteError.message}`);
        }
        const publicRecords = [];
        const privateRecords = [];
        parsed.forEach(record=>{
          if (moduleKey === 'Data_Karyawan') {
            const split = splitEmployeeRecord(record.data);
            publicRecords.push({ module: moduleKey, row_index: record.row_index, data: split.publicData });
            if (Object.keys(split.privateData).length) privateRecords.push({ module: moduleKey, row_index: record.row_index, data: split.privateData });
          } else {
            publicRecords.push({ module: moduleKey, row_index: record.row_index, data: record.data });
          }
        });
        for (let i=0; i<publicRecords.length; i+=100) {
          const { error } = await supabase.from('app_data').upsert(publicRecords.slice(i,i+100), { onConflict: 'module,row_index' });
          if (error) throw new Error(`${moduleKey}: ${error.message}`);
        }
        for (let i=0; i<privateRecords.length; i+=100) {
          const { error } = await supabase.from('app_private_data').upsert(privateRecords.slice(i,i+100), { onConflict: 'module,row_index' });
          if (error) throw new Error(`Data privat ${moduleKey}: ${error.message}`);
        }
        completed += 1;
      }
      setImportStatus(`Impor selesai. ${completed} sheet berhasil diproses.`);
      setNotice(`Impor workbook berhasil: ${completed} sheet diproses.`);
      await loadOverview();
      if (activeModule !== 'Dashboard') await loadModule(activeModule);
    } catch (error) {
      setImportStatus(`Impor belum selesai: ${error.message}`);
      setNotice(`Impor gagal: ${error.message}`);
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openAddModal = () => {
    const columns = rows.length ? Object.keys(rows[0].data || {}) : [];
    setModal({ row: null, columns });
  };
  const openEditModal = (row) => setModal({ row, columns: Object.keys(row.data || {}) });

  const saveRecord = async (formData) => {
    setSaveBusy(true);
    try {
      const maxIndex = rows.reduce((max,r)=>Math.max(max, Number(r.row_index)||0), 0);
      const rowIndex = modal.row?.row_index ?? maxIndex + 1;
      let publicData = formData;
      let privateData = null;
      if (activeModule === 'Data_Karyawan') {
        const split = splitEmployeeRecord(formData);
        publicData = split.publicData;
        privateData = split.privateData;
      }
      if (modal.row) {
        const { error } = await supabase.from('app_data').update({ data: publicData, updated_at: new Date().toISOString() }).eq('id', modal.row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('app_data').insert({ module: activeModule, row_index: rowIndex, data: publicData });
        if (error) throw error;
      }
      if (privateData && canEditPrivate && Object.keys(privateData).length) {
        const { error } = await supabase.from('app_private_data').upsert({ module: activeModule, row_index: rowIndex, data: privateData }, { onConflict: 'module,row_index' });
        if (error) throw error;
      }
      setModal(null); setNotice('Data berhasil disimpan dan disinkronkan.');
      await loadModule(activeModule); await loadOverview();
      return { ok: true };
    } catch (error) {
      return { error: error.message || 'Gagal menyimpan data.' };
    } finally { setSaveBusy(false); }
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

  if (!session) return <Login onLogin={handleLogin} busy={authBusy} error={authError}/>;
  if (!profile) return <div className="loading-screen"><div className="spinner"/>Menyiapkan akun...</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark">REP</div><div><strong>PEOPLE & OPS</strong><span>MANAGEMENT HUB</span></div></div>
      <div className="nav-caption">WORKSPACE</div><button className={`nav-item ${activeModule==='Dashboard'?'active':''}`} onClick={()=>setActiveModule('Dashboard')}><Icon name="grid"/><span>Dashboard</span></button>
      <div className="nav-caption menu-caption">DATA & MONITORING</div><nav className="main-nav">{allowedModules.map(([key,label,icon])=><button key={key} className={`nav-item ${activeModule===key?'active':''}`} onClick={()=>setActiveModule(key)}><Icon name={icon}/><span>{label}</span><b>›</b></button>)}</nav>
      <div className="sidebar-bottom"><div className="database-status"><span className="pulse"/><div><strong>Database online</strong><small>Realtime connected</small></div></div><div className="user-mini"><div className="avatar">{(profile.display_name||profile.username||'U').slice(0,1).toUpperCase()}</div><div className="user-mini-text"><strong>{profile.display_name || profile.username}</strong><small>{String(profile.role || 'viewer').toUpperCase()}</small></div><button title="Keluar" onClick={logout}><Icon name="logout" size={17}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>REP PORTAL</span><b>/</b><strong>{activeModule==='Dashboard'?'Overview':MODULES.find(x=>x[0]===activeModule)?.[1] || activeModule}</strong></div><div className="topbar-right"><span className="secure-label"><Icon name="lock" size={14}/> INTERNAL</span><button className="icon-btn refresh-btn" title="Muat ulang" onClick={()=>activeModule==='Dashboard'?loadOverview():loadModule(activeModule)}><Icon name="refresh" size={17}/></button><div className="top-avatar">{(profile.display_name||'U').slice(0,1).toUpperCase()}</div></div></header>
      {activeModule==='Dashboard' ? <DashboardHome overview={overview} loading={overviewLoading} onOpenModule={setActiveModule} isAdmin={isAdmin} onImport={openImport}/> : <DataTablePage module={activeModule} rows={rows} loading={loading} canWrite={activeCanWrite} onAdd={openAddModal} onEdit={openEditModal} onDelete={deleteRecord}/>}
      <footer className="app-footer"><span>REP PEOPLE & OPERATIONS DASHBOARD</span><span>VERSI 1.0.0 <i/> PROTECTED WORKSPACE</span></footer>
    </main>
    <input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={e=>importWorkbook(e.target.files?.[0])}/>
    {importBusy && <div className="modal-backdrop"><div className="progress-modal"><div className="spinner"/><strong>Memproses workbook</strong><p>{importStatus}</p><small>Jangan tutup halaman selama proses impor berlangsung.</small></div></div>}
    {importStatus && !importBusy && <div className="import-status"><div><strong>Status impor</strong><span>{importStatus}</span></div><button onClick={()=>setImportStatus('')}><Icon name="close" size={15}/></button></div>}
    {modal && <RecordModal module={activeModule} row={modal.row} columns={modal.columns} canEditPrivate={canEditPrivate} onClose={()=>setModal(null)} onSave={saveRecord} busy={saveBusy}/>}
    {notice && <div className="toast"><span>{notice}</span><button onClick={()=>setNotice('')}><Icon name="close" size={14}/></button></div>}
  </div>;
}
