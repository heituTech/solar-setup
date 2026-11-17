import { defineStore } from 'pinia';
import { get, post, setToken, getToken } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: JSON.parse(localStorage.getItem('solar_user') || 'null'),
    loading: false,
  }),
  getters: {
    authenticated: (state) => Boolean(state.token && state.user),
    staff: (state) => Boolean(state.user && state.user.role !== 'member'),
    role: (state) => state.user?.role || 'guest',
  },
  actions: {
    saveSession(data) {
      this.token = data.token;
      this.user = data.user;
      setToken(data.token);
      localStorage.setItem('solar_user', JSON.stringify(data.user));
    },
    async login(payload) {
      this.loading = true;
      try { this.saveSession(await post('/pv/api/auth/login', payload)); }
      finally { this.loading = false; }
    },
    async refresh() {
      if (!this.token) return;
      try {
        const data = await get('/pv/api/auth/me');
        this.user = data.user || data;
        localStorage.setItem('solar_user', JSON.stringify(this.user));
      } catch { this.logout(); }
    },
    logout() {
      this.token = '';
      this.user = null;
      setToken('');
      localStorage.removeItem('solar_user');
    },
  },
});
