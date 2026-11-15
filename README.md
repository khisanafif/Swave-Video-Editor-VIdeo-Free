# VeloCut — Hybrid-Edge Multi-Device Studio (V-HESA)

VeloCut adalah video editor 60 FPS yang dirancang agar **siapa pun cukup menyalakan 1 server di PC atau Laptop mereka**, lalu proses pengeditan, impor media, penambahan teks/efek shader, hingga render dapat dikerjakan bersama atau dilanjutkan dari **HP Android/iOS, Tablet, maupun Laptop lain** di jaringan WiFi/LAN yang sama (atau lewat internet via Cloudflare Tunnel).

---

## Cara Pakai Paling Mudah (1-Klik Multi-Device Studio)

### 1. Nyalakan Server di PC / Laptop Utama
- **Windows**: Klik ganda file **[start-studio.bat](file:///c:/WEB%20EDITOR%20VID/start-studio.bat)** (atau jalankan `npm start` di terminal).
- **Linux / macOS**: Jalankan `./start-studio.sh` (atau `npm start`).

Server otomatis:
1. Membangun & menyajikan aplikasi web VeloCut + API + SQLite WAL + Media Storage dalam **satu port tunggal (`3000`)** tanpa perlu menginstal Nginx terlebih dahulu.
2. Menampilkan daftar **alamat IP WiFi/LAN PC Anda** (contoh: `http://192.168.1.100:3000`) langsung di layar terminal.

### 2. Buka & Edit dari HP, Tablet, atau Laptop Lain
1. Klik tombol **Multi-Device / QR** di bar atas VeloCut pada PC Anda.
2. **Scan QR Code** yang tampil di layar menggunakan kamera HP atau Tablet Anda (pastikan terhubung ke WiFi yang sama).
3. Proyek yang sedang Anda kerjakan (`?project=<id>`) beserta seluruh video/audio yang sudah disinkronkan akan langsung terbuka di HP, Tablet, atau Laptop lain:
   - **Auto-Sync Media ke Server PC**: Saat Anda mengimpor video dari Galeri HP, file otomatis diunggah per potongan 10MB ke Server PC dan langsung muncul di **Pustaka Server PC** agar bisa dipakai di Tablet/Laptop tanpa unggah ulang.
   - **Auto-Save Live**: Perubahan timeline tersimpan otomatis ke database SQLite di PC.
   - **3 Mode Tampilan Adaptif**: Otomatis menyesuaikan tampilan untuk **Mode HP** (vertikal + bottom dock), **Mode Tablet** (split touch studio), dan **Mode Desktop** (3-pane pro studio).
   - **Export Universal**: Mendukung export di perangkat via **WebCodecs + `mp4-muxer`** (atau fallback otomatis **`MediaRecorder`** saat diakses melalui IP LAN HTTP biasa dari HP/Tablet) maupun **Server Offload FFmpeg** di PC.

---

## Mode Development (Hot-Reload)

```bash
npm install
npm run dev
```

- Frontend Dev Server: `http://localhost:5173`
- Backend API Server: `http://127.0.0.1:3000`

### Menjalankan Test & Typecheck

```bash
npm run typecheck
npm test
npm run build
```

---

## Instal Sebagai Aplikasi Android (PWA WebAPK & Native APK)

1. **Instal Langsung dari Chrome Android (PWA / WebAPK)**:
   - Buka VeloCut di Chrome Android -> ketuk tombol **Instal App** di bar atas VeloCut atau menu Chrome **Tambahkan ke Layar Utama / Instal aplikasi**.
2. **Build File `.apk` Mandiri (Capacitor / Bubblewrap TWA)**:
   - Gunakan konfigurasi [capacitor.config.json](file:///c:/WEB%20EDITOR%20VID/apps/web/capacitor.config.json) (`npm --workspace=@velocut/web run android:init` & `android:sync`) atau [twa-manifest.json](file:///c:/WEB%20EDITOR%20VID/infra/android/twa-manifest.json).
