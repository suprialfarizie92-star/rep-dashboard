# REP People & Operations Dashboard

Aplikasi web untuk menampilkan dan mengelola 13 bagian data dari workbook **Data Karyawan REP 2026.xlsx**. Aplikasi memakai React + Vite untuk antarmuka dan Supabase Auth, PostgreSQL, Row Level Security (RLS), serta Realtime untuk login, database terpusat, hak akses, dan sinkronisasi antar komputer.

## Fitur yang tersedia

- Login dengan username dan password per pengguna.
- Dashboard ringkasan karyawan, kontrak, kompetensi, PICA, dan komposisi departemen.
- 13 menu yang sesuai dengan nama sheet workbook: Data Karyawan, Data Kontrak, Data Resign, Pembinaan/SP, TNA Plan, TNA Realisasi, Data Kompetensi, Kebutuhan Tenaga Kerja, PICA, Rekrutmen, ATR, Data Unit, serta Data LV & Bus.
- Pencarian data, tambah, edit, dan hapus berdasarkan hak akses.
- Impor workbook Excel oleh Admin. Impor menggantikan data pada sheet yang diimpor.
- Sinkronisasi perubahan database ke komputer lain yang sedang membuka dashboard.
- Pemisahan sebagian kolom identitas/kontak pribadi dari master Data Karyawan; tabel privat dibatasi untuk role Admin dan HR melalui RLS.
- Tampilan responsif untuk desktop, tablet, dan ponsel.

## A. Menyiapkan database Supabase

1. Buat project di [Supabase](https://supabase.com/). Simpan **Project URL** dan **anon/public key** dari Project Settings → API.
2. Buka SQL Editor pada project tersebut.
3. Buka file `supabase/schema.sql` dari paket ini, salin seluruh isinya, lalu jalankan sekali di SQL Editor.
4. Di Authentication → Providers → Email, nonaktifkan konfirmasi email jika akun dibuat memakai alamat login internal (tidak digunakan untuk menerima email). Alternatifnya, buat akun dengan status email confirmed.

> Jangan pernah memasukkan `service_role key` ke file `.env` frontend. Aplikasi hanya memakai anon/public key; pembatasan data dilakukan oleh Row Level Security yang dibuat oleh `schema.sql`.

## B. Membuat akun Admin pertama

1. Buka Authentication → Users → Add user → Create new user.
2. Gunakan email login internal dengan pola `admin@login.rep.local`, masukkan password, dan tandai email sebagai confirmed. Username yang diketik pada halaman login adalah bagian sebelum `@`, yaitu `admin`.
3. Setelah user dibuat, jalankan di SQL Editor:

```sql
update public.profiles
set role = 'admin', display_name = 'Administrator REP'
where username = 'admin';
```

Role Admin otomatis dapat membaca dan mengelola semua 13 menu serta mengimpor workbook.

## C. Membuat akun pengguna lain dan mengatur hak akses

Buat pengguna melalui Authentication → Users → Add user. Misalnya:

- Email: `andi@login.rep.local`
- Password: buat password sementara yang unik dan bagikan secara aman kepada pengguna.
- Email harus berstatus confirmed.
- Username untuk login: `andi`.

Semua akun baru otomatis mendapat role `viewer`. Berikan hak akses per menu melalui SQL Editor. Contoh memberi akses baca/tulis Data Karyawan dan baca Data Kontrak kepada akun `andi`:

```sql
insert into public.module_permissions (user_id, module_key, can_read, can_write)
select user_id, 'Data_Karyawan', true, true
from public.profiles where username = 'andi'
on conflict (user_id, module_key) do update
set can_read = excluded.can_read, can_write = excluded.can_write;

insert into public.module_permissions (user_id, module_key, can_read, can_write)
select user_id, 'Data_Kontrak', true, false
from public.profiles where username = 'andi'
on conflict (user_id, module_key) do update
set can_read = excluded.can_read, can_write = excluded.can_write;
```

Daftar `module_key` yang digunakan:

| Menu | module_key |
|---|---|
| Data Karyawan | `Data_Karyawan` |
| Data Kontrak | `Data_Kontrak` |
| Data Resign | `Data_Resign` |
| Pembinaan / SP | `REKAP_SP` |
| TNA Plan | `TNA_Plan` |
| TNA Realisasi | `TNA_Realisasi` |
| Data Kompetensi | `Data_Kompetensi` |
| Kebutuhan Tenaga Kerja | `Data_Kebutuhan` |
| PICA | `Data_PICA` |
| Rekrutmen | `Data_Rekrutmen` |
| ATR | `Data_ATR` |
| Data Unit | `Data_Unit` |
| Data LV & Bus | `Data_LV & Bus` |

Untuk mengubah role pengguna menjadi HR (boleh membaca data privat karyawan), jalankan:

```sql
update public.profiles set role = 'hr' where username = 'andi';
```

Role HR tetap membutuhkan izin `module_permissions` untuk menampilkan menu yang diperlukan. Role HR dapat membaca dan mengedit data privat karyawan jika memiliki izin tulis pada menu Data Karyawan. Role editor/viewer tidak dapat membaca tabel privat.

Untuk menghapus semua hak akses menu seorang pengguna:

```sql
delete from public.module_permissions
where user_id = (select user_id from public.profiles where username = 'andi');
```

## D. Menjalankan aplikasi

Persyaratan: Node.js versi 20 atau lebih baru.

1. Salin `.env.example` menjadi `.env`.
2. Isi `.env` dengan Project URL dan anon/public key dari Supabase:

```env
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=SUPABASE_ANON_PUBLIC_KEY
```

3. Dari folder aplikasi, jalankan:

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Pada komputer lain yang berada dalam jaringan kantor yang sama, jalankan `npm run dev -- --host 0.0.0.0`, lalu akses melalui `http://IP-KOMPUTER-SERVER:5173` (izinkan port 5173 di firewall Windows). Komputer server harus tetap menyala.

## E. Deploy agar dapat diakses lintas jaringan

Untuk penggunaan harian beberapa komputer, disarankan deploy frontend ke Vercel atau Netlify dan gunakan project Supabase yang sama sebagai database online.

Pengaturan build:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`

Unggah folder ini ke repository Git, hubungkan repository ke Vercel/Netlify, lalu masukkan dua environment variable tersebut. Setelah deploy, semua komputer dapat membuka URL HTTPS yang sama, login dengan akun masing-masing, dan mengakses database terpusat.

## F. Mengimpor data Excel pertama kali

1. Login sebagai `admin`.
2. Pada Dashboard Overview, klik **Impor file Excel**.
3. Pilih file `Data Karyawan REP 2026.xlsx`.
4. Tunggu sampai status impor menyatakan selesai, jangan tutup browser saat impor berlangsung.

Impor mengganti isi sheet yang cocok pada database dengan isi workbook yang dipilih. Lakukan backup database sebelum mengimpor workbook revisi. Sheet yang tidak ditemukan di file sumber akan dilewati.

## Catatan keamanan dan operasional

- Jangan menggunakan password yang sama untuk semua orang. Berikan akun individual dan minta pengguna mengganti password sementaranya melalui prosedur administrator.
- Role Admin/HR dapat melihat kolom privat Data Karyawan seperti tanggal lahir, data keluarga, alamat, NIK, NPWP, BPJS, kontak, dan foto/path foto. Batasi role tersebut hanya untuk personel berwenang.
- Data di browser tidak disimpan sebagai database lokal. Semua perubahan yang berhasil disimpan masuk ke PostgreSQL Supabase.
- Status realtime memerlukan tabel `app_data` dan `app_private_data` berada dalam publication `supabase_realtime`; skrip SQL telah menyiapkannya.
- Paket ini menyiapkan source code dan skrip database. Aplikasi belum online sampai project Supabase dibuat, `.env` diisi, data Excel diimpor, dan frontend di-deploy ke hosting.

Workbook sumber juga disertakan pada folder `data/` agar Admin dapat langsung memilih file yang sama saat melakukan impor pertama kali.
