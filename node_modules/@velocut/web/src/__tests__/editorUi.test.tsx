import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorPage } from '../components/VideoEditorPage';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { generateQrMatrix } from '../utils/qrCode';

describe('VideoEditorPage UI Integration (Desktop, Tablet, Android & Multi-Device Hub)', () => {
  beforeEach(() => {
    useTimelineStore.getState().resetProject();
    useTimelineStore.temporal.getState().clear();
    usePlaybackStore.setState({ currentTime: 0, isPlaying: false });

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

    const addTextBtn = screen.getByRole('button', {
      name: /Tambah Teks Overlay/i,
    });
    fireEvent.click(addTextBtn);

    expect(screen.getByText(/Konten & Gaya Teks/i)).toBeInTheDocument();
    expect(screen.getByTestId('capcut-canvas-gizmo')).toBeInTheDocument();

    // Test CapCut 1-click Subtitle Bawah placement button
    fireEvent.click(screen.getByRole('button', { name: /↓ Subtitle Bawah/i }));
    const activeId = useTimelineStore.getState().selectedClipIds[0];
    expect(useTimelineStore.getState().clips[activeId].transforms.y).toBeGreaterThan(0);

    // Test Direct On-Canvas Inline Text Editor toggle
    fireEvent.click(screen.getByRole('button', { name: /Ketik \/ Edit Teks/i }));
    expect(screen.getByText(/Edit Teks Langsung \(Gaya CapCut\)/i)).toBeInTheDocument();
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

  it('provides CapCut Free creative tabs (Media, Audio, Teks/Auto-Caption, Stiker, Efek) and per-clip Speed/Animation controls', async () => {
    render(<VideoEditorPage />);
    await act(async () => {
      await Promise.resolve();
    });

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

    // Inspector shows CapCut Speed & Animation controls for the selected clip
    expect(screen.getByText(/Kecepatan \(Speed\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Animasi Masuk & Keluar \(CapCut\)/i)
    ).toBeInTheDocument();
  });
});
