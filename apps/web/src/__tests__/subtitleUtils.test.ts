import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIP_TRANSFORM, DEFAULT_TEXT_STYLE, type Clip } from '@swave/shared';
import { detectSpeechSegmentsVad, encodeMonoWav16k } from '../engine/audioExtractor';
import {
  alignTranscriptToSpeechSegments,
  chunkSubtitleCues,
  exportSubtitlesToSrt,
  exportSubtitlesToVtt,
  parseSrt,
  parseSubtitlesAuto,
  parseVtt,
} from '../engine/subtitleUtils';

describe('Subtitle Utilities & Audio VAD', () => {
  it('parses SRT and VTT formats accurately and strips markup tags', () => {
    const srt = `1
00:00:01,250 --> 00:00:03,500
<i>Halo semuanya!</i>

2
00:00:04,000 --> 00:00:06,200
Selamat datang di SWAVE Video`;

    const parsedSrt = parseSrt(srt);
    expect(parsedSrt).toHaveLength(2);
    expect(parsedSrt[0]).toEqual({
      start: 1.25,
      end: 3.5,
      text: 'Halo semuanya!',
    });

    const vtt = `WEBVTT

NOTE komentar diabaikan

00:02.500 --> 00:05.000 align:middle
Baris pertama VTT`;

    const parsedVtt = parseVtt(vtt);
    expect(parsedVtt).toHaveLength(1);
    expect(parsedVtt[0]).toEqual({
      start: 2.5,
      end: 5,
      text: 'Baris pertama VTT',
    });

    expect(parseSubtitlesAuto(vtt, 'demo.vtt')).toHaveLength(1);
  });

  it('exports timeline subtitle clips to SRT and VTT in chronological order', () => {
    const clips: Clip[] = [
      {
        id: 'c2',
        trackId: 't2',
        assetId: 'text',
        type: 'text',
        name: 'CC2',
        start: 4.5,
        duration: 2,
        offset: 0,
        transforms: { ...DEFAULT_CLIP_TRANSFORM },
        effects: [],
        isSubtitle: true,
        textStyle: { ...DEFAULT_TEXT_STYLE, content: 'Kalimat kedua' },
      },
      {
        id: 'c1',
        trackId: 't2',
        assetId: 'text',
        type: 'text',
        name: 'CC1',
        start: 1,
        duration: 2.5,
        offset: 0,
        transforms: { ...DEFAULT_CLIP_TRANSFORM },
        effects: [],
        isSubtitle: true,
        textStyle: { ...DEFAULT_TEXT_STYLE, content: 'Kalimat pertama' },
      },
    ];

    const srtOut = exportSubtitlesToSrt(clips);
    expect(srtOut).toContain('1\n00:00:01,000 --> 00:00:03,500\nKalimat pertama');
    expect(srtOut).toContain('2\n00:00:04,500 --> 00:00:06,500\nKalimat kedua');

    const vttOut = exportSubtitlesToVtt(clips);
    expect(vttOut.startsWith('WEBVTT')).toBe(true);
    expect(vttOut).toContain('00:00:01.000 --> 00:00:03.500\nKalimat pertama');
  });

  it('chunks long subtitle cues into punchy word groups with karaoke timings', () => {
    const chunked = chunkSubtitleCues(
      [
        {
          start: 0,
          end: 6,
          text: 'Ini adalah contoh subtitle otomatis yang sangat cepat',
        },
      ],
      4
    );
    expect(chunked).toHaveLength(2);
    expect(chunked[0].text).toBe('Ini adalah contoh subtitle');
    expect(chunked[1].text).toBe('otomatis yang sangat cepat');
    expect(chunked[0].words).toHaveLength(4);
    expect(chunked[1].end).toBeCloseTo(6, 2);
  });

  it('detects speech bursts with adaptive VAD and aligns pasted scripts onto spoken segments', () => {
    const sr = 16000;
    const pcm = new Float32Array(sr * 4); // 4 seconds: speech at 0.5-1.3s and 2.2-3.2s
    for (let i = Math.floor(0.5 * sr); i < Math.floor(1.3 * sr); i++) {
      pcm[i] = 0.35 * Math.sin((2 * Math.PI * 220 * i) / sr);
    }
    for (let i = Math.floor(2.2 * sr); i < Math.floor(3.2 * sr); i++) {
      pcm[i] = 0.4 * Math.sin((2 * Math.PI * 260 * i) / sr);
    }

    const segments = detectSpeechSegmentsVad(pcm, sr);
    expect(segments.length).toBe(2);
    expect(segments[0].start).toBeGreaterThanOrEqual(0.4);
    expect(segments[0].end).toBeLessThanOrEqual(1.6);
    expect(segments[1].start).toBeGreaterThanOrEqual(2.1);

    const wav = encodeMonoWav16k(pcm, sr);
    expect(wav.size).toBe(44 + pcm.length * 2);

    const aligned = alignTranscriptToSpeechSegments(
      'Halo dunia. Selamat berkarya!',
      segments,
      5
    );
    expect(aligned).toHaveLength(2);
    expect(aligned[0].start).toBeCloseTo(segments[0].start, 1);
    expect(aligned[1].end).toBeCloseTo(segments[1].end, 1);
  });
});
