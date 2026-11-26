const TOKEN_KEY = 'erp_token';
const USER_KEY = 'erp_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setStoredUser(user) {
  user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY);
}

export async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`/erp/api${path}`, {
    ...options,
    method: options.method || (body ? 'POST' : 'GET'),
    headers,
    body,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'invalid_response' }; }
  if (!response.ok) {
    const error = new Error(data.error || `http_${response.status}`);
    error.status = response.status;
    error.code = data.error;
    error.details = data.details;
    if (response.status === 401) {
      setToken('');
      setStoredUser(null);
      if (!location.pathname.endsWith('/login')) location.href = '/erp/login';
    }
    throw error;
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
export const fileUrl = (id) => `/erp/api/files/${id}?token=${encodeURIComponent(getToken())}`;
