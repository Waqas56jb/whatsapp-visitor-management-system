import axios from 'axios';

const TOKEN_KEY = 'botho_admin_token';
// While platform staff work inside a company ("Log in as"), their own token is kept here so
// "Return to platform" brings them straight back.
const PLATFORM_TOKEN_KEY = 'botho_platform_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function startImpersonation(companyToken) {
  sessionStorage.setItem(PLATFORM_TOKEN_KEY, getAdminToken() || '');
  setAdminToken(companyToken);
}

export function stopImpersonation() {
  const platform = sessionStorage.getItem(PLATFORM_TOKEN_KEY);
  sessionStorage.removeItem(PLATFORM_TOKEN_KEY);
  setAdminToken(platform || null);
  return Boolean(platform);
}

export function clearSession() {
  sessionStorage.removeItem(PLATFORM_TOKEN_KEY);
  setAdminToken(null);
}

export function errorText(err, fallback) {
  return err?.response?.data?.error || fallback;
}

// Downloads a file from the API (CSV, PDF, JSON export) with the signed-in token.
export async function download(path, filename, params) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens an API file (an uploaded ID document) in a new tab.
export async function openFile(path) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

// Error responses for blob requests arrive as Blobs; read the JSON message out of them.
export async function blobError(err, fallback) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).error || fallback;
    } catch {
      return fallback;
    }
  }
  return errorText(err, fallback);
}

export default api;
