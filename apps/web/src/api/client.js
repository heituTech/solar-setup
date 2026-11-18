import { nextTick, ref } from 'vue';

const TOKEN_KEY = 'solar_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }

// 数据库请求门控：请求进行中（含数据写入页面并完成渲染）时，阻断用户的后续操作
export const dbBusy = ref(false);
let busyCount = 0;

function beginDbTask() {
  busyCount += 1;
  dbBusy.value = true;
}

async function endDbTask() {
  // 先让调用方继续执行（把响应写入组件状态），再等待 DOM 渲染完成，最后才解除阻断
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0) dbBusy.value = false;
}

export async function api(path, options = {}) {
  beginDbTask();
  try {
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
  } finally {
    await endDbTask();
  }
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const put = (path, body = {}) => api(path, { method: 'PUT', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

export async function download(path, filename) {
  beginDbTask();
  try {
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
  } finally {
    await endDbTask();
  }
}
