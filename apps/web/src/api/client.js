const TOKEN_KEY = 'solar_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { Accept: 'application/json', 'X-Request-ID': crypto.randomUUID(), ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { ...options, method: options.method || (body ? 'POST' : 'GET'), headers, body });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'invalid_response' }; }
  if (!response.ok) {
    const error = new Error(data.error || `http_${response.status}`);
    error.status = response.status;
    error.code = data.error;
    error.details = data;
    if (response.status === 401) {
      setToken('');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw error;
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const put = (path, body = {}) => api(path, { method: 'PUT', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

export async function download(path, filename) {
  const headers = { 'X-Request-ID': crypto.randomUUID() };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { headers });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    const error = new Error(data.error || `http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
