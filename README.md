# VeloCut Studio (V-HESA) — Video Editor Web 100% Gratis Tanpa Watermark

**VeloCut** adalah aplikasi edit video web 60 FPS berbasis **Hybrid-Edge Studio Architecture (V-HESA)** yang dirancang agar mudah digunakan oleh **pemula / kreator kasual** sekaligus lengkap untuk **editor profesional**.

Semua fitur **100% gratis tanpa watermark, tanpa langganan berbayar, dan tanpa batasan resolusi ekspor**. Cukup jalankan 1 server lokal di PC/Laptop Anda, lalu edit dari komputer tersebut maupun langsung dari **HP Android/iOS, Tablet, dan Laptop lain** di jaringan WiFi/LAN yang sama.

---

## Mulai Cepat (3 Langkah untuk Semua Pengguna)

> **Syarat utama**: Terpasang **Node.js versi `>= 22.5.0`** (disarankan **Node.js 22 LTS**).

1. **Unduh / Clone Repository**
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   ```
   *(Menggunakan `--depth 1` membuat proses clone jauh lebih cepat karena hanya mengambil versi terbaru).*

2. **Instal Dependensi**
   ```bash
   npm install
   ```
   *(Perintah ini otomatis mengunduh paket web/server, biner `ffmpeg-static` sesuai OS Anda, serta mem-build paket `@velocut/shared`).*

3. **Jalankan Studio**
   - **Windows**: Klik ganda file `start-studio.bat` (atau jalankan `npm start` di terminal).
   - **Linux / macOS**:
     ```bash
     chmod +x start-studio.sh
     ./start-studio.sh
     ```
   Lalu buka **`http://localhost:3000`** di browser Anda (atau scan **QR Code** di tombol **Multi-Device / QR** untuk membuka langsung dari HP/Tablet di WiFi yang sama!).

---

## Panduan Instalasi Lengkap per Sistem Operasi

### 1. Windows 10 / 11

1. **Pasang Node.js v22 LTS**:
   - Buka [https://nodejs.org](https://nodejs.org) dan unduh installer **22.x LTS (Windows Installer `.msi`)**.
   - Jalankan installer hingga selesai, lalu buka **Command Prompt (CMD)** atau **PowerShell** dan pastikan versinya `>= 22.5.0`:
     ```cmd
     node -v
     npm -v
     ```
2. **Pasang Git** (jika belum ada): unduh dari [https://git-scm.com/download/win](https://git-scm.com/download/win).
3. **Clone, Instal, & Jalankan**:
   ```cmd
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   npm --workspace=@velocut/server run start
   ```
   *(Atau cukup klik ganda `start-studio.bat` setelah clone).*
4. **Tips WiFi LAN Windows**: Jika muncul jendela *Windows Defender Firewall*, centang **Private networks** dan klik **Allow access** agar HP/Tablet dapat terhubung ke alamat `http://192.168.x.x:3000`.

---

### 2. Linux (Ubuntu / Linux Mint / Debian / Arch)

1. **Pasang Node.js v22 LTS** *(jangan memakai `sudo apt install nodejs` bawaan Ubuntu/Debian lama karena sering masih v18)*:
   ```bash
   # Pasang NVM (Node Version Manager)
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc

   # Pasang Node.js 22 LTS
   nvm install 22
   nvm use 22

   # Pastikan versi >= v22.5.0
   node -v
   npm -v
   ```
2. **Clone, Instal, & Jalankan**:
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   chmod +x start-studio.sh
   ./start-studio.sh
   ```
3. **Izinkan Port 3000 di Firewall (jika memakai `ufw` dan ingin akses dari HP via WiFi)**:
   ```bash
   sudo ufw allow 3000/tcp
   ```

---

### 3. macOS

1. **Pasang Node.js v22** via Homebrew:
   ```bash
   brew install node@22
   echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   node -v
   ```
2. **Clone, Instal, & Jalankan**:
   ```bash
   git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
   cd WEB-EDITOR-VID-SERVER
   npm install
   npm run build
   chmod +x start-studio.sh
   ./start-studio.sh
   ```

---

## Fitur Lengkap untuk Pemula & Profesional

### 1. Dual-Mode (1 Klik di Bar Atas: `Pemula` | `Pro`)
- **Mode Pemula (Simpel)**:
  - Layar awal *Quick Start*: langsung impor video/foto, pilih rasio **`16:9 YouTube`**, **`9:16 TikTok/Reels`**, **`1:1 Feed`**, atau muat proyek demo.
  - Tombol **Isi Penuh (Fill)** & **Pas Layar (Fit)** 1-klik untuk menghilangkan garis hitam saat video landscape dimasukkan ke format vertikal `9:16`.
  - Preset filter warna, stiker animasi *Pop Zoom*, efek suara (SFX) & musik latar (BGM) sintetis bebas hak cipta, serta **Auto-Ducking BGM** (otomatis mengecilkan musik saat suara bicara terdengar).
  - Tombol hijau **Ekspor MP4** selalu tersedia di bar atas dengan preset sekali klik (*TikTok / Reels*, *YouTube Full HD*, *Hemat WhatsApp*).
- **Mode Pro (Studio NLE Lengkap — 100% Gratis)**:
  - Multi-track timeline: **Split (`S`)**, **Trim ke Playhead (`[` / `]`)**, **Ripple Delete / Rapatkan (`Shift+Delete`)**, **Tutup Celah**, **Freeze Frame**, **Mirror / Flip / Rotate 90°**, **Pisah Audio (`Detach Audio`)**, **Salin & Tempel Gaya**, serta rename & hapus track.
  - **Auto-Cut Silence (VAD)**: mendeteksi dan membuang jeda diam/hening secara otomatis pada klip video atau audio.
  - **9 Shader WebGL2 GLSL Real-time**: *Brightness, Contrast, Saturation, Grayscale, Sepia, Vignette, Chromatic Aberration (RGB Glitch), Blur, Mosaic Pixelate* + preset LUT.
  - **Shuttle `J / K / L`**, panduan bingkai (*Grid 3×3*, *Zona Aman TikTok/Reels*, *Safe Area YouTube*), dan panel diagnostik runtime.

### 2. Subtitle Otomatis (AI Speech-to-Text) & Subtitle Studio
Buka tab **Subtitle** di panel kiri untuk membuat subtitle otomatis:
- **AI Whisper di Browser (100% Gratis, Tanpa Server/API Key)**: Menjalankan `@huggingface/transformers` di Web Worker (`Xenova/whisper-tiny` ~40MB / `Xenova/whisper-base` ~75MB; diunduh sekali pada pemakaian pertama lalu tersimpan permanen di cache browser). Mendukung deteksi otomatis, **Bahasa Indonesia (`id`)**, Inggris, Melayu, Jawa, Jepang, Korea, Mandarin, Arab, dll.
- **Server PC Lokal (Whisper / VAD)**: Mengirim audio ke server lokal; otomatis memakai `faster-whisper` / `whisper` jika terpasang di PC, atau fallback **Server VAD** deteksi suara.
- **Live Dikte Mikrofon**: Ucapkan subtitle langsung sambil memutar video (Web Speech API di Chrome/Edge).
- **Sinkronisasi Naskah + VAD (100% Offline)**: Tempel naskah/lirik untuk diselaraskan otomatis dengan jeda bicara di audio.
- **Opsional BYOK API**: Mendukung *Groq* / *OpenAI* API key milik sendiri (disimpan hanya di `sessionStorage` browser).
- **Editor Cue, Sorot Kata Karaoke, & `.SRT` / `.VTT`**:
  - Edit teks per cue, geser waktu `-0.2s / +0.2s`, pecah (`Split`), gabung (`Merge`), dan **Terapkan Gaya ke Semua Subtitle** dalam 1 klik.
  - Sorot kata aktif (*Karaoke / Hormozi Highlight*) dengan *auto word-wrapping* di kanvas.
  - Impor dan ekspor `.srt` / `.vtt`, serta burn-in subtitle saat ekspor MP4 (WebCodecs maupun FFmpeg `libass`).

### 3. Multi-Device Studio & Penyimpanan Offline
- **Edit Bersama di WiFi/LAN**: Klik **Multi-Device / QR** di bar atas, lalu scan QR Code dari kamera HP/Tablet. Video dari galeri HP diunggah per potongan 10MB ke Server PC dan langsung sinkron ke timeline.
- **Auto-Save Offline**: Perubahan proyek tersimpan otomatis di `localStorage` + file media lokal di OPFS browser (serta ke database SQLite WAL saat terhubung ke Server PC).

---

## Cara Mengaktifkan Fitur Opsional Tambahan di Server PC

1. **Transkripsi Whisper Lokal di PC Server (Tanpa Internet Setelah Unduh Model)**
   Berguna bila Anda mengedit dari HP lewat WiFi dan ingin PC yang memproses transkripsi:
   ```bash
   pip install faster-whisper
   ```
   Setelah terpasang, mode **Server PC Lokal** di tab **Subtitle** otomatis memakai `faster-whisper`.

2. **Mode Development, Test, & Build**
   ```bash
   # Jalankan hot-reload frontend (:5173) + backend (:3000)
   npm run dev

   # Periksa tipe TypeScript, jalankan seluruh test, dan build produksi
   npm run typecheck
   npm test
   npm run build
   ```

3. **Instal sebagai Aplikasi Android (PWA / APK)**
   - **PWA (Paling Cepat)**: Buka URL VeloCut di Chrome Android → ketuk menu titik tiga → **Tambahkan ke Layar Utama / Instal aplikasi**.
   - **Native `.apk` (Capacitor)**:
     ```bash
     npm run build
     npm --workspace=@velocut/web run android:init
     npm --workspace=@velocut/web run android:sync
     ```

---

## Daftar Shortcut Keyboard (Mode Pro)

| Shortcut | Fungsi |
| :--- | :--- |
| `Space` | Play / Pause video |
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

- **Error `node:sqlite` atau `Unsupported engine` saat `npm install` / `npm start`**: Pastikan `node -v` menunjukkan **`v22.5.0` atau lebih baru**.
- **HP tidak bisa membuka `http://192.168.x.x:3000`**: Pastikan HP dan PC berada di WiFi yang sama, fitur *AP Isolation* router mati, dan port `3000` dibuka di firewall PC.
- **Ekspor dari HP via HTTP LAN menghasilkan `.webm`, bukan `.mp4`**: Browser menonaktifkan *WebCodecs* pada alamat `http://` selain `localhost` sehingga memakai fallback `MediaRecorder`. Pilih mode **Server PC FFmpeg** pada dialog Ekspor untuk mendapatkan file `.mp4` (H.264 + AAC) universal, atau sajikan lewat HTTPS (`infra/caddy/Caddyfile`, `infra/nginx/velocut.conf`, `infra/cloudflared/config.yml`).
- **Model AI Whisper di Browser gagal diunduh**: Koneksi internet hanya dibutuhkan saat pertama kali mengunduh model (~40MB). Setelah selesai, model tersimpan di cache browser. Jika sedang offline penuh, gunakan mode **Sinkronisasi Naskah + Deteksi Suara (100% Offline)** atau **Dikte Mikrofon**.
