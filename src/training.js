import { DEPT, resignedChecker, toDate, val } from './utils.js';

// Daftar training per kategori (sama dengan urutan kolom TNA di App).
export const TRAINING_GROUPS = [
  ['LEGAL COMPLIANCE', [
    'Ahli K3 Umum',
    'Ahli K3 Kebakaran Kelas C (Regu Penanggulangan Kebakaran)',
    'Ahli K3 Kebakaran Kelas D (Petugas Peran Kebakaran)',
    'Ahli K3 Listrik', 'Teknisi K3 Listrik', 'Rigger (Juru Ikat)', 'Auditor SMKP', 'Juru Las',
    'AK3 Teknisi Pesawat Angkat Angkut', 'HIMU', 'Petugas P3K', 'POP', 'POM', 'TIM TANGGAP DARURAT'
  ]],
  ['MANDATORY PROGRAM', [
    'DDT', 'DRD', 'Fatigue Awareness', 'SHE Pertama', 'SHE Pertama Plus', 'High Risk', 'Work Readiness',
    'Manual Handling', 'LOTO', 'Hand & Finger', 'Power Tools', 'Remove & Install Tyre', 'Job Safety Analysis',
    'Training Simulator 7 Danger', 'Instruktur Representative', 'Pengelolaan Hidrocarbon', 'PSMS Coaching'
  ]],
  ['PROGRAM INTERNAL', ['Sertifikasi BMC', 'SERTIFIKASI OPERATOR DT', 'SERTIFIKASI OPERATOR A2B']]
];

export const idOf = r => String(val(r, 'NRP', 'AMODI', 'NAMA', 'Nama') ?? '');

// Sel TNA Plan dianggap "dijadwalkan" bila terisi (bukan kosong, 0, atau tanda strip).
export const isPlanned = v => {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '0' && s !== '-';
};

/**
 * Plan   = karyawan yang dijadwalkan pada kolom training di TNA_Plan.
 * Aktual = dari mereka, yang sudah punya tanggal di TNA_Realisasi (NRP sama).
 */
export function computeTraining(data, inDept = () => true) {
  const gone = resignedChecker(data);
  const plans = data.filter(x => x.module === 'TNA_Plan').map(x => x.data || {}).filter(r => !gone(r)).filter(inDept);
  const real = new Map();
  data.filter(x => x.module === 'TNA_Realisasi').forEach(x => real.set(idOf(x.data || {}), x.data || {}));

  const people = new Set();
  const items = [];
  TRAINING_GROUPS.forEach(([cat, names]) => names.forEach(name => {
    const planned = plans.filter(r => isPlanned(val(r, name)));
    if (!planned.length) return;
    const pending = planned.filter(r => toDate(val(real.get(idOf(r)) || {}, name)) === null);
    pending.forEach(r => people.add(idOf(r)));
    const plan = planned.length;
    const aktual = plan - pending.length;
    const pct = (aktual / plan) * 100;
    items.push({
      name, cat, plan, aktual, sisa: pending.length, pct,
      status: pct >= 100 ? 'Selesai' : aktual > 0 ? 'Sebagian' : 'Belum mulai',
      pending: pending.map(r => ({ id: idOf(r), nama: val(r, 'NAMA', 'Nama'), dept: val(r, ...DEPT) }))
    });
  }));

  const totalPlan = items.reduce((s, i) => s + i.plan, 0);
  const totalDone = items.reduce((s, i) => s + i.aktual, 0);
  return {
    items, totalPlan, totalDone,
    rate: totalPlan > 0 ? (totalDone / totalPlan) * 100 : null,
    tuntas: items.filter(i => i.status === 'Selesai').length,
    sebagian: items.filter(i => i.status === 'Sebagian').length,
    belum: items.filter(i => i.status === 'Belum mulai').length,
    pendingPeople: people.size
  };
}
