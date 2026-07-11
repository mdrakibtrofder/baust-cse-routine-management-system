const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3201/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  if (!response.ok) {
    let message = 'Request failed';
    try {
      if (text) {
        const error = JSON.parse(text);
        if (error.conflicts && Array.isArray(error.conflicts)) {
          message = error.conflicts.map((c: any) => c.message).join(' | ');
        } else {
          message = error.message || message;
        }
      }
    } catch (_) {}
    throw new Error(message);
  }

  return text ? JSON.parse(text) : ({} as T);
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export default api;
