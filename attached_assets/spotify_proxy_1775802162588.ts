// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, baggage, sentry-trace',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // 1. Verify User Authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) throw new Error('Missing Authorization header');

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    // 2. Get Credentials from Secrets
    const client_id = Deno.env.get('SPOTIFY_CLIENT_ID');
    const client_secret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

    if (!client_id || !client_secret) {
        throw new Error("Missing Spotify credentials on server");
    }

    // 3. Authenticate with Spotify (Client Credentials Flow)
    const auth = btoa(`${client_id}:${client_secret}`);
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) throw new Error("Failed to authenticate with Spotify");
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 4. Handle Request
    const { action, query } = await req.json();

    if (action === 'search') {
        if (!query) throw new Error("Query required");

        const spotifyRes = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (!spotifyRes.ok) throw new Error("Spotify search failed");
        
        const data = await spotifyRes.json();
        
        const tracks = data.tracks.items;
        const seen = new Set<string>();
        const results: any[] = [];

        const formatDuration = (ms: number) => {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
        };

        for (const track of tracks) {
            const artist = track.artists[0].name;
            const title = track.name;
            const key = `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
            
            const image = track.album.images[1]?.url || track.album.images[0]?.url || "";
            const spotifyUrl = track.external_urls?.spotify || "";
            const durationStr = track.duration_ms ? formatDuration(track.duration_ms) : "";

            if (!seen.has(key)) {
                seen.add(key);
                results.push({
                    id: track.id,
                    title: track.name,
                    artist: track.artists.map((a: any) => a.name).join(", "),
                    album: track.album.name,
                    coverUrl: image,
                    spotifyUrl: spotifyUrl,
                    duration: durationStr
                });
            }
        }

        return new Response(JSON.stringify(results.slice(0, 10)), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});