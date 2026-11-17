# VeloCut Studio (V-HESA) — Video Editor 100% Gratis (HP Mandiri & Server PC)

**VeloCut Studio** adalah aplikasi edit video 60 FPS yang **100% gratis tanpa watermark, tanpa langganan berbayar, dan tanpa batasan ekspor**, lengkap dengan **Dual-Mode (`Pemula` | `Pro`)** dan **Subtitle Otomatis (AI Speech-to-Text)**.

Sekarang pengguna bebas memilih **2 cara kerja** dalam satu aplikasi yang sama:

1. **Aplikasi Mandiri di Perangkat (100% Di HP / Device Sendiri — Tanpa Server PC)**
   Unduh dari **GitHub Releases** atau pasang via **GitHub Pages**. Semua proses (preview WebGL2, potong klip, AI Whisper subtitle, potong hening VAD, mixing audio, & ekspor MP4) **berlangsung 100% langsung di HP Android, iPhone/iPad (iOS), maupun Laptop Anda**.
2. **Mode Perantara Server PC / Laptop (WiFi / LAN Offload FFmpeg)**
   Jalankan VeloCut sebagai server di satu PC/Laptop, lalu edit dari HP/Tablet lain di WiFi yang sama (scan QR Code) atau hubungkan aplikasi Android/iOS ke alamat IP PC untuk memakai render **FFmpeg CPU/GPU** dan **`faster-whisper`** di PC.

> Anda dapat berpindah antara **Mandiri di Perangkat** dan **Server PC** kapan saja lewat tombol status di bar atas editor.

---

## Pilihan 1: Unduh & Pakai Langsung di Perangkat (Tanpa Server PC)

Tidak perlu menginstal Node.js atau menjalankan server di laptop:

### A. HP Android (`.apk` / WebAPK)
1. **Unduh file `.apk` langsung dari GitHub**:
   - Buka halaman **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** pada repository ini.
   - Unduh **`VeloCut-Studio-Android.apk`** dan instal di HP Android Anda *(izinkan "Instal aplikasi tidak dikenal" jika diminta)*.
   - Semua editing, AI Subtitle Whisper, dan ekspor berlangsung langsung di HP (`Downloads/VeloCut/`).
2. **Atau tanpa instal file APK (Chrome PWA)**:
   - Buka halaman **GitHub Pages** VeloCut di Chrome Android → ketuk menu titik tiga → **Instal aplikasi / Tambahkan ke Layar Utama**.

### B. iPhone & iPad / iOS (Safari PWA & File `.ipa`)
1. **Cara Paling Mudah di iPhone/iPad (Resmi Apple Web App, Tanpa PC & Tanpa Sideload)**:
   - Buka link **GitHub Pages** VeloCut di browser **Safari** iPhone/iPad Anda.
   - Ketuk tombol **Bagikan (Share ↑)** di bagian bawah Safari → pilih **Tambahkan ke Layar Utama (Add to Home Screen)**.
   - VeloCut berjalan layar penuh (*standalone*) sebagai aplikasi iOS, mendukung impor galeri, preview ber-audio WebGL2, AI subtitle, dan ekspor `.mp4` langsung ke **Photos / Files**.
2. **Menggunakan File `.ipa` (`VeloCut-Studio-iOS-Unsigned.ipa`)**:
   - Unduh **`VeloCut-Studio-iOS-Unsigned.ipa`** dari **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)**.
   - Pasang ke iPhone/iPad menggunakan **AltStore**, **Sideloadly**, **TrollStore**, atau sign dengan Apple ID gratis di **Xcode** (`npm run mobile:ios`).

### C. Laptop / PC Portabel Offline (`.zip` — Tanpa `npm install`)
1. Unduh **`VeloCut-Studio-OnDevice-Portable.zip`** dari **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** lalu ekstrak.
2. **Windows**: Klik ganda **`Jalankan-Di-Perangkat.bat`**.
3. **Linux / macOS**: Jalankan **`./jalankan-di-perangkat.sh`**.
4. Semua pemrosesan tetap berlangsung lokal di browser perangkat Anda (zero server upload).

> *Catatan*: Paket `.apk`, `.ipa`, `.zip`, dan GitHub Pages otomatis dibuat oleh GitHub Actions ([`release-apps.yml`](.github/workflows/release-apps.yml)) setiap kali ada push ke `main` atau tag versi (`v*`). Untuk mengaktifkan **GitHub Pages**, pastikan di menu GitHub repo **Settings → Pages → Source** dipilih **GitHub Actions**.

---

## Pilihan 2: Jalankan sebagai Server PC / Laptop (Mode Multi-Device & Offload FFmpeg)

Gunakan cara ini bila Anda ingin menjadikan **1 Laptop/PC sebagai server perantara** agar:
- HP Android / iOS / Tablet lain di WiFi yang sama bisa membuka dan melanjutkan proyek yang sama lewat **QR Code**; atau
- HP dengan spesifikasi ringan mengirim proyek untuk dirender oleh **FFmpeg (`libx264` / NVENC / VAAPI)** dan **`faster-whisper`** milik PC.

### Mulai Cepat Server PC (3 Langkah)

> **Syarat utama PC/Laptop Host**: Terpasang **Node.js versi `>= 22.5.0`** (disarankan **Node.js 22 LTS**).

1. **Unduh / Clone Repository**
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   ```

2. **Instal Dependensi**
   ```bash
   npm install
   ```
   *(Otomatis memasang paket web/server, biner `ffmpeg-static` sesuai OS Anda, serta membangun `@velocut/shared`).*

3. **Jalankan Server Studio**
   - **Windows**: Klik ganda file `start-studio.bat` (atau `npm start`).
   - **Linux / macOS**:
     ```bash
     chmod +x start-studio.sh
     ./start-studio.sh
     ```
   - Buka **`http://localhost:3000`** di browser PC, lalu klik **Multi-Device / QR** untuk scan dari HP/Tablet lain di WiFi yang sama, **atau** buka aplikasi VeloCut (`.apk`/iOS PWA) di HP → ketuk tombol mode **`Di Perangkat`** di bar atas → pilih **Perantara Server PC** dan masukkan alamat IP PC (`http://192.168.x.x:3000`).

---

## Panduan Instalasi Lengkap PC Host per Sistem Operasi

### 1. Windows 10 / 11
1. Pasang **Node.js v22 LTS** dari [https://nodejs.org](https://nodejs.org) dan **Git** dari [https://git-scm.com/download/win](https://git-scm.com/download/win).
2. Pastikan versi minimal `>= 22.5.0`:
   ```cmd
   node -v
   npm -v
   ```
3. Clone & jalankan:
   ```cmd
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   npm --workspace=@velocut/server run start
   ```
   *(Atau klik ganda `start-studio.bat`). Jika muncul Windows Defender Firewall, izinkan **Private networks** agar HP via WiFi dapat terhubung.*

### 2. Linux (Ubuntu / Linux Mint / Debian / Arch)
1. Pasang Node.js v22 LTS via NVM (disarankan, hindari paket distro lama):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   nvm use 22
   node -v
   ```
2. Clone, instal, & jalankan:
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   chmod +x start-studio.sh
   ./start-studio.sh
   ```
3. Bila memakai `ufw` dan ingin dihubungkan dari HP via WiFi:
   ```bash
   sudo ufw allow 3000/tcp
   ```

### 3. macOS
1. Pasang Node.js v22 via Homebrew:
   ```bash
   brew install node@22
   echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```
2. Clone, instal, & jalankan:
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   chmod +x start-studio.sh
   ./start-studio.sh
   ```

---

## Fitur Utama Editor (100% Gratis Tanpa Watermark)

### 1. Dual-Mode (`Pemula` | `Pro`)
- **Mode Pemula (Simpel)**: Layar awal *Quick Start*, pilih rasio `16:9` / `9:16` / `1:1`, tombol 1-klik **Isi Penuh (Fill)** & **Pas Layar (Fit)**, preset filter/stiker/BGM/SFX bebas hak cipta, **Auto-Ducking BGM**, dan preset ekspor cepat (*TikTok / Reels*, *YouTube Full HD*, *Hemat WhatsApp*).
- **Mode Pro (Studio NLE)**: **Split (`S`)**, **Trim ke Playhead (`[` / `]`)**, **Ripple Delete (`Shift+Delete`)**, **Tutup Celah**, **Freeze Frame**, **Mirror / Flip / Rotate 90°**, **Pisah Audio (`Detach Audio`)**, **Auto-Cut Silence (VAD)**, **Salin & Tempel Gaya**, **Shuttle `J / K / L`**, panduan bingkai (*Grid 3×3*, *Zona Aman TikTok*, *Safe Area YouTube*), dan **9 Shader WebGL2 GLSL Real-time**.

### 2. Subtitle Otomatis (AI Speech-to-Text) & Subtitle Studio
- **AI Whisper di Perangkat (100% Gratis, Tanpa Server)**: Menjalankan `@huggingface/transformers` (`Xenova/whisper-tiny` / `Xenova/whisper-base`) langsung di browser/HP (mendukung **Bahasa Indonesia (`id`)**, Inggris, Melayu, Jawa, Jepang, Korea, Mandarin, Arab, dll.).
- **Mode Tambahan**: Perantara Server PC (`faster-whisper` / Server VAD), **Live Dikte Mikrofon**, **Sinkronisasi Naskah + VAD (100% Offline)**, serta opsional BYOK *Groq* / *OpenAI*.
- **Editor Cue & Karaoke**: Edit waktu & teks tiap blok, sorot kata aktif (*Karaoke / Hormozi*), *auto word-wrap*, **Terapkan Gaya ke Semua**, impor/ekspor `.srt` & `.vtt`, serta burn-in subtitle saat ekspor.

---

## Build Lokal APK Android, Project Xcode iOS, & Paket Portabel (Developer)

```bash
# 1. Buat paket portabel offline (dist-standalone/VeloCut-Studio-OnDevice)
npm run build:standalone

# 2. Siapkan & sync project Android Studio / APK (butuh Android SDK & JDK 17)
npm run mobile:android
npm --workspace=@velocut/web run android:open   # atau: cd apps/web/android && ./gradlew assembleDebug

# 3. Siapkan & sync project Xcode iOS (khusus macOS dengan Xcode & CocoaPods)
npm run mobile:ios
npm --workspace=@velocut/web run ios:open

# 4. Mode development, typecheck, test, dan build produksi
npm run dev
npm run typecheck
npm test
npm run build
```

> Opsional PC Server Whisper: jalankan `pip install faster-whisper` di PC Host agar mode subtitle Server PC otomatis memakai `faster-whisper`.

---

## Daftar Shortcut Keyboard (Mode Pro)

| Shortcut | Fungsi |
| :--- | :--- |
| `Space` | Play / Pause pratinjau video |
| `J` / `K` / `L` | Mundur 1 detik / Stop / Maju cepat (`1x` → `2x` → `4x`) |
| `←` / `→` | Geser 1 frame (`Shift` + panah untuk 1 detik) |
| `S` | Potong (*Split*) klip di posisi Playhead |
| `[` / `]` | Pangkas awal (`[`) atau akhir (`]`) klip ke posisi Playhead |
| `Delete` | Hapus klip terpilih |
| `Shift + Delete` | **Ripple Delete** (hapus & langsung rapatkan celah kosong) |
| `Ctrl + D` | Duplikat klip terpilih |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |
| `?` | Buka / tutup Panduan Cepat & Daftar Shortcut |

---

## Troubleshooting

- **HP ingin edit mandiri tanpa PC tapi muncul pesan server**: Klik tombol **`Di Perangkat` / `Server PC`** di bar atas → pilih **`Mandiri di Perangkat`**. Kini simpan proyek, preview, AI subtitle, dan ekspor berjalan 100% di HP.
- **Ekspor `.mp4` di Safari iPhone / iOS**: Pilih **Simpan / Bagikan** setelah ekspor selesai untuk langsung menyimpan hasil video ke **Photos (Galeri)** atau **Files**.
- **Ekspor via WiFi LAN `http://192.168.x.x:3000` menghasilkan `.webm`**: Browser membatasi *WebCodecs* di luar HTTPS / `localhost`, sehingga memakai fallback `MediaRecorder`. Pilih **Server PC FFmpeg** saat memakai Mode Server PC atau instal aplikasi via **GitHub Pages / APK / PWA HTTPS** untuk mendapatkan `.mp4` (H.264 + AAC) langsung di perangkat.
- **Error `node:sqlite` atau `Unsupported engine` saat `npm install` di PC**: Pastikan `node -v` menunjukkan **`v22.5.0` atau lebih baru**.
