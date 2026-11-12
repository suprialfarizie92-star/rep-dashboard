@echo off
cd /d "%~dp0"
if not exist .env (
  echo File .env belum ada. Salin .env.example menjadi .env dan isi konfigurasi Supabase terlebih dahulu.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Menginstal dependensi aplikasi...
  npm install
  if errorlevel 1 exit /b 1
)
echo Dashboard berjalan pada port 5173. Akses dari komputer lain melalui IP komputer ini.
npm run dev -- --host 0.0.0.0
