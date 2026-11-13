import React, { useCallback, useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { MODULES } from './modules.js';
import { createIsolatedClient, supabase } from './supabase';
import { FONT_SIZES, MODES, THEMES } from './appearance.jsx';

const ROLES = [
  { key: 'viewer', name: 'Viewer', hint: 'Hanya melihat data sesuai akses menu.' },
  { key: 'editor', name: 'Editor', hint: 'Melihat dan mengubah data sesuai akses menu.' },
  { key: 'hr', name: 'HR', hint: 'Seperti Editor, ditambah akses ke data pribadi karyawan.' },
  { key: 'admin', name: 'Admin', hint: 'Akses penuh ke semua menu, impor Excel, dan pengelolaan akun.' }
];

const emptyPerms = () => Object.fromEntries(MODULES.map(([key]) => [key, { read: false, write: false }]));

function translateAuthError(message = '') {
  const text = message.toLowerCase();
  if (text.includes('already registered')) return 'Username sudah dipakai akun lain.';
  if (text.includes('at least')) return 'Password terlalu pendek. Gunakan minimal 6 karakter.';
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) return 'Pendaftaran akun baru dimatikan di Supabase. Aktifkan "Allow new users to sign up" di Authentication, lalu coba lagi.';
  if (text.includes('rate limit')) return 'Terlalu banyak permintaan. Tunggu beberapa menit, lalu coba lagi.';
  return message || 'Akun belum dapat dibuat.';
}

/* ---------- Tampilan ---------- */

function AppearanceSettings({ appearance }) {
  const { prefs, setTheme, setMode, setFont, reset } = appearance;
  return (
    <div className="settings-stack">
      <section className="panel setting-block">
        <h3>Mode tampilan</h3>
        <p className="subtle">Pilih terang untuk ruangan yang cerah, gelap untuk malam hari, atau biarkan mengikuti pengaturan perangkat.</p>
        <div className="seg" role="group" aria-label="Mode tampilan">
          {MODES.map(m => (
            <button type="button" key={m.key} aria-pressed={prefs.mode === m.key} onClick={() => setMode(m.key)}>
              <Icon name={m.icon} size={16} /> {m.name}
            </button>
          ))}
        </div>
      </section>

      <section className="panel setting-block">
        <h3>Tema warna</h3>
        <p className="subtle">Warna aksen, sidebar, tombol, dan grafik mengikuti tema yang dipilih.</p>
        <div className="swatch-grid" role="group" aria-label="Tema warna">
          {THEMES.map(t => (
            <button type="button" key={t.key} data-theme={t.key} className="swatch" aria-pressed={prefs.theme === t.key} onClick={() => setTheme(t.key)}>
              <span className="swatch-preview"><span className="sw-side" /><span className="sw-main"><i /><i /><i /></span></span>
              <span className="swatch-name">{t.name}{prefs.theme === t.key && <Icon name="check" size={15} />}</span>
              <span className="swatch-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel setting-block">
        <h3>Ukuran huruf</h3>
        <p className="subtle">Berlaku untuk seluruh teks di dashboard, termasuk tabel data.</p>
        <div className="font-grid" role="group" aria-label="Ukuran huruf">
          {FONT_SIZES.map(f => (
            <button type="button" key={f.key} className="font-opt" aria-pressed={prefs.font === f.key} onClick={() => setFont(f.key)}>
              <span className="aa" style={{ '--aa': f.aa }}>Aa</span>
              <strong>{f.name}</strong>
              <small>{f.hint}</small>
            </button>
          ))}
        </div>
        <div className="font-preview">
          <strong>Contoh tampilan teks</strong>
          <p>Karyawan aktif 1.248 orang. Sebanyak 37 sertifikat kompetensi akan kedaluwarsa dalam 90 hari ke depan.</p>
        </div>
      </section>

      <div className="settings-actions">
        <span className="subtle" style={{ margin: 'auto auto auto 0' }}>Pilihan tersimpan di browser ini dan langsung berlaku.</span>
        <button type="button" className="btn light" onClick={reset}>Kembalikan ke bawaan</button>
      </div>
    </div>
  );
}

/* ---------- Akun ---------- */

function PermissionMatrix({ perms, onChange }) {
  const patch = (key, next) => onChange({ ...perms, [key]: { ...perms[key], ...next } });
  const setRead = (key, on) => patch(key, on ? { read: true } : { read: false, write: false });
  const setWrite = (key, on) => patch(key, on ? { read: true, write: true } : { write: false });
  const setAll = (read) => onChange(Object.fromEntries(MODULES.map(([key]) => [key, { read, write: false }])));
  return (
    <div className="perm-box">
      <div className="perm-head">
        <span>Hak akses menu</span>
        <span>
          <button type="button" onClick={() => setAll(true)}>Semua bisa dilihat</button>
          {' · '}
          <button type="button" onClick={() => setAll(false)}>Kosongkan</button>
        </span>
      </div>
      <div className="perm-row cols"><span>MENU</span><span>LIHAT</span><span>UBAH</span></div>
      {MODULES.map(([key, label]) => (
        <div className="perm-row" key={key}>
          <span>{label}</span>
          <label><input type="checkbox" aria-label={`Lihat ${label}`} checked={!!perms[key]?.read} onChange={e => setRead(key, e.target.checked)} /></label>
          <label><input type="checkbox" aria-label={`Ubah ${label}`} checked={!!perms[key]?.write} onChange={e => setWrite(key, e.target.checked)} /></label>
        </div>
      ))}
    </div>
  );
}

async function savePermissions(userId, perms) {
  const rows = MODULES.map(([key]) => {
    const write = !!perms[key]?.write;
    return { user_id: userId, module_key: key, can_read: write || !!perms[key]?.read, can_write: write };
  });
  const { error } = await supabase.from('module_permissions').upsert(rows, { onConflict: 'user_id,module_key' });
  if (error) throw error;
}

function EditAccessModal({ account, isSelf, onClose, onSaved }) {
  const [role, setRole] = useState(account.role);
  const [perms, setPerms] = useState(account.perms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { error: roleError } = await supabase.from('profiles').update({ role }).eq('user_id', account.user_id);
      if (roleError) throw roleError;
      if (role !== 'admin') await savePermissions(account.user_id, perms);
      onSaved(`Akses ${account.username} diperbarui.`);
    } catch (err) {
      setError(err.message || 'Perubahan belum tersimpan.');
    } finally { setBusy(false); }
  };
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="record-modal" onSubmit={save}>
        <div className="modal-head">
          <div><div className="eyebrow muted">ATUR AKSES</div><h2>{account.display_name || account.username}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <label className="field">
            <span>Peran</span>
            <select value={role} disabled={isSelf} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <small>{isSelf ? 'Peran akun Anda sendiri tidak dapat diubah dari sini.' : ROLES.find(r => r.key === role)?.hint}</small>
          </label>
          {role === 'admin'
            ? <div className="perm-box"><div className="perm-note">Admin otomatis dapat melihat dan mengubah semua menu.</div></div>
            : <PermissionMatrix perms={perms} onChange={setPerms} />}
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn light" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan akses'}</button>
        </div>
      </form>
    </div>
  );
}

const blankForm = () => ({ displayName: '', username: '', password: '', role: 'viewer', perms: emptyPerms() });

function AccountSettings({ profile, onNotice }) {
  const [accounts, setAccounts] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [form, setForm] = useState(blankForm);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [editing, setEditing] = useState(null);

  const loadAccounts = useCallback(async () => {
    setListLoading(true); setListError('');
    const [profilesRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('user_id,username,display_name,role,created_at').order('created_at', { ascending: true }),
      supabase.from('module_permissions').select('user_id,module_key,can_read,can_write')
    ]);
    if (profilesRes.error || permsRes.error) {
      setListError((profilesRes.error || permsRes.error).message);
      setListLoading(false);
      return;
    }
    const permsByUser = new Map();
    (permsRes.data || []).forEach(p => {
      if (!permsByUser.has(p.user_id)) permsByUser.set(p.user_id, emptyPerms());
      permsByUser.get(p.user_id)[p.module_key] = { read: p.can_read, write: p.can_write };
    });
    setAccounts((profilesRes.data || []).map(p => ({ ...p, perms: permsByUser.get(p.user_id) || emptyPerms() })));
    setListLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const change = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setWarning('');
    const username = form.username.trim().toLowerCase();
    const displayName = form.displayName.trim() || username;
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) { setError('Username 3–30 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.'); return; }
    if (form.password.length < 6) { setError('Password minimal 6 karakter.'); return; }
    if (accounts.some(a => a.username === username)) { setError('Username sudah dipakai akun lain.'); return; }
    setBusy(true);
    try {
      const temp = createIsolatedClient();
      const { data, error: signUpError } = await temp.auth.signUp({
        email: `${username}@login.rep.local`,
        password: form.password,
        options: { data: { username, display_name: displayName } }
      });
      if (signUpError) throw new Error(translateAuthError(signUpError.message));
      const user = data?.user;
      if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) throw new Error('Username sudah dipakai akun lain.');

      const { error: profileError } = await supabase.from('profiles').upsert(
        { user_id: user.id, username, display_name: displayName, role: form.role },
        { onConflict: 'user_id' }
      );
      if (profileError) throw profileError;
      if (form.role !== 'admin') await savePermissions(user.id, form.perms);

      if (!data.session) setWarning(`Akun ${username} dibuat, tetapi Supabase masih meminta konfirmasi email. Matikan "Confirm email" di Authentication → Providers → Email agar akun ini bisa langsung masuk.`);
      onNotice(`Akun ${username} berhasil dibuat.`);
      setForm(blankForm());
      await loadAccounts();
    } catch (err) {
      setError(err.message || 'Akun belum dapat dibuat.');
    } finally { setBusy(false); }
  };

  const countMenus = (a) => a.role === 'admin' ? 'Semua menu' : `${MODULES.filter(([key]) => a.perms[key]?.read).length} menu`;

  return (
    <div className="account-layout">
      <section className="panel setting-block">
        <h3>Tambah akun</h3>
        <p className="subtle">Pengguna masuk dengan username dan password di bawah ini. Bagikan password sementara secara aman.</p>
        <form onSubmit={submit}>
          <div className="field-grid">
            <label className="field"><span>Nama lengkap</span><input value={form.displayName} onChange={e => change('displayName', e.target.value)} placeholder="Contoh: Andi Pratama" autoComplete="off" /></label>
            <label className="field"><span>Username</span><input value={form.username} onChange={e => change('username', e.target.value)} placeholder="Contoh: andi" autoComplete="off" required /><small>Huruf kecil, angka, titik, garis bawah, atau strip.</small></label>
            <label className="field">
              <span>Password sementara</span>
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => change('password', e.target.value)} placeholder="Minimal 6 karakter" autoComplete="new-password" required />
              <small><button type="button" className="text-link" style={{ padding: 0 }} onClick={() => setShowPassword(s => !s)}>{showPassword ? 'Sembunyikan password' : 'Tampilkan password'}</button></small>
            </label>
            <label className="field">
              <span>Peran</span>
              <select value={form.role} onChange={e => change('role', e.target.value)}>{ROLES.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
              <small>{ROLES.find(r => r.key === form.role)?.hint}</small>
            </label>
          </div>
          {form.role === 'admin'
            ? <div className="perm-box"><div className="perm-note">Admin otomatis dapat melihat dan mengubah semua menu.</div></div>
            : <PermissionMatrix perms={form.perms} onChange={perms => change('perms', perms)} />}
          {error && <div className="form-error" role="alert">{error}</div>}
          {warning && <div className="form-error" role="status">{warning}</div>}
          <div className="settings-actions" style={{ marginTop: 18 }}>
            <button type="submit" className="btn primary" disabled={busy}><Icon name="userplus" size={16} /> {busy ? 'Membuat akun...' : 'Buat akun'}</button>
          </div>
        </form>
      </section>

      <section className="panel setting-block">
        <h3>Akun terdaftar</h3>
        <p className="subtle">{listLoading ? 'Memuat akun...' : `${accounts.length} akun`}</p>
        {listError && <div className="form-error">Daftar akun belum dapat dimuat: {listError}</div>}
        <div className="account-list">
          {accounts.map(a => (
            <div className="account-item" key={a.user_id}>
              <div className="avatar">{(a.display_name || a.username || 'U').slice(0, 1).toUpperCase()}</div>
              <div className="account-meta"><strong>{a.display_name || a.username}</strong><small>{a.username} · {countMenus(a)}</small></div>
              <span className="role-badge" data-role={a.role}>{a.role.toUpperCase()}</span>
              <button type="button" className="icon-btn" title="Atur akses" aria-label={`Atur akses ${a.username}`} onClick={() => setEditing(a)}><Icon name="edit" size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <EditAccessModal
          account={editing}
          isSelf={editing.user_id === profile?.user_id}
          onClose={() => setEditing(null)}
          onSaved={async (message) => { setEditing(null); onNotice(message); await loadAccounts(); }}
        />
      )}
    </div>
  );
}

/* ---------- Halaman ---------- */

export default function SettingsPage({ appearance, isAdmin, profile, onNotice, onExportAll, exportBusy }) {
  const [tab, setTab] = useState('appearance');

  const [selectedExportModules, setSelectedExportModules] = useState(
    () => MODULES.map(([key]) => key)
  );

  // Kode berikutnya tetap seperti semula
  return (
    <div className="page-content">
      <div className="welcome-row">
        <div>
          <div className="eyebrow muted">PREFERENSI</div>
          <h1>Pengaturan</h1>
          <p className="subtle">Atur tampilan dashboard{isAdmin ? ' dan kelola akun pengguna' : ''}.</p>
        </div>
            </div>
      <div className="settings-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'appearance'}
          className={`settings-tab ${tab === 'appearance' ? 'active' : ''}`}
          onClick={() => setTab('appearance')}
        >
          <Icon name="palette" size={16} /> Tampilan
        </button>

        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'export'}
            className={`settings-tab ${tab === 'export' ? 'active' : ''}`}
            onClick={() => setTab('export')}
          >
            <Icon name="download" size={16} /> Unduh Data
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'accounts'}
            className={`settings-tab ${tab === 'accounts' ? 'active' : ''}`}
            onClick={() => setTab('accounts')}
          >
            <Icon name="userplus" size={16} /> Akun pengguna
          </button>
        )}
      </div>

            {tab === 'appearance' || !isAdmin ? (
        <AppearanceSettings appearance={appearance} />
      ) : tab === 'export' ? (
        <section className="panel setting-block">
          <h3>Unduh Data Excel</h3>

          <p className="subtle">
            Pilih menu yang ingin dimasukkan ke dalam file Excel.
            Setiap menu akan menjadi satu sheet.
          </p>

          <div className="settings-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setSelectedExportModules(MODULES.map(([key]) => key))}
            >
              Pilih Semua
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => setSelectedExportModules([])}
            >
              Hapus Semua Pilihan
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
            marginTop: 20
          }}>
            {MODULES.map(([key, label]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedExportModules.includes(key)}
                  onChange={(e) => {
                    setSelectedExportModules(current =>
                      e.target.checked
                        ? [...current, key]
                        : current.filter(item => item !== key)
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <p className="subtle" style={{ marginTop: 16 }}>
            {selectedExportModules.length} dari {MODULES.length} sheet dipilih.
          </p>

          <div className="settings-actions" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => onExportAll(selectedExportModules)}
              disabled={exportBusy || selectedExportModules.length === 0}
            >
              <Icon name="download" size={16} />
              {exportBusy ? 'Menyiapkan file...' : 'Unduh Sheet Terpilih'}
            </button>
          </div>
        </section>
      ) : (
        <AccountSettings profile={profile} onNotice={onNotice} />
      )}
    </div>
  );
}