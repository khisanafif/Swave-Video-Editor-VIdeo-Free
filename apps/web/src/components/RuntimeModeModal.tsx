import { useEffect, useRef, useState } from 'react';
import {
  Apple,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FolderInput,
  FolderOutput,
  Globe,
  Laptop,
  Loader2,
  Server,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import type { ServerCapabilities } from '@swave/shared';
import type { PwaInstallState } from '../hooks/usePwaInstall';
import {
  exportProjectJsonToDevice,
  hydrateProjectMediaAssets,
  parseProjectJsonFile,
  saveProjectLocally,
} from '../engine/localPersistence';
import {
  getServerBaseUrl,
  testAndConnectServer,
} from '../engine/serverOffloadClient';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';
import { SwaveLogoMark } from './SwaveLogoMark';

const GITHUB_RELEASES_URL =
  'https://github.com/khisanafif/WEB-EDITOR-VID-SERVER/releases/latest';
const GITHUB_PAGES_URL =
  'https://khisanafif.github.io/WEB-EDITOR-VID-SERVER/';

interface RuntimeModeModalProps {
  isOpen: boolean;
  initialTab?: 'mode' | 'download';
  serverCaps: ServerCapabilities | null;
  onServerCapsChange: (caps: ServerCapabilities | null) => void;
  onOpenQrHub: () => void;
  pwa: PwaInstallState;
  onClose: () => void;
}

export function RuntimeModeModal({
  isOpen,
  initialTab = 'mode',
  serverCaps,
  onServerCapsChange,
  onOpenQrHub,
  pwa,
  onClose,
}: RuntimeModeModalProps) {
  const projectInputRef = useRef<HTMLInputElement>(null);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const setRuntimeMode = useUiStore((s) => s.setRuntimeMode);

  const [tab, setTab] = useState<'mode' | 'download'>(initialTab);
  const [serverUrl, setServerUrl] = useState(() => getServerBaseUrl());
  const [isConnecting, setIsConnecting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setServerUrl(getServerBaseUrl());
      setFeedback(null);
      setErrorMsg(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleUseStandalone = () => {
    setErrorMsg(null);
    setRuntimeMode('standalone', true);
    onServerCapsChange(null);
    setFeedback(
      'Mode Mandiri di Perangkat aktif! Semua edit, AI Subtitle, & ekspor kini diproses 100% di perangkat ini.'
    );
  };

  const handleConnectServer = async () => {
    setErrorMsg(null);
    setFeedback(null);
    setIsConnecting(true);
    try {
      const caps = await testAndConnectServer(serverUrl);
      if (!caps || caps.status !== 'online') {
        setErrorMsg(
          'Tidak dapat terhubung ke Server PC. Pastikan PC menjalankan start-studio.bat / npm start, WiFi sama, dan alamat IP:Port (mis. http://192.168.1.10:3000) benar.'
        );
        onServerCapsChange(null);
        return;
      }
      onServerCapsChange(caps);
      setRuntimeMode('server', true);
      setFeedback(
        `Terhubung ke Server PC (${caps.preferredEncoder || 'FFmpeg siap'})! Render & sinkronisasi lintas perangkat aktif.`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleExportProjectFile = () => {
    const doc = useTimelineStore.getState().exportProjectDocument();
    saveProjectLocally(doc);
    exportProjectJsonToDevice(doc);
    setFeedback('File proyek (.swave.json) diekspor ke penyimpanan perangkat.');
  };

  const handleImportProjectFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    try {
      const doc = await parseProjectJsonFile(files[0]);
      await hydrateProjectMediaAssets(doc);
      useTimelineStore.getState().loadProjectDocument(doc);
      usePlaybackStore.getState().seekTo(0);
      saveProjectLocally(doc);
      setFeedback(`Proyek "${doc.name}" berhasil dimuat.`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Mode Studio dan Instalasi Aplikasi Android / iOS"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 text-xs shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <SwaveLogoMark className="h-5 w-5" />
            <h2 className="text-sm font-bold text-white">
              Mode Operasi & Unduh Aplikasi (Android · iOS · PC)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setTab('mode')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === 'mode'
                ? 'border-b-2 border-cyan-400 bg-zinc-900 text-cyan-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Pilih Mode (HP / Server PC)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('download')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === 'download'
                ? 'border-b-2 border-emerald-400 bg-zinc-900 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Unduh APK / iOS / Web App</span>
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto p-4 text-zinc-300">
          {tab === 'mode' ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {/* Standalone On-Device Card */}
                <button
                  type="button"
                  onClick={handleUseStandalone}
                  className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                    runtimeMode === 'standalone'
                      ? 'border-cyan-400 bg-cyan-950/30 shadow-md shadow-cyan-500/10'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <Cpu className="h-4 w-4 text-cyan-400" />
                      <span>Mandiri di Perangkat</span>
                    </div>
                    {runtimeMode === 'standalone' && (
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                        AKTIF
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                    <strong>100% proses di HP/device ini sendiri</strong>. Tidak
                    perlu PC/laptop lain & zero server upload. Edit, Whisper AI
                    subtitle, dan ekspor MP4/WebM langsung lokal.
                  </p>
                </button>

                {/* Server PC Offload Card */}
                <button
                  type="button"
                  onClick={() => void handleConnectServer()}
                  className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                    runtimeMode === 'server'
                      ? 'border-emerald-400 bg-emerald-950/30 shadow-md shadow-emerald-500/10'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <Server className="h-4 w-4 text-emerald-400" />
                      <span>Perantara Server PC</span>
                    </div>
                    {runtimeMode === 'server' && serverCaps?.status === 'online' && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                        ONLINE
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                    Hubungkan ke <strong>PC / Laptop host</strong> di WiFi/LAN yang
                    sama untuk render FFmpeg GPU cepat, <code>faster-whisper</code>{' '}
                    PC, & sinkronisasi proyek lintas perangkat.
                  </p>
                </button>
              </div>

              {/* Optional PC Server URL connector */}
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                    <Globe className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Alamat Server PC / Laptop (Jika Pakai Mode Server)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenQrHub();
                    }}
                    className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-zinc-700"
                  >
                    <Wifi className="h-3 w-3" />
                    <span>Buka QR Hub</span>
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="url"
                    placeholder="Kosong (jika di PC host) atau mis. http://192.168.1.10:3000"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={() => void handleConnectServer()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Server className="h-3.5 w-3.5" />
                    )}
                    <span>Hubungkan</span>
                  </button>
                </div>

                {serverCaps?.status === 'online' && (
                  <p className="text-[10px] text-emerald-300">
                    Server PC terdeteksi aktif · Encoder FFmpeg:{' '}
                    <code>{serverCaps.preferredEncoder || 'libx264'}</code>
                  </p>
                )}
              </div>

              {/* Local Project Backup (.swave.json) — 100% Standalone */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                <p className="font-semibold text-zinc-100">
                  Cadangkan / Buka File Proyek Lokal (Tanpa Server)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Proyek tersimpan otomatis di memori perangkat. Ekspor file{' '}
                  <code>.swave.json</code> jika ingin memindahkan atau mencadangkan
                  timeline.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExportProjectFile}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-cyan-400"
                  >
                    <FolderOutput className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Simpan File (.json)</span>
                  </button>
                  <input
                    ref={projectInputRef}
                    type="file"
                    accept=".json,.swave.json,.velocut.json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      void handleImportProjectFile(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => projectInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-emerald-400"
                  >
                    <FolderInput className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Muat File Proyek (.json)</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {pwa.canInstall && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5">
                  <p className="font-bold text-emerald-300">
                    Browser Anda mendukung instalasi 1-Klik!
                  </p>
                  <button
                    type="button"
                    onClick={() => void pwa.promptInstall()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 font-bold text-zinc-950 hover:bg-emerald-400"
                  >
                    <Download className="h-4 w-4" />
                    <span>Instal SWAVE Video di Perangkat Ini Sekarang</span>
                  </button>
                </div>
              )}

              {/* GitHub Releases Direct Download Card */}
              <div className="rounded-xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/35 to-zinc-950 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-cyan-200">
                      Unduh Paket Siap Pakai dari GitHub Releases
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      100% proses berlangsung di perangkat Anda — tidak butuh server PC
                      ataupun instal Node.js.
                    </p>
                  </div>
                  <a
                    href={GITHUB_RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:bg-cyan-400"
                  >
                    <span>Releases</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ul className="mt-2.5 space-y-1 text-[11px] text-zinc-300">
                  <li>
                    • <strong>Android:</strong>{' '}
                    <code>SWAVE-Video-Android.apk</code> (instal langsung sebagai
                    aplikasi HP Android)
                  </li>
                  <li>
                    • <strong>iPhone / iPad (iOS):</strong>{' '}
                    <code>SWAVE-Video-iOS-Unsigned.ipa</code> (AltStore / Sideloadly
                    / TrollStore / Xcode)
                  </li>
                  <li>
                    • <strong>Laptop Portabel:</strong>{' '}
                    <code>SWAVE-Video-OnDevice-Portable.zip</code> (ekstrak &amp;
                    klik jalan)
                  </li>
                </ul>
              </div>

              {/* iPhone / iPad (iOS) Guide */}
              <div
                className={`rounded-xl border p-3.5 ${
                  pwa.isIos
                    ? 'border-violet-400/60 bg-violet-950/25'
                    : 'border-zinc-800 bg-zinc-950/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-bold text-white">
                    <Apple className="h-4 w-4 text-zinc-200" />
                    <span>Cara Pasang & Jalankan di iPhone / iPad (iOS)</span>
                  </h3>
                  {pwa.isIos && (
                    <span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-bold text-violet-200">
                      PERANGKAT iOS ANDA
                    </span>
                  )}
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-zinc-300">
                  <li>
                    <strong>Paling Mudah (Resmi, Tanpa PC/Sideload):</strong> Buka{' '}
                    <a
                      href={GITHUB_PAGES_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-300 underline"
                    >
                      Web App GitHub Pages
                    </a>{' '}
                    di <strong>Safari iOS</strong> → ketuk ikon{' '}
                    <strong>Bagikan (Share ↑)</strong> → pilih{' '}
                    <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
                    Semua editing &amp; ekspor <code>.mp4</code> berjalan langsung di
                    iPhone/iPad Anda.
                  </li>
                  <li>
                    <strong>Via File `.ipa`:</strong> Unduh{' '}
                    <code>SWAVE-Video-iOS-Unsigned.ipa</code> dari GitHub Releases,
                    lalu pasang via <strong>AltStore / Sideloadly / TrollStore</strong>{' '}
                    (atau sign di Xcode via <code>npm run mobile:ios</code>).
                  </li>
                </ol>
              </div>

              {/* Android Guide */}
              <div
                className={`rounded-xl border p-3.5 ${
                  pwa.isAndroid
                    ? 'border-emerald-400/60 bg-emerald-950/25'
                    : 'border-zinc-800 bg-zinc-950/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-bold text-emerald-300">
                    <Smartphone className="h-4 w-4" />
                    <span>Cara Pasang di HP Android (APK & WebAPK)</span>
                  </h3>
                  {pwa.isAndroid && (
                    <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                      ANDROID ANDA
                    </span>
                  )}
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-zinc-300">
                  <li>
                    <strong>Download APK Langsung:</strong> Ambil{' '}
                    <code>SWAVE-Video-Android.apk</code> dari{' '}
                    <a
                      href={GITHUB_RELEASES_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 underline"
                    >
                      GitHub Releases
                    </a>{' '}
                    lalu instal di HP Android Anda.
                  </li>
                  <li>
                    <strong>Atau Chrome WebAPK (1-Klik):</strong> Buka GitHub Pages
                    di Chrome Android → menu titik tiga →{' '}
                    <strong>Instal aplikasi</strong>.
                  </li>
                </ol>
              </div>

              {/* Local PC / Mac Developer Build Info */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="flex items-center gap-1.5 font-semibold text-zinc-200">
                  <Laptop className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Build Sendiri dari Source Code (Opsional Developer)</span>
                </p>
                <pre className="mt-1.5 overflow-x-auto rounded bg-zinc-900 p-2 font-mono text-[10px] text-cyan-300">
                  {`npm run mobile:android   # Siapkan project APK Capacitor Android
npm run mobile:ios       # Siapkan project Xcode Capacitor iOS
npm run build:standalone # Hasilkan paket web portabel mandiri`}
                </pre>
              </div>
            </>
          )}

          {feedback && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-[11px] text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{feedback}</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
