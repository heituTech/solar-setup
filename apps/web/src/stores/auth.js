import { defineStore } from 'pinia';
import { get, post, setToken, getToken } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: JSON.parse(localStorage.getItem('solar_user') || 'null'),
    loading: false,
    // 正在进行中的会话校验 Promise，用于路由守卫等待
    _validating: null,
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
      if (!this.token) return false;
      if (this._validating) return this._validating;
      this._validating = (async () => {
        try {
          const data = await get('/pv/api/auth/me');
          this.user = data.user || data;
          localStorage.setItem('solar_user', JSON.stringify(this.user));
          return true;
        } catch {
          this.logout();
          return false;
        } finally {
          this._validating = null;
        }
      })();
      return this._validating;
    },
    logout() {
      // 先通知服务端吊销当前 token（失败不影响本地登出）
      if (this.token) {
        fetch('/pv/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
          keepalive: true,
        }).catch(() => {});
      }
      this.token = '';
      this.user = null;
      setToken('');
      localStorage.removeItem('solar_user');
      // 用整页刷新而不是 router.push，确保所有已挂载的业务组件（客户、订单、报价等）
      // 连同它们的 DOM 和数据一起被彻底销毁，不会残留在页面上
      window.location.href = '/pv/';
    },
  },
});
