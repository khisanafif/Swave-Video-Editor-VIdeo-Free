import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorPage } from '../components/VideoEditorPage';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';
import { generateQrMatrix } from '../utils/qrCode';

describe('VideoEditorPage UI Integration (Desktop, Tablet, Android & Multi-Device Hub)', () => {
  beforeEach(() => {
    localStorage.clear();
    useTimelineStore.getState().resetProject();
    useTimelineStore.temporal.getState().clear();
    usePlaybackStore.setState({ currentTime: 0, isPlaying: false });
    useUiStore.setState({
      experienceMode: 'beginner',
      runtimeMode: 'standalone',
      safeGuideMode: 'none',
      timelineToolMode: 'select',
      layoutPreference: 'auto',
      mobileTimelineFocus: 'main',
      activeMediaCategory: 'media',
      clipboardStyle: null,
      showExportModal: false,
      showHelpModal: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }))
    );

    if (!HTMLCanvasElement.prototype.getContext) {
      HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    } else {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    }
  });

  it('adds a text overlay clip, inspects it, and handles Space / Delete shortcuts', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    const addTextBtn = screen.getByRole('button', {
      name: /Tambah Teks Overlay/i,
    });
    fireEvent.click(addTextBtn);

    expect(screen.getByText(/Konten & Gaya Teks/i)).toBeInTheDocument();
    expect(screen.getByTestId('canvas-overlay-gizmo')).toBeInTheDocument();

    // Test 1-click Subtitle Bawah placement button
    fireEvent.click(screen.getByRole('button', { name: /↓ Subtitle Bawah/i }));
    const activeId = useTimelineStore.getState().selectedClipIds[0];
    expect(useTimelineStore.getState().clips[activeId].transforms.y).toBeGreaterThan(0);

    // Test Direct On-Canvas Inline Text Editor toggle
    fireEvent.click(screen.getByRole('button', { name: /Ketik \/ Edit Teks/i }));
    expect(screen.getByText(/Edit Teks Langsung/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Selesai$/i }));

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(false);

    expect(Object.keys(useTimelineStore.getState().clips)).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(Object.keys(useTimelineStore.getState().clips)).toHaveLength(0);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(Object.keys(useTimelineStore.getState().clips)).toHaveLength(1);
  });

  it('switches into Android Mobile Studio mode with bottom navigation dock, slide-up drawer, and APK/PWA modal', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Cycle Desktop -> Mobile (HP)
    const modeToggle = screen.getByTitle(
      /Beralih antara Tampilan Studio Android/i
    );
    fireEvent.click(modeToggle);

    const androidNav = screen.getByRole('navigation', {
      name: /Navigasi Studio Android/i,
    });
    expect(androidNav).toBeInTheDocument();

    const quickTextBtn = screen.getByRole('button', { name: /\+ Teks/i });
    fireEvent.click(quickTextBtn);

    expect(Object.keys(useTimelineStore.getState().clips)).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: /Panel Alat Mobile/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Konten & Gaya Teks/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tutup/i }));
    expect(
      screen.queryByRole('dialog', { name: /Panel Alat Mobile/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Klip aktif:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /App APK/i }));
    expect(
      screen.getByRole('dialog', { name: /Instalasi Aplikasi Android/i })
    ).toBeInTheDocument();
  });

  it('opens the Multi-Device Studio Hub with a valid scannable QR code and shared project browser', async () => {
    const matrix = generateQrMatrix('http://192.168.1.100:3000/?project=demo');
    expect(matrix.length).toBeGreaterThanOrEqual(25);
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);

    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    const qrBtn = screen.getByTitle(
      /Buka Proyek Ini di HP, Tablet, atau Laptop Lain/i
    );
    await act(async () => {
      fireEvent.click(qrBtn);
      await Promise.resolve();
    });

    expect(
      screen.getByRole('dialog', { name: /Multi-Device Studio Hub/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/QR Code Akses LAN/i)).toBeInTheDocument();
  });

  it('provides creative tabs (Media, Audio, Teks/Auto-Caption, Stiker, Efek) and per-clip Speed/Animation controls', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Switch to Teks tab and generate Auto-Captions
    fireEvent.click(screen.getByTitle(/Kategori Teks/i));
    const autoCaptionBtn = screen.getByRole('button', {
      name: /Buat Auto-Caption/i,
    });
    fireEvent.click(autoCaptionBtn);

    const clipCountAfterCaptions = Object.keys(
      useTimelineStore.getState().clips
    ).length;
    expect(clipCountAfterCaptions).toBeGreaterThanOrEqual(2);

    // Switch to Stiker tab and add a Sticker
    fireEvent.click(screen.getByTitle(/Kategori Stiker/i));
    fireEvent.click(screen.getByRole('button', { name: /Api Hype/i }));
    expect(Object.keys(useTimelineStore.getState().clips).length).toBe(
      clipCountAfterCaptions + 1
    );

    // Inspector shows Speed & Animation controls for the selected clip
    expect(screen.getByText(/Kecepatan \(Speed\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Animasi Masuk & Keluar/i)).toBeInTheDocument();
  });

  it('supports Dual-Mode (Pemula vs Pro), Dedicated Subtitle AI Studio tab, Export Modal, and Help Shortcuts Modal', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Starts in Pemula mode without technical clutter
    expect(
      screen.queryByTitle(/Diagnostik Runtime Studio/i)
    ).not.toBeInTheDocument();

    // Switch to Pro mode -> exposes Runtime Diagnostics & Pro tools
    fireEvent.click(screen.getByRole('button', { name: /^Pro$/i }));
    expect(useUiStore.getState().experienceMode).toBe('pro');
    expect(
      screen.getByTitle(/Diagnostik Runtime Studio/i)
    ).toBeInTheDocument();

    // Switch to Subtitle (CC) Studio tab
    fireEvent.click(screen.getByTitle(/Kategori Subtitle/i));
    expect(
      screen.getByText(/Subtitle Otomatis \(AI Speech-to-Text\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate Subtitle Otomatis/i })
    ).toBeInTheDocument();

    // Open Top-Bar Export Modal
    fireEvent.click(screen.getByRole('button', { name: /Ekspor MP4/i }));
    expect(
      screen.getByRole('dialog', { name: /Ekspor Video Studio/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/TikTok \/ Reels/i)).toBeInTheDocument();

    // Open Help & Shortcuts Modal with '?' key
    fireEvent.keyDown(window, { key: '?' });
    expect(
      screen.getByRole('dialog', { name: /Panduan dan Shortcut Studio/i })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Shortcut Keyboard \(Pro\)/i })
    );
    expect(screen.getByText(/Shift \+ Delete/i)).toBeInTheDocument();
  });

  it('supports switching between Standalone On-Device mode, Mobile APK/iOS downloads, and PC Server offload', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Save in standalone mode saves locally without complaining about Server Offline
    const saveBtn = screen.getByTitle(/Simpan Proyek Lokal di Perangkat/i);
    await act(async () => {
      fireEvent.click(saveBtn);
      await Promise.resolve();
    });
    expect(screen.getByText(/Tersimpan Lokal/i)).toBeInTheDocument();

    // Open Runtime Mode & Mobile Download Modal
    fireEvent.click(screen.getByTitle(/Pilih Mode Operasi/i));
    const dialog = screen.getByRole('dialog', {
      name: /Instalasi Aplikasi Android/i,
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Mandiri di Perangkat/i)).toBeInTheDocument();
    expect(screen.getByText(/Perantara Server PC/i)).toBeInTheDocument();

    // Switch to APK / iOS / Portable Download tab
    fireEvent.click(
      screen.getByRole('button', { name: /Unduh APK \/ iOS \/ Web App/i })
    );
    expect(
      screen.getAllByText(/SWAVE-Video-Android\.apk/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/SWAVE-Video-iOS-Unsigned\.ipa/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/SWAVE-Video-OnDevice-Portable\.zip/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Safari iOS/i).length).toBeGreaterThanOrEqual(1);

    // Test connecting to PC Server from Mode tab
    fireEvent.click(
      screen.getByRole('button', { name: /Pilih Mode \(HP \/ Server PC\)/i })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'online',
          ffmpegAvailable: true,
          preferredEncoder: 'libx264',
        }),
      }))
    );

    const urlInput = screen.getByPlaceholderText(/192\.168\.1\.10:3000/i);
    fireEvent.change(urlInput, { target: { value: '192.168.1.50:3000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Hubungkan$/i }));
      await Promise.resolve();
    });
    expect(useUiStore.getState().runtimeMode).toBe('server');
  });

  it('exposes Audio Upload, Extract Audio (.WAV), Voiceover Recorder, Crop, Blend Mode, Chroma Key, Snapshot & Audio Export UI', async () => {
    useTimelineStore.getState().registerAsset({
      id: 'vid-sample',
      name: 'kamera.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      size: 2048,
      duration: 8,
      width: 1920,
      height: 1080,
      hasAudio: true,
      source: 'local',
    });
    useTimelineStore.getState().addClipFromAsset('vid-sample', 'track-1', 0);

    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Video clip inspector exposes Extract .WAV, Crop, Blend Mode & Chroma Key
    expect(screen.getByRole('button', { name: /Ekstrak \.WAV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mute Klip/i })).toBeInTheDocument();
    expect(screen.getByText(/Crop, Sudut & Blend/i)).toBeInTheDocument();
    expect(screen.getByText(/Chroma Key \(Green Screen\)/i)).toBeInTheDocument();

    // Preview bar exposes Snapshot PNG button
    expect(screen.getByRole('button', { name: /Snapshot/i })).toBeInTheDocument();

    // Switch to Audio tab -> dedicated Audio Upload, Extract Audio & Mic Voiceover
    fireEvent.click(screen.getByTitle(/Kategori Audio/i));
    expect(
      screen.getByText(/Upload Musik & Audio \(MP3, WAV, M4A, OGG\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Ekstrak Audio dari Video \(\.WAV\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ekstrak ke Track/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unduh Audio \.WAV/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Mulai Rekam Mikrofon/i })
    ).toBeInTheDocument();

    // Open Export Modal -> Audio-only WAV export option exists alongside Video export
    fireEvent.click(screen.getByRole('button', { name: /Ekspor MP4/i }));
    expect(screen.getByRole('button', { name: /Audio \(\.WAV\)/i })).toBeInTheDocument();
  });

  it('supports Tri-Mode Adaptive Layout switching (Mobile 50vw center playhead + contextual dock, Tablet icon rail, Desktop Blade B / Select A tools)', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Desktop starts with [Pilih] (A) & [Blade] (B) timeline cursor tools
    fireEvent.keyDown(window, { key: 'b' });
    expect(useUiStore.getState().timelineToolMode).toBe('blade');
    fireEvent.keyDown(window, { key: 'a' });
    expect(useUiStore.getState().timelineToolMode).toBe('select');

    // Cycle Desktop -> Mobile (HP)
    const modeToggle = screen.getByTitle(
      /Beralih antara Tampilan Studio Android/i
    );
    fireEvent.click(modeToggle);
    expect(screen.getByLabelText(/Playhead Tengah Mobile/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Bisukan suara track utama/i)).toBeInTheDocument();

    // Selecting a clip changes Mobile Bottom Dock into Contextual Actions with Back [<] button
    act(() => {
      useTimelineStore.getState().addTextClip('Demo HP', 0);
    });
    expect(screen.getByRole('button', { name: /^Kembali$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kecepatan/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Kembali$/i }));
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);

    // Cycle Mobile -> Tablet (renders Tablet vertical Icon Rail)
    fireEvent.click(
      screen.getByTitle(/Beralih antara Tampilan Studio Android/i)
    );
    expect(
      screen.getByRole('navigation', { name: /Rail Alat Tablet/i })
    ).toBeInTheDocument();
  });

  it('adapts smoothly when rotated into Phone/APK Landscape mode (844x390) with right vertical dock', async () => {
    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });

    try {
      render(<VideoEditorPage />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/HP Lanskap/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Playhead Tengah Mobile/i)).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', { name: /Navigasi Studio Android/i })
      ).toHaveClass('flex-col');

      // Mobile overflow menu popover opens Studio settings cleanly
      fireEvent.click(screen.getByRole('button', { name: /Menu Studio/i }));
      expect(screen.getByText(/Multi-Device \/ QR Hub/i)).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: prevW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: prevH, configurable: true });
    }
  });

  it('supports CapCut Image/Multi-Overlay stacking UI and Custom Resolution + Aspect Ratio selector', async () => {
    useTimelineStore.getState().registerAsset({
      id: 'vid-base',
      name: 'utama.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      size: 4096,
      duration: 8,
      width: 1920,
      height: 1080,
      hasAudio: true,
      source: 'local',
    });
    useTimelineStore.getState().registerAsset({
      id: 'img-ovl-1',
      name: 'stiker_logo.png',
      kind: 'image',
      mimeType: 'image/png',
      size: 1024,
      duration: 4,
      width: 512,
      height: 512,
      hasAudio: false,
      source: 'local',
    });
    useTimelineStore.getState().registerAsset({
      id: 'img-ovl-2',
      name: 'bingkai_promo.png',
      kind: 'image',
      mimeType: 'image/png',
      size: 1024,
      duration: 4,
      width: 800,
      height: 600,
      hasAudio: false,
      source: 'local',
    });

    useTimelineStore.getState().addClipFromAsset('vid-base', 'track-1', 0);
    const ovl1 = useTimelineStore.getState().addOverlayClipFromAsset('img-ovl-1', 1)!;
    useTimelineStore.getState().addOverlayClipFromAsset('img-ovl-2', 1);

    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByLabelText(/Logo SWAVE/i).length).toBeGreaterThanOrEqual(1);

    // Open CapCut Overlay Studio category -> lists both overlays & lets user reorder layer
    fireEvent.click(screen.getByTitle(/Kategori Overlay/i));
    expect(screen.getByText(/Urutan Lapisan Overlay/i)).toBeInTheDocument();
    expect(screen.getAllByText(/stiker_logo\.png/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/bingkai_promo\.png/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Naikkan Layer stiker_logo\.png/i }));
    const afterReorder = useTimelineStore.getState();
    const ovl1Track = afterReorder.clips[ovl1].trackId;
    const upperTracks = afterReorder.trackOrder.filter(
      (tid) => tid !== 'track-1' && afterReorder.tracks[tid]?.type !== 'audio'
    );
    expect(upperTracks.indexOf(ovl1Track)).toBe(upperTracks.length - 1);

    // Open CapCut Resolution Popover -> apply Custom 1440x1800 @ 60fps
    fireEvent.click(screen.getByRole('button', { name: /Resolusi Kanvas/i }));
    expect(
      screen.getByRole('dialog', { name: /Pengaturan Resolusi dan Rasio CapCut/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Kustom/i }));
    fireEvent.change(screen.getByLabelText(/Lebar Resolusi Kustom/i), {
      target: { value: '1440' },
    });
    fireEvent.change(screen.getByLabelText(/Tinggi Resolusi Kustom/i), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Terapkan$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^60$/i }));

    expect(useTimelineStore.getState().resolution.width).toBe(1440);
    expect(useTimelineStore.getState().resolution.height).toBe(1800);
    expect(useTimelineStore.getState().resolution.fps).toBe(60);
  });

  it('places mobile overlays cleanly below main video and displays overlay-only tracks when editing overlays on phone', async () => {
    const store = useTimelineStore.getState();
    store.registerAsset({
      id: 'vid-mobile-base',
      name: 'utama_hp.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      size: 2048,
      duration: 6,
      width: 1080,
      height: 1920,
      hasAudio: true,
      source: 'local',
    });
    store.registerAsset({
      id: 'img-mob-1',
      name: 'ovl_satu.png',
      kind: 'image',
      mimeType: 'image/png',
      size: 512,
      duration: 4,
      width: 400,
      height: 400,
      hasAudio: false,
      source: 'local',
    });
    store.registerAsset({
      id: 'img-mob-2',
      name: 'ovl_dua.png',
      kind: 'image',
      mimeType: 'image/png',
      size: 512,
      duration: 4,
      width: 400,
      height: 400,
      hasAudio: false,
      source: 'local',
    });

    store.addClipFromAsset('vid-mobile-base', 'track-1', 0);
    const ovl1Id = store.addOverlayClipFromAsset('img-mob-1', 0)!;
    const ovl2Id = store.addOverlayClipFromAsset('img-mob-2', 0)!;

    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });

    try {
      render(<VideoEditorPage />);
      await act(async () => {
        await Promise.resolve();
      });

      const timeline = screen.getByLabelText(/Multi-Track Timeline/i);
      const ovl1TrackId = useTimelineStore.getState().clips[ovl1Id].trackId;
      const ovl2TrackId = useTimelineStore.getState().clips[ovl2Id].trackId;

      // Selected overlay auto-enters Overlay-only mode on phone:
      // Main Video ref stays on top, Overlay 1 & Overlay 2 appear BELOW it, and Text/Audio tracks are hidden!
      expect(timeline).toHaveAttribute('data-mobile-timeline-view', 'overlay');
      const mainRefEl = timeline.querySelector('[data-mobile-main-ref="true"]')!;
      const ovl1El = timeline.querySelector(`[data-track-id="${ovl1TrackId}"]`)!;
      const ovl2El = timeline.querySelector(`[data-track-id="${ovl2TrackId}"]`)!;
      expect(mainRefEl).not.toBeNull();
      expect(ovl1El).not.toBeNull();
      expect(ovl2El).not.toBeNull();
      expect(
        mainRefEl.compareDocumentPosition(ovl1El) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        ovl1El.compareDocumentPosition(ovl2El) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(timeline.querySelector('[data-track-id="track-2"]')).toBeNull();
      expect(timeline.querySelector('[data-track-id="track-3"]')).toBeNull();

      // Clicking Back [<] exits Overlay-only mode back to Main Timeline showing compact Overlay pill below Video Utama
      fireEvent.click(screen.getByRole('button', { name: /^Kembali$/i }));
      expect(timeline).toHaveAttribute('data-mobile-timeline-view', 'main');
      const summaryBtn = screen.getByTestId('mobile-overlay-summary-strip');
      const mainTrackEl = timeline.querySelector('[data-track-id="track-1"]')!;
      expect(
        mainTrackEl.compareDocumentPosition(summaryBtn) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(timeline.querySelector('[data-track-id="track-3"]')).not.toBeNull();

      // Clicking summary strip jumps cleanly back into Overlay-only view
      fireEvent.click(summaryBtn);
      expect(timeline).toHaveAttribute('data-mobile-timeline-view', 'overlay');
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: prevW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: prevH, configurable: true });
    }
  });
});
