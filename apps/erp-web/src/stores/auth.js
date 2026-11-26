import { defineStore } from 'pinia';
import { get, post, getToken, setToken, getStoredUser, setStoredUser } from '@/api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: getStoredUser(),
    loading: false,
  }),
  getters: {
    authenticated: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || 'guest',
    isAdmin: (state) => state.user?.role === 'admin',
    isManager: (state) => ['admin', 'store_manager'].includes(state.user?.role),
    canSell: (state) => ['admin', 'store_manager', 'store_clerk'].includes(state.user?.role),
  },
  actions: {
    saveSession(data) {
      this.token = data.token;
      this.user = data.user;
      setToken(data.token);
      setStoredUser(data.user);
    },
    async login(payload) {
      this.loading = true;
      try { this.saveSession(await post('/auth/login', payload)); }
      finally { this.loading = false; }
    },
    async refresh() {
      if (!this.token) return false;
      try {
        const data = await get('/auth/me');
        this.user = data.user;
        setStoredUser(data.user);
        return true;
      } catch {
        return false;
      }
    },
    logout() {
      setToken('');
      setStoredUser(null);
      this.token = '';
      this.user = null;
      window.location.href = '/erp/login';
    },
  },
});
