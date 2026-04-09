import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface ParsedAddress {
  houseNumber: string;
  street: string;
  city: string;
  stateCode: string;
  state: string;
  postalCode: string;
  countryName: string;
  countryCode: string;
  label: string;
}

interface VenueItem {
  id: string;
  title: string;
  address: ParsedAddress;
}

interface GoogleTextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
}

interface GoogleTextSearchResponse {
  results: GoogleTextSearchResult[];
}

interface GooglePlaceDetailsResponse {
  result?: {
    address_components?: AddressComponent[];
  };
}

interface GoogleAutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GoogleAutocompleteResponse {
  predictions: GoogleAutocompletePrediction[];
}

function parseAddressComponents(components: AddressComponent[]) {
  const get = (type: string) => components.find(c => c.types.includes(type));
  return {
    houseNumber: get('street_number')?.long_name ?? '',
    street: get('route')?.long_name ?? '',
    city: get('locality')?.long_name ?? get('sublocality')?.long_name ?? '',
    stateCode: get('administrative_area_level_1')?.short_name ?? '',
    state: get('administrative_area_level_1')?.long_name ?? '',
    postalCode: get('postal_code')?.long_name ?? '',
    countryName: get('country')?.long_name ?? '',
    countryCode: get('country')?.short_name ?? '',
  };
}

app.get('/search', requireAuth, async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q param required' }, 400);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return c.json([]);

  try {
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=establishment&key=${apiKey}`;
    const searchRes = await fetch(textSearchUrl);
    const searchData = await searchRes.json() as GoogleTextSearchResponse;

    const places = (searchData.results ?? []).slice(0, 10);

    const items: VenueItem[] = await Promise.all(
      places.map(async (place) => {
        let addr: ParsedAddress = {
          houseNumber: '',
          street: '',
          city: '',
          stateCode: '',
          state: '',
          postalCode: '',
          countryName: '',
          countryCode: '',
          label: place.formatted_address ?? '',
        };

        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=address_component&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json() as GooglePlaceDetailsResponse;

          if (detailsData.result?.address_components) {
            const parsed = parseAddressComponents(detailsData.result.address_components);
            addr = { ...addr, ...parsed };
          }
        } catch {
          // Fall back to just the formatted_address in label
        }

        return {
          id: place.place_id,
          title: place.name,
          address: addr,
        };
      })
    );

    return c.json(items);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Venues] Search error:', message);
    return c.json([]);
  }
});

app.get('/autocomplete', requireAuth, async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q param required' }, 400);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return c.json({ items: [] });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=establishment&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as GoogleAutocompleteResponse;

    const items = (data.predictions ?? []).slice(0, 10).map((p) => ({
      title: p.structured_formatting?.main_text ?? p.description,
      id: p.place_id,
      address: p.description,
      street: '',
      city: '',
      state: '',
      zip: '',
      country: '',
    }));

    return c.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Venues] Autocomplete error:', message);
    return c.json({ items: [] });
  }
});

export default app;
