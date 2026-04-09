const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

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

export const apiGet  = <T>(path: string)                    => apiFetch<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'POST',  body: body ? JSON.stringify(body) : undefined });
export const apiPut  = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'PUT',   body: body ? JSON.stringify(body) : undefined });
export const apiPatch= <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDel  = <T>(path: string)                    => apiFetch<T>(path, { method: 'DELETE' });
