import { apiFetch } from '@/lib/apiFetch';

export interface MusicResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  spotifyUrl?: string;
  duration?: string;
}

export interface AudioFeatures {
  key?: string;
  tempo?: string;
  duration?: string;
}

// Helper: fetch with timeout + retry
const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 2, timeoutMs = 8000): Promise<Response> => {
  const fetchOne = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchOne();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
};

export const searchMusic = async (query: string): Promise<MusicResult[]> => {
  if (!query) return [];
  try {
    const data = await apiFetch<MusicResult[]>(`/api/spotify/search?q=${encodeURIComponent(query)}`);
    return data ?? [];
  } catch (err) {
    console.error('[musicApi] Search error:', err);
    return [];
  }
};

const PITCH_CLASS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const fetchAudioFeatures = async (spotifyId: string): Promise<AudioFeatures> => {
  if (!spotifyId) return {};
  try {
    const res = await fetchWithRetry(
      `https://api.reccobeats.com/v1/audio-features?ids=${spotifyId}`,
      { method: 'GET' },
      2,
      10_000
    );
    if (!res.ok) return {};

    const data = await res.json();
    if (!data.content?.length) return {};

    const track = data.content[0];
    let keyString = '';
    if (track.key !== undefined && track.mode !== undefined && track.key >= 0 && track.key < 12) {
      const pitch = PITCH_CLASS[track.key];
      const mode  = track.mode === 1 ? 'Major' : 'Minor';
      if (pitch) keyString = `${pitch} ${mode}`;
    }

    return {
      key:   keyString,
      tempo: track.tempo ? Math.round(Number(track.tempo)).toString() : '',
    };
  } catch {
    return {};
  }
};

const cleanForLyrics = (str: string) =>
  str
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*-\s*.*remaster.*/i, '')
    .replace(/\s*-\s*.*live.*/i,     '')
    .replace(/\s*feat\..*/i,          '')
    .trim();

export const fetchLyrics = async (artist: string, title: string): Promise<string> => {
  const attempt = async (a: string, t: string) => {
    const res = await fetchWithRetry(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
      {},
      1,
      5000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.lyrics || null;
  };

  try {
    let lyrics = await attempt(artist, title);
    if (lyrics) return lyrics;

    const ca = cleanForLyrics(artist);
    const ct = cleanForLyrics(title);
    if (ca !== artist || ct !== title) {
      lyrics = await attempt(ca, ct);
      if (lyrics) return lyrics;
    }
    return '';
  } catch {
    return '';
  }
};
