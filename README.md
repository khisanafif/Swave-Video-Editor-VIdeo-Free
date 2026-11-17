# SWAVE Video (Self-Hosted & Web-Native Visual Editor)

**Bahasa:** [Bahasa Indonesia](#bahasa-indonesia) · [English](#english)

---

<a id="bahasa-indonesia"></a>
## Bahasa Indonesia

**SWAVE Video** (*Self-Hosted & Web-Native Visual Editor*) adalah editor visual dan video web 60 FPS yang **100% gratis, open-source, tanpa watermark, dan tanpa batasan resolusi**, dirancang agar mudah digunakan oleh **pemula** sekaligus lengkap untuk **editor profesional**.

Aplikasi ini mendukung **2 mode pengoperasian** yang dapat dipilih dan diganti kapan saja di bar atas editor:

1. **Mode Mandiri di Perangkat (*Web-Native On-Device* — Tanpa Server PC)**
   Unduh dari **GitHub Releases** atau buka lewat **GitHub Pages**. Seluruh proses (preview WebGL2, potong klip, AI Whisper subtitle otomatis, potong hening VAD, mixing audio, dan ekspor MP4) berlangsung **100% langsung di perangkat** (HP Android, iPhone/iPad iOS, atau Laptop) menggunakan RAM, GPU, dan hardware encoder perangkat Anda.
2. **Mode Self-Hosted Server PC (*Self-Hosted* — Perantara Laptop/PC di WiFi/LAN)**
   Jalankan SWAVE Video di PC/Laptop sebagai server lokal, lalu edit dari HP/Tablet di WiFi yang sama (scan QR Code) atau hubungkan aplikasi HP ke server PC untuk memakai render **FFmpeg CPU/GPU** serta transkripsi **`faster-whisper`** di PC.

### Pilihan 1: Unduh & Instal Langsung di Perangkat (Tanpa Server PC)

- **HP Android (`.apk` & WebAPK)**:
  1. Buka **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** → unduh **`SWAVE-Video-Android.apk`** lalu instal di HP Android Anda. Hasil ekspor tersimpan ke folder `Downloads/SWAVE-VIDEO/`.
  2. Atau buka halaman **GitHub Pages** di Chrome Android → menu titik tiga → **Instal aplikasi**.
- **iPhone & iPad / iOS (Safari Web App & `.ipa`)**:
  1. **Cara Paling Mudah (Resmi tanpa sideload/PC)**: Buka URL **GitHub Pages** di **Safari iPhone/iPad** → ketuk tombol **Bagikan (Share ↑)** → pilih **Tambahkan ke Layar Utama (Add to Home Screen)**. Setelah selesai ekspor video, gunakan tombol **Simpan / Bagikan** untuk menyimpan langsung ke **Photos / Files**.
  2. **File Sideload `.ipa`**: Unduh **`SWAVE-Video-iOS-Unsigned.ipa`** dari **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** dan pasang melalui **AltStore**, **Sideloadly**, **TrollStore**, atau sign dengan Apple ID Anda di **Xcode** (`npm run mobile:ios`).
- **Laptop / PC Portabel Offline (`.zip` — Tanpa `npm install`)**:
  - Unduh **`SWAVE-Video-OnDevice-Portable.zip`** dari **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)**, ekstrak, lalu jalankan **`Jalankan-Di-Perangkat.bat`** (Windows) atau **`./jalankan-di-perangkat.sh`** (Linux/macOS).

### Pilihan 2: Menjalankan Server PC (*Self-Hosted*) di Windows, Linux, & macOS

> **Syarat Node.js**: Wajib terpasang **Node.js versi `>= 22.5.0`** (disarankan **Node.js 22 LTS**).

```bash
# 1. Clone versi terbaru secara cepat
git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
cd WEB-EDITOR-VID-SERVER

# 2. Instal dependensi (termasuk biner ffmpeg-static sesuai OS)
npm install

# 3. Jalankan Server PC SWAVE Video
# Windows: klik ganda start-studio.bat (atau npm start)
# Linux / macOS:
chmod +x start-studio.sh && ./start-studio.sh
```

Lalu buka **`http://localhost:3000`** di browser PC, klik **Multi-Device / QR** untuk scan dari HP di WiFi yang sama, atau buka app SWAVE Video di HP → klik tombol **`Di Perangkat`** di bar atas → ubah ke **Perantara Server PC** dan masukkan alamat IP PC (`http://192.168.x.x:3000`).

#### Catatan Instalasi per OS
- **Windows 10/11**: Pasang Node.js 22 LTS dari [nodejs.org](https://nodejs.org) dan Git. Saat jendela Firewall muncul, centang **Private networks** agar HP bisa mengakses lewat WiFi.
- **Linux (Ubuntu/Mint/Debian/Arch)**: Pasang Node 22 via NVM (`curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install 22`). Bila memakai `ufw`, jalankan `sudo ufw allow 3000/tcp`.
- **macOS**: Pasang Node 22 via Homebrew (`brew install node@22`).

### Fitur Utama SWAVE Video
- **Dual-Mode (`Pemula` | `Pro`)**: Layar *Quick Start* 1-klik (`16:9`, `9:16`, `1:1`), tombol **Isi Penuh / Pas Layar**, **Auto-Ducking BGM**, preset filter/audio sintetis bebas hak cipta, hingga alat NLE lengkap (*Split `S`*, *Trim `[` / `]`*, *Ripple Delete `Shift+Delete`*, *Detach Audio*, *Freeze Frame*, *Auto-Cut Silence VAD*, *Shuttle `J/K/L`*, *Safe Zone Guides*, dan *9 Shader WebGL2 GLSL*).
- **Subtitle Otomatis (AI Speech-to-Text)**: AI Whisper langsung di perangkat (`@huggingface/transformers`: `tiny` / `base`), opsional Server PC (`faster-whisper` via `pip install faster-whisper`), *Live Dikte Mikrofon*, *Sinkronisasi Naskah + VAD 100% Offline*, serta opsional BYOK *Groq/OpenAI*. Dilengkapi editor cue, *Karaoke Sorot Kata*, impor/ekspor `.srt`/`.vtt`, dan burn-in subtitle.
- **Penyimpanan Lokal & Backup**: Auto-save offline di `localStorage` + OPFS serta ekspor/impor file proyek `.swave.json`.

---

<a id="english"></a>
## English

**SWAVE Video** (**S**elf-Hosted & **W**eb-Native Visual Editor) is a **100% free, open-source, no-watermark, 60 FPS video and visual editor** built for both **casual creators / beginners** and **professional NLE workflows**, complete with **on-device AI Auto-Subtitles** and **dual runtime modes**.

Choose how you want to run it anytime directly from the top bar:

1. **On-Device Standalone Mode (*Web-Native* — Zero Server Required)**
   Download ready-to-use packages from **GitHub Releases** or open the live **GitHub Pages** app. All visual editing, WebGL2 shaders, AI Whisper transcription, silence removal (VAD), audio mixing, and MP4 export run **100% locally on your own phone (Android / iOS) or computer**.
2. **Self-Hosted PC Server Mode (*LAN Multi-Device & FFmpeg Offload*)**
   Run SWAVE Video on a PC/laptop over WiFi/LAN so phones, tablets, or secondary laptops can collaborate via QR Code or offload heavy FFmpeg H.264/NVENC rendering and `faster-whisper` transcription to your PC.

### Option 1: Download & Use Directly On-Device (No PC Server Needed)

- **Android (`.apk` & WebAPK)**:
  1. Open **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** and download **`SWAVE-Video-Android.apk`**. Exports save directly to `Downloads/SWAVE-VIDEO/`.
  2. Or open the **GitHub Pages** link in Chrome on Android and tap **Install app**.
- **iPhone & iPad / iOS (Safari PWA & `.ipa`)**:
  1. **Easiest Method (No sideloading/PC required)**: Open the **GitHub Pages** URL in **iOS Safari** → tap **Share (↑)** → **Add to Home Screen**. When finished exporting, tap **Simpan / Bagikan** to save the `.mp4` straight to **Photos / Files**.
  2. **Unsigned `.ipa`**: Download **`SWAVE-Video-iOS-Unsigned.ipa`** from **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)** and install via **AltStore**, **Sideloadly**, **TrollStore**, or sign in **Xcode** (`npm run mobile:ios`).
- **Portable Offline Desktop Bundle (`.zip` — No `npm install`)**:
  - Download **`SWAVE-Video-OnDevice-Portable.zip`** from **[Releases](https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest)**, extract it, and launch **`Jalankan-Di-Perangkat.bat`** (Windows) or **`./jalankan-di-perangkat.sh`** (Linux/macOS).

### Option 2: Run Self-Hosted PC Server (Windows, Linux, & macOS)

> **Requirement**: **Node.js `>= 22.5.0`** (Node.js 22 LTS recommended).

```bash
# 1. Shallow clone the repository
git clone --depth 1 https://github.com/khisanafif/WEB-EDITOR-VID-SERVER.git
cd WEB-EDITOR-VID-SERVER

# 2. Install workspace dependencies and OS ffmpeg binary
npm install

# 3. Start the self-hosted studio server on port 3000
npm start
# Or double-click start-studio.bat (Windows) / run ./start-studio.sh (Linux/macOS)
```

Open **`http://localhost:3000`** on your PC, scan the **Multi-Device / QR** code from your phone on the same WiFi, or enter `http://<PC-LAN-IP>:3000` inside the SWAVE Video app's **Server PC** settings.

### Key Features
- **Beginner & Pro Dual-Mode**: 1-click aspect ratios (`16:9`, `9:16`, `1:1`), **Fill / Fit** auto-framing, **Auto-Duck BGM**, royalty-free synthesized SFX/BGM, plus full NLE controls (**Split `S`**, **Trim `[` / `]`**, **Ripple Delete `Shift+Delete`**, **Detach Audio**, **Freeze Frame**, **Auto-Cut Silence**, **J/K/L Shuttle**, **Safe Zone Guides**, and **9 WebGL2 GLSL Shaders**).
- **Free AI Auto-Subtitles**: Browser Web Worker Whisper (`@huggingface/transformers`), optional local PC `faster-whisper` (`pip install faster-whisper`), live microphone dictation, offline script+VAD sync, optional BYOK Groq/OpenAI, word-level Karaoke highlighting, `.srt`/`.vtt` import/export, and burned-in MP4/ASS export.
- **Offline Storage & Portable Project Files**: Automatic OPFS + `localStorage` persistence plus `.swave.json` project export/import.

---

## Developer Build & Test Commands / Perintah Developer

```bash
npm run dev               # Hot-reload frontend (:5173) + backend (:3000)
npm run typecheck         # TypeScript check across shared, web, and server
npm test                  # Run Vitest unit & integration suites
npm run build             # Production build for web & server
npm run build:standalone  # Package portable offline web bundle (dist-standalone/)
npm run mobile:android    # Prepare Capacitor Android project (requires Android SDK)
npm run mobile:ios        # Prepare Capacitor iOS Xcode project (macOS only)
```

## Pro Keyboard Shortcuts / Pintasan Keyboard Mode Pro

| Shortcut | Action / Fungsi |
| :--- | :--- |
| `Space` | Play / Pause preview |
| `J` / `K` / `L` | Step back 1s / Stop / Forward shuttle (`1x` → `2x` → `4x`) |
| `←` / `→` | Move 1 frame (`Shift` + arrow for 1 second) |
| `S` | Split clip at playhead |
| `[` / `]` | Trim clip start (`[`) or end (`]`) to playhead |
| `Delete` | Delete selected clip |
| `Shift + Delete` | Ripple Delete (delete and close gap) |
| `Ctrl + D` | Duplicate selected clip |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |
| `?` | Toggle Quick Guide & Shortcuts modal |
