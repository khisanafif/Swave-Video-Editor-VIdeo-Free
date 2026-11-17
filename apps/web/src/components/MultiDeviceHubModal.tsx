import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FolderOpen,
  Laptop,
  Plus,
  QrCode,
  RefreshCw,
  Server,
  Smartphone,
  Tablet,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type { ProjectSummary, ServerNetworkInfo } from '@swave/shared';
import { mediaRegistry } from '../engine/opfsStorage';
import {
  deleteProjectOnServer,
  fetchServerNetworkInfo,
  listServerProjects,
  loadProjectFromServer,
  resolveServerUrl,
  saveProjectToServer,
  uploadBlobInChunks,
} from '../engine/serverOffloadClient';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { generateQrMatrix } from '../utils/qrCode';

interface MultiDeviceHubModalProps {
  isOpen: boolean;
  initialTab?: 'connect' | 'projects';
  autoSaveEnabled: boolean;
  onToggleAutoSave: (enabled: boolean) => void;
  onClose: () => void;
}

export function MultiDeviceHubModal({
  isOpen,
  initialTab = 'connect',
  autoSaveEnabled,
  onToggleAutoSave,
  onClose,
}: MultiDeviceHubModalProps) {
  const [tab, setTab] = useState<'connect' | 'projects'>(initialTab);
  const [networkInfo, setNetworkInfo] = useState<ServerNetworkInfo | null>(null);
  const [selectedEndpointIdx, setSelectedEndpointIdx] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const projectId = useTimelineStore((s) => s.projectId);
  const projectName = useTimelineStore((s) => s.projectName);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const refreshHubData = async () => {
    setIsLoading(true);
    try {
      const [net, projList] = await Promise.all([
        fetchServerNetworkInfo(),
        listServerProjects(),
      ]);
      setNetworkInfo(net);
      setProjects(projList);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void refreshHubData();
    }
  }, [isOpen]);

  const activeBaseUrl = useMemo(() => {
    if (networkInfo && networkInfo.endpoints.length > 0) {
      const chosen =
        networkInfo.endpoints[selectedEndpointIdx] || networkInfo.endpoints[0];
      return chosen.url;
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://192.168.1.100:3000';
  }, [networkInfo, selectedEndpointIdx]);

  const shareUrl = `${activeBaseUrl}/?project=${encodeURIComponent(projectId)}`;
  const qrMatrix = useMemo(() => generateQrMatrix(shareUrl), [shareUrl]);

  if (!isOpen) return null;

  const handleSyncCurrentProjectAndMedia = async () => {
    setIsSyncingAll(true);
    setStatusMsg('Menyinkronkan media & proyek ke Server PC...');
    try {
      const store = useTimelineStore.getState();
      for (const asset of Object.values(store.assets)) {
        if (asset.serverUrl) continue;
        const blob = mediaRegistry.getBlob(asset.id);
        if (!blob) continue;
        const res = await uploadBlobInChunks({
          blob,
          asset,
          onProgress: (pct) =>
            store.updateAsset(asset.id, { uploadProgress: pct }),
        });
        store.updateAsset(asset.id, {
          source: 'hybrid',
          serverAssetId: res.assetId,
          serverUrl: res.mediaUrl,
          uploadProgress: 100,
        });
      }

      const doc = useTimelineStore.getState().exportProjectDocument();
      await saveProjectToServer(doc);
      await refreshHubData();
      setStatusMsg('Proyek & seluruh media siap dibuka di HP / Tablet / Laptop lain!');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err) {
      setStatusMsg(`Gagal sinkronisasi: ${(err as Error).message}`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleLoadServerProject = async (id: string) => {
    setIsLoading(true);
    try {
      const doc = await loadProjectFromServer(id);
      for (const asset of Object.values(doc.assets)) {
        if (asset.serverUrl) {
          mediaRegistry.registerRemoteAsset(
            asset.id,
            resolveServerUrl(asset.serverUrl)
          );
        }
      }
      useTimelineStore.getState().loadProjectDocument(doc);
      usePlaybackStore.getState().seekTo(0);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(
          null,
          '',
          `/?project=${encodeURIComponent(doc.id)}`
        );
      }
      onClose();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProjectOnServer(id);
    await refreshHubData();
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Multi-Device Studio Hub"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-xs shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              Multi-Device Studio Hub (PC &harr; HP &harr; Tablet &harr; Laptop)
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
            onClick={() => setTab('connect')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === 'connect'
                ? 'border-b-2 border-cyan-400 bg-zinc-900 text-cyan-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>Hubungkan HP / Tablet / Laptop</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === 'projects'
                ? 'border-b-2 border-cyan-400 bg-zinc-900 text-cyan-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Proyek Server Bersama ({projects.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'connect' ? (
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              {/* Left: Scannable SVG QR Code */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="rounded-lg bg-white p-2.5 shadow-md">
                  <svg
                    viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                    className="h-36 w-36"
                    shapeRendering="crispEdges"
                    aria-label="QR Code Akses LAN"
                  >
                    {qrMatrix.map((row, rIdx) =>
                      row.map((cell, cIdx) =>
                        cell ? (
                          <rect
                            key={`${rIdx}-${cIdx}`}
                            x={cIdx}
                            y={rIdx}
                            width={1}
                            height={1}
                            fill="#09090b"
                          />
                        ) : null
                      )
                    )}
                  </svg>
                </div>
                <p className="mt-2 text-center text-[11px] font-medium text-zinc-300">
                  Scan dengan Kamera HP / Tablet
                </p>
                <p className="text-center text-[10px] text-zinc-500">
                  Pastikan di WiFi / LAN yang sama
                </p>
              </div>

              {/* Right: LAN Details & Sync Controls */}
              <div className="space-y-3.5">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-cyan-300">
                      1. Alamat Server PC / Laptop Anda
                    </span>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                      {networkInfo
                        ? `Host: ${networkInfo.hostname}`
                        : 'Mode Lokal'}
                    </span>
                  </div>

                  {networkInfo && networkInfo.endpoints.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {networkInfo.endpoints.map((ep, idx) => (
                        <button
                          key={ep.address}
                          type="button"
                          onClick={() => setSelectedEndpointIdx(idx)}
                          className={`rounded border px-2 py-1 font-mono text-[10px] ${
                            idx === selectedEndpointIdx
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                          }`}
                        >
                          {ep.address} ({ep.interfaceName})
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-cyan-200"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl()}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-300">
                      2. Sinkronisasi Proyek & Media Lintas Perangkat
                    </span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={autoSaveEnabled}
                        onChange={(e) => onToggleAutoSave(e.target.checked)}
                        className="accent-emerald-400"
                      />
                      <span>Auto-Save Live</span>
                    </label>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Unggah semua media lokal di proyek <strong>{projectName}</strong> ke
                    Server PC agar saat dibuka di HP, Tablet, atau Laptop lain
                    seluruh video & audio langsung muncul di timeline:
                  </p>
                  <button
                    type="button"
                    disabled={isSyncingAll}
                    onClick={() => void handleSyncCurrentProjectAndMedia()}
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md bg-cyan-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    <Server className="h-4 w-4" />
                    <span>
                      {isSyncingAll
                        ? 'Menyinkronkan Media & Proyek...'
                        : 'Sinkronkan Proyek & Media ke Server PC Sekarang'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-400">
                  <div className="rounded border border-zinc-800/80 bg-zinc-950/50 p-2">
                    <Laptop className="mx-auto mb-1 h-4 w-4 text-cyan-400" />
                    <div className="font-semibold text-zinc-200">PC / Laptop Host</div>
                    <div>Nyalakan `start-studio.bat`</div>
                  </div>
                  <div className="rounded border border-zinc-800/80 bg-zinc-950/50 p-2">
                    <Smartphone className="mx-auto mb-1 h-4 w-4 text-emerald-400" />
                    <div className="font-semibold text-zinc-200">HP Android / iOS</div>
                    <div>Scan QR & Edit 60FPS</div>
                  </div>
                  <div className="rounded border border-zinc-800/80 bg-zinc-950/50 p-2">
                    <Tablet className="mx-auto mb-1 h-4 w-4 text-violet-400" />
                    <div className="font-semibold text-zinc-200">Tablet / Laptop 2</div>
                    <div>Lanjutkan Timeline Sama</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400">
                  Pilih proyek yang tersimpan di Server PC untuk dilanjutkan di
                  perangkat ini:
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      useTimelineStore.getState().resetProject();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Proyek Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshHubData()}
                    className="rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700"
                    title="Segarkan daftar proyek"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {isLoading ? (
                <p className="py-8 text-center text-zinc-500">
                  Memuat daftar proyek dari server...
                </p>
              ) : projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-zinc-500">
                  Belum ada proyek tersimpan di Server PC. Klik{' '}
                  <strong>Simpan Proyek</strong> atau aktifkan{' '}
                  <strong>Auto-Save Live</strong>.
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.map((proj) => {
                    const isCurrent = proj.id === projectId;
                    return (
                      <div
                        key={proj.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition ${
                          isCurrent
                            ? 'border-cyan-500/50 bg-cyan-950/20'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-100">
                              {proj.name}
                            </span>
                            {isCurrent && (
                              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                                Sedang Dibuka
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                            ID: {proj.id} · Diperbarui:{' '}
                            {new Date(proj.updatedAt).toLocaleString('id-ID')}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleLoadServerProject(proj.id)}
                            className="rounded bg-cyan-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-cyan-400"
                          >
                            {isCurrent ? 'Muat Ulang' : 'Buka Proyek'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteProject(proj.id)}
                            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                            title="Hapus proyek dari server"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {statusMsg && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-2 text-center text-xs text-cyan-200">
              {statusMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

