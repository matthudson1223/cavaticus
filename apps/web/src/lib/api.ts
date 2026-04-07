const BASE = import.meta.env['VITE_API_URL'] ?? '';

function getCsrfToken(): string | null {
  // Try to get CSRF token from meta tag
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) return meta.getAttribute('content');

  // Fallback: look for it in cookies or a global store
  return sessionStorage.getItem('csrf-token');
}

function storeCsrfToken(token: string): void {
  sessionStorage.setItem('csrf-token', token);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: HeadersInit = body ? { 'Content-Type': 'application/json' } : {};

  // Add CSRF token for non-GET requests
  if (method !== 'GET') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Extract CSRF token from response header if present
  const newCsrfToken = res.headers.get('X-CSRF-Token');
  if (newCsrfToken) {
    storeCsrfToken(newCsrfToken);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
