import { useState } from 'react';
import {
  Captions,
  Film,
  HelpCircle,
  Keyboard,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { useUiStore } from '../stores/uiStore';

interface HelpShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_ITEMS = [
  { keys: 'Space', desc: 'Play / Pause pratinjau video' },
  { keys: 'J / K / L', desc: 'Mundur cepat / Stop / Maju cepat (1x → 2x → 4x)' },
  { keys: '← / →', desc: 'Geser 1 frame (tahan Shift untuk 1 detik)' },
  { keys: 'S', desc: 'Potong (Split) klip di posisi garis biru' },
  { keys: '[ / ]', desc: 'Pangkas awal ([) atau akhir (]) klip ke posisi Playhead' },
  { keys: 'Delete', desc: 'Hapus klip yang sedang dipilih' },
  { keys: 'Shift + Delete', desc: 'Hapus & Rapatkan (Ripple Delete) tanpa celah kosong' },
  { keys: 'Ctrl + D', desc: 'Duplikat klip terpilih' },
  { keys: 'Ctrl + Z / Ctrl + Y', desc: 'Undo / Redo langkah pengeditan' },
  { keys: '?', desc: 'Buka / tutup jendela panduan & shortcut ini' },
];

export function HelpShortcutsModal({
  isOpen,
  onClose,
}: HelpShortcutsModalProps) {
  const [tab, setTab] = useState<'guide' | 'shortcuts'>('guide');
  const experienceMode = useUiStore((s) => s.experienceMode);
  const setExperienceMode = useUiStore((s) => s.setExperienceMode);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Panduan dan Shortcut Studio"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              Panduan Cepat & Shortcut SWAVE Video
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

        <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setTab('guide')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
              tab === 'guide'
                ? 'border-b-2 border-cyan-400 bg-zinc-900 text-cyan-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Panduan Mudah (Pemula)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('shortcuts')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
              tab === 'shortcuts'
                ? 'border-b-2 border-cyan-400 bg-zinc-900 text-cyan-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span>Shortcut Keyboard (Pro)</span>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {tab === 'guide' ? (
            <>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3">
                <p className="font-bold text-cyan-200">
                  Pilih Pengalaman Kerja Anda Kapan Saja:
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExperienceMode('beginner')}
                    className={`rounded-lg border p-2 text-left transition ${
                      experienceMode === 'beginner'
                        ? 'border-cyan-400 bg-cyan-500/20 text-white'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-300'
                    }`}
                  >
                    <p className="font-bold">Mode Pemula (Simpel)</p>
                    <p className="mt-0.5 text-[10px] text-zinc-300">
                      Istilah sederhana, preset 1-klik, bebas ribet.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExperienceMode('pro')}
                    className={`rounded-lg border p-2 text-left transition ${
                      experienceMode === 'pro'
                        ? 'border-violet-400 bg-violet-500/20 text-white'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-300'
                    }`}
                  >
                    <p className="font-bold">Mode Pro (Studio)</p>
                    <p className="mt-0.5 text-[10px] text-zinc-300">
                      Kontrol presisi NLE, color shader penuh, ripple & detach audio.
                    </p>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <Film className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
                  <div>
                    <p className="font-bold text-white">
                      1. Impor Video / Foto dari HP atau Laptop
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Seret video ke panel Media atau klik &ldquo;Impor Video / Foto&rdquo;.
                      Anda juga bisa klik &ldquo;Muat Demo&rdquo; untuk langsung mencoba.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <Captions className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
                  <div>
                    <p className="font-bold text-white">
                      2. Buat Subtitle Otomatis dalam 1 Klik
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Buka tab <strong>Subtitle (CC)</strong>, pilih bahasa, lalu klik{' '}
                      <strong>Generate Subtitle Otomatis</strong>. AI Whisper akan
                      mendengarkan suara video Anda secara gratis dan langsung
                      memasang subtitle beranimasi!
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <Scissors className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-bold text-white">
                      3. Potong, Tambah Filter, dan Ekspor MP4
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Tekan <strong>Split (S)</strong> untuk memotong bagian tidak
                      perlu, atau gunakan <strong>Potong Hening</strong> untuk
                      membuang jeda diam otomatis. Terakhir klik tombol hijau{' '}
                      <strong>Ekspor MP4</strong> di kanan atas!
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] text-zinc-400">
                  <strong className="text-zinc-200">Tips Mode Jalan:</strong> Ketuk
                  tombol <strong>Di Perangkat</strong> / <strong>Server PC</strong> di
                  bar atas jika ingin memilih apakah semua proses dikerjakan mandiri
                  di HP/laptop ini atau melalui perantara Server PC lewat WiFi/LAN.
                </div>
              </div>
            </>
          ) : (
            <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950/60">
              {SHORTCUT_ITEMS.map((item) => (
                <div
                  key={item.keys}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="text-[11px] text-zinc-300">{item.desc}</span>
                  <kbd className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
