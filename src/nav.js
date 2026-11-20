import { isLicense } from './utils.js';

// Kompetensi = catatan Data_Kompetensi di luar enam jenis lisensi.
export const KOMPETENSI_PRESET = { label: 'Kompetensi (di luar lisensi)', nav: 'kompetensi', test: r => !isLicense(r) };

// Label tab untuk halaman yang punya beberapa tampilan.
export const TAB_LABEL = { Training: 'Ringkasan training', TNA_Plan: 'TNA Plan', TNA_Realisasi: 'TNA Realisasi' };

/**
 * Urutan menu sama dengan dashboard Apps Script.
 * modules : kunci data yang dibuka (yang pertama jadi tampilan awal; bila lebih dari satu, muncul tab)
 * perms   : modul yang izin bacanya menentukan menu terlihat (default = modules)
 */
export const NAV = [
  { id: 'dashboard', label: 'Ringkasan', icon: 'grid', modules: ['Dashboard'] },
  { id: 'karyawan', label: 'Karyawan', icon: 'people', modules: ['Data_Karyawan'] },
  { id: 'lisensi', label: 'Lisensi', icon: 'contract', modules: ['Lisensi'], perms: ['Data_Karyawan'] },
  { id: 'unit', label: 'Unit', icon: 'truck', modules: ['Data_Unit', 'Data_LV & Bus'] },
  { id: 'kompetensi', label: 'Kompetensi', icon: 'certificate', modules: ['Data_Kompetensi'], preset: KOMPETENSI_PRESET },
  { id: 'atr', label: 'ATR', icon: 'chart', modules: ['Data_ATR'] },
  { id: 'turnover', label: 'Turnover', icon: 'exit', modules: ['Data_Resign'] },
  { id: 'kontrak', label: 'Kontrak', icon: 'edit', modules: ['Data_Kontrak'] },
  { id: 'manpower', label: 'Database Manpower', icon: 'staffing', modules: ['Data_Kebutuhan', 'Data_PICA'] },
  { id: 'rekrutmen', label: 'Rekrutmen', icon: 'recruitment', modules: ['Data_Rekrutmen'] },
  { id: 'tes', label: 'Tes Teori', icon: 'action', modules: ['Tes'] },
  { id: 'training', label: 'Training', icon: 'training', modules: ['Training', 'TNA_Plan', 'TNA_Realisasi'], perms: ['TNA_Plan', 'TNA_Realisasi'] },
  { id: 'pembinaan', label: 'Pembinaan Karyawan', icon: 'discipline', modules: ['REKAP_SP'] },
  { id: 'laporan', label: 'Laporan SHE', icon: 'report', modules: ['Laporan'], perms: ['Data_Karyawan'] },
  { id: 'smkp', label: 'SMKP', icon: 'audit', modules: ['SMKP_Elemen'], perms: ['SMKP_Elemen'] },
  { id: 'input', label: 'Input data', icon: 'plus', modules: [] } // khusus admin: impor Excel
];
