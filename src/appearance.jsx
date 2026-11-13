import React, { useCallback, useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export const THEMES = [
  { key: 'teal', name: 'Toska', hint: 'Segar dan mudah dibaca' },
  { key: 'forest', name: 'Hijau Hutan', hint: 'Tenang, dekat dengan lapangan' },
  { key: 'safety', name: 'Oranye Safety', hint: 'Hangat, identik dengan K3' },
  { key: 'indigo', name: 'Nila', hint: 'Modern dan tegas' },
  { key: 'maroon', name: 'Marun', hint: 'Elegan, kontras kuat' },
  { key: 'graphite', name: 'Grafit', hint: 'Netral dan sederhana' },
  { key: 'classic', name: 'Biru Klasik', hint: 'Mirip tampilan sebelumnya' }
];

export const MODES = [
  { key: 'light', name: 'Terang', icon: 'sun' },
  { key: 'dark', name: 'Gelap', icon: 'moon' },
  { key: 'auto', name: 'Ikuti sistem', icon: 'monitor' }
];

export const FONT_SIZES = [
  { key: 's', name: 'Kecil', hint: 'Padat, muat banyak data', aa: '16px' },
  { key: 'm', name: 'Sedang', hint: 'Standar', aa: '19px' },
  { key: 'l', name: 'Besar', hint: 'Lebih nyaman dibaca', aa: '23px' },
  { key: 'xl', name: 'Sangat besar', hint: 'Untuk layar jauh', aa: '27px' }
];

export const STORAGE_KEY = 'rep-appearance';
export const DEFAULT_PREFS = { theme: 'teal', mode: 'light', font: 'm' };

const valid = {
  theme: THEMES.map(x => x.key),
  mode: MODES.map(x => x.key),
  font: FONT_SIZES.map(x => x.key)
};

export function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const prefs = { ...DEFAULT_PREFS };
    Object.keys(valid).forEach(k => { if (valid[k].includes(stored[k])) prefs[k] = stored[k]; });
    return prefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* penyimpanan browser tidak tersedia */ }
}

export function resolveMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.mode = resolveMode(prefs.mode);
  root.dataset.font = prefs.font;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--side').trim() || '#0b2f2d');
}

export function useAppearance() {
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs]);

  // Mode "Ikuti sistem": perbarui otomatis saat pengaturan gelap/terang perangkat berubah.
  useEffect(() => {
    if (prefs.mode !== 'auto' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyPrefs(prefs);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [prefs]);

  const setTheme = useCallback(theme => setPrefs(p => ({ ...p, theme })), []);
  const setMode = useCallback(mode => setPrefs(p => ({ ...p, mode })), []);
  const setFont = useCallback(font => setPrefs(p => ({ ...p, font })), []);
  const toggleMode = useCallback(() => setPrefs(p => ({ ...p, mode: resolveMode(p.mode) === 'dark' ? 'light' : 'dark' })), []);
  const reset = useCallback(() => setPrefs({ ...DEFAULT_PREFS }), []);

  return { prefs, setTheme, setMode, setFont, toggleMode, reset };
}

export function ModeToggle({ appearance, className = 'icon-btn' }) {
  const dark = resolveMode(appearance.prefs.mode) === 'dark';
  return (
    <button type="button" className={className} onClick={appearance.toggleMode} title={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} aria-label={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}>
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

export function ThemeDots({ appearance }) {
  return (
    <div className="theme-dots" role="group" aria-label="Tema warna">
      {THEMES.map(t => (
        <button type="button" key={t.key} data-theme={t.key} className="theme-dot" title={t.name} aria-label={`Tema ${t.name}`} aria-pressed={appearance.prefs.theme === t.key} onClick={() => appearance.setTheme(t.key)} />
      ))}
    </div>
  );
}
