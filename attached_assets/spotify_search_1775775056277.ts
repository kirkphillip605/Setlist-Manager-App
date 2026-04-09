// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    
    if (!query) {
      throw new Error('Query is required')
    }

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials not configured')
    }

    // 1. Get Client Credentials Token
    const authResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    })

    const authData = await authResponse.json()
    const token = authData.access_token

    // 2. Search Spotify
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    const searchData = await searchResponse.json()
    
    // 3. Map results to our format
    const tracks = searchData.tracks.items.map((track: any) => ({
      spotify_id: track.id,
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(', '),
      cover_url: track.album.images[0]?.url,
      spotify_url: track.external_urls.spotify,
      duration_ms: track.duration_ms,
      album: track.album.name,
      release_date: track.album.release_date
    }))

    return new Response(
      JSON.stringify({ tracks }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})