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
    const apiKey = Deno.env.get('HERE_API_KEY')

    if (!apiKey) throw new Error('HERE API Key not configured')

    const response = await fetch(
      `https://autosuggest.search.hereapi.com/v1/autosuggest?at=37.7749,-122.4194&q=${encodeURIComponent(query)}&apiKey=${apiKey}`
    )

    const data = await response.json()
    
    // Map to a cleaner format
    const items = data.items?.map((item: any) => ({
      title: item.title,
      id: item.id,
      address: item.address?.label,
      street: item.address?.street,
      city: item.address?.city,
      state: item.address?.state,
      zip: item.address?.postalCode,
      country: item.address?.countryName
    })) || []

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})