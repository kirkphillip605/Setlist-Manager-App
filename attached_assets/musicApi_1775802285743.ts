import { supabase } from "@/integrations/supabase/client";

export interface MusicResult {
  id: string; // Spotify ID
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  spotifyUrl?: string;
  duration?: string; // MM:SS
}

export interface AudioFeatures {
  key?: string;
  tempo?: string;
  duration?: string;
}

// Helper: Fetch with timeout and retry logic
const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 2, timeoutMs = 8000): Promise<Response> => {
  const fetchOne = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return res;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchOne();
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw new Error("Unreachable code");
};

export const searchMusic = async (query: string): Promise<MusicResult[]> => {
  if (!query) return [];

  try {
    const { data, error } = await supabase.functions.invoke('spotify-proxy', {
        body: { action: 'search', query }
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Search Error:", error);
    return [];
  }
};

const PITCH_CLASS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const fetchAudioFeatures = async (spotifyId: string): Promise<AudioFeatures> => {
  if (!spotifyId) return {};
  
  console.log(`Fetching track analysis for ID: ${spotifyId}`);
  try {
    const response = await fetchWithRetry(
      `https://api.reccobeats.com/v1/audio-features?ids=${spotifyId}`,
      {
        method: 'GET'
      },
      2, // 2 retries
      10000 // 10s timeout
    );

    if (!response.ok) {
        console.error("Track Analysis API Error:", await response.text());
        return {};
    }

    const data = await response.json();
    
    if (!data.content || data.content.length === 0) {
      return {};
    }

    const track = data.content[0];

    // Parse Key: 0=C, 1=C#, etc.
    let keyString = "";
    if (track.key !== undefined && track.mode !== undefined && track.key >= 0 && track.key < 12) {
      const pitch = PITCH_CLASS[track.key];
      const mode = track.mode === 1 ? "Major" : "Minor";
      if (pitch) {
        keyString = `${pitch} ${mode}`;
      }
    }

    // Parse Tempo: Round to nearest whole number
    let tempoString = "";
    if (track.tempo) {
      tempoString = Math.round(Number(track.tempo)).toString();
    }

    return {
      key: keyString,
      tempo: tempoString,
      duration: "" 
    };
  } catch (error) {
    console.error("Track Analysis Exception:", error);
    return {};
  }
};

const cleanForLyrics = (str: string) => {
  return str
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*-\s*.*remaster.*/i, '')
    .replace(/\s*-\s*.*live.*/i, '')
    .replace(/\s*feat\..*/i, '')
    .trim();
};

export const fetchLyrics = async (artist: string, title: string) => {
  console.log(`Fetching lyrics for: ${artist} - ${title}`);
  try {
    const attemptFetch = async (a: string, t: string) => {
      const res = await fetchWithRetry(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
        {},
        1, // 1 retry
        5000 // 5s timeout
      );
      if (res.ok) {
        const data = await res.json();
        return data.lyrics || "";
      }
      return null;
    };

    let lyrics = await attemptFetch(artist, title);
    if (lyrics) return lyrics;

    const cleanArtist = cleanForLyrics(artist);
    const cleanTitle = cleanForLyrics(title);
    
    if (cleanArtist !== artist || cleanTitle !== title) {
      lyrics = await attemptFetch(cleanArtist, cleanTitle);
      if (lyrics) return lyrics;
    }

    return "";
  } catch (error) {
    console.warn("Lyrics fetch failed", error);
    return "";
  }
};