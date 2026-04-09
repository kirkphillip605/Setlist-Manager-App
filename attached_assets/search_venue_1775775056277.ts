// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, baggage, sentry-trace',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 2. Setup Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 3. Verify User Authentication
    // This ensures only logged-in users can consume your HERE API quota
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // 4. Parse Request
    const { query } = await req.json();
    const apiKey = Deno.env.get('HERE_API_KEY');

    if (!apiKey) throw new Error("Missing HERE_API_KEY configuration");
    if (!query) throw new Error("Search query is required");

    // 5. Call HERE API
    const baseUrl = "https://discover.search.hereapi.com/v1/discover";
    const params = new URLSearchParams({
      limit: "20", // Fetch slightly more to account for filtering
      in: "countryCode:USA",
      at: "39.8283,-98.5795", // Default search center
      q: query,
      apiKey: apiKey
    });

    const response = await fetch(`${baseUrl}?${params.toString()}`);
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("HERE API Error:", errText);
      throw new Error(`HERE API responded with ${response.status}`);
    }

    const data = await response.json();

    // Filter server-side: only return specific places (venues), ignoring generic cities/regions
    const items = (data.items || []).filter((item: any) => item.resultType === 'place').slice(0, 10);

    return new Response(JSON.stringify({ items }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Error in search-venue:", error);
    // Always return CORS headers even on error
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized' ? 401 : 400,
    });
  }
});