import type { Clip, SubtitleCue, SubtitleWord } from '@swave/shared';

function parseTimestampToSec(raw: string): number | null {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  let hours = 0;
  let mins = 0;
  let secs = 0;
  if (parts.length === 3) {
    hours = Number(parts[0]);
    mins = Number(parts[1]);
    secs = Number(parts[2]);
  } else {
    mins = Number(parts[0]);
    secs = Number(parts[1]);
  }

  if (!Number.isFinite(hours) || !Number.isFinite(mins) || !Number.isFinite(secs)) {
    return null;
  }
  return Math.max(0, hours * 3600 + mins * 60 + secs);
}

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.min(999, Math.round((safe % 1) * 1000));
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(
    2,
    '0'
  )}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(',', '.');
}

function stripSubtitleMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

export function parseSrt(raw: string): SubtitleCue[] {
  const blocks = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx < 0) continue;

    const timeLine = lines[arrowIdx];
    const [startRaw, endRawWithSettings] = timeLine.split('-->');
    if (!startRaw || !endRawWithSettings) continue;
    const endRaw = endRawWithSettings.trim().split(/\s+/)[0];

    const start = parseTimestampToSec(startRaw);
    const end = parseTimestampToSec(endRaw);
    if (start === null || end === null || end <= start) continue;

    const text = stripSubtitleMarkup(lines.slice(arrowIdx + 1).join('\n'));
    if (!text) continue;

    cues.push({
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text,
    });
  }

  return cues;
}

export function parseVtt(raw: string): SubtitleCue[] {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n*/i, '');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (
      !trimmed ||
      trimmed.startsWith('NOTE') ||
      trimmed.startsWith('STYLE') ||
      trimmed.startsWith('REGION')
    ) {
      continue;
    }
    const parsed = parseSrt(trimmed);
    cues.push(...parsed);
  }
  return cues;
}

export function parseSubtitlesAuto(
  content: string,
  filename?: string
): SubtitleCue[] {
  const isVtt =
    (filename && /\.vtt$/i.test(filename)) || /^\uFEFF?WEBVTT/i.test(content.trim());
  return isVtt ? parseVtt(content) : parseSrt(content);
}

export function selectExportableSubtitleClips(clips: Clip[]): Clip[] {
  const explicit = clips.filter((c) => c.type === 'text' && c.isSubtitle);
  const pool =
    explicit.length > 0
      ? explicit
      : clips.filter((c) => c.type === 'text' && c.textStyle?.content);
  return [...pool].sort((a, b) => a.start - b.start);
}

export function exportSubtitlesToSrt(clips: Clip[]): string {
  const ordered = selectExportableSubtitleClips(clips);
  return ordered
    .map((clip, idx) => {
      const start = formatSrtTime(clip.start);
      const end = formatSrtTime(clip.start + clip.duration);
      const content = (clip.textStyle?.content || clip.name || '').trim();
      return `${idx + 1}\n${start} --> ${end}\n${content}`;
    })
    .join('\n\n');
}

export function exportSubtitlesToVtt(clips: Clip[]): string {
  const ordered = selectExportableSubtitleClips(clips);
  const body = ordered
    .map((clip) => {
      const start = formatVttTime(clip.start);
      const end = formatVttTime(clip.start + clip.duration);
      const content = (clip.textStyle?.content || clip.name || '').trim();
      return `${start} --> ${end}\n${content}`;
    })
    .join('\n\n');
  return body ? `WEBVTT\n\n${body}` : 'WEBVTT\n';
}

export function chunkSubtitleCues(
  cues: SubtitleCue[],
  maxWordsPerCue = 5
): SubtitleCue[] {
  const limit = Math.max(1, Math.round(maxWordsPerCue));
  const result: SubtitleCue[] = [];

  for (const cue of cues) {
    const cleanText = cue.text.trim();
    if (!cleanText) continue;

    if (cue.words && cue.words.length > 0) {
      if (cue.words.length <= limit) {
        result.push(cue);
        continue;
      }
      for (let i = 0; i < cue.words.length; i += limit) {
        const slice = cue.words.slice(i, i + limit);
        const absStart = cue.start + slice[0].start;
        const absEnd = Math.max(
          absStart + 0.25,
          cue.start + slice[slice.length - 1].end
        );
        const relWords: SubtitleWord[] = slice.map((w) => ({
          word: w.word,
          start: Number(Math.max(0, cue.start + w.start - absStart).toFixed(3)),
          end: Number(Math.max(0.05, cue.start + w.end - absStart).toFixed(3)),
        }));
        result.push({
          start: Number(absStart.toFixed(3)),
          end: Number(absEnd.toFixed(3)),
          text: slice.map((w) => w.word).join(' '),
          words: relWords,
        });
      }
      continue;
    }

    const words = cleanText.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
      result.push({
        start: Number(cue.start.toFixed(3)),
        end: Number(Math.max(cue.start + 0.3, cue.end).toFixed(3)),
        text: cleanText,
      });
      continue;
    }

    const totalDur = Math.max(0.4, cue.end - cue.start);
    const totalChars = Math.max(1, words.join(' ').length);
    let cursor = cue.start;

    for (let i = 0; i < words.length; i += limit) {
      const slice = words.slice(i, i + limit);
      const chunkText = slice.join(' ');
      const weight = chunkText.length / totalChars;
      const chunkDur =
        i + limit >= words.length
          ? Math.max(0.25, cue.end - cursor)
          : Math.max(0.3, totalDur * weight);
      const chunkEnd = Math.min(cue.end, cursor + chunkDur);

      // Synthesize approximate relative word timings for karaoke highlight
      const segDur = Math.max(0.25, chunkEnd - cursor);
      const sliceChars = Math.max(1, chunkText.length);
      let wordCursor = 0;
      const synthWords: SubtitleWord[] = slice.map((w) => {
        const wDur = Math.max(0.08, (w.length / sliceChars) * segDur);
        const wStart = wordCursor;
        const wEnd = Math.min(segDur, wordCursor + wDur);
        wordCursor = wEnd;
        return {
          word: w,
          start: Number(wStart.toFixed(3)),
          end: Number(Math.max(wStart + 0.05, wEnd).toFixed(3)),
        };
      });

      result.push({
        start: Number(cursor.toFixed(3)),
        end: Number(Math.max(cursor + 0.25, chunkEnd).toFixed(3)),
        text: chunkText,
        words: synthWords,
      });
      cursor = chunkEnd;
    }
  }

  return result;
}

export function alignTranscriptToSpeechSegments(
  scriptText: string,
  segments: Array<{ start: number; end: number }>,
  maxWordsPerCue = 5
): SubtitleCue[] {
  const rawLines = scriptText
    .split(/\r?\n|[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const phrases: string[] = [];
  for (const line of rawLines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length <= maxWordsPerCue) {
      phrases.push(words.join(' '));
    } else {
      for (let i = 0; i < words.length; i += maxWordsPerCue) {
        phrases.push(words.slice(i, i + maxWordsPerCue).join(' '));
      }
    }
  }

  if (phrases.length === 0) return [];

  if (segments.length === 0) {
    let cursor = 0;
    return phrases.map((text) => {
      const dur = Math.max(1.2, Math.min(3.2, text.split(/\s+/).length * 0.42));
      const cue: SubtitleCue = {
        start: Number(cursor.toFixed(3)),
        end: Number((cursor + dur).toFixed(3)),
        text,
      };
      cursor += dur;
      return cue;
    });
  }

  const validSegs = segments
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const totalSpeechSec = validSegs.reduce((sum, s) => sum + (s.end - s.start), 0);
  const totalChars = Math.max(1, phrases.reduce((sum, p) => sum + p.length, 0));

  // Map cumulative speech offset onto real timeline segments
  const mapSpeechOffsetToTimeline = (speechOffset: number): number => {
    let acc = 0;
    for (const seg of validSegs) {
      const len = seg.end - seg.start;
      if (speechOffset <= acc + len) {
        return seg.start + Math.max(0, speechOffset - acc);
      }
      acc += len;
    }
    return validSegs[validSegs.length - 1].end;
  };

  let charCursor = 0;
  return phrases.map((text) => {
    const startSpeech = (charCursor / totalChars) * totalSpeechSec;
    charCursor += text.length;
    const endSpeech = (charCursor / totalChars) * totalSpeechSec;
    const start = mapSpeechOffsetToTimeline(startSpeech);
    const end = Math.max(start + 0.35, mapSpeechOffsetToTimeline(endSpeech));
    return {
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text,
    };
  });
}
