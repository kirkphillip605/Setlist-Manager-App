const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  public retriedByClient: boolean;
  constructor(public status: number, message: string, retriedByClient = false) {
    super(message);
    this.name = 'ApiError';
    this.retriedByClient = retriedByClient;
  }
}

function getBackoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = base * 0.5 * Math.random();
  return base + jitter;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_RETRIES_429 = 3;

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    const res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (res.status === 429) {
      if (attempt < MAX_RETRIES_429) {
        const retryAfter = res.headers.get('Retry-After');
        let delayMs = getBackoffDelay(attempt);
        if (retryAfter) {
          const parsed = Number(retryAfter);
          if (!isNaN(parsed) && parsed > 0) {
            delayMs = parsed * 1000;
          } else {
            const date = Date.parse(retryAfter);
            if (!isNaN(date)) {
              delayMs = Math.max(date - Date.now(), 1000);
            }
          }
        }
        await sleep(delayMs);
        continue;
      }
      throw new ApiError(429, 'Too many requests. Please wait a moment and try again.', true);
    }

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch {}
      throw new ApiError(res.status, message);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : (undefined as unknown as T);
  }

  throw lastError ?? new ApiError(429, 'Too many requests. Please wait a moment and try again.', true);
}

export const apiGet  = <T>(path: string)                    => apiFetch<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'POST',  body: body ? JSON.stringify(body) : undefined });
export const apiPut  = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'PUT',   body: body ? JSON.stringify(body) : undefined });
export const apiPatch= <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDel  = <T>(path: string)                    => apiFetch<T>(path, { method: 'DELETE' });
